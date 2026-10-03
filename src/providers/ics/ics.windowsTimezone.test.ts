import { DateTime } from 'luxon';

import { toEventInput } from '../../core/interop';
import { normalizeTimezone } from '../../features/timezone/Timezone';
import { DEFAULT_SETTINGS, FullCalendarSettings } from '../../types/settings';
import { getEventsFromICS } from './ics';

jest.mock('../../ui/view', () => ({
  getCalendarColors: (color: string) => ({ color, textColor: '#ffffff' })
}));

function outlookEvent(tzid: string, icsDate: string): string {
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:Microsoft Exchange Server 2010
BEGIN:VEVENT
UID:synthetic-${icsDate}
DTSTART;TZID=${tzid}:${icsDate}T100000
DTEND;TZID=${tzid}:${icsDate}T103000
SUMMARY:Synthetic timezone test
END:VEVENT
END:VCALENDAR`;
}

describe('Outlook ICS Windows timezone IDs', () => {
  it.each([
    ['E. South America Standard Time', '20260924', 'America/Sao_Paulo', '-03:00'],
    // No DST in Reykjavik; Europe/London would put this event at +01:00 in summer.
    ['Greenwich Standard Time', '20260715', 'Atlantic/Reykjavik', '+00:00'],
    ['Argentina Standard Time', '20260715', 'America/Argentina/Buenos_Aires', '-03:00'],
    ['Tokyo Standard Time', '20260715', 'Asia/Tokyo', '+09:00']
  ])('maps %s to %s', (tzid, icsDate, zone, expectedOffset) => {
    const events = getEventsFromICS(outlookEvent(tzid, icsDate));

    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event).toMatchObject({
      type: 'single',
      allDay: false,
      startTime: '10:00',
      endTime: '10:30',
      timezone: zone
    });

    const settings: FullCalendarSettings = { ...DEFAULT_SETTINGS, displayTimezone: zone };
    const eventInput = toEventInput(`synthetic-${icsDate}`, event, settings);
    const start = DateTime.fromISO(String(eventInput?.start), { setZone: true });
    expect(start.toFormat('ZZ')).toBe(expectedOffset);
    expect(start.setZone(zone).toFormat('HH:mm')).toBe('10:00');
  });

  it('keeps already valid IANA zones and passes unknown names through', () => {
    expect(normalizeTimezone('America/Sao_Paulo')).toBe('America/Sao_Paulo');
    expect(normalizeTimezone('Customized Time Zone')).toBe('Customized Time Zone');
  });
});
