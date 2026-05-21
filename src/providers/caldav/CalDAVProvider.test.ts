/**
 * @jest-environment jsdom
 */
import { CalDAVProvider } from './CalDAVProvider';
import { obsidianFetch } from './obsidian-fetch_caldav';
import { fetchCalendarInfo } from './helper_caldav';
import { importCalendars } from './import_caldav';
import { CalDAVProviderConfig } from './typesCalDAV';
import FullCalendarPlugin from '../../main';
import { OFCEvent } from '../../types';

// Mock obsidianFetch
jest.mock('./obsidian-fetch_caldav', () => ({
  obsidianFetch: jest.fn()
}));

const mockObsidianFetch = obsidianFetch as jest.MockedFunction<typeof obsidianFetch>;

describe('CalDAVProvider', () => {
  let provider: CalDAVProvider;
  let mockPlugin: FullCalendarPlugin;
  const mockConfig: CalDAVProviderConfig = {
    id: 'caldav_1',
    name: 'Test Calendar',
    url: 'https://example.com/caldav/',
    homeUrl: 'https://example.com/caldav/user/calendar/events/',
    username: 'user',
    password: 'password'
  };

  beforeEach(() => {
    mockPlugin = {} as FullCalendarPlugin;
    provider = new CalDAVProvider(mockConfig, mockPlugin);
    mockObsidianFetch.mockReset();
  });

  it('should fetch events using a single REPORT request after validating URL', async () => {
    const mockPropfindResponse = `
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

    const mockReportResponse = `
      <d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
        <d:response>
          <d:href>/caldav/user/calendar/events/event1.ics</d:href>
          <d:propstat>
            <d:prop>
              <d:getetag>"12345"</d:getetag>
              <c:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:event1
SUMMARY:Test Event 1
DTSTART:20230101T100000Z
DTEND:20230101T110000Z
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
        text: () => Promise.resolve(mockPropfindResponse)
      } as Response) // First call: PROPFIND
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(mockReportResponse)
      } as Response) // Second call: REPORT for VEVENT
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(`<d:multistatus xmlns:d="DAV:"></d:multistatus>`)
      } as Response); // Third call: REPORT for VTODO

    const events = await provider.getEvents();

    expect(mockObsidianFetch).toHaveBeenCalledTimes(3);

    // Verify PROPFIND
    expect(mockObsidianFetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('https://example.com/caldav/user/calendar/events/'),
      expect.objectContaining({
        method: 'PROPFIND',
        headers: expect.objectContaining({
          Depth: '0'
        }) as Record<string, unknown>
      })
    );

    // Verify REPORT for VEVENT
    expect(mockObsidianFetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('https://example.com/caldav/user/calendar/events/'),
      expect.objectContaining({
        method: 'REPORT',
        headers: expect.objectContaining({
          Depth: '1'
        }) as Record<string, unknown>,
        body: expect.stringContaining('<c:comp-filter name="VEVENT">') as string
      })
    );

    // Verify REPORT for VTODO
    expect(mockObsidianFetch).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('https://example.com/caldav/user/calendar/events/'),
      expect.objectContaining({
        method: 'REPORT',
        headers: expect.objectContaining({
          Depth: '1'
        }) as Record<string, unknown>,
        body: expect.stringContaining('<c:comp-filter name="VTODO">') as string
      })
    );

    expect(events).toHaveLength(1);
    expect(events[0][0].title).toBe('Test Event 1');
  });

  it('should use compatibility fallback when REPORT returns 400', async () => {
    const mockPropfindResponse = `
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

    const mockFallbackPropfind = `
      <d:multistatus xmlns:d="DAV:">
        <d:response>
          <d:href>/caldav/user/calendar/events/event1.ics</d:href>
          <d:propstat>
            <d:prop>
              <d:getetag>"etag-1"</d:getetag>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;

    const mockIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:event1
SUMMARY:Fallback Event
DTSTART:20230101T100000Z
DTEND:20230101T110000Z
END:VEVENT
END:VCALENDAR
`;

    mockObsidianFetch
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(mockPropfindResponse)
      } as Response)
      .mockResolvedValueOnce({
        status: 400,
        text: () => Promise.resolve('Bad Request')
      } as Response)
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(mockFallbackPropfind)
      } as Response)
      .mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve(mockIcs)
      } as Response);

    const events = await provider.getEvents();

    expect(events).toHaveLength(1);
    expect(events[0][0].title).toBe('Fallback Event');
    expect(events[0][0].etag).toBe('etag-1');

    expect(mockObsidianFetch).toHaveBeenCalledTimes(4);
    expect(mockObsidianFetch).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('https://example.com/caldav/user/calendar/events/'),
      expect.objectContaining({
        method: 'PROPFIND',
        headers: expect.objectContaining({
          Depth: '1'
        }) as Record<string, unknown>
      })
    );
  });

  it('should preserve unique sync keys for recurring series and recurrence exceptions', async () => {
    const mockPropfindResponse = `
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

    const mockReportResponse = `
      <d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
        <d:response>
          <d:href>/caldav/user/calendar/events/event1.ics</d:href>
          <d:propstat>
            <d:prop>
              <d:getetag>"etag-rrule"</d:getetag>
              <c:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:series-1
SUMMARY:Yearly Anniversary
DTSTART;VALUE=DATE:20200115
DTEND;VALUE=DATE:20200116
RRULE:FREQ=YEARLY
END:VEVENT
BEGIN:VEVENT
UID:series-1
RECURRENCE-ID;VALUE=DATE:20240115
SUMMARY:Yearly Anniversary (Moved)
DTSTART;VALUE=DATE:20240116
DTEND;VALUE=DATE:20240117
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
        text: () => Promise.resolve(mockPropfindResponse)
      } as Response)
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(mockReportResponse)
      } as Response)
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(`<d:multistatus xmlns:d="DAV:"></d:multistatus>`)
      } as Response);

    const events = await provider.getEvents();
    const syncKeys = events.map(([event]) => provider.computeSyncKey(event));

    expect(events).toHaveLength(2);
    expect(syncKeys).toHaveLength(2);
    expect(new Set(syncKeys).size).toBe(2);
    expect(syncKeys).toContain('ics::series-1::2020-01-15::recurring');
    expect(syncKeys).toContain('series-1');
  });

  it('should keep valid fallback events when some fallback GET requests fail', async () => {
    const mockPropfindResponse = `
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

    const mockFallbackPropfind = `
      <d:multistatus xmlns:d="DAV:">
        <d:response>
          <d:href>/caldav/user/calendar/events/bad.ics</d:href>
          <d:propstat>
            <d:prop>
              <d:getetag>"bad-etag"</d:getetag>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
        <d:response>
          <d:href>/caldav/user/calendar/events/good.ics</d:href>
          <d:propstat>
            <d:prop>
              <d:getetag>"good-etag"</d:getetag>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;

    const goodIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:good
SUMMARY:Good Event
DTSTART:20230101T100000Z
DTEND:20230101T110000Z
END:VEVENT
END:VCALENDAR
`;

    mockObsidianFetch
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(mockPropfindResponse)
      } as Response)
      .mockResolvedValueOnce({
        status: 400,
        text: () => Promise.resolve('Bad Request')
      } as Response)
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(mockFallbackPropfind)
      } as Response)
      .mockResolvedValueOnce({
        status: 500,
        text: () => Promise.resolve('Server error')
      } as Response)
      .mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve(goodIcs)
      } as Response);

    const events = await provider.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0][0].title).toBe('Good Event');
    expect(events[0][0].etag).toBe('good-etag');
  });

  it('should throw error if URL is not a calendar collection', async () => {
    const mockPropfindResponse = `
      <d:multistatus xmlns:d="DAV:">
        <d:response>
          <d:href>/caldav/user/calendar/events/</d:href>
          <d:propstat>
            <d:prop>
              <d:resourcetype>
                <d:collection/>
                <!-- No calendar tag -->
              </d:resourcetype>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;

    mockObsidianFetch.mockResolvedValueOnce({
      status: 207,
      text: () => Promise.resolve(mockPropfindResponse)
    } as Response);

    await expect(provider.getEvents()).rejects.toThrow('Invalid collection URL or not a calendar');
  });

  it('should fail fast when REPORT response body is empty', async () => {
    const mockPropfindResponse = `
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

    mockObsidianFetch
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(mockPropfindResponse)
      } as Response)
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve('   ')
      } as Response);

    await expect(provider.getEvents()).rejects.toThrow('CalDAV REPORT returned an empty body');
  });

  it('should fail fast when REPORT XML is malformed', async () => {
    const mockPropfindResponse = `
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

    mockObsidianFetch
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(mockPropfindResponse)
      } as Response)
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve('<d:multistatus><broken></d:multistatus>')
      } as Response);

    await expect(provider.getEvents()).rejects.toThrow('CalDAV REPORT returned malformed XML');
  });

  it('should fail fast when fallback GET returns empty ICS payload', async () => {
    const mockPropfindResponse = `
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

    const mockReportWithoutCalendarData = `
      <d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
        <d:response>
          <d:href>/caldav/user/calendar/events/event-empty.ics</d:href>
          <d:propstat>
            <d:prop>
              <d:getetag>"empty-etag"</d:getetag>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;

    mockObsidianFetch
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(mockPropfindResponse)
      } as Response)
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(mockReportWithoutCalendarData)
      } as Response)
      .mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve('')
      } as Response);

    await expect(provider.getEvents()).rejects.toThrow('empty ICS payload');
  });

  it('supports create, rename/update, and delete workflow for editable events', async () => {
    const baseEvent: OFCEvent = {
      uid: 'evt-workflow-1',
      title: 'Initial Name',
      type: 'single',
      allDay: true,
      date: '2026-03-27',
      endDate: null
    };

    const renamedEvent: OFCEvent = {
      ...baseEvent,
      title: 'Renamed Name'
    };

    mockObsidianFetch
      .mockResolvedValueOnce({ status: 201, statusText: 'Created' } as Response)
      .mockResolvedValueOnce({ status: 204, statusText: 'No Content' } as Response)
      .mockResolvedValueOnce({ status: 204, statusText: 'No Content' } as Response);

    expect(provider.getCapabilities()).toEqual({ canCreate: true, canEdit: true, canDelete: true });

    const [createdEvent] = await provider.createEvent({ ...baseEvent });
    expect(createdEvent.uid).toBe('evt-workflow-1');

    await provider.updateEvent(
      { persistentId: 'evt-workflow-1' },
      { ...baseEvent, etag: 'old-etag' },
      renamedEvent
    );

    await provider.deleteEvent({ persistentId: 'evt-workflow-1' });

    expect(mockObsidianFetch).toHaveBeenCalledTimes(3);

    expect(mockObsidianFetch).toHaveBeenNthCalledWith(
      1,
      'https://example.com/caldav/user/calendar/events/evt-workflow-1.ics',
      expect.objectContaining({
        method: 'PUT'
      })
    );

    expect(mockObsidianFetch).toHaveBeenNthCalledWith(
      2,
      'https://example.com/caldav/user/calendar/events/evt-workflow-1.ics',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'If-Match': '"old-etag"'
        }) as Record<string, unknown>
      })
    );

    expect(mockObsidianFetch).toHaveBeenNthCalledWith(
      3,
      'https://example.com/caldav/user/calendar/events/evt-workflow-1.ics',
      expect.objectContaining({
        method: 'DELETE'
      })
    );
  });
});

describe('fetchCalendarInfo', () => {
  beforeEach(() => {
    mockObsidianFetch.mockReset();
  });

  it('returns isCalendar=true with displayName and color from a full PROPFIND response', async () => {
    const xml = `
      <d:multistatus xmlns:d="DAV:" xmlns:ical="http://apple.com/ns/ical/">
        <d:response>
          <d:href>/cal/</d:href>
          <d:propstat>
            <d:prop>
              <d:resourcetype>
                <d:collection/>
                <cal:calendar xmlns:cal="urn:ietf:params:xml:ns:caldav"/>
              </d:resourcetype>
              <d:displayname>Work Calendar</d:displayname>
              <ical:calendar-color>#FF5733FF</ical:calendar-color>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;
    mockObsidianFetch.mockResolvedValueOnce({
      status: 207,
      text: () => Promise.resolve(xml)
    } as Response);

    const result = await fetchCalendarInfo('https://example.com/cal/', {
      username: 'user',
      password: 'pass'
    });

    expect(result.isCalendar).toBe(true);
    expect(result.displayName).toBe('Work Calendar');
    expect(result.color).toBe('#FF5733'); // alpha stripped
  });

  it('passes through a 6-digit hex color without modification', async () => {
    const xml = `
      <d:multistatus xmlns:d="DAV:" xmlns:ical="http://apple.com/ns/ical/">
        <d:response>
          <d:propstat>
            <d:prop>
              <d:resourcetype>
                <cal:calendar xmlns:cal="urn:ietf:params:xml:ns:caldav"/>
              </d:resourcetype>
              <d:displayname>Personal</d:displayname>
              <ical:calendar-color>#3A86FF</ical:calendar-color>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;
    mockObsidianFetch.mockResolvedValueOnce({
      status: 207,
      text: () => Promise.resolve(xml)
    } as Response);

    const result = await fetchCalendarInfo('https://example.com/cal/');
    expect(result.color).toBe('#3A86FF');
  });

  it('returns undefined displayName and color when server omits them', async () => {
    const xml = `
      <d:multistatus xmlns:d="DAV:">
        <d:response>
          <d:propstat>
            <d:prop>
              <d:resourcetype>
                <cal:calendar xmlns:cal="urn:ietf:params:xml:ns:caldav"/>
              </d:resourcetype>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;
    mockObsidianFetch.mockResolvedValueOnce({
      status: 207,
      text: () => Promise.resolve(xml)
    } as Response);

    const result = await fetchCalendarInfo('https://example.com/cal/');
    expect(result.isCalendar).toBe(true);
    expect(result.displayName).toBeUndefined();
    expect(result.color).toBeUndefined();
  });

  it('returns isCalendar=false when resourcetype is not a calendar', async () => {
    const xml = `
      <d:multistatus xmlns:d="DAV:">
        <d:response>
          <d:propstat>
            <d:prop>
              <d:resourcetype><d:collection/></d:resourcetype>
              <d:displayname>Files</d:displayname>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;
    mockObsidianFetch.mockResolvedValueOnce({
      status: 207,
      text: () => Promise.resolve(xml)
    } as Response);

    const result = await fetchCalendarInfo('https://example.com/files/');
    expect(result.isCalendar).toBe(false);
  });

  it('returns isCalendar=false on HTTP error', async () => {
    mockObsidianFetch.mockResolvedValueOnce({
      status: 401,
      text: () => Promise.resolve('Unauthorized')
    } as Response);

    const result = await fetchCalendarInfo('https://example.com/cal/', {
      username: 'bad',
      password: 'creds'
    });
    expect(result.isCalendar).toBe(false);
    expect(result.error).toContain('status 401');
  });

  it('builds UTF-8 Basic auth header without relying on direct Buffer usage', async () => {
    const xml = `
      <d:multistatus xmlns:d="DAV:">
        <d:response>
          <d:propstat>
            <d:prop>
              <d:resourcetype>
                <cal:calendar xmlns:cal="urn:ietf:params:xml:ns:caldav"/>
              </d:resourcetype>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;
    mockObsidianFetch.mockResolvedValueOnce({
      status: 207,
      text: () => Promise.resolve(xml)
    } as Response);

    await fetchCalendarInfo('https://example.com/cal/', {
      username: 'usér',
      password: 'päss'
    });

    expect(mockObsidianFetch).toHaveBeenCalledWith(
      'https://example.com/cal/',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Basic dXPDqXI6cMOkc3M='
        }) as Record<string, unknown>
      })
    );
  });

  it('handles color values without a leading # prefix', async () => {
    const xml = `
      <d:multistatus xmlns:d="DAV:" xmlns:ical="http://apple.com/ns/ical/">
        <d:response>
          <d:propstat>
            <d:prop>
              <d:resourcetype>
                <cal:calendar xmlns:cal="urn:ietf:params:xml:ns:caldav"/>
              </d:resourcetype>
              <ical:calendar-color>FF5733FF</ical:calendar-color>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;
    mockObsidianFetch.mockResolvedValueOnce({
      status: 207,
      text: () => Promise.resolve(xml)
    } as Response);

    const result = await fetchCalendarInfo('https://example.com/cal/');
    expect(result.color).toBe('#FF5733');
  });
});

describe('importCalendars', () => {
  beforeEach(() => {
    mockObsidianFetch.mockReset();
  });

  it('uses server-provided name and color when available', async () => {
    const xml = `
      <d:multistatus xmlns:d="DAV:" xmlns:ical="http://apple.com/ns/ical/">
        <d:response>
          <d:propstat>
            <d:prop>
              <d:resourcetype>
                <cal:calendar xmlns:cal="urn:ietf:params:xml:ns:caldav"/>
              </d:resourcetype>
              <d:displayname>Home</d:displayname>
              <ical:calendar-color>#AABBCCDD</ical:calendar-color>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;
    mockObsidianFetch.mockResolvedValueOnce({
      status: 207,
      text: () => Promise.resolve(xml)
    } as Response);

    const sources = await importCalendars(
      { type: 'basic', username: 'u', password: 'p' },
      'https://example.com/cal/',
      []
    );

    expect(sources).toHaveLength(1);
    expect(sources[0].name).toBe('Home');
    expect(sources[0].color).toBe('#AABBCC'); // alpha stripped
  });

  it('falls back to defaults when server omits name and color', async () => {
    const xml = `
      <d:multistatus xmlns:d="DAV:">
        <d:response>
          <d:propstat>
            <d:prop>
              <d:resourcetype>
                <cal:calendar xmlns:cal="urn:ietf:params:xml:ns:caldav"/>
              </d:resourcetype>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;
    mockObsidianFetch.mockResolvedValueOnce({
      status: 207,
      text: () => Promise.resolve(xml)
    } as Response);

    const sources = await importCalendars(
      { type: 'basic', username: 'u', password: 'p' },
      'https://example.com/cal/',
      []
    );

    expect(sources).toHaveLength(1);
    expect(sources[0].name).toBe('CalDAV Calendar');
    expect(sources[0].color).toBe('#888888');
  });

  it('throws when the URL is not a calendar collection', async () => {
    const xml = `
      <d:multistatus xmlns:d="DAV:">
        <d:response>
          <d:propstat>
            <d:prop>
              <d:resourcetype><d:collection/></d:resourcetype>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>
    `;
    mockObsidianFetch.mockResolvedValueOnce({
      status: 207,
      text: () => Promise.resolve(xml)
    } as Response);

    await expect(
      importCalendars(
        { type: 'basic', username: 'u', password: 'p' },
        'https://example.com/files/',
        []
      )
    ).rejects.toThrow('does not appear to be a valid CalDAV calendar collection');
  });

  it('throws a structured error when discovery request fails', async () => {
    mockObsidianFetch.mockResolvedValueOnce({
      status: 503,
      text: () => Promise.resolve('Service unavailable')
    } as Response);

    await expect(
      importCalendars(
        { type: 'basic', username: 'u', password: 'p' },
        'https://example.com/files/',
        []
      )
    ).rejects.toThrow('Failed to import CalDAV calendar: CalDAV PROPFIND failed with status 503.');
  });
});
