import { OFCEvent } from '../../types';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createVTodoCalendar, parseVTodoCalendar, updateVTodoCalendar } from './vtodo';

const appleMultiStatus = readFileSync(
  join(__dirname, 'fixtures', 'apple-vtodo-multistatus.xml'),
  'utf8'
);

function calendarDataPayloads(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagNameNS('urn:ietf:params:xml:ns:caldav', 'calendar-data'))
    .map(node => node.textContent || '')
    .filter(payload => payload.includes('BEGIN:VCALENDAR'));
}

describe('CalDAV VTODO codec', () => {
  it('parses a simple due-date reminder without treating DUE as an event end', () => {
    const [task] = parseVTodoCalendar(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:test-1
SUMMARY:Buy groceries
DUE:20260816T180000Z
STATUS:NEEDS-ACTION
END:VTODO
END:VCALENDAR`);

    expect(task.event).toMatchObject({
      type: 'single',
      uid: 'test-1',
      title: 'Buy groceries',
      date: '2026-08-16',
      endDate: null,
      allDay: false,
      startTime: '18:00',
      endTime: '18:00',
      completed: false
    });
    expect(task.due).toMatchObject({ allDay: false });
    expect(task.start).toBeUndefined();
  });

  it('maps STATUS and COMPLETED to a completed task', () => {
    const [task] = parseVTodoCalendar(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:test-2
SUMMARY:Finished task
DUE:20260815T180000Z
STATUS:COMPLETED
COMPLETED:20260815T140000Z
END:VTODO
END:VCALENDAR`);

    expect(task.completed).toBe(true);
    expect(task.completedAt).toContain('2026-08-15T14:00:00');
    expect(task.event?.type === 'single' && task.event.completed).toBeTruthy();
  });

  it('parses Apple VTODO with VTIMEZONE and nested VALARM without using the alarm UID', () => {
    const [completedPayload] = calendarDataPayloads(appleMultiStatus);
    const [task] = parseVTodoCalendar(completedPayload);

    expect(completedPayload).toContain('PERCENT-COMPLETE:100');
    expect(completedPayload).toContain('X-APPLE-SORT-ORDER:100');
    expect(completedPayload).toContain('BEGIN:VALARM');
    expect(completedPayload).toContain('BEGIN:VTIMEZONE');
    expect(task).toMatchObject({
      uid: 'COMPLETED-REMINDER-UID',
      title: 'Completed reminder',
      status: 'COMPLETED',
      completed: true,
      percentComplete: 100,
      priority: 1,
      start: { timezone: 'Asia/Nicosia', allDay: false },
      due: { timezone: 'Asia/Nicosia', allDay: false }
    });
    expect(task.uid).not.toBe('REMINDER-ALARM-UID');
    expect(task.event).toMatchObject({
      date: '2023-01-09',
      startTime: '09:00',
      timezone: 'Asia/Nicosia'
    });
  });

  it('maps PERCENT-COMPLETE:100 to completion when STATUS is absent', () => {
    const [task] = parseVTodoCalendar(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:percent-complete-task
SUMMARY:Submit report
DUE;VALUE=DATE:20260820
PERCENT-COMPLETE:100
END:VTODO
END:VCALENDAR`);

    expect(task.completed).toBe(true);
    expect(task.percentComplete).toBe(100);
    expect(task.event?.type === 'single' && task.event.completed).toBe(true);
  });

  it('parses a date-only reminder as an all-day task', () => {
    const [task] = parseVTodoCalendar(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:test-3
SUMMARY:Submit documents
DUE;VALUE=DATE:20260820
STATUS:NEEDS-ACTION
END:VTODO
END:VCALENDAR`);

    expect(task.event).toMatchObject({
      type: 'single',
      date: '2026-08-20',
      allDay: true,
      endDate: null
    });
  });

  it('uses DTSTART for placement while preserving both DTSTART and DUE', () => {
    const [task] = parseVTodoCalendar(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:test-4
SUMMARY:Windowed task
DTSTART;TZID=Europe/Nicosia:20260820T100000
DUE;TZID=Europe/Nicosia:20260820T120000
STATUS:IN-PROCESS
END:VTODO
END:VCALENDAR`);

    expect(task.event).toMatchObject({
      date: '2026-08-20',
      startTime: '10:00',
      endTime: '10:00',
      completed: false,
      icalTask: {
        status: 'IN-PROCESS',
        start: { timezone: 'Europe/Nicosia' },
        due: { timezone: 'Europe/Nicosia' }
      }
    });
  });

  it('keeps an undated task available without creating a calendar event', () => {
    const [task] = parseVTodoCalendar(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:test-5
SUMMARY:Someday
STATUS:NEEDS-ACTION
END:VTODO
END:VCALENDAR`);

    expect(task.uid).toBe('test-5');
    expect(task.event).toBeNull();
  });

  it('ignores VEVENT and unknown Apple extensions safely', () => {
    const tasks = parseVTodoCalendar(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:event-1
SUMMARY:Meeting
DTSTART:20260820T100000Z
DTEND:20260820T110000Z
END:VEVENT
BEGIN:VTODO
UID:test-6
SUMMARY:Generic reminder
DUE;VALUE=DATE:20260821
X-APPLE-SOMETHING:opaque-value
END:VTODO
END:VCALENDAR`);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Generic reminder');
  });

  it('round-trips essential task data and preserves unknown extensions', () => {
    const original = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:test-7
SUMMARY:Original title
DESCRIPTION:Original notes
DTSTART;TZID=Europe/Nicosia:20260820T100000
DUE;TZID=Europe/Nicosia:20260820T120000
STATUS:NEEDS-ACTION
PRIORITY:3
PERCENT-COMPLETE:50
RRULE:FREQ=WEEKLY
CREATED:20260801T080000Z
LAST-MODIFIED:20260810T090000Z
X-APPLE-SOMETHING:preserve-me
END:VTODO
END:VCALENDAR`;
    const oldEvent = parseVTodoCalendar(original)[0].event;
    if (!oldEvent) throw new Error('Expected a dated task');
    const movedEvent = {
      ...oldEvent,
      title: 'Updated title',
      description: 'Updated notes',
      type: 'rrule',
      startDate: '2026-08-21'
    } as OFCEvent;

    const serialized = updateVTodoCalendar(original, 'test-7', oldEvent, movedEvent);
    const [roundTripped] = parseVTodoCalendar(serialized);

    expect(serialized).toContain('X-APPLE-SOMETHING:preserve-me');
    expect(serialized).toContain('RRULE:FREQ=WEEKLY');
    expect(serialized).toContain('STATUS:NEEDS-ACTION');
    expect(serialized).toContain('PERCENT-COMPLETE:50');
    expect(roundTripped).toMatchObject({
      uid: 'test-7',
      title: 'Updated title',
      description: 'Updated notes',
      priority: 3,
      percentComplete: 50,
      rrule: 'FREQ=WEEKLY'
    });
    expect(roundTripped.start?.value).toContain('2026-08-21T10:00:00');
    expect(roundTripped.due?.value).toContain('2026-08-21T12:00:00');
  });

  it('creates a standards-based VTODO rather than a VEVENT', () => {
    const event = {
      type: 'single',
      uid: 'new-task',
      title: 'Created reminder',
      description: 'Notes',
      date: '2026-08-22',
      endDate: null,
      allDay: true,
      completed: false
    } as OFCEvent;

    const serialized = createVTodoCalendar(event, 'new-task');
    expect(serialized).toContain('PRODID:-//Full Calendar Remastered//CalDAV VTODO//EN');
    expect(serialized).toContain('BEGIN:VTODO');
    expect(serialized).toContain('DUE;VALUE=DATE:20260822');
    expect(serialized).toContain('STATUS:NEEDS-ACTION');
    expect(serialized).toContain('PERCENT-COMPLETE:0');
    expect(serialized).not.toContain('BEGIN:VEVENT');
  });

  it('reopens a completed task by removing COMPLETED and restoring an active status', () => {
    const original = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:completed-task
SUMMARY:Completed
DUE;VALUE=DATE:20260822
STATUS:COMPLETED
COMPLETED:20260815T140000Z
END:VTODO
END:VCALENDAR`;
    const oldEvent = parseVTodoCalendar(original)[0].event;
    if (!oldEvent || oldEvent.type !== 'single') throw new Error('Expected a single task');

    const serialized = updateVTodoCalendar(original, 'completed-task', oldEvent, {
      ...oldEvent,
      completed: false
    });
    expect(serialized).toContain('STATUS:NEEDS-ACTION');
    expect(serialized).toContain('PERCENT-COMPLETE:0');
    expect(serialized).not.toContain('COMPLETED:');
  });

  it('rejects malformed iCalendar input', () => {
    expect(() => parseVTodoCalendar('BEGIN:VTODO\nUID:broken')).toThrow();
    expect(() =>
      parseVTodoCalendar('BEGIN:VCALENDAR\nBEGIN:VTODO\nUID:broken\nEND:VCALENDAR')
    ).toThrow();
  });
});
