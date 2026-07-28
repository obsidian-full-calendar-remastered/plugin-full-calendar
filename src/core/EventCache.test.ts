import { PluginState } from './PluginState';
// src/core/EventCache.test.ts

import { CalendarInfo, EventLocation, OFCEvent } from '../types';
import { CalendarProvider } from '../providers/Provider';
import { DEFAULT_SETTINGS, FullCalendarSettings } from '../types/settings';
import EventCache, { CacheEntry, OFCEventSource, CachedEvent } from './EventCache';
import type FullCalendarPlugin from '../main';
import type { ProviderRegistry } from '../providers/ProviderRegistry';

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

import { TFile } from 'obsidian';

// Mock TimeEngine to prevent real timer/window usage in tests
jest.mock('./TimeEngine', () => ({
  TimeEngine: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    scheduleCacheRebuild: jest.fn()
  }))
}));

jest.mock('../types/schema', () => ({
  validateEvent: (e: unknown) => e
}));

jest.mock('../features/i18n/i18n', () => ({
  t: (key: string) => key,
  initializeI18n: jest.fn(),
  i18n: {
    t: (key: string) => key
  }
}));

const withCounter = <T>(f: (x: string) => T, label?: string) => {
  const counter = () => {
    let count = 0;
    return () => (label || '') + count++;
  };
  const c = counter();
  return () => f(c());
};

const mockEvent = withCounter(
  (title): OFCEvent =>
    ({
      title,
      uid: title,
      type: 'single',
      allDay: true,
      date: '2022-01-01',
      endDate: null,
      skipDates: []
    }) as unknown as OFCEvent,
  'event'
);

const setPluginStateFromMock = (plugin: unknown) => {
  const state = plugin as {
    settings: FullCalendarSettings;
    providerRegistry: ProviderRegistry;
    cache?: EventCache;
  };

  PluginState.setSettings(state.settings);
  PluginState.setProviderRegistry(state.providerRegistry);
  if (state.cache) {
    PluginState.setCache(state.cache);
  }
};

// Replace the entire TestReadonlyCalendar class with this function:
const makeCache = (events: OFCEvent[]) => {
  const mockProvider: CalendarProvider<unknown> = {
    type: 'FOR_TEST_ONLY',
    displayName: 'Test Provider',
    isRemote: false,
    loadPriority: 50,
    getEvents: () => Promise.resolve(events.map(e => [e, null] as [OFCEvent, null])),
    getCapabilities: () => ({ canCreate: false, canEdit: false, canDelete: false }),
    getEventHandle: (e: OFCEvent) => ({ persistentId: e.title }),
    createEvent: jest.fn(),
    updateEvent: jest.fn(),
    deleteEvent: jest.fn(),
    createInstanceOverride: jest.fn(),
    getConfigurationComponent: jest.fn(),
    getSettingsRowComponent: jest.fn()
  };

  const calendarInfo: CalendarInfo = {
    type: 'FOR_TEST_ONLY',
    color: '#000000',
    id: 'test',
    config: {}
  };

  // Update mockPlugin to include getAllSources and required registry mocks
  const mockPlugin = {
    settings: { ...DEFAULT_SETTINGS, calendarSources: [calendarInfo] },
    providerRegistry: {
      getProvider: () => mockProvider,
      fetchAllEvents: () =>
        Promise.resolve(
          events.map(e => ({
            calendarId: 'test',
            event: e,
            location: null
          }))
        ),
      fetchLocalEvents: () =>
        Promise.resolve(
          events.map(e => ({
            calendarId: 'test',
            event: e,
            location: null
          }))
        ),

      fetchAllByPriority: async (
        onProviderComplete?: (
          calendarId: string,
          events: [OFCEvent, EventLocation | null][]
        ) => void | Promise<void>,
        onAllComplete?: () => void | Promise<void>
      ) => {
        // Return local events via callback
        const localEvents = events.map(
          e => [e, null as EventLocation | null] as [OFCEvent, EventLocation | null]
        );
        if (onProviderComplete) {
          await onProviderComplete('test', localEvents);
        }
        if (onAllComplete) {
          await onAllComplete();
        }
      },
      getAllSources: () => [calendarInfo],
      getInstance: () => mockProvider,
      generateId: withCounter(x => x, 'test-id'),
      buildMap: jest.fn(),
      addMapping: jest.fn(),
      removeMapping: jest.fn(),
      computeSyncKeyForEvent: (event: OFCEvent, calendarId: string) =>
        `${calendarId}::${event.uid || event.title}`,
      getSource: () => calendarInfo,
      getCapabilities: () => ({ canCreate: false, canEdit: false, canDelete: false })
    }
  } as unknown as FullCalendarPlugin;

  setPluginStateFromMock(mockPlugin);
  const cache = new EventCache(mockPlugin);
  cache.reset();
  return cache;
};

const extractEvents = (source: OFCEventSource): OFCEvent[] =>
  source.events.map(({ event }: CachedEvent) => event);
async function assertFailed(func: () => Promise<unknown>, message: RegExp) {
  try {
    await func();
  } catch (e) {
    expect(e).toBeInstanceOf(Error);
    expect((e as Error).message).toMatch(message);
    return;
  }
  expect(false).toBeTruthy();
}

