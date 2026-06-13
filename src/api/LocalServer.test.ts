import { LocalServer } from './LocalServer';
import { PublicAPI, AuthorizedAPI } from './FullCalendarAPI';
import * as http from 'http';

// Mock AuthorizedAPI interface implementation
const mockAuthorizedApi: Partial<AuthorizedAPI> = {
  getEvents: jest.fn().mockReturnValue([{ id: '1', title: 'Test Event' }]),
  openCalendar: jest.fn().mockResolvedValue(undefined),
  createEvent: jest.fn().mockResolvedValue(true)
};

const mockPublicApi = {
  withToken: jest.fn()
} as unknown as PublicAPI;

interface MockResponse {
  error?: string;
  success?: boolean;
  message?: string;
  events?: Array<{ id: string; title: string }>;
}

describe('LocalServer Integration Tests', () => {
  let server: LocalServer;
  const port = 9876;

  beforeAll(async () => {
    server = new LocalServer(mockPublicApi, port);
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Helper utility to make HTTP requests against local listener
  const makeRequest = (
    path: string,
    options: { method?: string; headers?: Record<string, string>; body?: string } = {}
  ): Promise<{ status: number; headers: Record<string, string>; body: string }> => {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method: options.method || 'GET',
          headers: options.headers
        },
        res => {
          let body = '';
          res.on('data', chunk => {
            body += chunk;
          });
          res.on('end', () => {
            resolve({
              status: res.statusCode || 0,
              headers: res.headers as Record<string, string>,
              body
            });
          });
        }
      );
      req.on('error', reject);
      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  };

  it('should return 401 when Authorization header is missing', async () => {
    const res = await makeRequest('/api/v1/events');
    expect(res.status).toBe(401);
    const data = JSON.parse(res.body) as unknown as MockResponse;
    expect(data.error).toBe('Unauthorized');
    expect(data.message).toContain('Missing or invalid Authorization header');
  });

  it('should return 403 when token is invalid', async () => {
    (mockPublicApi.withToken as jest.Mock).mockReturnValue(null);
    const res = await makeRequest('/api/v1/events', {
      headers: { Authorization: 'Bearer invalid_token' }
    });
    expect(res.status).toBe(403);
    const data = JSON.parse(res.body) as unknown as MockResponse;
    expect(data.error).toBe('Forbidden');
  });

  it('should return list of events with query criteria when token is valid', async () => {
    (mockPublicApi.withToken as jest.Mock).mockReturnValue(mockAuthorizedApi);
    const res = await makeRequest('/api/v1/events?calendar=1&query=meeting', {
      headers: { Authorization: 'Bearer valid_token' }
    });
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body) as unknown as MockResponse;
    expect(data.success).toBe(true);
    expect(data.events).toEqual([{ id: '1', title: 'Test Event' }]);
    expect(mockAuthorizedApi.getEvents).toHaveBeenCalledWith({
      calendarIds: ['1'],
      textSearch: { query: 'meeting', mode: 'default' }
    });
  });

  it('should invoke createEvent when POSTing to /api/v1/events', async () => {
    (mockPublicApi.withToken as jest.Mock).mockReturnValue(mockAuthorizedApi);
    const event = { title: 'New Event' };
    const res = await makeRequest('/api/v1/events', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid_token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        calendarId: 'cal_1',
        event
      })
    });
    expect(res.status).toBe(201);
    const data = JSON.parse(res.body) as unknown as MockResponse;
    expect(data.success).toBe(true);
    expect(mockAuthorizedApi.createEvent).toHaveBeenCalledWith('cal_1', event, undefined);
  });

  it('should support CORS preflight options request', async () => {
    const res = await makeRequest('/api/v1/events', {
      method: 'OPTIONS'
    });
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toContain(
      'GET, POST, PUT, DELETE, OPTIONS'
    );
  });
});
