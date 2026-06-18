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

    const overrideComponent = createOverrideVEvent(event, '2026-05-20');
    const ics = (overrideComponent as unknown as { toString(): string }).toString();

    expect(ics).toContain('RECURRENCE-ID;VALUE=DATE:20260520\r\n');
    expect(ics).not.toContain('TZID');
  });

  it('should serialize a completed task with status COMPLETED and completed datetime', () => {
    const task = {
      type: 'single',
      title: 'Completed Task',
      date: '2026-05-20',
      startTime: '10:00',
      endTime: '11:00',
      allDay: false,
      timezone: 'Europe/Amsterdam',
      completed: '2026-05-20T10:30:00Z',
      endDate: null
    } as OFCEvent;

    const ics = eventToIcs(task);
    expect(ics).toContain('BEGIN:VTODO');
    expect(ics).toContain('STATUS:COMPLETED');
    expect(ics).toContain('COMPLETED:20260520T103000Z');
    expect(ics).toContain('DTSTART;TZID=Europe/Amsterdam:20260520T100000');
    expect(ics).toContain('DUE;TZID=Europe/Amsterdam:20260520T110000');
    expect(ics).toContain('END:VTODO');
  });

  it('should serialize a pending/actionable task with status NEEDS-ACTION', () => {
    const task = {
      type: 'single',
      title: 'Pending Task',
      date: '2026-05-20',
      allDay: true,
      completed: false,
      endDate: null
    } as OFCEvent;

    const ics = eventToIcs(task);
    expect(ics).toContain('BEGIN:VTODO');
    expect(ics).toContain('STATUS:NEEDS-ACTION');
    expect(ics).not.toContain('COMPLETED');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260520');
    expect(ics).toContain('DUE;VALUE=DATE:20260520');
    expect(ics).toContain('END:VTODO');
  });

  it('should serialize a timed task with a floating timezone (no timezone specified) as VTODO without TZID or Z', () => {
    const task = {
      type: 'single',
      title: 'Floating Task',
      date: '2026-05-20',
      startTime: '10:00',
      endTime: '11:00',
      allDay: false,
      completed: false,
      endDate: null
    } as OFCEvent;

    const ics = eventToIcs(task);
    expect(ics).toContain('BEGIN:VTODO');
    expect(ics).toContain('DTSTART:20260520T100000\r\n');
    expect(ics).toContain('DUE:20260520T110000\r\n');
    expect(ics).not.toContain('TZID');
    expect(ics).not.toContain('Z\r\n');
    expect(ics).toContain('END:VTODO');
  });

  it('should serialize VTODO overrides with the correct RECURRENCE-ID TZID parameter', () => {
    const task = {
      type: 'single',
      title: 'Overridden Task Instance',
      date: '2026-05-20',
      startTime: '10:00',
      endTime: '11:00',
      allDay: false,
      timezone: 'Europe/Amsterdam',
      completed: false,
      endDate: null
    } as OFCEvent;

    const overrideComponent = createOverrideVEvent(task, '2026-05-20T10:00:00');
    const ics = (overrideComponent as unknown as { toString(): string }).toString();

    expect(ics).toContain('BEGIN:VTODO');
    expect(ics).toContain('RECURRENCE-ID;TZID=Europe/Amsterdam:20260520T100000');
    expect(ics).toContain('END:VTODO');
  });

  it('should serialize provider alarms as VALARM components', () => {
    const event = {
      type: 'single',
      title: 'Alarmed Event',
      date: '2026-05-20',
      startTime: '10:00',
      endTime: '11:00',
      allDay: false,
      endDate: null,
      alarms: [{ minutesBefore: 15, action: 'DISPLAY' }]
    } as OFCEvent;

    const ics = eventToIcs(event);
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('ACTION:DISPLAY');
    expect(ics).toContain('TRIGGER:-PT15M');
    expect(ics).toContain('DESCRIPTION:Alarmed Event');
    expect(ics).toContain('END:VALARM');
  });
});
