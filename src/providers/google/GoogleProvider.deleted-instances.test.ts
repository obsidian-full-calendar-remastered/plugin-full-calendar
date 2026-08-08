import FullCalendarPlugin from '../../main';
import { PluginState } from '../../core/PluginState';
import { GoogleProvider } from './GoogleProvider';
import { makeAuthenticatedRequest } from './auth/request';

jest.mock('../../core/PluginState');
jest.mock('./auth/request');

describe('GoogleProvider deleted recurring instances', () => {
  it('requests cancelled instances from Google Calendar', async () => {
    const plugin = {
      app: {
        vault: {
          getAbstractFileByPath: jest.fn()
        },
        metadataCache: {
          getFileCache: jest.fn(),
          on: jest.fn(),
          offref: jest.fn()
        }
      }
    } as unknown as FullCalendarPlugin;
    const provider = new GoogleProvider(
      {
        id: 'google_1',
        name: 'Google Calendar',
        calendarId: 'primary'
      },
      plugin
    );

    jest.spyOn(provider['authManager'], 'getTokenForSource').mockResolvedValue('token');
    PluginState.getSettings = jest.fn().mockReturnValue({ displayTimezone: 'UTC' });
    const requestMock = jest.mocked(makeAuthenticatedRequest);
    requestMock.mockResolvedValue({ items: [] });

    await provider.getEvents({
      start: new Date('2026-08-01T00:00:00Z'),
      end: new Date('2026-09-01T00:00:00Z')
    });

    const requestUrl = requestMock.mock.calls[0]?.[1];
    expect(requestUrl).toBeDefined();
    expect(new URL(requestUrl || '').searchParams.get('showDeleted')).toBe('true');
  });
});