describe('event cache with readonly calendar', () => {
  it('populates multiple events', async () => {
    const event1 = mockEvent();
    const event2 = mockEvent();
    const event3 = mockEvent();
    const cache = makeCache([event1, event2, event3]);

    await cache.populate();

    const sources = cache.getAllEvents();
    expect(sources.length).toBe(1);
    expect(extractEvents(sources[0])).toEqual([event1, event2, event3]);
    expect(sources[0].color).toEqual('#000000');
    expect(sources[0].editable).toBeFalsy();
  });

  it('enhances provider-pushed additions through the same read pipeline as initial load', async () => {
    const cache = makeCache([]);
    cache.updateSettings({
      ...DEFAULT_SETTINGS,
      enableAdvancedCategorization: true,
      categorySettings: [{ name: 'Wellness', color: '#448844' }]
    });

    await cache.processProviderUpdates('test', {
      additions: [
        {
          event: {
            uid: 'Daily.md::2',
            title: 'Wellness - Task 2 - edit 2',
            type: 'single',
            allDay: true,
            date: '2026-04-30',
            endDate: null,
            completed: false
          },
          location: null
        }
      ],
      updates: [],
      deletions: []
    });

    const [event] = extractEvents(cache.getAllEvents()[0]);
    expect(event).toMatchObject({
      uid: 'Daily.md::2',
      title: 'Task 2 - edit 2',
      category: 'Wellness'
    });
  });

  it('properly sorts events into separate calendars', async () => {
    const events1 = [mockEvent()];
    const events2 = [mockEvent(), mockEvent()];

    const mockProvider: CalendarProvider<unknown> = {
      type: 'FOR_TEST_ONLY',
      displayName: 'Test Provider',
      isRemote: false,
      loadPriority: 50,
      getEvents: () => Promise.resolve(events1.map(e => [e, null])),
      getCapabilities: () => ({ canCreate: false, canEdit: false, canDelete: false }),
      getEventHandle: (e: OFCEvent) => ({ persistentId: e.title }),
      createEvent: jest.fn(),
      updateEvent: jest.fn(),
      deleteEvent: jest.fn(),
      createInstanceOverride: jest.fn(),
      getConfigurationComponent: jest.fn(),
      getSettingsRowComponent: jest.fn()
    };

    const calendarSources = [
      {
        type: 'FOR_TEST_ONLY',
        id: 'cal1',
        color: 'red',
        config: { id: 'cal1' }
      },
      {
        type: 'FOR_TEST_ONLY',
        id: 'cal2',
        color: 'blue',
        config: { id: 'cal2' }
      }
    ];
    // Update mockPlugin to include getAllSources and fetchAllEvents
    const mockPlugin = {
      settings: { ...DEFAULT_SETTINGS, calendarSources },
      providerRegistry: {
        getProvider: () => mockProvider,
        getAllSources: () => calendarSources,
        fetchAllEvents: () =>
          Promise.resolve([
            ...events1.map(e => ({ calendarId: 'cal1', event: e, location: null })),
            ...events2.map(e => ({ calendarId: 'cal2', event: e, location: null }))
          ]),
        fetchLocalEvents: () =>
          Promise.resolve([
            ...events1.map(e => ({ calendarId: 'cal1', event: e, location: null })),
            ...events2.map(e => ({ calendarId: 'cal2', event: e, location: null }))
          ]),

        fetchAllByPriority: (
          onProviderComplete?: (
            calendarId: string,
            events: [OFCEvent, EventLocation | null][]
          ) => void,
          onAllComplete?: () => void
        ) => {
          // Return local events via callback

          const localResults1 = events1.map(
            e => [e, null as EventLocation | null] as [OFCEvent, EventLocation | null]
          );
          const localResults2 = events2.map(
            e => [e, null as EventLocation | null] as [OFCEvent, EventLocation | null]
          );

          if (onProviderComplete) {
            onProviderComplete('cal1', localResults1);
            onProviderComplete('cal2', localResults2);
          }
          if (onAllComplete) {
            onAllComplete();
          }
          return Promise.resolve();
        },
        getSource: (id: string) => calendarSources.find(source => source.id === id),
        getInstance: () => mockProvider,
        generateId: withCounter(x => x, 'test-id'),
        buildMap: jest.fn(),
        addMapping: jest.fn(),
        removeMapping: jest.fn(),
        computeSyncKeyForEvent: (event: OFCEvent, calendarId: string) =>
          `${calendarId}::${event.uid || event.title}`
      }
    } as unknown as FullCalendarPlugin;
    setPluginStateFromMock(mockPlugin);
    const cache = new EventCache(mockPlugin);
    cache.reset();

    await cache.populate();

    const sources = cache.getAllEvents();
    expect(sources.length).toBe(2);
    expect(extractEvents(sources[0])).toEqual(events1);
    expect(sources[0].color).toEqual('red');
    expect(sources[0].editable).toBeFalsy();
    expect(extractEvents(sources[1])).toEqual(events2);
    expect(sources[1].color).toEqual('blue');
    expect(sources[1].editable).toBeFalsy();
  });

  it.each([
    [
      'addEvent',
      async (cache: EventCache, _id: string) => {
        const result = await cache.addEvent('test', mockEvent());
        expect(result).toBe(false);
      },
      /read-only/i // Placeholder, not used for this specific test case
    ],
    [
      'deleteEvent',
      async (cache: EventCache, id: string) => await cache.deleteEvent(id),
      /does not support deleting/i
    ],
    [
      'modifyEvent',
      async (cache: EventCache, id: string) => await cache.updateEventWithId(id, mockEvent()),
      /does not support editing/i
    ]
  ])('does not allow editing via %p', async (name, f, message) => {
    const event = mockEvent();
    const cache = makeCache([event]);
    await cache.populate();

    const sources = cache.getAllEvents();
    const eventId = sources[0].events[0].id;

    if (name === 'addEvent') {
      await f(cache, eventId); // This test case has its own `expect`
    } else {
      await assertFailed(async () => await f(cache, eventId), message);
    }
  });

  it('populates a single event', async () => {
    const event = mockEvent();
    const cache = makeCache([event]);

    expect(cache.initialized).toBeFalsy();
    await cache.populate();
    expect(cache.initialized).toBeTruthy();

    const sources = cache.getAllEvents();
    expect(sources.length).toBe(1);
    expect(extractEvents(sources[0])).toEqual([event]);
    expect(sources[0].color).toEqual('#000000');
    expect(sources[0].editable).toBeFalsy();
  });
});

type EditableEventResponse = [OFCEvent, EventLocation | null];

