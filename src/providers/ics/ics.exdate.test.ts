import { Settings } from 'luxon';
import { TimeEngine } from '../../core/TimeEngine';
import type EventCache from '../../core/EventCache';
import { getEventsFromICS } from './ics';

describe('ICS recurrence exclusions', () => {
  const originalNow = Settings.now;
  const originalZone = Settings.defaultZone;

  beforeEach(() => {
    Settings.now = () => Date.parse('2026-06-15T00:00:00Z');
    Settings.defaultZone = 'UTC';
  });

  afterEach(() => {
    Settings.now = originalNow;
    Settings.defaultZone = originalZone;
  });

  it.each(['VEVENT', 'VTODO'])(
    'excludes every date in a single EXDATE property for %s',
    async component => {
      const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Synthetic EXDATE regression//EN
BEGIN:${component}
UID:synthetic-multiple-exdates
DTSTAMP:20260601T000000Z
SUMMARY:Synthetic recurring item
DTSTART:20260615T100000Z
${component === 'VEVENT' ? 'DTEND' : 'DUE'}:20260615T110000Z
RRULE:FREQ=DAILY;COUNT=5
EXDATE:20260616T100000Z,20260618T100000Z
END:${component}
END:VCALENDAR`;

      const events = getEventsFromICS(ics);
      expect(events).toHaveLength(1);
      const event = events[0];
      expect(event.type).toBe('rrule');
      if (event.type !== 'rrule') throw new Error('Expected a recurring item');

      expect(event.skipDates).toEqual(['2026-06-16', '2026-06-18']);

      const cache = {
        store: {
          getAllEvents: () => [{ id: event.id, event, location: null }]
        }
      } as unknown as EventCache;
      const engine = new TimeEngine(cache);
      await (
        engine as unknown as { rebuildOccurrenceCache: () => Promise<void> }
      ).rebuildOccurrenceCache();

      expect(engine.getOccurrenceCache().map(occurrence => occurrence.start.toISODate())).toEqual([
        '2026-06-15',
        '2026-06-17',
        '2026-06-19'
      ]);
    }
  );
});
