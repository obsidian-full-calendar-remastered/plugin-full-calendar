import { getEventsFromICS } from './ics';

const buildCalendar = (cancelledFields: string): string =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:Microsoft Exchange Server 2010',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:weekly-series',
    'DTSTART:20260804T100000Z',
    'DTEND:20260804T110000Z',
    'RRULE:FREQ=WEEKLY;COUNT=4',
    'SUMMARY:Weekly meeting',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:weekly-series',
    'RECURRENCE-ID:20260811T100000Z',
    cancelledFields,
    'STATUS:CANCELLED',
    'END:VEVENT',
    'END:VCALENDAR'
  ]
    .filter(Boolean)
    .join('\r\n');

describe('ICS cancelled recurring instances', () => {
  it.each([
    ['without duplicate event dates', ''],
    ['with duplicate event dates', 'DTSTART:20260811T100000Z\r\nDTEND:20260811T110000Z']
  ])('keeps the cancelled date excluded %s', (_case, cancelledFields) => {
    const events = getEventsFromICS(buildCalendar(cancelledFields));

    expect(events).toHaveLength(1);
    const series = events[0];
    expect(series.type).toBe('rrule');
    if (series.type !== 'rrule') {
      throw new Error('Expected a recurring event');
    }
    expect(series.skipDates).toEqual(['2026-08-11']);
  });
});
