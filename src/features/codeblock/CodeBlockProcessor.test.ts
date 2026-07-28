import { EmbeddedCalendar, ViewConfig, sanitizeEmbeddedConfig } from './CodeBlockProcessor';
import { parseRelativeOffset, getEventSources } from './CodeBlockQueryHelper';
import { DateTime } from 'luxon';
import { PluginState } from '../../core/PluginState';
import {
  EventFilterSortEngine,
  EventFilterCriteria,
  EventSortCriteria,
  QueryableEvent
} from '../../core/EventFilterSortEngine';
import type { EventSourceInput } from '@fullcalendar/core';
import type { OFCEventSource } from '../../core/EventCache';
import type { FullCalendarSettings } from '../../types/settings';
import type EventCache from '../../core/EventCache';
import type { InternalAPI } from '../../api/FullCalendarAPI';
import type FullCalendarPlugin from '../../main';

interface FakeContext {
  app: {
    vault: {
      getAbstractFileByPath: jest.Mock;
    };
  };
  widgetCtx: {
    sourcePath: string;
  };
  enhancerInstance: {
    updateSettings: jest.Mock;
    getEnhancedData: jest.Mock;
  };
}

interface EmbeddedCalendarWithPrivate {
  getSourcesAndConfig(config: ViewConfig): {
    sources: EventSourceInput[];
    initialDate?: string;
  };
}

interface TestEvent {
  id: string;
}

interface TestEventSource {
  id: string;
  events: TestEvent[];
}

describe('CodeBlockProcessor Relative Offset Parsing', () => {
  const baseDate = DateTime.fromISO('2026-06-15T00:00:00.000Z', { zone: 'utc' });

  it('parses basic positive and negative day offsets correctly', () => {
    expect(parseRelativeOffset('+3d', baseDate).toISO()).toBe('2026-06-18T00:00:00.000Z');
    expect(parseRelativeOffset('-5d', baseDate).toISO()).toBe('2026-06-10T00:00:00.000Z');
  });

  it('parses week offsets correctly', () => {
    expect(parseRelativeOffset('+2w', baseDate).toISO()).toBe('2026-06-29T00:00:00.000Z');
    expect(parseRelativeOffset('-1w', baseDate).toISO()).toBe('2026-06-08T00:00:00.000Z');
  });

  it('parses month offsets correctly', () => {
    expect(parseRelativeOffset('+1m', baseDate).toISO()).toBe('2026-07-15T00:00:00.000Z');
    expect(parseRelativeOffset('-2m', baseDate).toISO()).toBe('2026-04-15T00:00:00.000Z');
  });

  it('parses year offsets correctly', () => {
    expect(parseRelativeOffset('+1y', baseDate).toISO()).toBe('2027-06-15T00:00:00.000Z');
    expect(parseRelativeOffset('-3y', baseDate).toISO()).toBe('2023-06-15T00:00:00.000Z');
  });

  it('falls back to baseDate for invalid syntax', () => {
    expect(parseRelativeOffset('invalid', baseDate).toISO()).toBe(baseDate.toISO());
    expect(parseRelativeOffset('5', baseDate).toISO()).toBe(baseDate.toISO());
    expect(parseRelativeOffset('+3x', baseDate).toISO()).toBe(baseDate.toISO());
  });
});

