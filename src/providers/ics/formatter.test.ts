import { eventToIcs, createOverrideVEvent, eventsToIcs } from './formatter';
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
    expect(ics).not.toContain('DTSTART:20260520T100000Z');
    expect(ics).not.toContain('DTEND:20260520T110000Z');
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
  it('should serialize a completed task as VEVENT', () => {
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
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('SUMMARY:Completed Task');
    expect(ics).toContain('DTSTART;TZID=Europe/Amsterdam:20260520T100000');
    expect(ics).toContain('DTEND;TZID=Europe/Amsterdam:20260520T110000');
    expect(ics).toContain('END:VEVENT');
  });

  it('should serialize a pending/actionable task as VEVENT', () => {
    const task = {
      type: 'single',
      title: 'Pending Task',
      date: '2026-05-20',
      allDay: true,
      completed: false,
      endDate: null
    } as OFCEvent;

    const ics = eventToIcs(task);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('SUMMARY:Pending Task');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260520');
    expect(ics).toContain('DTEND;VALUE=DATE:20260521');
    expect(ics).toContain('END:VEVENT');
  });

  it('should serialize a timed task with a floating timezone as VEVENT without TZID or Z', () => {
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
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('SUMMARY:Floating Task');
    expect(ics).toContain('DTSTART:20260520T100000\r\n');
    expect(ics).toContain('DTEND:20260520T110000\r\n');
    expect(ics).not.toContain('TZID');
    expect(ics).toContain('END:VEVENT');
  });

  it('should serialize task overrides as VEVENT with the correct RECURRENCE-ID TZID parameter', () => {
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

    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('RECURRENCE-ID;TZID=Europe/Amsterdam:20260520T100000');
    expect(ics).toContain('END:VEVENT');
  });

  it('should deduplicate category and subcategory prefixes in getLiteralFullTitle', () => {
    const event = {
      type: 'single',
      title: 'Work - Project - Clean Title',
      category: 'Work',
      subCategory: 'Project',
      date: '2026-05-20',
      allDay: true,
      endDate: null
    } as OFCEvent;

    const ics = eventToIcs(event);
    expect(ics).toContain('SUMMARY:Work - Project - Clean Title');
    expect(ics).not.toContain('Work - Project - Work - Project - Clean Title');
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

  describe('eventsToIcs', () => {
    it('should serialize multiple events and tasks into a single VCALENDAR component', () => {
      const event1 = {
        type: 'single',
        title: 'First Event',
        date: '2026-05-20',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        endDate: null
      } as OFCEvent;

      const event2 = {
        type: 'single',
        title: 'Second Task',
        date: '2026-05-21',
        startTime: '12:00',
        endTime: '13:00',
        allDay: false,
        endDate: null,
        completed: false
      } as OFCEvent;

      const ics = eventsToIcs([event1, event2]);

      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics).toContain('SUMMARY:First Event');
      expect(ics).toContain('END:VEVENT');
      expect(ics).toContain('SUMMARY:Second Task');
      expect(ics).toContain('END:VCALENDAR');

      // Check that VCALENDAR occurs exactly once at the outer layer
      expect(ics.match(/BEGIN:VCALENDAR/g)?.length).toBe(1);
      expect(ics.match(/END:VCALENDAR/g)?.length).toBe(1);
    });

    it('should format DTSTAMP in UTC time format (ending with Z)', () => {
      const event = {
        type: 'single',
        title: 'DTSTAMP Test Event',
        date: '2026-05-20',
        allDay: true,
        endDate: null
      } as OFCEvent;

      const ics = eventToIcs(event);
      expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
    });

    it('should reconcile UIDs and serialize overrides with correct RECURRENCE-ID', () => {
      const master = {
        type: 'recurring',
        title: 'Recurring Master',
        id: 'my-event.md',
        startRecur: '2026-05-20',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        timezone: 'Europe/Amsterdam'
      } as OFCEvent;

      const override = {
        type: 'single',
        title: 'Override Instance',
        recurringEventId: 'my-event.md',
        recurrenceId: '2026-05-27T10:00:00',
        date: '2026-05-27',
        startTime: '12:00',
        endTime: '13:00',
        allDay: false,
        timezone: 'Europe/Amsterdam',
        endDate: null
      } as OFCEvent;

      const ics = eventsToIcs([master, override]);

      // Verify both events are present
      expect(ics).toContain('SUMMARY:Recurring Master');
      expect(ics).toContain('SUMMARY:Override Instance');

      // Verify recurrence-id is correctly formatted
      expect(ics).toContain('RECURRENCE-ID;TZID=Europe/Amsterdam:20260527T100000');

      // Find the UIDs of both events and verify they are identical
      const uidMatches = ics.match(/UID:[^\r\n]+/g);
      expect(uidMatches?.length).toBe(2);
      expect(uidMatches![0]).toBe(uidMatches![1]);
    });
  });
});