// Replace the entire TestEditable class with this function:
const makeEditableCache = (events: EditableEventResponse[]) => {
  const calendar: jest.Mocked<CalendarProvider<unknown>> = {
    type: 'FOR_TEST_ONLY',
    displayName: 'Editable Test Provider',
    isRemote: false,
    loadPriority: 50,
    getEvents: jest.fn(() => Promise.resolve(events)),
    getEventsInFile: jest.fn(() => Promise.resolve([])),
    getCapabilities: jest.fn(() => ({
      canCreate: true,
      canEdit: true,
      canDelete: true
    })),
    getEventHandle: jest.fn((e: OFCEvent) => ({ persistentId: e.uid || e.title })), // Updated to use UID
    createEvent: jest.fn(),
    updateEvent: jest.fn(),
    deleteEvent: jest.fn(),
    createInstanceOverride: jest.fn(),
    getConfigurationComponent: jest.fn(),
    getSettingsRowComponent: jest.fn()
  };

  const calendarInfo: CalendarInfo = {
    type: 'FOR_TEST_ONLY',
    id: 'test',
    config: { id: 'test' },
    color: 'black'
  };
  // Update mockPlugin to include getAllSources and required registry mocks
  const mockPlugin = {
    settings: { ...DEFAULT_SETTINGS, calendarSources: [calendarInfo] },
    providerRegistry: {
      getProvider: () => calendar,
      fetchAllEvents: () =>
        Promise.resolve(
          events.map(([event, location]) => ({
            calendarId: 'test',
            event,
            location
          }))
        ),
      fetchLocalEvents: () =>
        Promise.resolve(
          events.map(([event, location]) => ({
            calendarId: 'test',
            event,
            location
          }))
        ),

      fetchAllByPriority: (
        onProviderComplete?: (
          calendarId: string,
          events: [OFCEvent, EventLocation | null][]
        ) => void,
        onAllComplete?: () => void
      ) => {
        // Return local events via callback
        const localResults = events.map(
          ([event, location]) => [event, location] as [OFCEvent, EventLocation | null]
        );

        if (onProviderComplete) {
          onProviderComplete('test', localResults);
        }
        if (onAllComplete) {
          onAllComplete();
        }
        return Promise.resolve();
      },
      getAllSources: () => [calendarInfo],
      getInstance: () => calendar,
      generateId: withCounter(x => x, 'test-id'),
      buildMap: jest.fn(),
      addMapping: jest.fn(),
      removeMapping: jest.fn(),
      createEventInProvider: jest.fn((id: string, event: OFCEvent) => calendar.createEvent(event)),
      // UPDATED MOCK: delegate to provider's updateEvent
      updateEventInProvider: jest.fn(
        (sessionId: string, calendarId: string, oldEventData: OFCEvent, newEventData: OFCEvent) =>
          calendar.updateEvent(calendar.getEventHandle(oldEventData)!, oldEventData, newEventData)
      ),
      deleteEventInProvider: jest.fn((id: string) => Promise.resolve()),
      getSource: () => calendarInfo,
      getCapabilities: () => ({ canCreate: true, canEdit: true, canDelete: true }),
      getGlobalIdentifier: (event: OFCEvent, calendarId: string) => {
        // Look up the event in the store to get its location path
        const storedEvents = events.filter(([e]) => e.title === event.title);
        if (storedEvents.length > 0 && storedEvents[0][1]?.file?.path) {
          return `${calendarId}::${storedEvents[0][1].file.path}`;
        }
        return `${calendarId}::/path/to/${event.title}.md`;
      },
      computeSyncKeyForEvent: (event: OFCEvent, calendarId: string) =>
        `${calendarId}::${event.uid || event.title}`
    }
  } as unknown as FullCalendarPlugin;
  setPluginStateFromMock(mockPlugin);
  const cache = new EventCache(mockPlugin);

  // Ensure createEvent returns [event, location] as expected by addEvent, and adds the UID.
  calendar.createEvent.mockImplementation((event: OFCEvent) => {
    const location = mockLocation();
    const finalEvent = { ...event, uid: location.file.path }; // Add the UID
    return Promise.resolve([finalEvent, location]);
  });

  cache.reset();
  return [cache, calendar, mockPlugin] as const;
};

// Minimal file-like object; only path is used by store logic.
const mockFile = withCounter(path => Object.assign(new TFile(), { path }), 'file');
const mockLocation = (withLine = false): EventLocation => ({
  file: mockFile(),
  lineNumber: withLine ? Math.floor(Math.random() * 100) : undefined
});

const mockEventResponse = (): EditableEventResponse => [mockEvent(), mockLocation()];

const assertCacheContentCounts = (
  cache: EventCache,
  { calendars, files, events }: { calendars: number; files: number; events: number }
) => {
  expect(cache.getAllEvents().length).toBe(calendars);
  expect(cache.store.fileCount).toBe(files);
  expect(cache.store.eventCount).toBe(events);
};

