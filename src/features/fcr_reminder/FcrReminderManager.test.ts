import { FcrReminderManager } from './FcrReminderManager';
import { PluginState } from '../../core/PluginState';
import { DEFAULT_SETTINGS } from '../../types/settings';
import type FullCalendarPlugin from '../../main';
import type EventCache from '../../core/EventCache';
import { requestUrl } from 'obsidian';
import type { RequestUrlResponse } from 'obsidian';

jest.mock(
  'obsidian',
  () => ({
    Modal: class {},
    Notice: class {},
    Plugin: class {},
    TFile: class {},
    TFolder: class {},
    TAbstractFile: class {},
    normalizePath: (path: string) => path.replace(/\\/g, '/'),
    requestUrl: jest.fn()
  }),
  { virtual: true }
);

jest.mock('../i18n/i18n', () => ({
  t: (key: string) => key,
  initializeI18n: jest.fn(),
  i18n: {
    t: (key: string) => key
  }
}));

describe('FcrReminderManager', () => {
  let mockPlugin: FullCalendarPlugin;
  let mockCache: jest.Mocked<EventCache>;
  let manager: FcrReminderManager;
  let onMock: jest.Mock;
  let offMock: jest.Mock;
  const requestUrlMock = requestUrl as jest.MockedFunction<typeof requestUrl>;

  beforeEach(() => {
    jest.useFakeTimers();
    requestUrlMock.mockReset();

    onMock = jest.fn();
    offMock = jest.fn();

    mockCache = {
      on: onMock,
      off: offMock,
      initialized: true,
      getOccurrenceCache: jest.fn()
    } as unknown as jest.Mocked<EventCache>;

    mockPlugin = {
      app: {
        vault: {
          getName: () => 'TestVault'
        }
      },
      notificationManager: {
        getUpcomingRemindersPayload: () => [{ id: 'evt-1', title: 'Test event' }]
      }
    } as unknown as FullCalendarPlugin;

    PluginState.setPlugin(mockPlugin);
    PluginState.setCache(mockCache);
    PluginState.setSettings({
      ...DEFAULT_SETTINGS,
      enableReminders: true,
      fcrReminderCompanion: {
        enabled: true,
        apiUrl: 'http://127.0.0.1:45677'
      }
    });

    manager = new FcrReminderManager(mockPlugin);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('update lifecycle', () => {
    it('registers cache update callback when both general reminders and companion are enabled', async () => {
      const statusResponse: RequestUrlResponse = {
        status: 200,
        text: JSON.stringify({ status: 'running' }),
        json: { status: 'running' },
        headers: {},
        arrayBuffer: new ArrayBuffer(0)
      };

      requestUrlMock.mockResolvedValue(statusResponse);

      manager.update(PluginState.getSettings());

      expect(onMock).toHaveBeenCalledWith('update', expect.any(Function));

      // Flush microtasks for liveness retry checks
      await jest.runAllTimersAsync();
      expect(requestUrlMock).toHaveBeenCalled();
    });

    it('does NOT register callback if global reminders are disabled', () => {
      PluginState.setSettings({
        ...DEFAULT_SETTINGS,
        enableReminders: false,
        fcrReminderCompanion: {
          enabled: true,
          apiUrl: 'http://127.0.0.1:45677'
        }
      });

      manager.update(PluginState.getSettings());

      expect(onMock).not.toHaveBeenCalled();
    });

    it('does NOT register callback if companion is disabled', () => {
      PluginState.setSettings({
        ...DEFAULT_SETTINGS,
        enableReminders: true,
        fcrReminderCompanion: {
          enabled: false,
          apiUrl: 'http://127.0.0.1:45677'
        }
      });

      manager.update(PluginState.getSettings());

      expect(onMock).not.toHaveBeenCalled();
    });

    it('correctly unregisters callback and unloads when toggled off', () => {
      // 1. Enable companion
      manager.update(PluginState.getSettings());
      expect(onMock).toHaveBeenCalled();

      const calls = onMock.mock.calls as unknown[][];
      const firstCall = calls[0];
      const registeredCallback = firstCall[1] as () => void;

      // 2. Disable it
      PluginState.setSettings({
        ...DEFAULT_SETTINGS,
        enableReminders: true,
        fcrReminderCompanion: {
          enabled: false,
          apiUrl: 'http://127.0.0.1:45677'
        }
      });

      manager.update(PluginState.getSettings());

      expect(offMock).toHaveBeenCalledWith('update', registeredCallback);
    });
  });

  describe('syncToCompanion logic', () => {
    it('bypasses synchronization if companion is disabled', async () => {
      PluginState.setSettings({
        ...DEFAULT_SETTINGS,
        enableReminders: true,
        fcrReminderCompanion: {
          enabled: false,
          apiUrl: 'http://127.0.0.1:45677'
        }
      });

      await manager.syncToCompanion();

      expect(requestUrlMock).not.toHaveBeenCalled();
    });

    it('bypasses synchronization if global reminders are disabled', async () => {
      PluginState.setSettings({
        ...DEFAULT_SETTINGS,
        enableReminders: false,
        fcrReminderCompanion: {
          enabled: true,
          apiUrl: 'http://127.0.0.1:45677'
        }
      });

      await manager.syncToCompanion();

      expect(requestUrlMock).not.toHaveBeenCalled();
    });

    it('executes POST request if active and companion is online', async () => {
      const statusResponse: RequestUrlResponse = {
        status: 200,
        text: JSON.stringify({ status: 'running' }),
        json: { status: 'running' },
        headers: {},
        arrayBuffer: new ArrayBuffer(0)
      };

      const syncResponse: RequestUrlResponse = {
        status: 200,
        text: '{}',
        json: {},
        headers: {},
        arrayBuffer: new ArrayBuffer(0)
      };

      requestUrlMock.mockResolvedValueOnce(statusResponse); // status check
      requestUrlMock.mockResolvedValueOnce(syncResponse); // sync post

      await manager.syncToCompanion();

      expect(requestUrlMock).toHaveBeenCalledTimes(2);
      expect(requestUrlMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'http://127.0.0.1:45677/sync'
        })
      );
    });
  });

  describe('liveness checks retry loop', () => {
    it('aborts early and does not sync if disabled during retry loop', async () => {
      const offlineResponse: RequestUrlResponse = {
        status: 500,
        text: 'offline',
        json: {},
        headers: {},
        arrayBuffer: new ArrayBuffer(0)
      };

      // Setup status endpoint to mock offline daemon
      requestUrlMock.mockResolvedValue(offlineResponse);

      // Start the update loop which kicks off the retry check
      manager.update(PluginState.getSettings());

      expect(onMock).toHaveBeenCalled();

      // Let 2 retries run (advancing timers by 3000ms per attempt)
      await jest.advanceTimersByTimeAsync(3000);
      await jest.advanceTimersByTimeAsync(3000);

      // Disable companion app mid-way
      PluginState.setSettings({
        ...DEFAULT_SETTINGS,
        enableReminders: true,
        fcrReminderCompanion: {
          enabled: false,
          apiUrl: 'http://127.0.0.1:45677'
        }
      });
      manager.update(PluginState.getSettings());

      // Let remaining retries run out
      await jest.runAllTimersAsync();

      // Ensure that even if daemon became online later, sync was never called
      expect(requestUrlMock).not.toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: 'http://127.0.0.1:45677/sync'
        })
      );
    });
  });
});
