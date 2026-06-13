import type { EventFilterCriteria } from '../core/EventFilterSortEngine';
import type { OFCEvent } from '../types';
import type { FullCalendarSettings } from '../types/settings';
import { PublicAPI } from './FullCalendarAPI';

declare const require: (id: string) => unknown;

// Dynamic resolver to satisfy eslint import rules and prevent runtime failures on mobile
const getRequire = (): ((id: string) => unknown) => {
  if (
    typeof window !== 'undefined' &&
    (window as unknown as { require: (id: string) => unknown }).require
  ) {
    return (window as unknown as { require: (id: string) => unknown }).require;
  }
  return require;
};

const reqFn = getRequire();

interface RequestShape {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  on(event: 'data', cb: (chunk: string) => void): this;
  on(event: 'end', cb: () => void): this;
  on(event: 'error', cb: (err: Error) => void): this;
}

interface ResponseShape {
  writeHead(status: number, headers?: Record<string, string>): void;
  end(data?: string): void;
  setHeader(name: string, value: string): void;
}

interface ServerShape {
  listen(port: number, host: string, cb: () => void): void;
  close(cb: (err?: Error) => void): void;
  on(event: 'error', cb: (err: Error) => void): this;
}

interface HttpModuleShape {
  createServer(cb: (req: RequestShape, res: ResponseShape) => void): ServerShape;
}

interface UrlShape {
  pathname: string | null;
  query: Record<string, string | string[] | undefined>;
}

interface UrlModuleShape {
  parse(urlStr: string, parseQueryString: boolean): UrlShape;
}

const httpModule = reqFn('http') as HttpModuleShape | null;
const urlModule = reqFn('url') as UrlModuleShape;

/**
 * A local REST HTTP server running inside the Obsidian environment.
 * Allows programmatic access to Full Calendar API scopes.
 */
export class LocalServer {
  private server: ServerShape | null = null;
  public readonly port: number;
  private api: PublicAPI;

  constructor(api: PublicAPI, port: number) {
    this.api = api;
    this.port = port;
  }

  /**
   * Starts the local server listener.
   */
  public async start(): Promise<void> {
    if (this.server) {
      await this.stop();
    }

    return new Promise<void>((resolve, reject) => {
      if (!httpModule) {
        reject(new Error('Node.js http module is not available in this environment.'));
        return;
      }

      this.server = httpModule.createServer((req: RequestShape, res: ResponseShape) => {
        void this.handleRequest(req, res);
      });

      this.server.on('error', (err: Error) => {
        reject(err);
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        resolve();
      });
    });
  }

