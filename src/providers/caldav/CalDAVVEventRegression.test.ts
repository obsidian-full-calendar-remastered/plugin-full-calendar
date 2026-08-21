/**
 * @jest-environment jsdom
 */
import FullCalendarPlugin from '../../main';
import { CalDAVProvider } from './CalDAVProvider';
import { obsidianFetch } from './obsidian-fetch_caldav';
import { CalDAVProviderConfig } from './typesCalDAV';

jest.mock('./obsidian-fetch_caldav', () => ({ obsidianFetch: jest.fn() }));

const mockFetch = obsidianFetch as jest.MockedFunction<typeof obsidianFetch>;

const config: CalDAVProviderConfig = {
  id: 'caldav_vevent_regression',
  name: 'Calendar',
  url: 'https://caldav.example.com/',
  homeUrl: 'https://caldav.example.com/calendars/events/',
  username: '',
  password: ''
};

const collectionInfo = `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response><d:propstat><d:prop>
    <d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
    <c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>
  </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
</d:multistatus>`;

const eventReport = `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response><d:href>/calendars/events/meeting.ics</d:href><d:propstat><d:prop>
    <d:getetag>"event-etag"</d:getetag>
    <c:calendar-data><![CDATA[BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:existing-event
SUMMARY:Team meeting
DTSTART:20260820T100000Z
DTEND:20260820T110000Z
END:VEVENT
END:VCALENDAR]]></c:calendar-data>
  </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
</d:multistatus>`;

describe('CalDAV VEVENT regression', () => {
  beforeEach(() => mockFetch.mockReset());

  it('keeps the existing VEVENT CalDAV read path unchanged', async () => {
    mockFetch
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(collectionInfo)
      } as Response)
      .mockResolvedValueOnce({ status: 207, text: () => Promise.resolve(eventReport) } as Response)
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve('<d:multistatus xmlns:d="DAV:"/>')
      } as Response);

    const provider = new CalDAVProvider(config, {} as FullCalendarPlugin);
    const events = await provider.getEvents({
      start: new Date('2026-08-01T00:00:00Z'),
      end: new Date('2026-09-01T00:00:00Z')
    });

    expect(events).toHaveLength(1);
    expect(events[0][0]).toMatchObject({
      uid: 'existing-event',
      title: 'Team meeting',
      caldavHref: '/calendars/events/meeting.ics',
      etag: 'event-etag'
    });
    expect(mockFetch.mock.calls[1][1]?.body).toEqual(
      expect.stringContaining('<c:comp-filter name="VEVENT">')
    );
  });
});
