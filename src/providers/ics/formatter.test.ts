import { eventToIcs, createOverrideVEvent } from './formatter';
import { OFCEvent } from '../../types';

describe('ICS Formatter timezone serialization', () => {
  it('should serialize a timed event with an explicit local timezone and TZID parameter', () => {
    const event = {
      type: 'single',
      title: 'Timezone Event',
      date: '2026-05-20',
      startTime: '10:00',
      endTime: '11:00',
      allDay: false,
      timezone: 'Europe/Amsterdam',
      endDate: null
    } as OFCEvent;

    const ics = eventToIcs(event);
    expect(ics).toContain('DTSTART;TZID=Europe/Amsterdam:20260520T100000');
    expect(ics).toContain('DTEND;TZID=Europe/Amsterdam:20260520T110000');
    // Ensure it does not have the UTC Z suffix or get treated as floating
    expect(ics).not.toContain('DTSTART:20260520T100000Z');
    expect(ics).not.toContain('DTSTART:20260520T100000\r\n');
  });

  it('should serialize a timed event with UTC timezone using Z suffix and no TZID', () => {
    const event = {
      type: 'single',
      title: 'UTC Event',
      date: '2026-05-20',
      startTime: '10:00',
      endTime: '11:00',
      allDay: false,
      timezone: 'UTC',
      endDate: null
    } as OFCEvent;

    const ics = eventToIcs(event);
    expect(ics).toContain('DTSTART:20260520T100000Z');
    expect(ics).toContain('DTEND:20260520T110000Z');
    expect(ics).not.toContain('TZID=UTC');
  });

  it('should serialize a timed event with a floating timezone (no timezone specified) without Z or TZID', () => {
    const event = {
      type: 'single',
      title: 'Floating Event',
      date: '2026-05-20',
      startTime: '10:00',
      endTime: '11:00',
      allDay: false,
      endDate: null
    } as OFCEvent;

    const ics = eventToIcs(event);
    expect(ics).toContain('DTSTART:20260520T100000\r\n');
    expect(ics).toContain('DTEND:20260520T110000\r\n');
    expect(ics).not.toContain('Z\r\n');
    expect(ics).not.toContain('TZID');
  });

  it('should serialize an all-day event as a plain date without TZID or Z', () => {
    const event = {
      type: 'single',
      title: 'All Day Event',
      date: '2026-05-20',
      allDay: true,
      endDate: null
    } as OFCEvent;

    const ics = eventToIcs(event);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260520\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20260521\r\n');
    expect(ics).not.toContain('TZID');
    expect(ics).not.toContain('T000000');
  });

  it('should serialize recurring events and include TZID on EXDATE properties', () => {
    const event = {
      type: 'recurring',
      title: 'Recurring Event with Exceptions',
      startRecur: '2026-05-20',
      startTime: '10:00',
      endTime: '11:00',
      allDay: false,
      timezone: 'Europe/Amsterdam',
      skipDates: ['2026-05-27']
    } as OFCEvent;

    const ics = eventToIcs(event);
    expect(ics).toContain('DTSTART;TZID=Europe/Amsterdam:20260520T100000');
    expect(ics).toContain('EXDATE;TZID=Europe/Amsterdam:20260527T100000');
  });

  it('should serialize overrides with the correct RECURRENCE-ID TZID parameter', () => {
    const event = {
      type: 'single',
      title: 'Overridden Instance',
      date: '2026-05-20',
      startTime: '10:00',
      endTime: '11:00',
      allDay: false,
      timezone: 'Europe/Amsterdam',
      endDate: null
    } as OFCEvent;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const overrideComponent = createOverrideVEvent(event, '2026-05-20T10:00:00');
    const ics = (overrideComponent as unknown as { toString(): string }).toString();

    expect(ics).toContain('RECURRENCE-ID;TZID=Europe/Amsterdam:20260520T100000');
  });

  it('should serialize overrides of all-day events with plain date RECURRENCE-ID without TZID', () => {
    const event = {
      type: 'single',
      title: 'Overridden All-Day Instance',
      date: '2026-05-20',
      allDay: true,
      endDate: null
    } as OFCEvent;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const overrideComponent = createOverrideVEvent(event, '2026-05-20');
    const ics = (overrideComponent as unknown as { toString(): string }).toString();

    expect(ics).toContain('RECURRENCE-ID;VALUE=DATE:20260520\r\n');
    expect(ics).not.toContain('TZID');
  });
});