describe('EmbeddedCalendar getSourcesAndConfig filtering by configured name', () => {
  const mockSources = [
    {
      id: 'dailynote_1',
      events: [
        {
          id: 'event_daily_1',
          event: {
            title: 'Daily Event',
            type: 'single',
            date: '2026-06-10',
            allDay: true
          }
        }
      ]
    },
    {
      id: 'local_1',
      events: [
        {
          id: 'event_local_1',
          event: {
            title: 'Local Event',
            type: 'single',
            date: '2026-06-10',
            allDay: true
          }
        }
      ]
    }
  ];

  const mockSettings = {
    calendarSources: [
      { id: 'dailynote_1', name: 'DailyNote', type: 'dailynote' },
      { id: 'local_1', name: 'New Local Calendar', type: 'local' }
    ]
  };

  let fakeContext: FakeContext;

  beforeEach(() => {
    fakeContext = {
      app: {
        vault: {
          getAbstractFileByPath: jest.fn()
        }
      },
      widgetCtx: {
        sourcePath: 'dummy-path'
      },
      enhancerInstance: {
        updateSettings: jest.fn(),
        getEnhancedData: jest.fn().mockReturnValue({
          sources: JSON.parse(JSON.stringify(mockSources)) as EventSourceInput[]
        })
      }
    };

    PluginState.setPlugin({
      app: {
        vault: {
          getAbstractFileByPath: jest.fn()
        }
      }
    } as unknown as FullCalendarPlugin);
    PluginState.setSettings(mockSettings as unknown as FullCalendarSettings);
    PluginState.setCache({
      getAllEvents: jest
        .fn()
        .mockReturnValue(JSON.parse(JSON.stringify(mockSources)) as OFCEventSource[])
    } as unknown as EventCache);

    PluginState.setInternalAPI({
      getEventSources: jest.fn().mockImplementation((config: ViewConfig, sourcePath: string) => {
        return getEventSources(config, sourcePath, PluginState.getInternalAPI());
      }),
      getEventDetails: jest.fn().mockImplementation((id: string) => {
        if (id === 'event_daily_1') {
          return {
            event: { title: 'Daily Event' },
            calendarId: 'dailynote_1',
            location: null
          };
        }
        if (id === 'event_local_1') {
          return {
            event: { title: 'Local Event' },
            calendarId: 'local_1',
            location: null
          };
        }
        return null;
      }),
      getEvents: jest
        .fn()
        .mockImplementation((criteria: EventFilterCriteria, sorts: EventSortCriteria[]) => {
          const queryables: QueryableEvent[] = [
            {
              id: 'event_daily_1',
              title: 'Daily Event',
              calendarId: 'dailynote_1',
              rawEvent: {
                id: 'event_daily_1',
                event: {
                  title: 'Daily Event',
                  type: 'single',
                  date: '2026-06-10',
                  allDay: true
                }
              }
            },
            {
              id: 'event_local_1',
              title: 'Local Event',
              calendarId: 'local_1',
              rawEvent: {
                id: 'event_local_1',
                event: {
                  title: 'Local Event',
                  type: 'single',
                  date: '2026-06-10',
                  allDay: true
                }
              }
            }
          ];
          return EventFilterSortEngine.query(queryables, criteria, sorts);
        })
    } as unknown as InternalAPI);
  });

  afterEach(() => {
    PluginState.clear();
  });

  it('filters by user-defined name exactly and retains its events', () => {
    const result = (
      EmbeddedCalendar.prototype as unknown as EmbeddedCalendarWithPrivate
    ).getSourcesAndConfig.call(fakeContext as unknown as EmbeddedCalendar, {
      calendars: ['DailyNote']
    });
    const sources = result.sources as unknown as TestEventSource[];
    expect(sources).toHaveLength(1);
    expect(sources[0].id).toBe('dailynote_1');
    expect(sources[0].events).toHaveLength(1);
    const events = sources[0].events;
    expect(events[0].id).toBe('event_daily_1');
  });

  it('filters by user-defined name exactly with spaces and retains its events', () => {
    const result = (
      EmbeddedCalendar.prototype as unknown as EmbeddedCalendarWithPrivate
    ).getSourcesAndConfig.call(fakeContext as unknown as EmbeddedCalendar, {
      calendars: ['New Local Calendar']
    });
    const sources = result.sources as unknown as TestEventSource[];
    expect(sources).toHaveLength(1);
    expect(sources[0].id).toBe('local_1');
    expect(sources[0].events).toHaveLength(1);
    const events = sources[0].events;
    expect(events[0].id).toBe('event_local_1');
  });

  it('falls back to matching by internal source ID and retains its events', () => {
    const result = (
      EmbeddedCalendar.prototype as unknown as EmbeddedCalendarWithPrivate
    ).getSourcesAndConfig.call(fakeContext as unknown as EmbeddedCalendar, {
      calendars: ['local_1']
    });
    const sources = result.sources as unknown as TestEventSource[];
    expect(sources).toHaveLength(1);
    expect(sources[0].id).toBe('local_1');
    expect(sources[0].events).toHaveLength(1);
    const events = sources[0].events;
    expect(events[0].id).toBe('event_local_1');
  });

  it('returns empty array if configured calendar target does not match name or ID', () => {
    const result = (
      EmbeddedCalendar.prototype as unknown as EmbeddedCalendarWithPrivate
    ).getSourcesAndConfig.call(fakeContext as unknown as EmbeddedCalendar, {
      calendars: ['NonExistentName']
    });
    expect(result.sources).toHaveLength(0);
  });
});

