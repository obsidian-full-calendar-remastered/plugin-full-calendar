/**
 * @jest-environment jsdom
 */
import { CalDAVProvider } from './CalDAVProvider';
import { obsidianFetch } from './obsidian-fetch_caldav';
import { CalDAVProviderConfig } from './typesCalDAV';
import FullCalendarPlugin from '../../main';
import { OFCEvent } from '../../types';

jest.mock('./obsidian-fetch_caldav', () => ({
  obsidianFetch: jest.fn()
}));

const mockObsidianFetch = obsidianFetch as jest.MockedFunction<typeof obsidianFetch>;

describe('CalDAV recurrence exceptions and provider alarms', () => {
  let provider: CalDAVProvider;
  const mockConfig: CalDAVProviderConfig = {
    id: 'caldav_1',
    name: 'Test Calendar',
    url: 'https://example.com/caldav/',
    homeUrl: 'https://example.com/caldav/user/calendar/events/',
    username: 'user',
    password: 'password'
  };

  beforeEach(() => {
    provider = new CalDAVProvider(mockConfig, {} as FullCalendarPlugin);
    mockObsidianFetch.mockReset();
  });

  it('updates CalDAV events at the server href returned by REPORT', async () => {
    const propfindResponse = `
      <d:multistatus xmlns:d="DAV:">
        <d:response>
          <d:href>/caldav/user/calendar/events/</d:href>
          <d:propstat>
            <d:prop>
              <d:resourcetype>
                <d:collection/>
                <c:calendar xmlns:c="urn:ietf:params:xml:ns:caldav"/>
              </d:resourcetype>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;

    const reportResponse = `
      <d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
        <d:response>
          <d:href>/caldav/user/calendar/events/server-generated-object.ics</d:href>
          <d:propstat>
            <d:prop>
              <d:getetag>"etag-1"</d:getetag>
              <c:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:not-the-file-name
SUMMARY:Original
DTSTART:20260615T100000Z
DTEND:20260615T110000Z
END:VEVENT
END:VCALENDAR
</c:calendar-data>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;

    mockObsidianFetch
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(propfindResponse)
      } as Response)
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(reportResponse)
      } as Response)
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(`<d:multistatus xmlns:d="DAV:"></d:multistatus>`)
      } as Response)
      .mockResolvedValueOnce({ status: 204, statusText: 'No Content' } as Response);

    const [[oldEvent]] = await provider.getEvents();
    const handle = provider.getEventHandle(oldEvent);
    if (!handle) throw new Error('Expected event handle');

    await provider.updateEvent(handle, oldEvent, {
      ...oldEvent,
      title: 'Updated',
      alarms: [{ minutesBefore: 20, action: 'DISPLAY' }]
    });

    expect(mockObsidianFetch).toHaveBeenLastCalledWith(
      'https://example.com/caldav/user/calendar/events/server-generated-object.ics',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'If-Match': '"etag-1"'
        }) as Record<string, unknown>
      })
    );

    const body = mockObsidianFetch.mock.calls[3][1]?.body;
    expect(body).toEqual(expect.stringContaining('BEGIN:VALARM'));
    expect(body).toEqual(expect.stringContaining('TRIGGER:-PT20M'));
  });

  it('creates recurrence overrides in the original CalDAV object', async () => {
    const masterEvent = {
      type: 'rrule',
      uid: 'meeting-series',
      id: 'ics::meeting-series::2026-06-01::recurring',
      caldavHref: '/caldav/user/calendar/events/real-object.ics',
      title: 'Weekly Meeting',
      startDate: '2026-06-01',
      endDate: null,
      rrule: 'FREQ=WEEKLY',
      skipDates: [],
      allDay: false,
      startTime: '10:00',
      endTime: '11:00',
      timezone: 'Europe/Amsterdam',
      notify: { value: 10 },
      alarms: [{ minutesBefore: 10, action: 'DISPLAY' }]
    } as OFCEvent;

    const overrideEvent = {
      type: 'single',
      title: 'Weekly Meeting moved',
      date: '2026-06-09',
      endDate: null,
      allDay: false,
      startTime: '12:00',
      endTime: '13:00'
    } as OFCEvent;

    mockObsidianFetch
      .mockResolvedValueOnce({
        status: 200,
        text: () =>
          Promise.resolve(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:meeting-series
SUMMARY:Weekly Meeting
DTSTART:20260601T100000
DTEND:20260601T110000
RRULE:FREQ=WEEKLY
END:VEVENT
END:VCALENDAR`)
      } as Response)
      .mockResolvedValueOnce({ status: 204, statusText: 'No Content' } as Response);

    await provider.createInstanceOverride(masterEvent, '2026-06-08', overrideEvent);

    expect(mockObsidianFetch).toHaveBeenLastCalledWith(
      'https://example.com/caldav/user/calendar/events/real-object.ics',
      expect.objectContaining({ method: 'PUT' })
    );
    const body = mockObsidianFetch.mock.calls[1][1]?.body;
    expect(body).toEqual(expect.stringContaining('UID:meeting-series'));
    expect(body).toEqual(
      expect.stringContaining('RECURRENCE-ID;TZID=Europe/Amsterdam:20260608T100000')
    );
    expect(body).toEqual(expect.stringContaining('DTSTART;TZID=Europe/Amsterdam:20260609T120000'));
    expect(body).toEqual(expect.stringContaining('BEGIN:VALARM'));
    expect(body).toEqual(expect.stringContaining('TRIGGER:-PT10M'));
  });

  it('creates Obsidian recurring events as real CalDAV recurrence series', async () => {
    const event = {
      type: 'recurring',
      uid: 'obsidian-created-series',
      title: 'Daily standup',
      startRecur: '2026-06-01',
      endDate: null,
      daysOfWeek: ['M', 'T', 'W', 'R', 'F'],
      repeatInterval: 1,
      skipDates: [],
      allDay: false,
      startTime: '09:00',
      endTime: '09:30',
      timezone: 'Europe/Amsterdam'
    } as OFCEvent;

    mockObsidianFetch.mockResolvedValueOnce({ status: 201, statusText: 'Created' } as Response);

    await provider.createEvent(event);

    expect(mockObsidianFetch).toHaveBeenLastCalledWith(
      'https://example.com/caldav/user/calendar/events/obsidian-created-series.ics',
      expect.objectContaining({ method: 'PUT' })
    );
    const body = mockObsidianFetch.mock.calls[0][1]?.body;
    expect(body).toEqual(expect.stringContaining('BEGIN:VEVENT'));
    expect(body).toEqual(expect.stringContaining('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'));
    expect(body).toEqual(expect.stringContaining('DTSTART;TZID=Europe/Amsterdam:20260601T090000'));
    expect(body).toEqual(expect.stringContaining('DTEND;TZID=Europe/Amsterdam:20260601T093000'));
  });

  it('updates a CalDAV recurrence override without replacing the recurring object', async () => {
    const oldOverride = {
      type: 'single',
      uid: 'meeting-series',
      recurrenceId: '2026-06-08T10:00:00.000+02:00',
      caldavHref: '/caldav/user/calendar/events/real-object.ics',
      title: 'Weekly Meeting moved',
      date: '2026-06-09',
      endDate: null,
      allDay: false,
      startTime: '12:00',
      endTime: '13:00',
      timezone: 'Europe/Amsterdam'
    } as OFCEvent;

    const newOverride = {
      ...oldOverride,
      title: 'Weekly Meeting moved again',
      alarms: [{ minutesBefore: 30, action: 'DISPLAY' }]
    } as OFCEvent;

    mockObsidianFetch
      .mockResolvedValueOnce({
        status: 200,
        text: () =>
          Promise.resolve(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:meeting-series
SUMMARY:Weekly Meeting
DTSTART;TZID=Europe/Amsterdam:20260601T100000
DTEND;TZID=Europe/Amsterdam:20260601T110000
RRULE:FREQ=WEEKLY
END:VEVENT
BEGIN:VEVENT
UID:meeting-series
RECURRENCE-ID;TZID=Europe/Amsterdam:20260608T100000
SUMMARY:Weekly Meeting moved
DTSTART;TZID=Europe/Amsterdam:20260609T120000
DTEND;TZID=Europe/Amsterdam:20260609T130000
END:VEVENT
END:VCALENDAR`)
      } as Response)
      .mockResolvedValueOnce({ status: 204, statusText: 'No Content' } as Response);

    const handle = provider.getEventHandle(oldOverride);
    if (!handle) throw new Error('Expected event handle');

    await provider.updateEvent(handle, oldOverride, newOverride);

    expect(mockObsidianFetch).toHaveBeenLastCalledWith(
      'https://example.com/caldav/user/calendar/events/real-object.ics',
      expect.objectContaining({ method: 'PUT' })
    );
    const body = mockObsidianFetch.mock.calls[1][1]?.body;
    expect(body).toEqual(expect.stringContaining('RRULE:FREQ=WEEKLY'));
    expect(body).toEqual(expect.stringContaining('SUMMARY:Weekly Meeting'));
    expect(body).toEqual(expect.stringContaining('SUMMARY:Weekly Meeting moved again'));
    expect(body).toEqual(
      expect.stringContaining('RECURRENCE-ID;TZID=Europe/Amsterdam:20260608T100000')
    );
    expect(body).toEqual(expect.stringContaining('TRIGGER:-PT30M'));
  });

  it('deletes a CalDAV recurrence override without deleting the shared recurring object', async () => {
    const overrideEvent = {
      type: 'single',
      uid: 'meeting-series',
      recurrenceId: '2026-06-08T10:00:00.000+02:00',
      caldavHref: '/caldav/user/calendar/events/real-object.ics',
      title: 'Weekly Meeting moved',
      date: '2026-06-09',
      endDate: null,
      allDay: false,
      startTime: '12:00',
      endTime: '13:00',
      timezone: 'Europe/Amsterdam'
    } as OFCEvent;

    mockObsidianFetch
      .mockResolvedValueOnce({
        status: 200,
        text: () =>
          Promise.resolve(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:meeting-series
SUMMARY:Weekly Meeting
DTSTART;TZID=Europe/Amsterdam:20260601T100000
DTEND;TZID=Europe/Amsterdam:20260601T110000
RRULE:FREQ=WEEKLY
END:VEVENT
BEGIN:VEVENT
UID:meeting-series
RECURRENCE-ID;TZID=Europe/Amsterdam:20260608T100000
SUMMARY:Weekly Meeting moved
DTSTART;TZID=Europe/Amsterdam:20260609T120000
DTEND;TZID=Europe/Amsterdam:20260609T130000
END:VEVENT
END:VCALENDAR`)
      } as Response)
      .mockResolvedValueOnce({ status: 204, statusText: 'No Content' } as Response);

    const handle = provider.getEventHandle(overrideEvent);
    if (!handle) throw new Error('Expected event handle');

    await provider.deleteEvent(handle);

    expect(mockObsidianFetch).toHaveBeenLastCalledWith(
      'https://example.com/caldav/user/calendar/events/real-object.ics',
      expect.objectContaining({ method: 'PUT' })
    );
    const body = mockObsidianFetch.mock.calls[1][1]?.body;
    expect(body).toEqual(expect.stringContaining('RRULE:FREQ=WEEKLY'));
    expect(body).toEqual(expect.stringContaining('SUMMARY:Weekly Meeting'));
    expect(body).not.toEqual(expect.stringContaining('SUMMARY:Weekly Meeting moved'));
    expect(body).not.toEqual(expect.stringContaining('RECURRENCE-ID'));
  });

  it('keeps multiple moved recurrence exceptions distinct when syncing CalDAV', async () => {
    const propfindResponse = `
      <d:multistatus xmlns:d="DAV:">
        <d:response>
          <d:href>/caldav/user/calendar/events/</d:href>
          <d:propstat>
            <d:prop>
              <d:resourcetype>
                <d:collection/>
                <c:calendar xmlns:c="urn:ietf:params:xml:ns:caldav"/>
              </d:resourcetype>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;

    const reportResponse = `
      <d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
        <d:response>
          <d:href>/caldav/user/calendar/events/series.ics</d:href>
          <d:propstat>
            <d:prop>
              <d:getetag>"etag-series"</d:getetag>
              <c:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:series-with-exceptions
SUMMARY:Weekly Meeting
DTSTART;TZID=Europe/Amsterdam:20260601T100000
DTEND;TZID=Europe/Amsterdam:20260601T110000
RRULE:FREQ=WEEKLY
END:VEVENT
BEGIN:VEVENT
UID:series-with-exceptions
RECURRENCE-ID;TZID=Europe/Amsterdam:20260608T100000
SUMMARY:Weekly Meeting moved once
DTSTART;TZID=Europe/Amsterdam:20260609T120000
DTEND;TZID=Europe/Amsterdam:20260609T130000
END:VEVENT
BEGIN:VEVENT
UID:series-with-exceptions
RECURRENCE-ID;TZID=Europe/Amsterdam:20260615T100000
SUMMARY:Weekly Meeting moved twice
DTSTART;TZID=Europe/Amsterdam:20260620T120000
DTEND;TZID=Europe/Amsterdam:20260620T130000
END:VEVENT
END:VCALENDAR
</c:calendar-data>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;

    mockObsidianFetch
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(propfindResponse)
      } as Response)
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(reportResponse)
      } as Response)
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(`<d:multistatus xmlns:d="DAV:"></d:multistatus>`)
      } as Response);

    const events = await provider.getEvents();
    const parsedEvents = events.map(([event]) => event);
    const syncKeys = parsedEvents.map(event => provider.computeSyncKey(event));
    const recurringEvent = parsedEvents.find(event => event.type === 'rrule');
    const exceptionEvents = parsedEvents.filter(
      (event): event is Extract<OFCEvent, { type: 'single' }> => event.type === 'single'
    );

    expect(parsedEvents).toHaveLength(3);
    expect(new Set(syncKeys).size).toBe(3);
    expect(recurringEvent?.type === 'rrule' ? recurringEvent.skipDates : []).toEqual([
      '2026-06-08',
      '2026-06-15'
    ]);
    expect(exceptionEvents.map(event => event.date)).toEqual(['2026-06-09', '2026-06-20']);
  });
});
