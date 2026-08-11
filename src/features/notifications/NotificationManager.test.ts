import { NotificationManager } from './NotificationManager';
import { PluginState } from '../../core/PluginState';
import { DEFAULT_SETTINGS } from '../../types/settings';
import { EnrichedOFCEvent } from '../../core/TimeEngine';
import { DateTime, Settings } from 'luxon';
import type FullCalendarPlugin from '../../main';
import type EventCache from '../../core/EventCache';

jest.mock(
  'obsidian',
  () => ({
    Modal: class {},
    Notice: class {},
    Plugin: class {},
    TFile: class {},
    TFolder: class {},
    TAbstractFile: class {},
    normalizePath: (path: string) => path.replace(/\\/g, '/')
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

describe('NotificationManager', () => {
  let mockPlugin: FullCalendarPlugin;
  let manager: NotificationManager;

  beforeEach(() => {
    mockPlugin = {
      app: {
        vault: {
          getName: () => 'TestVault'
        }
      }
    } as unknown as FullCalendarPlugin;

    // Reset settings in PluginState
    PluginState.setSettings({
      ...DEFAULT_SETTINGS,
      enableReminders: true,
      enableDefaultReminder: true,
      defaultReminderMinutes: 10,
      fcrReminderCompanion: {
        enabled: false,
        apiUrl: 'http://127.0.0.1:45677'
      }
    });

    manager = new NotificationManager(mockPlugin);
  });

  describe('getTriggerTime', () => {
    it('calculates custom reminder time if custom notify value is set', () => {
      const occurrence = {
        id: 'evt-1',
        event: {
          title: 'Meeting',
          type: 'single',
          notify: { value: 15 }
        },
        start: DateTime.fromISO('2026-05-22T12:00:00'),
        end: DateTime.fromISO('2026-05-22T13:00:00'),
        location: null
      } as unknown as EnrichedOFCEvent;

      const triggerTime = manager.getTriggerTime(occurrence);
      expect(triggerTime).not.toBeNull();
      expect(triggerTime?.toISO()).toBe(DateTime.fromISO('2026-05-22T11:45:00').toISO());
    });

    it('calculates default reminder time if no custom notify value is set', () => {
      const occurrence = {
        id: 'evt-2',
        event: {
          title: 'Meeting 2',
          type: 'single'
        },
        start: DateTime.fromISO('2026-05-22T12:00:00'),
        end: DateTime.fromISO('2026-05-22T13:00:00'),
        location: null
      } as unknown as EnrichedOFCEvent;

      const triggerTime = manager.getTriggerTime(occurrence);
      expect(triggerTime).not.toBeNull();
      expect(triggerTime?.toISO()).toBe(DateTime.fromISO('2026-05-22T11:50:00').toISO());
    });

    it('returns null if default reminders are disabled and no custom notify is set', () => {
      const settings = PluginState.getSettings();
      PluginState.setSettings({
        ...settings,
        enableDefaultReminder: false
      });

      const occurrence = {
        id: 'evt-3',
        event: {
          title: 'Meeting 3',
          type: 'single'
        },
        start: DateTime.fromISO('2026-05-22T12:00:00'),
        end: DateTime.fromISO('2026-05-22T13:00:00'),
        location: null
      } as unknown as EnrichedOFCEvent;

      const triggerTime = manager.getTriggerTime(occurrence);
      expect(triggerTime).toBeNull();
    });
  });

  describe('getUpcomingRemindersPayload', () => {
    it('compiles correct FCR daemon synchronization payload for events within the next 24 hours based on reminder time', () => {
      const now = DateTime.now();
      const within24h = now.plus({ hours: 2 });
      const outside24h = now.plus({ hours: 26 });

      const occurrences = [
        {
          id: 'evt-1',
          event: {
            title: 'Meeting Inside 24h',
            type: 'single',
            description: 'Very important'
          },
          start: within24h,
          end: within24h.plus({ hours: 1 }),
          location: {
            file: { path: 'Folder/Meeting1.md' }
          }
        },
        {
          id: 'evt-2',
          event: {
            title: 'Meeting Outside 24h',
            type: 'single',
            description: 'Not today'
          },
          start: outside24h,
          end: outside24h.plus({ hours: 1 }),
          location: null
        }
      ] as unknown as EnrichedOFCEvent[];

      // Mock Cache getOccurrenceCache
      const mockCache = {
        getOccurrenceCache: () => occurrences
      };
      PluginState.setCache(mockCache as unknown as EventCache);

      const payload = manager.getUpcomingRemindersPayload();
      expect(payload).toHaveLength(1);
      expect(payload[0]).toEqual({
        id: 'evt-1',
        title: 'Meeting Inside 24h',
        body: 'Very important',
        trigger_at_epoch: Math.floor(within24h.minus({ minutes: 10 }).toMillis() / 1000),
        action_url: 'obsidian://open?vault=TestVault&file=Folder%2FMeeting1.md'
      });
    });
  });

  describe('tryTrigger with FCR Companion', () => {
    it('bypasses local toast notifications if fcrReminderCompanion is enabled', () => {
      // Setup settings
      const settings = PluginState.getSettings();
      PluginState.setSettings({
        ...settings,
        fcrReminderCompanion: {
          enabled: true,
          apiUrl: 'http://127.0.0.1:45677'
        }
      });

      const occurrence = {
        id: 'evt-1',
        event: {
          title: 'Meeting',
          type: 'single'
        },
        start: DateTime.fromISO('2026-05-22T12:00:00'),
        end: DateTime.fromISO('2026-05-22T13:00:00'),
        location: null
      } as unknown as EnrichedOFCEvent;

      const triggerNotificationSpy = jest.spyOn(
        manager as unknown as { triggerNotification: () => void },
        'triggerNotification'
      );

      // Call internal tryTrigger using casting or bracket notation
      (
        manager as unknown as {
          tryTrigger: (
            occurrence: EnrichedOFCEvent,
            type: 'default' | 'custom',
            triggerTime: DateTime
          ) => void;
        }
      ).tryTrigger(occurrence, 'default', DateTime.fromISO('2026-05-22T11:50:00'));

      expect(triggerNotificationSpy).not.toHaveBeenCalled();
    });
  });

  describe('tryTrigger with Notification and timezone conversion', () => {
    let originalNotification: typeof Notification;
    let mockNotificationConstructor: jest.Mock;

    beforeEach(() => {
      originalNotification = window.Notification;
      mockNotificationConstructor = jest.fn();
      window.Notification = mockNotificationConstructor as unknown as typeof Notification;
    });

    afterEach(() => {
      window.Notification = originalNotification;
      Settings.defaultZone = 'local';
    });

    it('formats the notification time using the local timezone', () => {
      // Set mock system/local timezone to America/New_York (UTC-4 in May 2026)
      Settings.defaultZone = 'America/New_York';

      // Create an occurrence starting in Europe/Berlin (UTC+2 in May 2026, which is 6 hours ahead of NY)
      const occurrence = {
        id: 'evt-tz-test',
        event: {
          title: 'Timezone Meeting',
          type: 'single',
          startTime: '16:00', // 4:00 PM in Berlin
          timezone: 'Europe/Berlin'
        },
        // 16:00 Europe/Berlin is 10:00 AM America/New_York
        start: DateTime.fromISO('2026-05-22T16:00:00', { zone: 'Europe/Berlin' }),
        end: DateTime.fromISO('2026-05-22T17:00:00', { zone: 'Europe/Berlin' }),
        location: null
      } as unknown as EnrichedOFCEvent;

      // Invoke tryTrigger with companion disabled
      const triggerTime = DateTime.fromISO('2026-05-22T09:50:00', { zone: 'America/New_York' });

      (
        manager as unknown as {
          tryTrigger: (
            occurrence: EnrichedOFCEvent,
            type: 'default' | 'custom',
            triggerTime: DateTime
          ) => void;
        }
      ).tryTrigger(occurrence, 'default', triggerTime);

      // Verify that Notification constructor was called
      expect(mockNotificationConstructor).toHaveBeenCalled();
      const firstCall = mockNotificationConstructor.mock.calls[0] as
        [string, NotificationOptions] | undefined;
      const bodyArg = firstCall?.[1]?.body;
      // In local time (New York), 16:00 Berlin is 10:00 AM New York.
      // So the notification body should say "at 10:00 AM" instead of the raw event's "at 4:00 PM"
      expect(bodyArg).toContain('at 10:00 AM');
    });
  });
});
