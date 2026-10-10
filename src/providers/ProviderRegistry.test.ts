import { ProviderRegistry } from './ProviderRegistry';
import { PluginState } from '../core/PluginState';
import { OFCEvent } from '../types';
import { FullCalendarSettings } from '../types/settings';
import type FullCalendarPlugin from '../main';
import type EventCache from '../core/EventCache';
import { TFile } from 'obsidian';
import type { CalendarInfo, TestSource } from '../types/calendar_settings';

// Mock Obsidian modules
jest.mock(
  'obsidian',
  () => ({
    App: jest.fn(),
    Modal: jest.fn().mockImplementation(() => ({
      open: jest.fn(),
      close: jest.fn()
    })),
    PluginSettingTab: jest.fn(),
    Setting: jest.fn().mockImplementation(() => ({
      setName: jest.fn().mockReturnThis(),
      setDesc: jest.fn().mockReturnThis(),
      addDropdown: jest.fn().mockReturnThis(),
      addExtraButton: jest.fn().mockReturnThis(),
      addText: jest.fn().mockReturnThis(),
      addToggle: jest.fn().mockReturnThis()
    })),
    DropdownComponent: jest.fn(),
    TextComponent: jest.fn(),
    ToggleComponent: jest.fn(),
    setIcon: jest.fn(),
    normalizePath: (p: string) => p,
    Platform: {
      isMobile: false
    },
    ItemView: jest.fn(),
    WorkspaceLeaf: jest.fn(),
    TFile: jest.fn(),
    TFolder: jest.fn(),
    Menu: jest.fn(),
    activeDocument: typeof document !== 'undefined' ? document : undefined
  }),
  { virtual: true }
);

// Mock the TaskBacklogManager to avoid fullcalendar ESM/CSS import issues
const mockTaskBacklogManager = {
  getIsLoaded: jest.fn().mockReturnValue(false),
  onload: jest.fn(),
  onunload: jest.fn(),
  refreshViews: jest.fn()
};
jest.mock('../features/task-backlogs/TaskBacklogManager', () => ({
  TaskBacklogManager: jest.fn().mockImplementation(() => mockTaskBacklogManager)
}));

// Mock i18n
jest.mock('../features/i18n/i18n', () => ({
  t: jest.fn().mockImplementation((key: string) => key)
}));