  /**
   * Stops the local server listener and releases the port.
   */
  public stop(): Promise<void> {
    return new Promise<void>(resolve => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(err => {
        if (err) {
          // Silent fallback on close error to comply with Obsidian plugin guidelines
        }
        this.server = null;
        resolve();
      });
    });
  }

  /**
   * Main request router.
   */
  private async handleRequest(req: RequestShape, res: ResponseShape): Promise<void> {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const parsed = urlModule.parse(req.url || '', true);
      const pathname = parsed.pathname || '';

      // Token Authentication
      const authHeaderVal = req.headers['authorization'];
      const authHeader = Array.isArray(authHeaderVal) ? authHeaderVal[0] : authHeaderVal;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        this.sendJson(res, 401, {
          error: 'Unauthorized',
          message: 'Missing or invalid Authorization header. Must be Bearer token.'
        });
        return;
      }

      const token = authHeader.substring(7).trim();
      const authorizedApi = this.api.withToken(token);
      if (!authorizedApi) {
        this.sendJson(res, 403, {
          error: 'Forbidden',
          message: 'Invalid or expired API token.'
        });
        return;
      }

      // --- ENDPOINTS ---

      // 1. GET /api/v1/events - Query events
      if (pathname === '/api/v1/events') {
        if (req.method === 'GET') {
          const queryParams = parsed.query || {};
          const criteria: EventFilterCriteria = {};

          if (queryParams.calendar) {
            criteria.calendarIds = Array.isArray(queryParams.calendar)
              ? queryParams.calendar
              : String(queryParams.calendar).split(',');
          }

          if (queryParams.query) {
            criteria.textSearch = {
              query: Array.isArray(queryParams.query)
                ? queryParams.query[0]
                : String(queryParams.query),
              mode: 'default'
            };
          }

          if (queryParams.isTask !== undefined) {
            criteria.isTask = queryParams.isTask === 'true';
          }

          if (queryParams.isCompleted !== undefined) {
            criteria.isCompleted = queryParams.isCompleted === 'true';
          }

          let startMillis: number | undefined;
          let endMillis: number | undefined;

          if (queryParams.start) {
            const startVal = Array.isArray(queryParams.start)
              ? queryParams.start[0]
              : queryParams.start;
            startMillis = isNaN(Number(startVal))
              ? new Date(String(startVal)).getTime()
              : Number(startVal);
          }
          if (queryParams.end) {
            const endVal = Array.isArray(queryParams.end) ? queryParams.end[0] : queryParams.end;
            endMillis = isNaN(Number(endVal)) ? new Date(String(endVal)).getTime() : Number(endVal);
          }

          if (startMillis !== undefined || endMillis !== undefined) {
            criteria.dateRange = {
              ...(startMillis !== undefined ? { startMillis } : {}),
              ...(endMillis !== undefined ? { endMillis } : {})
            };
          }

          const events = authorizedApi.getEvents(criteria);
          this.sendJson(res, 200, { success: true, count: events.length, events });
          return;
        }

        // 2. POST /api/v1/events - Create new event
        if (req.method === 'POST') {
          const body = await this.readRequestBody(req);
          const calendarId = body.calendarId as string;
          const event = body.event as OFCEvent;
          const options = body.options as { silent?: boolean } | undefined;
          if (!calendarId || !event) {
            this.sendJson(res, 400, {
              error: 'Bad Request',
              message: 'Fields calendarId and event are required.'
            });
            return;
          }
          const result = await authorizedApi.createEvent(calendarId, event, options);
          this.sendJson(res, 201, { success: true, result });
          return;
        }
      }

      // 3. Match /api/v1/events/:id - Get, Update, or Delete specific event
      const eventIdMatch = pathname.match(/^\/api\/v1\/events\/([^/]+)$/);
      if (eventIdMatch) {
        const eventId = decodeURIComponent(eventIdMatch[1]);

        if (req.method === 'GET') {
          const details = authorizedApi.getEventDetails(eventId);
          if (!details) {
            this.sendJson(res, 404, {
              error: 'Not Found',
              message: `Event not found with ID: ${eventId}`
            });
            return;
          }
          this.sendJson(res, 200, { success: true, details });
          return;
        }

        if (req.method === 'PUT') {
          const body = await this.readRequestBody(req);
          const event = body.event as OFCEvent;
          const options = body.options as { silent?: boolean } | undefined;
          if (!event) {
            this.sendJson(res, 400, {
              error: 'Bad Request',
              message: 'Field event is required.'
            });
            return;
          }
          const result = await authorizedApi.updateEvent(eventId, event, options);
          this.sendJson(res, 200, { success: true, result });
          return;
        }

        if (req.method === 'DELETE') {
          const body = (await this.readRequestBody(req).catch(() => ({}))) as Record<
            string,
            unknown
          >;
          const options = body.options as
            | { silent?: boolean; instanceDate?: string; force?: boolean }
            | undefined;
          await authorizedApi.deleteEvent(eventId, options);
          this.sendJson(res, 200, { success: true });
          return;
        }
      }

      // 4. POST /api/v1/ui/open-calendar - Open main calendar tab
      if (pathname === '/api/v1/ui/open-calendar' && req.method === 'POST') {
        await authorizedApi.openCalendar();
        this.sendJson(res, 200, { success: true });
        return;
      }

      // 5. POST /api/v1/ui/open-sidebar - Focus/open calendar sidebar
      if (pathname === '/api/v1/ui/open-sidebar' && req.method === 'POST') {
        await authorizedApi.openSidebar();
        this.sendJson(res, 200, { success: true });
        return;
      }

      // 6. POST /api/v1/ui/change-view - Change current view
      if (pathname === '/api/v1/ui/change-view' && req.method === 'POST') {
        const body = await this.readRequestBody(req);
        const viewName = body.viewName as string;
        if (!viewName) {
          this.sendJson(res, 400, {
            error: 'Bad Request',
            message: 'Field viewName is required.'
          });
          return;
        }
        await authorizedApi.changeView(viewName);
        this.sendJson(res, 200, { success: true });
        return;
      }

      // 7. GET /api/v1/calendars - List all calendars
      if (pathname === '/api/v1/calendars' && req.method === 'GET') {
        const calendars = authorizedApi.getCalendarSources();
        this.sendJson(res, 200, { success: true, calendars });
        return;
      }

      // 8. POST /api/v1/providers/revalidate - Trigger reload of provider calendars
      if (pathname === '/api/v1/providers/revalidate' && req.method === 'POST') {
        const body = (await this.readRequestBody(req).catch(() => ({}))) as Record<string, unknown>;
        const force = body.force as boolean | undefined;
        authorizedApi.revalidateRemoteCalendars(!!force);
        this.sendJson(res, 200, { success: true });
        return;
      }

      // 9. GET & PUT /api/v1/settings - Read and write plugin settings
      if (pathname === '/api/v1/settings') {
        if (req.method === 'GET') {
          const settings = authorizedApi.getSettings();
          this.sendJson(res, 200, { success: true, settings });
          return;
        }

        if (req.method === 'PUT') {
          const body = await this.readRequestBody(req);
          const settingsObj = body.settings as Partial<FullCalendarSettings>;
          const options = body.options as { save?: boolean } | undefined;
          if (!settingsObj) {
            this.sendJson(res, 400, {
              error: 'Bad Request',
              message: 'Field settings is required.'
            });
            return;
          }
          await authorizedApi.updateSettings(settingsObj, options);
          this.sendJson(res, 200, { success: true });
          return;
        }
      }

      // 404 Route Fallback
      this.sendJson(res, 404, {
        error: 'Not Found',
        message: `No handler found for ${req.method} ${pathname}`
      });
    } catch (err: unknown) {
      const errorObj = err as Error;
      this.sendJson(res, 500, {
        error: 'Internal Server Error',
        message: errorObj.message || String(err)
      });
    }
  }

  /**
   * Helper to write JSON responses consistently.
   */
  private sendJson(res: ResponseShape, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  }

  /**
   * Helper to parse and read request stream body.
   */
  private readRequestBody(req: RequestShape): Promise<Record<string, unknown>> {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      let body = '';
      req.on('data', (chunk: string) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          resolve(body ? (JSON.parse(body) as Record<string, unknown>) : {});
        } catch {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', (err: Error) => {
        reject(err);
      });
    });
  }
}
