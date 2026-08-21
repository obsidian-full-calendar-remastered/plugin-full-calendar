/**
 * @jest-environment jsdom
 */
import { OFCEvent } from '../../types';
import { readFileSync } from 'fs';
import { join } from 'path';
import FullCalendarPlugin from '../../main';
import { CredentialStore } from '../../features/credentials/CredentialStore';
import { PluginState } from '../../core/PluginState';
import { obsidianFetch } from './obsidian-fetch_caldav';
import { CalDAVTaskProvider } from './CalDAVTaskProvider';
import { CalDAVTaskProviderConfig } from './typesCalDAV';

jest.mock('./obsidian-fetch_caldav', () => ({ obsidianFetch: jest.fn() }));

const mockFetch = obsidianFetch as jest.MockedFunction<typeof obsidianFetch>;

const appleMultiStatus = readFileSync(
  join(__dirname, 'fixtures', 'apple-vtodo-multistatus.xml'),
  'utf8'
);

const config: CalDAVTaskProviderConfig = {
  id: 'caldavtasks_1',
  name: 'Reminders',
  url: 'https://caldav.example.com/',
  homeUrl: 'https://caldav.example.com/principal/calendars/tasks/',
  username: '',
  password: ''
};

const collectionInfo = `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response><d:propstat><d:prop>
    <d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
    <c:supported-calendar-component-set><c:comp name="VTODO"/></c:supported-calendar-component-set>
  </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
</d:multistatus>`;

function reportResponse(ics: string, href = '/principal/calendars/tasks/task.ics'): string {
  return `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response><d:href>${href}</d:href><d:propstat><d:prop>
    <d:getetag>"etag-1"</d:getetag><c:calendar-data><![CDATA[${ics}]]></c:calendar-data>
  </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
</d:multistatus>`;
}