describe('ProviderRegistry Unit Tests', () => {
  let mockPlugin: {
    app: {
      workspace: { trigger: jest.Mock; on: jest.Mock; off: jest.Mock };
      vault: Record<string, unknown>;
      metadataCache: Record<string, unknown>;
      fileManager: Record<string, unknown>;
    };
  };
  let mockSettings: { calendarSources: never[] };
  let mockCache: {
    store: {
      getEventsInCalendar: jest.Mock;
      getEventDetails: jest.Mock;
    };
    enhancer: { enhance: (e: OFCEvent) => OFCEvent };
    syncCalendar: jest.Mock;
    syncFile: jest.Mock;
    processProviderUpdates: jest.Mock;
    resync: jest.Mock;
  };
  let registry: ProviderRegistry;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSettings = {
      calendarSources: []
    };

    mockPlugin = {
      app: {
        workspace: {
          trigger: jest.fn(),
          on: jest.fn(),
          off: jest.fn()
        },
        vault: {},
        metadataCache: {},
        fileManager: {}
      }
    };

    mockCache = {
      store: {
        getEventsInCalendar: jest.fn().mockReturnValue([]),
        getEventDetails: jest.fn().mockReturnValue(null)
      },
      enhancer: {
        enhance: (e: OFCEvent) => e
      },
      syncCalendar: jest.fn(),
      syncFile: jest.fn(),
      processProviderUpdates: jest.fn(),
      resync: jest.fn()
    };

    PluginState.getSettings = () => mockSettings as unknown as FullCalendarSettings;

    registry = new ProviderRegistry(mockPlugin as unknown as FullCalendarPlugin);
    registry.setCache(mockCache as unknown as EventCache);
  });

  describe('Identifier and Mapping Operations', () => {
    it('should generate unique IDs', () => {
      const id1 = registry.generateId();
      const id2 = registry.generateId();
      expect(id1).not.toBe(id2);
    });

    it('should store and resolve session ID mappings', async () => {
      const mockEvent: OFCEvent = {
        type: 'single',
        title: 'Test Event',
        date: '2026-06-26',
        allDay: true,
        endDate: null
      };

      const mockProvider: { getEventHandle: jest.Mock } = {
        getEventHandle: jest.fn().mockReturnValue({ persistentId: 'p-123' })
      };

      // Set mock provider instance
      (registry as unknown as { instances: Map<string, unknown> }).instances.set(
        'cal-1',
        mockProvider
      );

      // Verify getGlobalIdentifier
      const globalId = registry.getGlobalIdentifier(mockEvent, 'cal-1');
      expect(globalId).toBe('cal-1::p-123');

      // Add mapping
      registry.addMapping(mockEvent, 'cal-1', 'session-123');

      // Retrieve mapping
      const sessionId = await registry.getSessionId('cal-1::p-123');
      expect(sessionId).toBe('session-123');

      // Remove mapping
      registry.removeMapping('session-123');
      const removedId = await registry.getSessionId('cal-1::p-123');
      expect(removedId).toBeNull();
    });

    it('should compute sync key', () => {
      const mockEvent: OFCEvent = {
        type: 'single',
        title: 'Test Event',
        date: '2026-06-26',
        allDay: true,
        endDate: null
      };

      const mockProviderWithSyncKey: { computeSyncKey: jest.Mock } = {
        computeSyncKey: jest.fn().mockReturnValue('sync-key-abc')
      };

      (registry as unknown as { instances: Map<string, unknown> }).instances.set(
        'cal-1',
        mockProviderWithSyncKey
      );

      const key = registry.computeSyncKeyForEvent(mockEvent, 'cal-1');
      expect(key).toBe('cal-1::sync-key-abc');
      expect(mockProviderWithSyncKey.computeSyncKey).toHaveBeenCalledWith(mockEvent);
    });

    it('should resolve session ID from store fallback', () => {
      const mockEvent: OFCEvent = {
        type: 'single',
        title: 'Test Event',
        date: '2026-06-26',
        allDay: true,
        endDate: null,
        uid: 'uid-123'
      };

      const storedEvents = [
        {
          id: 'session-stored-1',
          event: { uid: 'uid-123' },
          location: null
        }
      ];
      mockCache.store.getEventsInCalendar.mockReturnValue(storedEvents);

      const resolved = (
        registry as unknown as {
          resolveSessionIdFromStoreFallback: (
            calId: string,
            pid: string,
            event?: OFCEvent
          ) => string | null;
        }
      ).resolveSessionIdFromStoreFallback('cal-1', 'uid-123', mockEvent);
      expect(resolved).toBe('session-stored-1');
    });

    it('should build map from store events', async () => {
      const mockEvent: OFCEvent = {
        type: 'single',
        title: 'Test Event',
        date: '2026-06-26',
        allDay: true,
        endDate: null
      };

      const mockProvider: { getEventHandle: jest.Mock } = {
        getEventHandle: jest.fn().mockReturnValue({ persistentId: 'p-123' })
      };
      (registry as unknown as { instances: Map<string, unknown> }).instances.set(
        'cal-1',
        mockProvider
      );

      const mockStore = {
        getAllEvents: jest.fn().mockReturnValue([
          {
            id: 'session-123',
            event: mockEvent,
            calendarId: 'cal-1'
          }
        ])
      };

      registry.buildMap(mockStore);
      const sessionId = await registry.getSessionId('cal-1::p-123');
      expect(sessionId).toBe('session-123');
    });
  });

  describe('Provider registration and management', () => {
    it('should allow registering and looking up provider types', async () => {
      const mockClass = jest.fn();
      // Ensure we export it in a way that Object.values finds a function and matches type
      (mockClass as unknown as { type: string }).type = 'test-type';
      const loader = jest.fn().mockResolvedValue({ TestProvider: mockClass });
      registry.register('test-type', loader);

      const resolved = await registry.getProviderForType('test-type');
      expect(loader).toHaveBeenCalled();
      expect(resolved).toBe(mockClass);
    });
  });

  describe('File update and delete handling', () => {
    it('should delete old path and sync new file on file rename workflow', async () => {
      const mockEvent: OFCEvent = {
        type: 'single',
        title: 'Renamed Meeting',
        date: '2026-09-05',
        allDay: true,
        endDate: null
      };

      const mockInstance = {
        isRemote: false,
        isFileRelevant: jest.fn().mockReturnValue(true),
        getEventsInFile: jest
          .fn()
          .mockResolvedValue([
            [mockEvent, { file: { path: 'events/NewName.md' }, lineNumber: undefined }]
          ])
      };

      (registry as unknown as { instances: Map<string, unknown> }).instances.set(
        'local_1',
        mockInstance
      );
      const testSource: CalendarInfo = {
        type: 'FOR_TEST_ONLY',
        id: 'local_1',
        color: ''
      } satisfies TestSource & { color: string };
      registry.updateSources([testSource]);

      await registry.handleFileDelete('events/OldName.md');
      expect(mockCache.syncFile).toHaveBeenCalledWith({ path: 'events/OldName.md' }, []);

      const mockNewFile = Object.assign(new TFile(), { path: 'events/NewName.md' });
      await registry.handleFileUpdate(mockNewFile);

      expect(mockInstance.isFileRelevant).toHaveBeenCalledWith(mockNewFile);
      expect(mockInstance.getEventsInFile).toHaveBeenCalledWith(mockNewFile);
      expect(mockCache.syncFile).toHaveBeenCalledWith(
        mockNewFile,
        expect.arrayContaining([
          expect.objectContaining({
            event: mockEvent,
            calendarId: 'local_1'
          })
        ])
      );
    });

    describe('fetchAllByPriority second stage loading', () => {
      it('skips calling getEvents in Stage 2 for providers where supportsSecondStage is false', async () => {
        const mockInstance = {
          type: 'custom_plugin_provider',
          displayName: 'Custom Provider',
          isRemote: false,
          loadPriority: 10,
          supportsSecondStage: false,
          getEvents: jest.fn().mockResolvedValue([]),
          getCapabilities: jest.fn().mockReturnValue({})
        };

        (registry as unknown as { instances: Map<string, unknown> }).instances.set(
          'custom_1',
          mockInstance
        );
        const testSource: CalendarInfo = {
          type: 'FOR_TEST_ONLY',
          id: 'custom_1',
          color: ''
        } satisfies TestSource & { color: string };
        registry.updateSources([testSource]);

        const processResults = jest.fn();
        await registry.fetchAllByPriority(processResults);

        // Stage 1 called getEvents with a range
        expect(mockInstance.getEvents).toHaveBeenCalledTimes(1);
        const [stage1Arg] = mockInstance.getEvents.mock.calls[0] as [
          { start?: unknown; end?: unknown }
        ];
        expect(stage1Arg?.start).toBeInstanceOf(Date);
        expect(stage1Arg?.end).toBeInstanceOf(Date);
      });

      it('calls getEvents in Stage 2 for providers where supportsSecondStage is true', async () => {
        const mockInstance = {
          type: 'two_stage_provider',
          displayName: 'Two Stage Provider',
          isRemote: false,
          loadPriority: 10,
          supportsSecondStage: true,
          getEvents: jest.fn().mockResolvedValue([]),
          getCapabilities: jest.fn().mockReturnValue({})
        };

        (registry as unknown as { instances: Map<string, unknown> }).instances.set(
          'two_stage_1',
          mockInstance
        );
        const testSource: CalendarInfo = {
          type: 'FOR_TEST_ONLY',
          id: 'two_stage_1',
          color: ''
        } satisfies TestSource & { color: string };
        registry.updateSources([testSource]);

        const processResults = jest.fn();
        await registry.fetchAllByPriority(processResults);

        // Stage 1 called with range, Stage 2 called without range
        expect(mockInstance.getEvents).toHaveBeenCalledTimes(2);
        const [stage1CallArg] = mockInstance.getEvents.mock.calls[0] as [
          { start?: unknown; end?: unknown }
        ];
        expect(stage1CallArg?.start).toBeInstanceOf(Date);
        expect(stage1CallArg?.end).toBeInstanceOf(Date);
        expect(mockInstance.getEvents).toHaveBeenNthCalledWith(2);
      });
    });
  });
});
