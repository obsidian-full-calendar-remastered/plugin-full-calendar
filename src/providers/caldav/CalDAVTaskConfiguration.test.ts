/**
 * @jest-environment jsdom
 */
import { parseCalendarInfo } from '../../types/calendar_settings';
import { obsidianFetch } from './obsidian-fetch_caldav';
import { importCalendars } from './import_caldav';

jest.mock('./obsidian-fetch_caldav', () => ({ obsidianFetch: jest.fn() }));
jest.mock('../../features/i18n/i18n', () => ({ t: (key: string) => key }));

const mockFetch = obsidianFetch as jest.MockedFunction<typeof obsidianFetch>;

function collectionResponse(component: 'VTODO' | 'VEVENT'): string {
  return `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:ical="http://apple.com/ns/ical/">
  <d:response><d:propstat><d:prop>
    <d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
    <d:displayname>Reminders</d:displayname>
    <c:supported-calendar-component-set><c:comp name="${component}"/></c:supported-calendar-component-set>
    <ical:calendar-color>#123456FF</ical:calendar-color>
  </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
</d:multistatus>`;
}

describe('CalDAV Tasks configuration', () => {
  beforeEach(() => mockFetch.mockReset());

  it('imports a direct VTODO collection as a distinct source type', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 207,
      text: () => Promise.resolve(collectionResponse('VTODO'))
    } as Response);

    const [source] = await importCalendars(
      { type: 'basic', username: '', password: '' },
      'https://caldav.example.com/principal/calendars/tasks',
      [],
      'caldavtasks'
    );

    expect(source).toMatchObject({
      type: 'caldavtasks',
      id: 'caldavtasks_1',
      name: 'Reminders',
      homeUrl: 'https://caldav.example.com/principal/calendars/tasks/',
      color: '#123456',
      username: '',
      password: ''
    });
    expect(parseCalendarInfo(source)).toEqual(source);
  });

  it('rejects a collection that explicitly advertises VEVENT only', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 207,
      text: () => Promise.resolve(collectionResponse('VEVENT'))
    } as Response);

    await expect(
      importCalendars(
        { type: 'basic', username: '', password: '' },
        'https://caldav.example.com/principal/calendars/events/',
        [],
        'caldavtasks'
      )
    ).rejects.toThrow('noVtodoCapability');
  });
});
