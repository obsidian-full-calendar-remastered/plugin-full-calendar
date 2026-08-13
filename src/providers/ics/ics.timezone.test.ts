import { DateTime } from 'luxon';

import { toEventInput } from '../../core/interop';
import { DEFAULT_SETTINGS, FullCalendarSettings } from '../../types/settings';
import { getEventsFromICS } from './ics';

jest.mock('../../ui/view', () => ({
  getCalendarColors: (color: string) => ({ color, textColor: '#ffffff' })
}));

const settings: FullCalendarSettings = {
  ...DEFAULT_SETTINGS,
  displayTimezone: 'Asia/Nicosia'
};

describe('Outlook ICS Windows timezone rendering', () => {
  it.each([
    ['summer', '20260729', '+03:00'],
    ['winter', '20260129', '+02:00']
  ])(
    'keeps a GTB Standard Time event at 10:00 in Asia/Nicosia in %s',
    (_season, icsDate, expectedOffset) => {
      const events = getEventsFromICS(`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Synthetic Outlook ICS Test//EN
BEGIN:VEVENT
UID:synthetic-gtb-${icsDate}
DTSTART;TZID=GTB Standard Time:${icsDate}T100000
DTEND;TZID=GTB Standard Time:${icsDate}T103000
SUMMARY:Synthetic timezone test
END:VEVENT
END:VCALENDAR`);

      expect(events).toHaveLength(1);
      const event = events[0];

      // EventDetails formats these cached wall-clock fields directly.
      expect(event).toMatchObject({
        type: 'single',
        allDay: false,
        startTime: '10:00',
        endTime: '10:30',
        timezone: 'Europe/Bucharest'
      });

      const eventInput = toEventInput(`synthetic-gtb-${icsDate}`, event, settings);
      expect(eventInput).not.toBeNull();

      const sourceStart = DateTime.fromISO(String(eventInput?.start), { setZone: true });
      const sourceEnd = DateTime.fromISO(String(eventInput?.end), { setZone: true });
      expect(sourceStart.toFormat('ZZ')).toBe(expectedOffset);
      expect(sourceEnd.toFormat('ZZ')).toBe(expectedOffset);

      // FullCalendar is configured with Asia/Nicosia and renders these instants there.
      const renderedStart = sourceStart.setZone(settings.displayTimezone!);
      const renderedEnd = sourceEnd.setZone(settings.displayTimezone!);
      expect(renderedStart.toFormat('HH:mm')).toBe('10:00');
      expect(renderedEnd.toFormat('HH:mm')).toBe('10:30');
      expect(renderedStart.toFormat('HH:mm')).not.toBe(_season === 'summer' ? '13:00' : '12:00');
      expect(renderedEnd.toFormat('HH:mm')).not.toBe(_season === 'summer' ? '13:30' : '12:30');
    }
  );
});