describe('sanitizeEmbeddedConfig', () => {
  it('drops empty list filters and keeps valid values', () => {
    const sanitized = sanitizeEmbeddedConfig({
      defaultDate: 'auto',
      calendars: [null, '', '   '],
      categories: ['work', '']
    });

    expect(sanitized.defaultDate).toBe('auto');
    expect(sanitized.calendars).toBeUndefined();
    expect(sanitized.categories).toEqual(['work']);
  });

  it('treats valueless keys as unset while preserving false and zero', () => {
    const sanitized = sanitizeEmbeddedConfig({
      showSearch: false,
      zoomLevel: 0,
      header: null,
      textSearch: '   ',
      calendars: undefined
    });

    expect(sanitized.showSearch).toBe(false);
    expect(sanitized.zoomLevel).toBe(0);
    expect(sanitized.header).toBeUndefined();
    expect(sanitized.textSearch).toBeUndefined();
    expect(sanitized.calendars).toBeUndefined();
  });
});

describe('EmbeddedCalendar multi-day all-day event rendering', () => {
  it('correctly maps multi-day all-day events without date truncation', () => {
    const multiDayEvent = {
      id: 'gcal_multiday_1',
      title: '4-Day Trip',
      type: 'single',
      date: '2026-07-10',
      endDate: '2026-07-13', // inclusive 4 days: 10, 11, 12, 13
      allDay: true
    };

    const mockSources = [
      {
        id: 'google_1',
        events: [{ id: 'gcal_multiday_1', event: multiDayEvent }]
      }
    ];

    PluginState.setPlugin({
      app: { vault: { getAbstractFileByPath: jest.fn() } }
    } as unknown as FullCalendarPlugin);
    PluginState.setSettings({
      calendarSources: [{ id: 'google_1', name: 'Google Calendar', type: 'google' }]
    } as unknown as FullCalendarSettings);
    PluginState.setCache({
      getAllEvents: jest.fn().mockReturnValue(mockSources as OFCEventSource[])
    } as unknown as EventCache);

    PluginState.setInternalAPI({
      getEventSources: jest.fn().mockImplementation((config: ViewConfig, sourcePath: string) => {
        return getEventSources(config, sourcePath, PluginState.getInternalAPI());
      }),
      getEvents: jest.fn().mockImplementation((criteria, sorts) => {
        const queryables = [
          {
            id: 'gcal_multiday_1',
            title: '4-Day Trip',
            calendarId: 'google_1',
            rawEvent: { id: 'gcal_multiday_1', event: multiDayEvent }
          }
        ];
        return EventFilterSortEngine.query(queryables, criteria, sorts);
      })
    } as unknown as InternalAPI);

    const fakeCtx = {
      app: { vault: { getAbstractFileByPath: jest.fn() } },
      widgetCtx: { sourcePath: 'note.md' }
    };

    const result = (
      EmbeddedCalendar.prototype as unknown as EmbeddedCalendarWithPrivate
    ).getSourcesAndConfig.call(fakeCtx as unknown as EmbeddedCalendar, {});

    const sources = result.sources as Array<{
      id: string;
      events: Array<{ start: string; end: string; allDay: boolean }>;
    }>;
    expect(sources).toHaveLength(1);
    expect(sources[0].events).toHaveLength(1);

    const eventInput = sources[0].events[0];
    expect(eventInput.start).toBe('2026-07-10');
    // FullCalendar exclusive end for 4-day event (July 10..13) must be 2026-07-14
    expect(eventInput.end).toBe('2026-07-14');
    expect(eventInput.allDay).toBe(true);

    PluginState.clear();
  });
});