describe('CalDAVTaskProvider', () => {
  let provider: CalDAVTaskProvider;

  beforeEach(() => {
    provider = new CalDAVTaskProvider(config, {} as FullCalendarPlugin);
    mockFetch.mockReset();
    jest.spyOn(CredentialStore, 'getCalDAVPassword').mockReturnValue(config.password);
  });

  afterEach(() => jest.restoreAllMocks());

  it('fetches only VTODO resources and maps stable href/UID/ETag identity', async () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:remote-task
SUMMARY:Remote reminder
DUE:20260816T180000Z
STATUS:NEEDS-ACTION
END:VTODO
END:VCALENDAR`;
    mockFetch
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(collectionInfo)
      } as Response)
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(reportResponse(ics))
      } as Response);

    const events = await provider.getEvents({
      start: new Date('2026-08-01T00:00:00Z'),
      end: new Date('2026-09-01T00:00:00Z')
    });

    expect(mockFetch.mock.calls[1][1]?.body).toEqual(
      expect.stringContaining('<c:comp-filter name="VTODO"/>')
    );
    expect(mockFetch.mock.calls[1][1]?.body).not.toEqual(expect.stringContaining('VEVENT'));
    expect(mockFetch.mock.calls[1][1]?.body).not.toEqual(expect.stringContaining('<c:time-range'));
    expect(events).toHaveLength(1);
    expect(events[0][0]).toMatchObject({
      uid: 'remote-task',
      caldavHref: '/principal/calendars/tasks/task.ics',
      etag: 'etag-1',
      completed: false
    });
  });

  it('extracts and parses multiple Apple VTODO resources from a sanitized 207 response', async () => {
    mockFetch
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(collectionInfo)
      } as Response)
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(appleMultiStatus)
      } as Response);

    const events = await provider.getEvents();

    const reportRequest = mockFetch.mock.calls[1][1];
    expect(reportRequest?.method).toBe('REPORT');
    expect(reportRequest?.headers as Record<string, string>).toMatchObject({
      Depth: '1',
      'Content-Type': 'application/xml; charset=utf-8'
    });
    expect(mockFetch.mock.calls[1][1]?.body).toEqual(
      expect.stringContaining('<c:comp-filter name="VTODO"/>')
    );
    expect(mockFetch.mock.calls[1][1]?.body).toEqual(expect.stringContaining('<c:calendar-data/>'));
    expect(mockFetch.mock.calls[1][1]?.body).not.toEqual(expect.stringContaining('<c:time-range'));
    expect(events.length).toBeGreaterThan(0);
    expect(events).toHaveLength(2);
    expect(events.map(([event]) => event.uid)).toEqual([
      'COMPLETED-REMINDER-UID',
      'ACTIVE-APPLE-REMINDER-UID'
    ]);
    expect(events[0][0]).toMatchObject({
      title: 'Completed reminder',
      date: '2023-01-09',
      startTime: '09:00',
      timezone: 'Asia/Nicosia',
      caldavHref: '/sanitized-principal/calendars/tasks/completed-reminder.ics',
      etag: 'completed-etag'
    });
    expect(events[0][0].type === 'single' && events[0][0].completed).toBeTruthy();
    expect(events[1][0]).toMatchObject({
      title: 'Active reminder',
      date: '2026-08-16',
      startTime: '09:00',
      timezone: 'Asia/Nicosia',
      completed: false,
      caldavHref: '/sanitized-principal/calendars/tasks/active-reminder.ics',
      etag: 'active-etag'
    });
  });

  it('does not parse VEVENT data returned by a compatibility fallback', async () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:event-only
SUMMARY:Meeting
DTSTART:20260816T180000Z
DTEND:20260816T190000Z
END:VEVENT
END:VCALENDAR`;
    mockFetch
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(collectionInfo)
      } as Response)
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(reportResponse(ics))
      } as Response);

    await expect(provider.getEvents()).resolves.toEqual([]);
  });

  it('creates a VTODO with a conditional PUT', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 201,
      statusText: 'Created',
      headers: new Headers({ etag: '"created-etag"' })
    } as Response);
    const event = {
      type: 'single',
      title: 'Created in Full Calendar',
      date: '2026-08-20',
      endDate: null,
      allDay: true,
      completed: false
    } as OFCEvent;

    const [[created]] = await Promise.all([provider.createEvent(event)]);
    const request = mockFetch.mock.calls[0][1];
    expect(request?.method).toBe('PUT');
    expect((request?.headers as Record<string, string>)['If-None-Match']).toBe('*');
    expect(request?.body).toEqual(expect.stringContaining('BEGIN:VTODO'));
    expect(request?.body).toEqual(expect.stringContaining('DUE;VALUE=DATE:20260820'));
    expect(request?.body).not.toEqual(expect.stringContaining('BEGIN:VEVENT'));
    expect(created).toMatchObject({ completed: false, etag: 'created-etag' });
  });

  it('updates and completes the original VTODO while preserving Apple extensions', async () => {
    const original = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:remote-task
SUMMARY:Original
DUE;VALUE=DATE:20260820
STATUS:NEEDS-ACTION
X-APPLE-SOMETHING:preserve-me
END:VTODO
END:VCALENDAR`;
    mockFetch
      .mockResolvedValueOnce({ status: 200, text: () => Promise.resolve(original) } as Response)
      .mockResolvedValueOnce({
        status: 204,
        statusText: 'No Content',
        headers: new Headers({ etag: '"etag-2"' })
      } as Response);
    const oldEvent = {
      type: 'single',
      uid: 'remote-task',
      caldavHref: '/principal/calendars/tasks/task.ics',
      etag: 'etag-1',
      title: 'Original',
      date: '2026-08-20',
      endDate: null,
      allDay: true,
      completed: false
    } as OFCEvent;
    const newEvent = {
      ...oldEvent,
      title: 'Updated',
      date: '2026-08-21',
      completed: '2026-08-15T14:00:00Z'
    } as OFCEvent;

    await provider.updateEvent(provider.getEventHandle(oldEvent)!, oldEvent, newEvent);

    const put = mockFetch.mock.calls[1][1];
    expect(put?.method).toBe('PUT');
    expect((put?.headers as Record<string, string>)['If-Match']).toBe('"etag-1"');
    expect(put?.body).toEqual(expect.stringContaining('SUMMARY:Updated'));
    expect(put?.body).toEqual(expect.stringContaining('DUE;VALUE=DATE:20260821'));
    expect(put?.body).toEqual(expect.stringContaining('STATUS:COMPLETED'));
    expect(put?.body).toEqual(expect.stringContaining('PERCENT-COMPLETE:100'));
    expect(put?.body).toEqual(expect.stringContaining('COMPLETED:20260815T140000Z'));
    expect(put?.body).toEqual(expect.stringContaining('X-APPLE-SOMETHING:preserve-me'));
    expect(newEvent.etag).toBe('etag-2');
  });

  it('deletes the exact CalDAV resource href', async () => {
    mockFetch.mockResolvedValueOnce({ status: 204, statusText: 'No Content' } as Response);
    await provider.deleteEvent({ persistentId: '/principal/calendars/tasks/server-name.ics' });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://caldav.example.com/principal/calendars/tasks/server-name.ics',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('preserves the resource href when deleting an undated backlog task', async () => {
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:undated-task
SUMMARY:Call dentist
STATUS:NEEDS-ACTION
END:VTODO
END:VCALENDAR`;
    mockFetch
      .mockResolvedValueOnce({
        status: 207,
        text: () => Promise.resolve(collectionInfo)
      } as Response)
      .mockResolvedValueOnce({
        status: 207,
        text: () =>
          Promise.resolve(
            reportResponse(ics, '/principal/calendars/tasks/server-generated-name.ics')
          )
      } as Response)
      .mockResolvedValueOnce({ status: 204, statusText: 'No Content' } as Response);

    const [task] = await provider.getTaskBacklogItems();
    await provider.deleteTaskBacklogItem(task.id);

    expect(mockFetch.mock.calls[2][0]).toBe(
      'https://caldav.example.com/principal/calendars/tasks/server-generated-name.ics'
    );
    expect(mockFetch.mock.calls[2][1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
  });

  it('routes the calendar checkbox through provider-owned completion sync', async () => {
    const event = {
      type: 'single',
      uid: 'remote-task',
      caldavHref: '/principal/calendars/tasks/task.ics',
      title: 'Checkbox task',
      date: '2026-08-20',
      endDate: null,
      allDay: true,
      completed: false
    } as OFCEvent;
    type ProviderUpdatePayload = Parameters<
      ReturnType<typeof PluginState.getProviderRegistry>['processProviderUpdates']
    >[1];
    const processProviderUpdates = jest
      .fn<Promise<void>, [string, ProviderUpdatePayload]>()
      .mockResolvedValue(undefined);
    jest.spyOn(PluginState, 'getCache').mockReturnValue({
      store: {
        getEventDetails: () => ({
          id: 'session-id',
          event,
          calendarId: config.id,
          location: null
        })
      }
    } as unknown as ReturnType<typeof PluginState.getCache>);
    jest.spyOn(PluginState, 'getProviderRegistry').mockReturnValue({
      processProviderUpdates
    } as unknown as ReturnType<typeof PluginState.getProviderRegistry>);
    const updateEventSpy = jest.spyOn(provider, 'updateEvent').mockResolvedValue(null);

    await expect(provider.toggleComplete('session-id', true)).resolves.toBe(true);
    const [handle, previousEvent, completedEvent] = updateEventSpy.mock.calls[0];
    expect(handle.persistentId).toBe('/principal/calendars/tasks/task.ics');
    expect(previousEvent).toBe(event);
    expect(completedEvent.type).toBe('single');
    expect(completedEvent.type === 'single' && typeof completedEvent.completed).toBe('string');
    expect(processProviderUpdates.mock.calls[0][0]).toBe(config.id);
    expect(processProviderUpdates.mock.calls[0][1].updates).toHaveLength(1);
    expect(processProviderUpdates.mock.calls[0][1].updates[0].event).toBe(completedEvent);
  });
});