describe('editable calendars', () => {
  it('populates a single event', async () => {
    const e1 = mockEventResponse();
    const [cache] = makeEditableCache([e1]);

    await cache.populate();

    const sources = cache.getAllEvents();

    expect(sources.length).toBe(1);
    expect(extractEvents(sources[0])).toEqual([e1[0]]);
    expect(sources[0].color).toEqual('black');
    expect(sources[0].editable).toBeTruthy();
  });

  describe('add events', () => {
    it('empty cache', async () => {
      const [cache, calendar] = makeEditableCache([]);

      await cache.populate();

      const event = mockEvent();
      const loc = mockLocation();
      calendar.createEvent.mockResolvedValue([event, loc]);
      expect(await cache.addEvent('test', event)).toBeTruthy();
      const safeCalendar = calendar as unknown as { createEvent: jest.Mock };
      expect(safeCalendar.createEvent).toHaveBeenCalledTimes(1);
      expect(safeCalendar.createEvent).toHaveBeenCalledWith(expect.objectContaining(event));

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 1,
        events: 1
      });
    });

    it('in the same file', async () => {
      const event = mockEventResponse();
      const [cache, calendar] = makeEditableCache([event]);

      await cache.populate();

      const event2 = mockEvent();
      const loc = { file: event[1]!.file, lineNumber: 102 };
      calendar.createEvent.mockResolvedValue([event2, loc]);
      expect(await cache.addEvent('test', event2)).toBeTruthy();
      const safeCalendar = calendar as unknown as { createEvent: jest.Mock };
      const mockCreateEvent = safeCalendar.createEvent;
      expect(mockCreateEvent).toHaveBeenCalledTimes(1);
      expect(mockCreateEvent).toHaveBeenCalledWith(expect.objectContaining(event2));

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 1,
        events: 2
      });
    });

    it('in a different file', async () => {
      const event = mockEventResponse();
      const [cache, calendar] = makeEditableCache([event]);

      await cache.populate();

      const event2 = mockEvent();
      const loc = mockLocation();

      calendar.createEvent.mockResolvedValue([event2, loc]);
      expect(await cache.addEvent('test', event2)).toBeTruthy();
      const safeCalendar = calendar as unknown as { createEvent: jest.Mock };
      const mockCreateEvent = safeCalendar.createEvent;
      expect(mockCreateEvent).toHaveBeenCalledTimes(1);
      expect(mockCreateEvent).toHaveBeenCalledWith(expect.objectContaining(event2));

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 2,
        events: 2
      });
    });

    it('adding many events', async () => {
      const event = mockEventResponse();
      const [cache, calendar] = makeEditableCache([event]);

      await cache.populate();

      const mockAndResolve = (): Promise<EditableEventResponse> =>
        Promise.resolve([mockEvent(), mockLocation()]);
      calendar.createEvent
        .mockReturnValueOnce(mockAndResolve())
        .mockReturnValueOnce(mockAndResolve())
        .mockReturnValueOnce(mockAndResolve());

      expect(await cache.addEvent('test', mockEvent())).toBeTruthy();
      expect(await cache.addEvent('test', mockEvent())).toBeTruthy();
      expect(await cache.addEvent('test', mockEvent())).toBeTruthy();

      const safeCalendar = calendar as unknown as { createEvent: jest.Mock };
      expect(safeCalendar.createEvent).toHaveBeenCalledTimes(3);

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 4,
        events: 4
      });
    });
  });

  describe('delete events', () => {
    it('delete one', async () => {
      const event = mockEventResponse();
      const [cache] = makeEditableCache([event]);

      await cache.populate();

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 1,
        events: 1
      });

      const sources = cache.getAllEvents();
      expect(sources.length).toBe(1);
      const id = sources[0].events[0].id;

      await cache.deleteEvent(id);

      // Updated assertion to registry mock
      const safeRegistry = PluginState.getProviderRegistry() as unknown as {
        deleteEventInProvider: jest.Mock;
      };
      const mockDelete = safeRegistry.deleteEventInProvider;
      expect(mockDelete).toHaveBeenCalledTimes(1);
      expect(mockDelete).toHaveBeenCalledWith(id, event[0], 'test');

      assertCacheContentCounts(cache, {
        calendars: 1, // Calendar source still exists
        files: 0,
        events: 0
      });
    });

    it('delete non-existing event', async () => {
      const event = mockEventResponse();
      const [cache, calendar] = makeEditableCache([event]);

      await cache.populate();
      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 1,
        events: 1
      });

      await assertFailed(() => cache.deleteEvent('unknown ID'), /not found for deletion/);

      const safeCalendar = calendar as unknown as { deleteEvent: jest.Mock };
      expect(safeCalendar.deleteEvent).not.toHaveBeenCalled();

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 1,
        events: 1
      });
    });
  });

  describe('modify event', () => {
    const oldEvent = mockEventResponse();
    const newLoc = mockLocation();
    const newEvent = mockEvent();

    it('assigns a default one-hour endTime when moving all-day event to timed slot', async () => {
      const allDayEvent: EditableEventResponse = [
        {
          title: 'all-day-source',
          uid: 'all-day-source',
          type: 'single',
          allDay: true,
          date: '2026-05-10',
          endDate: null,
          skipDates: []
        } as unknown as OFCEvent,
        mockLocation()
      ];

      const [cache, calendar] = makeEditableCache([allDayEvent]);
      await cache.populate();

      const sources = cache.getAllEvents();
      const id = sources[0].events[0].id;

      const movedToTimed: OFCEvent = {
        title: 'all-day-source',
        uid: 'all-day-source',
        type: 'single',
        allDay: false,
        date: '2026-05-10',
        startTime: '09:00',
        endTime: null,
        endDate: null,
        timezone: 'UTC'
      } as unknown as OFCEvent;

      calendar.updateEvent.mockResolvedValue(mockLocation());

      await cache.updateEventWithId(id, movedToTimed);

      const safeRegistry = PluginState.getProviderRegistry() as unknown as {
        updateEventInProvider: jest.Mock;
      };

      expect(safeRegistry.updateEventInProvider).toHaveBeenCalledWith(
        id,
        'test',
        expect.any(Object),
        expect.objectContaining({
          allDay: false,
          startTime: '09:00',
          endTime: '10:00'
        })
      );

      expect(cache.store.getEventById(id)).toEqual(
        expect.objectContaining({
          allDay: false,
          startTime: '09:00',
          endTime: '10:00'
        })
      );
    });

    it('preserves recurrence identity when updating an existing recurring override', async () => {
      const overrideEvent: EditableEventResponse = [
        {
          title: 'Weekly Meeting',
          uid: 'series-uid',
          recurringEventId: 'series-uid',
          recurrenceId: '2026-06-08T09:00',
          type: 'single',
          allDay: false,
          date: '2026-06-10',
          startTime: '11:00',
          endTime: '12:00',
          endDate: null
        },
        mockLocation()
      ];

      const [cache, calendar] = makeEditableCache([overrideEvent]);
      await cache.populate();

      const id = cache.getAllEvents()[0].events[0].id;
      calendar.updateEvent.mockResolvedValue(mockLocation());

      await cache.updateEventWithId(id, {
        title: 'Weekly Meeting',
        type: 'single',
        allDay: false,
        date: '2026-06-11',
        startTime: '13:00',
        endTime: '14:00',
        endDate: null
      });

      expect(calendar.updateEvent.mock.calls[0]).toEqual([
        expect.objectContaining({ persistentId: 'series-uid' }),
        expect.objectContaining({ recurrenceId: '2026-06-08T09:00' }),
        expect.objectContaining({
          uid: 'series-uid',
          recurringEventId: 'series-uid',
          recurrenceId: '2026-06-08T09:00',
          date: '2026-06-11'
        })
      ]);
      expect(cache.store.getEventById(id)).toEqual(
        expect.objectContaining({
          uid: 'series-uid',
          recurringEventId: 'series-uid',
          recurrenceId: '2026-06-08T09:00',
          date: '2026-06-11'
        })
      );
    });

    it.each([
      [
        'calendar moves event to a new file',
        newLoc,
        [
          { file: oldEvent[1]!.file, numEvents: 0 },
          { file: newLoc.file, numEvents: 1 }
        ],
        1 // The old file is gone, so the total count is now 1.
      ],
      [
        'calendar keeps event in the same file, but moves it around',
        { file: oldEvent[1]!.file, lineNumber: newLoc.lineNumber },
        [{ file: oldEvent[1]!.file, numEvents: 1 }],
        1 // The file count never changes.
      ]
    ])('%p', async (_, newLocation, fileDetails, expectedFileCount) => {
      const [cache, calendar] = makeEditableCache([oldEvent]);
      await cache.populate();

      assertCacheContentCounts(cache, { calendars: 1, files: 1, events: 1 });

      const sources = cache.getAllEvents();
      const id = sources[0].events[0].id;

      calendar.updateEvent.mockResolvedValue(newLocation);

      await cache.updateEventWithId(id, newEvent);

      const safeRegistry = PluginState.getProviderRegistry() as unknown as {
        updateEventInProvider: jest.Mock;
      };
      expect(safeRegistry.updateEventInProvider).toHaveBeenCalledTimes(1);
      expect(safeRegistry.updateEventInProvider).toHaveBeenCalledWith(
        id,
        'test',
        expect.objectContaining(oldEvent[0]), // Corrected line
        expect.objectContaining(newEvent)
      );

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: expectedFileCount,
        events: 1
      });

      expect(cache.store.getEventById(id)).toEqual(newEvent);

      for (const { file, numEvents } of fileDetails) {
        const eventsInFile = cache.store.getEventsInFile(file);
        expect(eventsInFile).toHaveLength(numEvents);
      }
    });

    it('modify non-existing event', async () => {
      const event = mockEventResponse();
      const [cache, calendar] = makeEditableCache([event]);
      await cache.populate();

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 1,
        events: 1
      });

      await assertFailed(
        () => cache.updateEventWithId('unknown ID', mockEvent()),
        /not present in event store/
      );

      const sources = cache.getAllEvents();
      expect(sources.length).toBe(1);
      const id = sources[0].events[0].id;

      const safeCalendar = calendar as unknown as { updateEvent: jest.Mock };
      expect(safeCalendar.updateEvent).not.toHaveBeenCalled();
      expect(cache.store.getEventById(id)).toEqual(event[0]);

      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 1,
        events: 1
      });
    });
  });

  describe('filesystem update callback', () => {
    const callbackMock = jest.fn<
      void,
      [
        | { type: 'events'; toRemove: string[]; toAdd: CacheEntry[] }
        | { type: 'calendar'; calendar: OFCEventSource }
        | { type: 'resync' }
      ]
    >();
    const oldEvent = mockEventResponse();
    const newEvent = mockEventResponse();
    let cache: EventCache;
    let calendar: jest.Mocked<CalendarProvider<unknown>>;

    beforeEach(async () => {
      [cache, calendar] = makeEditableCache([oldEvent]);
      await cache.populate();
      callbackMock.mockClear();
      cache.on('update', callbackMock);
    });

    it.each([
      {
        test: 'New event in a new file',
        eventsInFile: [newEvent],
        file: newEvent[1]!.file,
        counts: { files: 2, events: 2 },
        callback: { toRemoveLength: 0, eventsToAddLength: 1 }
      },
      {
        test: 'Changing events in an existing location',
        eventsInFile: [[newEvent[0], oldEvent[1]] as EditableEventResponse],
        file: oldEvent[1]!.file,
        counts: { files: 1, events: 1 },
        callback: { toRemoveLength: 1, eventsToAddLength: 1 }
      },
      {
        test: 'No callback fired if event does not change.',
        eventsInFile: [oldEvent],
        file: oldEvent[1]!.file,
        counts: { files: 1, events: 1 },
        callback: null
      }
    ])('$test', async ({ eventsInFile, file, counts: { files, events }, callback }) => {
      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 1,
        events: 1
      });

      if (calendar.getEventsInFile) {
        // Type guard
        (calendar.getEventsInFile as jest.Mock).mockResolvedValue(eventsInFile);
      }

      // Simulate ProviderRegistry fetching events and calling syncFile
      const newEventsForSync = eventsInFile.map(([event, location]) => ({
        event,
        location,
        calendarId: 'test'
      }));
      if (!(file instanceof TFile)) throw new Error('Expected TFile');
      await cache.syncFile(file, newEventsForSync);

      assertCacheContentCounts(cache, {
        calendars: 1,
        files,
        events
      });

      if (callback) {
        expect(callbackMock).toHaveBeenCalled();
        const { toRemoveLength, eventsToAddLength } = callback;
        const callbackInvocation = callbackMock.mock.calls[0][0] as {
          toRemove: string[];
          toAdd: CacheEntry[];
        };

        expect(callbackInvocation.toAdd).toBeDefined();
        expect(callbackInvocation.toRemove).toBeDefined();

        expect(callbackInvocation.toRemove.length).toBe(toRemoveLength);
        expect(callbackInvocation.toAdd.length).toBe(eventsToAddLength);
        if (eventsToAddLength > 0) {
          expect(callbackInvocation.toAdd[0].event).toEqual(eventsInFile[0][0]);
        }
      } else {
        expect(callbackMock).not.toHaveBeenCalled();
      }
    });
    it.todo('updates when events are the same but locations are different');

    it('should pass correct affectedCalendars on deletion via file sync', async () => {
      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 1,
        events: 1
      });

      if (calendar.getEventsInFile) {
        (calendar.getEventsInFile as jest.Mock).mockResolvedValue([]);
      }

      const file = oldEvent[1]!.file;
      if (!(file instanceof TFile)) throw new Error('Expected TFile');

      // Sync file with 0 events (represents a deletion of all events in the file)
      await cache.syncFile(file, []);

      // Verify counts in cache
      assertCacheContentCounts(cache, {
        calendars: 1,
        files: 0,
        events: 0
      });

      // Verify callback was invoked and has correct affectedCalendars
      expect(callbackMock).toHaveBeenCalledTimes(1);
      const callbackInvocation = callbackMock.mock.calls[0][0] as {
        type: 'events';
        toRemove: string[];
        toAdd: CacheEntry[];
        affectedCalendars: string[];
      };
      expect(callbackInvocation.type).toBe('events');
      expect(callbackInvocation.toRemove.length).toBe(1);
      expect(callbackInvocation.toAdd.length).toBe(0);
      expect(callbackInvocation.affectedCalendars).toEqual(['test']);
    });
  });

  describe('affectedCalendars on cache mutations', () => {
    const callbackMock = jest.fn<
      void,
      [
        | { type: 'events'; toRemove: string[]; toAdd: CacheEntry[]; affectedCalendars?: string[] }
        | { type: 'calendar'; calendar: OFCEventSource }
        | { type: 'resync' }
      ]
    >();
    const event = mockEventResponse();
    let cache: EventCache;

    beforeEach(async () => {
      const [c] = makeEditableCache([event]);
      cache = c;
      await cache.populate();
      callbackMock.mockClear();
      cache.on('update', callbackMock);
    });

    it('should pass calendarId on deleteEvent', async () => {
      const sources = cache.getAllEvents();
      const id = sources[0].events[0].id;

      await cache.deleteEvent(id);

      expect(callbackMock).toHaveBeenCalledTimes(1);
      const callbackInvocation = callbackMock.mock.calls[0][0];
      if (callbackInvocation.type !== 'events') {
        throw new Error('Expected events payload');
      }
      expect(callbackInvocation.affectedCalendars).toEqual(['test']);
    });

    it('should pass calendarId on addEvent', async () => {
      const newEvent: OFCEvent = {
        title: 'New Added Event',
        type: 'single',
        allDay: true,
        date: '2026-05-20',
        endDate: null
      };

      await cache.addEvent('test', newEvent);

      expect(callbackMock).toHaveBeenCalledTimes(1);
      const callbackInvocation = callbackMock.mock.calls[0][0];
      if (callbackInvocation.type !== 'events') {
        throw new Error('Expected events payload');
      }
      expect(callbackInvocation.affectedCalendars).toEqual(['test']);
    });

    it('should pass calendarId on updateEventWithId', async () => {
      const sources = cache.getAllEvents();
      const id = sources[0].events[0].id;
      const originalEvent = sources[0].events[0].event;

      const updatedEvent: OFCEvent = {
        ...originalEvent,
        title: 'Updated Event Title'
      };

      await cache.updateEventWithId(id, updatedEvent);

      expect(callbackMock).toHaveBeenCalled();
      const callbackInvocation = callbackMock.mock.calls[0][0];
      if (callbackInvocation.type !== 'events') {
        throw new Error('Expected events payload');
      }
      expect(callbackInvocation.affectedCalendars).toEqual(['test']);
    });
  });

  describe('Non-blocking remote calendar loading', () => {
    let mockPlugin: FullCalendarPlugin;
    let cache: EventCache;

    beforeEach(() => {});

    it('should load local providers immediately and remote providers asynchronously', async () => {
      // Create mock local and remote providers
      const localEvent = mockEvent();
      const remoteEvent = mockEvent();

      const localProvider: CalendarProvider<unknown> = {
        type: 'local',
        displayName: 'Local Provider',
        isRemote: false,
        loadPriority: 10,
        getEvents: jest.fn().mockResolvedValue([[localEvent, null]]),
        getCapabilities: () => ({ canCreate: false, canEdit: false, canDelete: false }),
        getEventHandle: (e: OFCEvent) => ({ persistentId: e.title }),
        createEvent: jest.fn(),
        updateEvent: jest.fn(),
        deleteEvent: jest.fn(),
        createInstanceOverride: jest.fn(),
        getConfigurationComponent: jest.fn(),
        getSettingsRowComponent: jest.fn()
      };

      const remoteProvider: CalendarProvider<unknown> = {
        type: 'ical',
        displayName: 'Remote ICS Provider',
        isRemote: true,
        loadPriority: 100,
        getEvents: jest
          .fn()
          .mockImplementation(
            () =>
              new Promise(resolve => window.setTimeout(() => resolve([[remoteEvent, null]]), 100))
          ),
        getCapabilities: () => ({ canCreate: false, canEdit: false, canDelete: false }),
        getEventHandle: (e: OFCEvent) => ({ persistentId: e.title }),
        createEvent: jest.fn(),
        updateEvent: jest.fn(),
        deleteEvent: jest.fn(),
        createInstanceOverride: jest.fn(),
        getConfigurationComponent: jest.fn(),
        getSettingsRowComponent: jest.fn()
      };

      const calendarSources = [
        { type: 'local', id: 'local1', color: 'blue', config: {} },
        { type: 'ical', id: 'remote1', color: 'red', config: {} }
      ];

      // const syncCalendarSpy = jest.fn(); // Moved spy creation to after cache init

      mockPlugin = {
        settings: { ...DEFAULT_SETTINGS, calendarSources },
        providerRegistry: {
          getProvider: (id: string) => {
            if (id === 'local1') return localProvider;
            if (id === 'remote1') return remoteProvider;
            return undefined;
          },
          getAllSources: () => calendarSources,
          getSource: (id: string) => calendarSources.find(s => s.id === id),
          getInstance: (id: string) => {
            if (id === 'local1') return localProvider;
            if (id === 'remote1') return remoteProvider;
            return undefined;
          },
          generateId: withCounter(x => x, 'test-id'),
          fetchAllByPriority: async (
            onProviderComplete?: (
              calId: string,
              events: [OFCEvent, EventLocation | null][]
            ) => void,
            onAllComplete?: () => void
          ) => {
            // 1. Fetch Local
            const localEvents = await localProvider.getEvents();
            if (onProviderComplete) {
              onProviderComplete(
                'local1',
                localEvents.map(([e, l]) => [e, l] as [OFCEvent, EventLocation | null])
              );
            }
            // 2. Local Complete Callback (Stage 1 Complete)
            if (onAllComplete) {
              onAllComplete();
            }

            // 3. Simulate Remote Provider (this was missing causing the test failure)
            // We need to execute the remote provider promise and call callback
            // Note: In real code this happens in background. Here we just trigger it.
            void remoteProvider.getEvents().then(remoteEvents => {
              if (onProviderComplete) {
                onProviderComplete(
                  'remote1',
                  remoteEvents.map(([e, l]) => [e, l] as [OFCEvent, EventLocation | null])
                );
              }
            });

            return Promise.resolve();
          },
          buildMap: jest.fn(),
          addMapping: jest.fn(),
          removeMapping: jest.fn(),
          computeSyncKeyForEvent: (event: OFCEvent, calendarId: string) =>
            `${calendarId}::${event.uid || event.title}`
        }
      } as unknown as FullCalendarPlugin;
      setPluginStateFromMock(mockPlugin);
      cache = new EventCache(mockPlugin);
      cache.reset();
      const syncCalendarSpy = jest.spyOn(cache, 'syncCalendar');

      await cache.populate();

      // Expect local provider to be loaded and synced immediately (before populate returns if await works as intended for local)
      // Actually, populate awaits the entire fetchAllByPriority, which handles local then background remote.
      expect(syncCalendarSpy).toHaveBeenCalledWith(
        'local1',
        expect.arrayContaining([expect.arrayContaining([localEvent, null])])
      );

      // Remote provider should NOT be loaded yet (if we were truly async without await in test,
      // but fetchAllByPriority implementation determines this.
      // In the real implementation, fetchAllByPriority awaits local, calls onLocalComplete, then does remote in background?
      // Let's verify standard behavior.
      const sources = cache.getAllEvents();
      expect(sources.length).toBe(2); // Both local and remote calendars should be initialized
      const localSource = sources.find(s => s.id === 'local1');
      expect(localSource).toBeDefined();
      expect(localSource!.events).toHaveLength(1);
      expect(localSource!.events[0].event).toEqual(localEvent);

      // Remote calendar should be empty initially
      const remoteSource = sources.find(s => s.id === 'remote1');
      expect(remoteSource).toBeDefined();
      expect(remoteSource!.events).toHaveLength(0);

      // Wait for remote provider to complete
      await new Promise(resolve => window.setTimeout(resolve, 200));

      // Assert: syncCalendar should have been called for remote provider
      expect(syncCalendarSpy).toHaveBeenCalledWith('remote1', [[remoteEvent, null]]);
    });

    it('should respect priority order for remote providers', async () => {
      const icsEvent = mockEvent();
      const caldavEvent = mockEvent();
      const googleEvent = mockEvent();

      const loadOrder: string[] = [];

      const createRemoteProvider = (type: string, event: OFCEvent): CalendarProvider<unknown> => ({
        type,
        displayName: `${type} Provider`,
        isRemote: true,
        loadPriority: type === 'ical' ? 100 : type === 'caldav' ? 110 : 120,
        getEvents: jest.fn().mockImplementation(() => {
          loadOrder.push(type);
          return Promise.resolve([[event, null]]);
        }),
        getCapabilities: () => ({ canCreate: false, canEdit: false, canDelete: false }),
        getEventHandle: (e: OFCEvent) => ({ persistentId: e.title }),
        createEvent: jest.fn(),
        updateEvent: jest.fn(),
        deleteEvent: jest.fn(),
        createInstanceOverride: jest.fn(),
        getConfigurationComponent: jest.fn(),
        getSettingsRowComponent: jest.fn()
      });

      const calendarSources = [
        { type: 'google', id: 'google1', color: 'green', config: {} },
        { type: 'ical', id: 'ics1', color: 'blue', config: {} },
        { type: 'caldav', id: 'caldav1', color: 'red', config: {} }
      ];

      mockPlugin = {
        settings: { ...DEFAULT_SETTINGS, calendarSources },
        providerRegistry: {
          getAllSources: () => calendarSources,
          getInstance: (id: string) => {
            if (id === 'google1') return createRemoteProvider('google', googleEvent);
            if (id === 'ics1') return createRemoteProvider('ical', icsEvent);
            if (id === 'caldav1') return createRemoteProvider('caldav', caldavEvent);
            return null;
          },
          fetchLocalEvents: jest.fn().mockResolvedValue([]),

          fetchAllByPriority: jest
            .fn()
            .mockImplementation(
              async (
                onProviderComplete?: (
                  calId: string,
                  events: { event: OFCEvent; location: EventLocation | null }[]
                ) => void,
                onAllComplete?: () => void
              ) => {
                // Simulate unified priority-based loading using the new loadPriority values
                const instances = new Map([
                  ['google1', createRemoteProvider('google', googleEvent)],
                  ['ics1', createRemoteProvider('ical', icsEvent)],
                  ['caldav1', createRemoteProvider('caldav', caldavEvent)]
                ]);

                // Sort by loadPriority (lower = higher priority)
                const prioritizedProviders = Array.from(instances.entries()).sort(
                  ([, a], [, b]) => a.loadPriority - b.loadPriority
                );

                for (const [settingsId, instance] of prioritizedProviders) {
                  try {
                    const rawEvents = await instance.getEvents();
                    const events = rawEvents.map(([rawEvent, location]) => ({
                      event: rawEvent,
                      location
                    }));

                    if (onProviderComplete) {
                      onProviderComplete(settingsId, events);
                    }
                  } catch {
                    // Continue with next provider
                  }
                }

                if (onAllComplete) {
                  onAllComplete();
                }
                return Promise.resolve();
              }
            ),
          generateId: withCounter(x => x, 'test-id'),
          buildMap: jest.fn(),
          addMapping: jest.fn(),
          removeMapping: jest.fn(),
          computeSyncKeyForEvent: (event: OFCEvent, calendarId: string) =>
            `${calendarId}::${event.uid || event.title}`,
          getSource: (id: string) => calendarSources.find(s => s.id === id)
        }
      } as unknown as FullCalendarPlugin;
      setPluginStateFromMock(mockPlugin);
      cache = new EventCache(mockPlugin);
      cache.reset();
      jest.spyOn(cache, 'syncCalendar').mockImplementation(async () => {});

      // Act: Call populate and wait for completion
      await cache.populate();
      await new Promise(resolve => window.setTimeout(resolve, 100));

      // Assert: Providers should have been loaded in priority order: ICS > CalDAV > Google
      expect(loadOrder).toEqual(['ical', 'caldav', 'google']);
    });
  });

  describe('make sure cache is populated before doing anything', () => {
    describe('move event', () => {
      it('moves event from one calendar to another', async () => {
        const event = mockEventResponse();
        const [cache, calendar] = makeEditableCache([event]);
        await cache.populate();

        // Add a second calendar to move to
        // Note: calendar2 not directly used, but cal2Info is passed through providerRegistry
        const cal2Info: CalendarInfo = {
          type: 'FOR_TEST_ONLY',
          id: 'cal2',
          config: { id: 'cal2' },
          color: 'green'
        };

        // We need to patch the registry on the EXISTING mockPlugin
        const providerRegistry = PluginState.getProviderRegistry();
        const originalGetSource = providerRegistry.getSource.bind(providerRegistry);
        const originalGetCapabilities = providerRegistry.getCapabilities.bind(providerRegistry);

        providerRegistry.getSource = (id: string) => {
          if (id === 'cal2') return cal2Info;
          return originalGetSource(id);
        };

        providerRegistry.getCapabilities = (id: string) => {
          if (id === 'cal2') return { canCreate: true, canEdit: true, canDelete: true };
          return originalGetCapabilities(id);
        };

        // Mock createEventInProvider for destination and ensure it returns formatted event
        (providerRegistry.createEventInProvider as jest.Mock).mockImplementation(
          async (calId: string, evt: OFCEvent) => {
            if (calId === 'cal2') {
              return [evt, mockLocation()];
            }
            return calendar.createEvent(evt);
          }
        );

        // We must add the new calendar to the cache manually since reset() was already called in makeEditableCache
        // Alternatively, we can patch getAllSources and reset again.
        providerRegistry.getAllSources = () => [providerRegistry.getSource('test')!, cal2Info];
        // We also need getInstance to work for cal2
        providerRegistry.getInstance = (id: string) => {
          if (id === 'cal2') return calendar; // Reuse same mock provider for simplicity
          if (id === 'test') return calendar;
          return undefined;
        };

        cache.reset(); // Reload calendars
        await cache.populate(); // Repopulate

        const sources = cache.getAllEvents();
        // Should have 2 calendars now.
        // But verify we have the event in the first one 'test'
        const testCalParams = sources.find(s => s.id === 'test');
        expect(testCalParams).toBeDefined();
        expect(testCalParams!.events.length).toBe(1);

        const eventId = testCalParams!.events[0].id;
        const eventData = testCalParams!.events[0].event;

        // Perform move
        await cache.moveEventToCalendar(eventId, 'cal2');

        // Verify delete was called on old calendar
        const safeRegistry = providerRegistry as unknown as {
          deleteEventInProvider: jest.Mock;
          createEventInProvider: jest.Mock;
        };
        expect(safeRegistry.deleteEventInProvider).toHaveBeenCalledTimes(1);
        // The id passed to deleteEventInProvider is the session ID.

        // Verify create was called on new calendar
        // We expect createEventInProvider to be called with 'cal2' and the event data
        expect(safeRegistry.createEventInProvider).toHaveBeenCalledWith(
          'cal2',
          expect.objectContaining({
            title: eventData.title
          })
        );

        // Verify cache state
        // Old event gone?
        // Note: we can't check by old ID because it's gone.
        const oldEvents = cache.store.getEventsInCalendar('test');
        expect(oldEvents.length).toBe(0);

        // New event exists?
        const newEvents = cache.store.getEventsInCalendar('cal2');
        expect(newEvents.length).toBe(1);
        expect(newEvents[0].event.title).toBe(eventData.title);
      });
      it('moves a recurring master event and its children', async () => {
        const masterTuple = mockEventResponse();
        // Force filename to match what child expects
        masterTuple[1]!.file.path = 'folder/Master.md';

        const masterEvent = { ...masterTuple[0], type: 'recurring', title: 'Master' } as OFCEvent;
        const masterSource: EditableEventResponse = [masterEvent, masterTuple[1]];

        const childTuple = mockEventResponse();
        const childEvent = {
          ...childTuple[0],
          type: 'single',
          title: 'Master',
          recurringEventId: 'Master.md' // Matches master filename
        } as OFCEvent;
        const childSource: EditableEventResponse = [childEvent, childTuple[1]];

        const [cache, calendar] = makeEditableCache([masterSource, childSource]);
        await cache.populate();

        // Setup Destination Calendar
        const calendar2: jest.Mocked<CalendarProvider<unknown>> = {
          ...calendar,
          type: 'FOR_TEST_ONLY_2'
        };
        // We need to support `createEventInProvider` returning a location with file path for linking
        const mockLocationWithFile = (filename: string) => ({
          file: Object.assign(new TFile(), { path: `folder/${filename}` }),
          lineNumber: 1
        });

        type MutableProviderRegistry = {
          getProvider: (id: string) => CalendarProvider<unknown> | undefined;
          getInstance: (id: string) => CalendarProvider<unknown> | undefined;
          getSource: (id: string) => CalendarInfo | undefined;
          createEventInProvider: jest.Mock;
          deleteEventInProvider: jest.Mock;
          updateEventInProvider: jest.Mock;
          getAllSources: () => CalendarInfo[];
          getCapabilities: (id: string) => {
            canCreate: boolean;
            canEdit: boolean;
            canDelete: boolean;
          };
        };

        const providerRegistry =
          PluginState.getProviderRegistry() as unknown as MutableProviderRegistry;
        const originalGetSource = providerRegistry.getSource;
        providerRegistry.getProvider = (id: string) => (id === 'cal2' ? calendar2 : calendar);
        providerRegistry.getInstance = (id: string) => (id === 'cal2' ? calendar2 : calendar);
        // FIX: preserve original getSource behavior for 'test'
        providerRegistry.getSource = (id: string) =>
          id === 'cal2'
            ? ({
                id: 'cal2',
                type: 'local',
                config: { directory: 'folder' },
                color: 'green'
              } as unknown as CalendarInfo)
            : originalGetSource(id);

        // Mock createEventInProvider for destination
        providerRegistry.createEventInProvider.mockImplementation(
          (calId: string, evt: OFCEvent) => {
            if (evt.type === 'recurring') {
              return Promise.resolve([evt, mockLocationWithFile('NewMaster.md')]);
            }
            return Promise.resolve([evt, mockLocation()]);
          }
        );

        // Get Master ID
        const sources = cache.getAllEvents();
        const testSource = sources.find(s => s.id === 'test');
        const masterId = testSource!.events.find(e => e.event.type === 'recurring')!.id;
        const childId = testSource!.events.find(e => e.event.type === 'single')!.id;

        // Spy on delete
        const deleteSpy = jest.spyOn(providerRegistry, 'deleteEventInProvider');

        // Execute Move
        await cache.moveEventToCalendar(masterId, 'cal2');

        // ASSERTIONS

        // 1. Master Created in New Cal
        expect(providerRegistry.createEventInProvider).toHaveBeenCalledWith(
          'cal2',
          expect.objectContaining({ title: 'Master', type: 'recurring' })
        );

        // 2. Child Created in New Cal with UPDATED Link
        // The child should have `recurringEventId` set to 'NewMaster.md' (derived from location)
        expect(providerRegistry.createEventInProvider).toHaveBeenCalledWith(
          'cal2',
          expect.objectContaining({
            title: 'Master',
            type: 'single',
            recurringEventId: 'NewMaster.md'
          })
        );

        // 3. Old Events Deleted
        expect(deleteSpy).toHaveBeenCalledWith(masterId, expect.anything(), 'test');
        expect(deleteSpy).toHaveBeenCalledWith(childId, expect.anything(), 'test');
      });

      it('moves a child instance as a detached single event', async () => {
        const masterTuple = mockEventResponse();
        const masterEvent = { ...masterTuple[0], type: 'recurring', title: 'Master' } as OFCEvent;
        const masterSource: EditableEventResponse = [masterEvent, masterTuple[1]];

        const childTuple = mockEventResponse();
        const childEvent = {
          ...childTuple[0],
          type: 'single',
          title: 'Master',
          recurringEventId: 'Master'
        } as OFCEvent;
        const childSource: EditableEventResponse = [childEvent, childTuple[1]];

        const [cache] = makeEditableCache([masterSource, childSource]);
        await cache.populate();

        const providerRegistry = PluginState.getProviderRegistry();
        const deleteSpy = jest.spyOn(providerRegistry, 'deleteEventInProvider');

        // Get Child ID
        const sources = cache.getAllEvents();
        const testSource = sources.find(s => s.id === 'test');
        const childId = testSource!.events.find(e => e.event.type === 'single')!.id;

        // Execute Move to same calendar (simulating detach + move, or different cal)
        // Let's move to 'cal2' just like before
        await cache.moveEventToCalendar(childId, 'cal2');

        // 1. Created as Single in New Cal (recurringEventId removed)
        // 1. Created as Single in New Cal (recurringEventId removed)
        // We expect recurringEventId to be missing. expect.objectContaining({ recurringEventId: undefined }) fails if key is missing.
        const safeRegistry = providerRegistry as unknown as { createEventInProvider: jest.Mock };
        expect(safeRegistry.createEventInProvider).toHaveBeenCalledWith(
          'cal2',
          expect.objectContaining({
            title: 'Master',
            type: 'single'
          })
        );
        // Verify recurringEventId is NOT present in the call arguments
        const createCallArgs = (
          providerRegistry.createEventInProvider as jest.Mock<unknown, unknown[]>
        ).mock.calls[0];
        expect(createCallArgs[1]).not.toHaveProperty('recurringEventId');

        // 2. Old Child Deleted
        expect(deleteSpy).toHaveBeenCalledWith(childId, expect.anything(), 'test');

        // 3. Master Skip Dates updated (hard to test with mocks unless we inspect calls to updateEvent)
      });
    });
  });
});
