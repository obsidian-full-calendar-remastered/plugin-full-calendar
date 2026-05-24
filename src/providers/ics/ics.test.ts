import { getEventsFromICS } from './ics';

describe('ics tests', () => {
  it('throws on empty ICS input', () => {
    expect(() => getEventsFromICS('   ')).toThrow('ICS content is empty');
  });

  it('throws when VCALENDAR header is missing', () => {
    const invalidIcs = `BEGIN:VEVENT
UID:missing-calendar
SUMMARY:Broken
END:VEVENT`;
    expect(() => getEventsFromICS(invalidIcs)).toThrow(
      'ICS content is missing BEGIN:VCALENDAR header'
    );
  });

  it('parses all day event', () => {
    const ics = `BEGIN:VCALENDAR
PRODID:blah
X-WR-CALNAME:Test calendar
X-WR-TIMEZONE:Etc/UTC
VERSION:2.0
CALSCALE:GREGORIAN
X-PUBLISHED-TTL:PT5M
METHOD:PUBLISH
BEGIN:VEVENT
UID:7389432083-0-40713-74006
SEQUENCE:1
CLASS:PUBLIC
CREATED:20200101T000000Z
GEO:40.7128;-74.006
DTSTAMP:20230226T143136Z
DTSTART;VALUE=DATE:20230226
DESCRIPTION:Description!
LOCATION:New york city
URL:https://www.example.com
STATUS:CONFIRMED
SUMMARY:EVENT TITLE
TRANSP:TRANSPARENT
END:VEVENT
END:VCALENDAR`;
    const events = getEventsFromICS(ics);
    expect(events).toMatchSnapshot(ics);
  });

  it('parses gcal ics file and categories', () => {
    const ics = `BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Obsidian Test Calendar
X-WR-TIMEZONE:America/New_York
BEGIN:VTIMEZONE
TZID:America/New_York
X-LIC-LOCATION:America/New_York
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
DTSTART;VALUE=DATE:20220302
DTEND;VALUE=DATE:20220303
DTSTAMP:20230302T233513Z
UID:5r09pnnlktaqivstai5vlbqb1h@google.com
CREATED:20220226T211158Z
DESCRIPTION:
LAST-MODIFIED:20220226T214634Z
LOCATION:
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:All day event
TRANSP:TRANSPARENT
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20220301T110000
DTEND;TZID=America/New_York:20220301T123000
RRULE:FREQ=WEEKLY;WKST=SU;BYDAY=TH,TU
DTSTAMP:20230302T233513Z
UID:5tt2avr2th0h65homv3b6jeqof@google.com
CREATED:20220226T211144Z
DESCRIPTION:
LAST-MODIFIED:20220226T214627Z
LOCATION:
SEQUENCE:1
STATUS:CONFIRMED
SUMMARY:Work - Recurring event
TRANSP:OPAQUE
END:VEVENT
BEGIN:VEVENT
DTSTART:20220228T164500Z
DTEND:20220228T194500Z
DTSTAMP:20230302T233513Z
UID:40mdbe6fvc1rmd60n6r0c3go7e@google.com
X-GOOGLE-CONFERENCE:https://meet.google.com/riu-josb-pdb
CREATED:20220226T210517Z
DESCRIPTION:This is an example <i>event.</i>\n\nJoin with Google Meet: http
    s://meet.google.com/riu-josb-pdb\nOr dial: (US) +1 609-726-6186 PIN: 156393
    865#\nMore phone numbers: https://tel.meet/riu-josb-pdb?pin=1416269198709&h
    s=7\n\nLearn more about Meet at: https://support.google.com/a/users/answer/
    9282720
LAST-MODIFIED:20220226T214608Z
LOCATION:
SEQUENCE:1
STATUS:CONFIRMED
SUMMARY:Work - Project Alpha - Hello\\, iCal!
TRANSP:OPAQUE
END:VEVENT
BEGIN:VEVENT
DTSTART:20220219T190000Z
DTEND:20220219T230000Z
DTSTAMP:20230302T233513Z
UID:44hekcaaf0or7547vhqa772mqj@google.com
CREATED:20220220T002201Z
DESCRIPTION:
LAST-MODIFIED:20220220T002201Z
LOCATION:
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:Work on GCal Sync
TRANSP:OPAQUE
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20220216
DTEND;VALUE=DATE:20220217
DTSTAMP:20230302T233513Z
UID:7ooluqb717vabebvc9gkc38c9l@google.com
CREATED:20220220T002146Z
DESCRIPTION:
LAST-MODIFIED:20220220T002146Z
LOCATION:
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:Announce Beta
TRANSP:TRANSPARENT
END:VEVENT
END:VCALENDAR
        `;
    const events = getEventsFromICS(ics);
    expect(events).toMatchSnapshot(ics);
  });

  it('parses exactly on DST boundaries', () => {
    // Berlin DST transition 2024:
    // Starts: Sunday, March 31, 2024, 02:00:00 clocks are turned forward 1 hour to 03:00:00
    // Ends: Sunday, October 27, 2024, 03:00:00 clocks are turned backward 1 hour to 02:00:00
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VTIMEZONE
TZID:Europe/Berlin
END:VTIMEZONE
BEGIN:VEVENT
UID:dst-transition-test-1
DTSTART;TZID=Europe/Berlin:20240330T100000
DTEND;TZID=Europe/Berlin:20240330T110000
SUMMARY:Before DST Starts
END:VEVENT
BEGIN:VEVENT
UID:dst-transition-test-2
DTSTART;TZID=Europe/Berlin:20240331T100000
DTEND;TZID=Europe/Berlin:20240331T110000
SUMMARY:After DST Starts
END:VEVENT
BEGIN:VEVENT
UID:dst-transition-test-3
DTSTART;TZID=Europe/Berlin:20241026T100000
DTEND;TZID=Europe/Berlin:20241026T110000
SUMMARY:Before DST Ends
END:VEVENT
BEGIN:VEVENT
UID:dst-transition-test-4
DTSTART;TZID=Europe/Berlin:20241028T100000
DTEND;TZID=Europe/Berlin:20241028T110000
SUMMARY:After DST Ends
END:VEVENT
END:VCALENDAR`;

    const events = getEventsFromICS(ics);
    expect(events).toHaveLength(4);

    // We expect the local time components (startTime/endTime) in the OFCEvent
    // to match exactly what is in the ICS file, regardless of UTC representation
    const e1 = events.find(e => e.uid === 'dst-transition-test-1')!;
    expect(e1).toHaveProperty('startTime', '10:00');
    expect(e1.timezone).toBe('Europe/Berlin');

    const e2 = events.find(e => e.uid === 'dst-transition-test-2')!;
    expect(e2).toHaveProperty('startTime', '10:00');
    expect(e2.timezone).toBe('Europe/Berlin');

    const e3 = events.find(e => e.uid === 'dst-transition-test-3')!;
    expect(e3).toHaveProperty('startTime', '10:00');
    expect(e3.timezone).toBe('Europe/Berlin');

    const e4 = events.find(e => e.uid === 'dst-transition-test-4')!;
    expect(e4).toHaveProperty('startTime', '10:00');
    expect(e4.timezone).toBe('Europe/Berlin');
  });

  it('parses recurring event with RECURRENCE-ID exception without losing the series', () => {
    // Regression test for: recurring ICS events with RECURRENCE-ID exceptions
    // were silently dropped due to sync key collision in ICSProvider.computeSyncKey()
    // See: https://github.com/blacksmithstudio/obsidian-full-calendar/issues/...
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:course-sosc-1420
DTSTART;TZID=China Standard Time:20260203T133000
DTEND;TZID=China Standard Time:20260203T143000
RRULE:FREQ=WEEKLY;UNTIL=20260505T053000Z;BYDAY=TU
SUMMARY:SOSC 1420 (L1)
DESCRIPTION:Regular Tuesday class
END:VEVENT
BEGIN:VEVENT
UID:course-sosc-1420
RECURRENCE-ID;TZID=China Standard Time:20260317T133000
DTSTART;TZID=China Standard Time:20260317T133000
DTEND;TZID=China Standard Time:20260317T143000
SUMMARY:SOSC 1420 (L1) + MidTerm
DESCRIPTION:Modified occurrence with midterm exam
END:VEVENT
END:VCALENDAR`;

    const events = getEventsFromICS(ics);

    // Should have 2 events: 1 rrule (parent series) + 1 exception (modified occurrence)
    expect(events).toHaveLength(2);

    // Verify rrule event exists and is properly formed
    const rruleEvent = events.find(e => e.type === 'rrule' && e.uid === 'course-sosc-1420') as
      | ((typeof events)[0] & { type: 'rrule' })
      | undefined;
    expect(rruleEvent).toBeDefined();
    expect(rruleEvent?.title).toBe('SOSC 1420 (L1)');
    expect(rruleEvent?.rrule).toContain('FREQ=WEEKLY');
    expect(rruleEvent?.rrule).toContain('BYDAY=TU');
    // Timezone name may be normalized by ical.js (China Standard Time → Asia/Shanghai)
    expect(rruleEvent?.timezone).toBeTruthy();

    // Verify exception event exists
    const exceptionEvent = events.find(e => e.type === 'single' && e.uid === 'course-sosc-1420') as
      | ((typeof events)[0] & { type: 'single' })
      | undefined;
    expect(exceptionEvent).toBeDefined();
    expect(exceptionEvent?.title).toBe('SOSC 1420 (L1) + MidTerm');
    expect(exceptionEvent?.date).toBe('2026-03-17');

    // Verify exception date is added to rrule's skipDates
    expect(rruleEvent?.skipDates).toContain('2026-03-17');
  });

  it('parses single completed VTODO task', () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:task-completed-1
SUMMARY:Completed Task
DTSTART:20260520T100000Z
DUE:20260520T110000Z
STATUS:COMPLETED
COMPLETED:20260520T103000Z
DESCRIPTION:Completed task description
END:VTODO
END:VCALENDAR`;

    const events = getEventsFromICS(ics);
    expect(events).toHaveLength(1);
    const task = events[0];
    expect(task.uid).toBe('task-completed-1');
    expect(task.title).toBe('Completed Task');
    expect(task.type).toBe('single');
    expect(task.description).toBe('Completed task description');
    expect(task.type).toBe('single');
    if (task.type !== 'single') {
      throw new Error('Expected single task');
    }
    expect(task.completed).toBeTruthy();
    expect(typeof task.completed).toBe('string');
    expect(task.completed).toContain('2026-05-20T10:30:00');
  });

  it('parses single pending VTODO task', () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:task-pending-1
SUMMARY:Pending Task
DTSTART;TZID=America/New_York:20260520T100000
DUE;TZID=America/New_York:20260520T110000
STATUS:NEEDS-ACTION
END:VTODO
END:VCALENDAR`;

    const events = getEventsFromICS(ics);
    expect(events).toHaveLength(1);
    const task = events[0];
    expect(task.uid).toBe('task-pending-1');
    expect(task.title).toBe('Pending Task');
    expect(task.type).toBe('single');
    expect(task.type).toBe('single');
    expect(task.allDay).toBe(false);
    if (task.type !== 'single' || task.allDay !== false) {
      throw new Error('Expected single timed task');
    }
    expect(task.completed).toBe(false);
    expect(task.timezone).toBe('America/New_York');
    expect(task).toHaveProperty('startTime', '10:00');
    expect(task).toHaveProperty('endTime', '11:00');
  });

  it('does not parse an unscheduled VTODO task as a calendar event', () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:task-unscheduled-1
SUMMARY:Unscheduled Task
DTSTAMP:20260520T100000Z
CREATED:20260520T100000Z
STATUS:NEEDS-ACTION
END:VTODO
END:VCALENDAR`;

    const events = getEventsFromICS(ics);
    expect(events).toHaveLength(0);
  });

  it('does not default an undated VTODO task to the current date', () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:task-undated-1
SUMMARY:Undated Task
STATUS:NEEDS-ACTION
END:VTODO
END:VCALENDAR`;

    const events = getEventsFromICS(ics);
    expect(events).toHaveLength(0);
  });

  it('parses recurring VTODO task', () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:task-recurring-1
SUMMARY:Recurring Task
DTSTART;VALUE=DATE:20260520
DUE;VALUE=DATE:20260521
RRULE:FREQ=WEEKLY;BYDAY=WE
END:VTODO
END:VCALENDAR`;

    const events = getEventsFromICS(ics);
    expect(events).toHaveLength(1);
    const task = events[0];
    expect(task.uid).toBe('task-recurring-1');
    expect(task.title).toBe('Recurring Task');
    expect(task.type).toBe('rrule');
    expect(task.type).toBe('rrule');
    if (task.type !== 'rrule') {
      throw new Error('Expected recurring task');
    }
    expect(task.isTask).toBe(true);
    expect(task.rrule).toContain('FREQ=WEEKLY');
    expect(task.allDay).toBe(true);
  });

  it('parses single all-day VTODO task with only DUE property', () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:task-allday-due-only
SUMMARY:All-Day Task Due Only
DUE;VALUE=DATE:20260520
STATUS:NEEDS-ACTION
END:VTODO
END:VCALENDAR`;

    const events = getEventsFromICS(ics);
    expect(events).toHaveLength(1);
    const task = events[0];
    expect(task.uid).toBe('task-allday-due-only');
    expect(task.title).toBe('All-Day Task Due Only');
    expect(task.type).toBe('single');
    if (task.type !== 'single') {
      throw new Error('Expected single task');
    }
    expect(task.allDay).toBe(true);
    expect(task.date).toBe('2026-05-20');
    expect(task.endDate).toBeNull();
    expect(task.completed).toBe(false);
  });

  it('parses single all-day VTODO task with matching DTSTART and DUE properties', () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:task-allday-matching-start-due
SUMMARY:All-Day Task Matching Start Due
DTSTART;VALUE=DATE:20260520
DUE;VALUE=DATE:20260520
STATUS:NEEDS-ACTION
END:VTODO
END:VCALENDAR`;

    const events = getEventsFromICS(ics);
    expect(events).toHaveLength(1);
    const task = events[0];
    expect(task.uid).toBe('task-allday-matching-start-due');
    expect(task.title).toBe('All-Day Task Matching Start Due');
    expect(task.type).toBe('single');
    if (task.type !== 'single') {
      throw new Error('Expected single task');
    }
    expect(task.allDay).toBe(true);
    expect(task.date).toBe('2026-05-20');
    expect(task.endDate).toBeNull();
    expect(task.completed).toBe(false);
  });

  it('parses single all-day VTODO task with different DTSTART and DUE properties', () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:task-allday-diff-start-due
SUMMARY:All-Day Task Different Start Due
DTSTART;VALUE=DATE:20260520
DUE;VALUE=DATE:20260522
STATUS:NEEDS-ACTION
END:VTODO
END:VCALENDAR`;

    const events = getEventsFromICS(ics);
    expect(events).toHaveLength(1);
    const task = events[0];
    expect(task.uid).toBe('task-allday-diff-start-due');
    expect(task.title).toBe('All-Day Task Different Start Due');
    expect(task.type).toBe('single');
    if (task.type !== 'single') {
      throw new Error('Expected single task');
    }
    expect(task.allDay).toBe(true);
    expect(task.date).toBe('2026-05-20');
    expect(task.endDate).toBe('2026-05-22');
    expect(task.completed).toBe(false);
  });
});
