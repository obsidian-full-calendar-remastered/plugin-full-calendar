import { PluginState } from '../../core/PluginState';
/**
 * @file RecurringEventManager.test.ts
 * @brief Tests for RecurringEventManager bug fixes
 */

import { OFCEvent } from '../../types';
import { RecurringEventManager } from './RecurringEventManager';
import EventCache from '../../core/EventCache';
import { CalendarProvider } from '../../providers/Provider';
import { DEFAULT_SETTINGS, FullCalendarSettings } from '../../types/settings';
import FullCalendarPlugin from '../../main';
import type { ProviderRegistry } from '../../providers/ProviderRegistry';

const mockOpenDeleteRecurringModal = jest.fn();
const mockDeleteRecurringModalConstructor = jest.fn();

// Mock Obsidian
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

// Mock dependencies
jest.mock('../../core/EventCache');
jest.mock('../../ui/modals/DeleteRecurringModal', () => ({
  DeleteRecurringModal: jest.fn().mockImplementation((...args: unknown[]) => {
    mockDeleteRecurringModalConstructor(...args);
    return { open: mockOpenDeleteRecurringModal };
  })
}));

describe('RecurringEventManager', () => {
  let manager: RecurringEventManager;
  let mockCache: jest.Mocked<EventCache>;
  let mockProvider: jest.Mocked<CalendarProvider<unknown>>;

  const mockPlugin = {
    app: {},
    settings: DEFAULT_SETTINGS,
    providerRegistry: {
      getSource: jest.fn(),
      getInstance: jest.fn()
    }
  } as unknown as FullCalendarPlugin;

  const setPluginStateFromMock = (plugin: unknown) => {
    const state = plugin as {
      settings: FullCalendarSettings;
      providerRegistry: ProviderRegistry;
    };

    PluginState.setSettings(state.settings);
    PluginState.setProviderRegistry(state.providerRegistry);
  };

  beforeEach(() => {
    setPluginStateFromMock(mockPlugin);
    (PluginState.getProviderRegistry().getSource as jest.Mock).mockClear();
    (PluginState.getProviderRegistry().getInstance as jest.Mock)?.mockClear();

    // Create mock calendar
    mockProvider = {
      type: 'test',
      displayName: 'Test Provider',
      getCapabilities: jest.fn(() => ({
        canCreate: true,
        canEdit: true,
        canDelete: true
      })),
      getEventHandle: jest.fn((event: OFCEvent) => ({ persistentId: event.title }))
    } as unknown as jest.Mocked<CalendarProvider<unknown>>;

    // Create mock cache
    mockCache = {
      getEventById: jest.fn(),
      updateEventWithId: jest.fn(),
      deleteEvent: jest.fn(),
      processEvent: jest.fn(),
      addEvent: jest.fn(),
      flushUpdateQueue: jest.fn(),
      getSessionId: jest.fn(),
      getGlobalIdentifier: jest.fn(
        (event: OFCEvent, calendarId: string) => `${calendarId}::${event.title}`
      ),
      updateQueue: {
        toRemove: new Set<string>(),
        toAdd: new Map()
      },
      generateId: jest.fn().mockReturnValue('override-session-id'),
      enhancer: {
        enhance: jest.fn((event: OFCEvent) => event)
      },
      store: {
        getEventDetails: jest.fn(),
        getAllEvents: jest.fn().mockReturnValue([]),
        add: jest.fn(),
        delete: jest.fn()
      },
      calendars: new Map([['test-calendar', mockProvider]]),
      plugin: mockPlugin
    } as unknown as jest.Mocked<EventCache>;

    manager = new RecurringEventManager(mockCache, mockPlugin);
    mockOpenDeleteRecurringModal.mockClear();
    mockDeleteRecurringModalConstructor.mockClear();
  });

  describe('handleDelete', () => {
    beforeEach(() => {
      (PluginState.getProviderRegistry().getSource as jest.Mock).mockReturnValue({
        type: 'local',
        id: 'test-calendar',
        directory: 'events'
      });
      (PluginState.getProviderRegistry().getInstance as jest.Mock).mockReturnValue(mockProvider);
    });

    it('does not show recurring delete options for single standalone events', async () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'One-off',
        date: '2026-06-08',
        endDate: null,
        allDay: true
      };
      (mockCache.store.getEventDetails as jest.Mock).mockReturnValue({
        id: 'event-id',
        calendarId: 'test-calendar',
        event,
        location: null
      });

      await expect(manager.handleDelete('event-id', event)).resolves.toBe(false);
      expect(mockOpenDeleteRecurringModal).not.toHaveBeenCalled();
    });

    it('shows recurring delete options for recurring masters even without child overrides', async () => {
      const event: OFCEvent = {
        type: 'recurring',
        title: 'Daily standup',
        daysOfWeek: ['M', 'T', 'W', 'R', 'F'],
        endDate: null,
        allDay: false,
        startTime: '09:00',
        endTime: '09:30',
        skipDates: []
      };
      (mockCache.store.getEventDetails as jest.Mock).mockReturnValue({
        id: 'master-id',
        calendarId: 'test-calendar',
        event,
        location: null
      });

      await expect(manager.handleDelete('master-id', event)).resolves.toBe(true);
      expect(mockOpenDeleteRecurringModal).toHaveBeenCalledTimes(1);
      expect(mockDeleteRecurringModalConstructor).toHaveBeenCalledWith(
        mockPlugin.app,
        expect.any(Function),
        expect.any(Function),
        undefined,
        undefined,
        false
      );
    });

    it('deletes CalDAV recurrence overrides through the provider when deleting only one instance', async () => {
      const masterEvent: OFCEvent = {
        type: 'rrule',
        title: 'Daily standup',
        uid: 'series-1',
        startDate: '2026-06-01',
        endDate: null,
        rrule: 'FREQ=DAILY',
        skipDates: [],
        allDay: false,
        startTime: '09:00',
        endTime: '09:30'
      };
      const overrideEvent: OFCEvent = {
        type: 'single',
        title: 'Daily standup moved',
        uid: 'series-1',
        recurrenceId: '2026-06-08T09:00:00.000+02:00',
        date: '2026-06-08',
        endDate: null,
        allDay: false,
        startTime: '10:00',
        endTime: '10:30'
      };

      (PluginState.getProviderRegistry().getSource as jest.Mock).mockReturnValue({
        type: 'caldav',
        id: 'test-calendar'
      });
      (mockCache.store.getEventDetails as jest.Mock).mockReturnValue({
        id: 'override-id',
        calendarId: 'test-calendar',
        event: overrideEvent,
        location: null
      });
      (mockCache.store.getAllEvents as jest.Mock).mockReturnValue([
        {
          id: 'master-id',
          calendarId: 'test-calendar',
          event: masterEvent,
          location: null
        }
      ]);

      await expect(manager.handleDelete('override-id', overrideEvent)).resolves.toBe(true);
      const constructorCalls = mockDeleteRecurringModalConstructor.mock.calls as unknown as Array<
        [unknown, unknown, unknown, () => void]
      >;
      const deleteInstance = constructorCalls[0][3];
      deleteInstance();
      await Promise.resolve();

      const cacheMocks = mockCache as unknown as { deleteEvent: jest.Mock };
      expect(cacheMocks.deleteEvent).toHaveBeenCalledWith('override-id', {
        silent: true,
        force: true
      });
    });
  });

  describe('modifyRecurringInstance', () => {
    const masterEvent: OFCEvent = {
      type: 'rrule',
      title: 'Weekly Remote Meeting',
      uid: 'remote-master',
      startDate: '2026-06-01',
      endDate: null,
      rrule: 'FREQ=WEEKLY',
      skipDates: [],
      allDay: false,
      startTime: '09:00',
      endTime: '10:00',
      notify: { value: 15 },
      alarms: [{ minutesBefore: 15, action: 'DISPLAY' }]
    };

    const overrideEvent: OFCEvent = {
      type: 'single',
      title: 'Weekly Remote Meeting moved',
      uid: 'remote-master',
      date: '2026-06-08',
      endDate: null,
      allDay: false,
      startTime: '11:00',
      endTime: '12:00'
    };

    it('updates native provider masters in cache without rewriting the master event', async () => {
      (mockProvider.getCapabilities as jest.Mock).mockReturnValue({
        canCreate: true,
        canEdit: true,
        canDelete: true,
        ownsRecurringInstanceOverrides: true
      });
      (PluginState.getProviderRegistry().getSource as jest.Mock).mockReturnValue({
        type: 'caldav',
        id: 'test-calendar'
      });
      (PluginState.getProviderRegistry().getInstance as jest.Mock).mockReturnValue(mockProvider);
      (
        PluginState.getProviderRegistry() as unknown as {
          createInstanceOverrideInProvider: jest.Mock;
        }
      ).createInstanceOverrideInProvider = jest.fn().mockResolvedValue([overrideEvent, null]);

      (mockCache.store.getEventDetails as jest.Mock).mockReturnValue({
        id: 'master-session-id',
        calendarId: 'test-calendar',
        event: masterEvent,
        location: null
      });

      await manager.modifyRecurringInstance('master-session-id', '2026-06-08', overrideEvent);

      expect(
        (
          PluginState.getProviderRegistry() as unknown as {
            createInstanceOverrideInProvider: jest.Mock;
          }
        ).createInstanceOverrideInProvider
      ).toHaveBeenCalledWith(
        'test-calendar',
        masterEvent,
        '2026-06-08',
        expect.objectContaining({
          notify: { value: 15 },
          alarms: [{ minutesBefore: 15, action: 'DISPLAY' }]
        })
      );
      const cacheMocks = mockCache as unknown as {
        processEvent: jest.Mock;
        flushUpdateQueue: jest.Mock;
        store: {
          delete: jest.Mock;
          add: jest.Mock;
        };
      };
      expect(cacheMocks.processEvent).not.toHaveBeenCalled();
      expect(cacheMocks.flushUpdateQueue).not.toHaveBeenCalled();
      expect(cacheMocks.store.delete).toHaveBeenCalledWith('master-session-id');
      expect(cacheMocks.store.add).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'master-session-id',
          calendarId: 'test-calendar',
          event: expect.objectContaining({ skipDates: ['2026-06-08'] }) as OFCEvent
        })
      );
      expect(mockCache.updateQueue.toRemove.has('master-session-id')).toBe(true);
      expect(mockCache.updateQueue.toAdd.get('override-session-id')).toMatchObject({
        event: overrideEvent,
        calendarId: 'test-calendar'
      });
    });
  });

  describe('toggleRecurringInstance - undoing completed task', () => {
    beforeEach(() => {
      // Mock the provider registry to return our test provider and config
      (PluginState.getProviderRegistry().getSource as jest.Mock).mockReturnValue({
        type: 'test',
        config: { directory: 'events' }
      });
      // The getProviderAndConfig helper now uses getInstance, so we mock that.
      (PluginState.getProviderRegistry().getInstance as jest.Mock).mockReturnValue(mockProvider);
    });

    const masterEvent: OFCEvent = {
      type: 'recurring',
      title: 'Weekly Meeting',
      daysOfWeek: ['M'],
      allDay: false,
      startTime: '09:00',
      endTime: '10:00',
      isTask: true,
      skipDates: ['2023-11-20'],
      endDate: null
    };

    const originalOverrideEvent: OFCEvent = {
      type: 'single',
      title: 'Weekly Meeting',
      date: '2023-11-20',
      endDate: null,
      allDay: false,
      startTime: '09:00',
      endTime: '10:00',
      completed: '2023-11-20T10:00:00.000Z',
      recurringEventId: 'Weekly Meeting'
    };

    const modifiedTimingOverrideEvent: OFCEvent = {
      type: 'single',
      title: 'Weekly Meeting',
      date: '2023-11-20',
      endDate: null,
      allDay: false,
      startTime: '10:00', // Modified from 09:00
      endTime: '11:00', // Modified from 10:00
      completed: '2023-11-20T11:00:00.000Z',
      recurringEventId: 'Weekly Meeting'
    };

    it('should delete override when timing is unchanged from original', async () => {
      // Setup: child override has original timing
      (mockCache.store.getEventDetails as jest.Mock).mockReturnValue({
        event: originalOverrideEvent,
        calendarId: 'test-calendar',
        location: { path: 'test.md', lineNumber: 1 }
      });

      // Act: undo completion
      await manager.toggleRecurringInstance('child-event-id', '2023-11-20', false);

      // Assert: should delete the override
      const safeMockCache = mockCache as unknown as {
        deleteEvent: jest.Mock;
        updateEventWithId: jest.Mock;
      };
      expect(safeMockCache.deleteEvent).toHaveBeenCalledWith('child-event-id');
      expect(safeMockCache.updateEventWithId).not.toHaveBeenCalled();
    });

    it('should preserve override and change completion status when timing is modified', async () => {
      // Setup: child override has modified timing
      (mockCache.store.getEventDetails as jest.Mock).mockReturnValue({
        event: modifiedTimingOverrideEvent,
        calendarId: 'test-calendar',
        location: { path: 'test.md', lineNumber: 1 }
      });

      // Mock getting the master event session ID and the master event itself
      mockCache.getSessionId.mockResolvedValue('master-event-id');
      mockCache.getEventById.mockReturnValue(masterEvent);

      // Act: undo completion
      await manager.toggleRecurringInstance('child-event-id', '2023-11-20', false);

      // Assert: should preserve override but change completion status
      const safeMockCache = mockCache as unknown as {
        deleteEvent: jest.Mock;
        updateEventWithId: jest.Mock;
      };
      expect(safeMockCache.deleteEvent).not.toHaveBeenCalled();
      expect(safeMockCache.updateEventWithId).toHaveBeenCalledWith(
        'child-event-id',
        expect.objectContaining({
          completed: false
        })
      );
    });

    it('should preserve override when endDate is modified', async () => {
      const modifiedEndDateOverride: OFCEvent = {
        ...originalOverrideEvent,
        endDate: '2023-11-21', // Multi-day event
        completed: '2023-11-20T10:00:00.000Z'
      };

      (mockCache.store.getEventDetails as jest.Mock).mockReturnValue({
        event: modifiedEndDateOverride,
        calendarId: 'test-calendar',
        location: { path: 'test.md', lineNumber: 1 }
      });

      // Mock getting the master event session ID and the master event itself
      mockCache.getSessionId.mockResolvedValue('master-event-id');
      mockCache.getEventById.mockReturnValue(masterEvent);

      // Act: undo completion
      await manager.toggleRecurringInstance('child-event-id', '2023-11-20', false);

      // Assert: should preserve override
      const safeMockCache = mockCache as unknown as {
        deleteEvent: jest.Mock;
        updateEventWithId: jest.Mock;
      };
      expect(safeMockCache.deleteEvent).not.toHaveBeenCalled();
      expect(safeMockCache.updateEventWithId).toHaveBeenCalledWith(
        'child-event-id',
        expect.objectContaining({
          completed: false
        })
      );
    });

    it('should preserve override when allDay status is changed', async () => {
      const modifiedAllDayOverride: OFCEvent = {
        type: 'single',
        title: 'Weekly Meeting',
        date: '2023-11-20',
        endDate: null,
        allDay: true, // Changed from false
        completed: '2023-11-20T10:00:00.000Z',
        recurringEventId: 'Weekly Meeting'
      };

      (mockCache.store.getEventDetails as jest.Mock).mockReturnValue({
        event: modifiedAllDayOverride,
        calendarId: 'test-calendar',
        location: { path: 'test.md', lineNumber: 1 }
      });

      // Mock getting the master event session ID and the master event itself
      mockCache.getSessionId.mockResolvedValue('master-event-id');
      mockCache.getEventById.mockReturnValue(masterEvent);

      // Act: undo completion
      await manager.toggleRecurringInstance('child-event-id', '2023-11-20', false);

      // Assert: should preserve override
      const safeMockCache = mockCache as unknown as {
        deleteEvent: jest.Mock;
        updateEventWithId: jest.Mock;
      };
      expect(safeMockCache.deleteEvent).not.toHaveBeenCalled();
      expect(safeMockCache.updateEventWithId).toHaveBeenCalledWith(
        'child-event-id',
        expect.objectContaining({
          completed: false
        })
      );
    });
  });
});
