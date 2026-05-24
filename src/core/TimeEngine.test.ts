import { DateTime, Settings } from 'luxon';
import { TimeEngine } from './TimeEngine';
import type EventCache from './EventCache';
import type { OFCEvent } from '../types';

function createTimeEngine(events: { id: string; event: OFCEvent }[]): TimeEngine {
  const cache = {
    store: {
      getAllEvents: () => events.map(({ id, event }) => ({ id, event, location: null }))
    },
    broadcastTimeTick: jest.fn()
  } as unknown as EventCache;

  return new TimeEngine(cache);
}

describe('TimeEngine', () => {
  afterEach(() => {
    Settings.now = () => Date.now();
  });

  it('builds timed single event occurrences in the event source timezone', async () => {
    Settings.now = () => Date.parse('2026-06-15T11:00:00.000Z');

    const event = {
      type: 'single',
      title: 'New York meeting',
      date: '2026-06-15',
      startTime: '10:00',
      endTime: '11:00',
      timezone: 'America/New_York',
      allDay: false,
      endDate: null
    } as OFCEvent;

    const engine = createTimeEngine([{ id: 'evt-1', event }]);
    const rebuildOccurrenceCache = (
      engine as unknown as { rebuildOccurrenceCache: () => Promise<void> }
    ).rebuildOccurrenceCache.bind(engine);
    await rebuildOccurrenceCache();

    const occurrence = engine.getOccurrenceCache()[0];
    expect(occurrence).toBeDefined();
    expect(occurrence.start.toUTC().toISO()).toBe('2026-06-15T14:00:00.000Z');
    expect(occurrence.end.toUTC().toISO()).toBe('2026-06-15T15:00:00.000Z');
  });

  it('builds timed rrule event occurrences from the timed source timezone start', async () => {
    Settings.now = () => Date.parse('2026-06-15T11:00:00.000Z');

    const event = {
      type: 'rrule',
      title: 'Recurring New York meeting',
      startDate: '2026-06-15',
      startTime: '10:00',
      endTime: '11:00',
      timezone: 'America/New_York',
      allDay: false,
      endDate: null,
      rrule: 'RRULE:FREQ=DAILY;COUNT=1',
      skipDates: []
    } as OFCEvent;

    const engine = createTimeEngine([{ id: 'evt-rrule-1', event }]);
    const rebuildOccurrenceCache = (
      engine as unknown as { rebuildOccurrenceCache: () => Promise<void> }
    ).rebuildOccurrenceCache.bind(engine);
    await rebuildOccurrenceCache();

    const occurrence = engine.getOccurrenceCache()[0];
    expect(occurrence).toBeDefined();
    expect(occurrence.start.toUTC().toISO()).toBe('2026-06-15T14:00:00.000Z');
    expect(occurrence.end.toUTC().toISO()).toBe('2026-06-15T15:00:00.000Z');
  });
});
