# Local REST Server Specification

!!! abstract "Daemon Overview"
    The [`LocalServer`](../../../src/api/LocalServer.ts) class implements a lightweight, local-only HTTP REST server daemon inside Obsidian. It allows external applications (Python scripts, shell commands, cron jobs, browser tools) to control Full Calendar via standard HTTP requests authenticated with Bearer tokens.

---

## 1. Listener Lifecycle & Environment Safety

Source anchor: [`src/api/LocalServer.ts#L62`](../../../src/api/LocalServer.ts#L62)

```typescript
export class LocalServer {
  private server: ServerShape | null = null;
  public readonly port: number;
  private api: PublicAPI;
  // ...
}
```

### Dynamic Node.js Resolver
To avoid compilation and runtime failures on mobile platforms (Capacitor/WebView), `LocalServer` uses a dynamic require resolver:

```typescript
const getRequire = (): ((id: string) => unknown) => {
  if (typeof window !== 'undefined' && (window as any).require) {
    return (window as any).require;
  }
  return require;
};
```

### Network Binding & CORS Policy
* **Loopback IP**: The server binds strictly to `127.0.0.1` (`localhost`). It never binds to `0.0.0.0` or public interface IPs.
* **Default Port**: `8540` (configurable via `FullCalendarSettings.localServerPort`).
* **CORS Headers**: Attached to every response:
  * `Access-Control-Allow-Origin: *`
  * `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
  * `Access-Control-Allow-Headers: Content-Type, Authorization`
* **Preflight Requests**: `OPTIONS` requests return `204 No Content` immediately without token validation.

---

## 2. Authentication & Authorization Middleware

Every non-`OPTIONS` request must present a valid `Authorization` HTTP header:

```http
Authorization: Bearer ofc_pat_your_token_here
```

### Middleware Validation Flow
1. Extract header value. If missing or not starting with `Bearer `, return `401 Unauthorized`.
2. Extract token string and pass to [`PublicAPI.withToken(token)`](public-api.md#withtokentoken).
3. If `withToken()` returns `null` (invalid, expired, or revoked token), return `403 Forbidden`.
4. Route request to appropriate endpoint handler on the returned `AuthorizedAPI` instance.

---

## 3. Complete REST Endpoint Reference

| Method | Endpoint Path | Required Scope | Request Body / Query Params | Description & Response |
|---|---|---|---|---|
| `GET` | `/api/v1/events` | `events:read` | **Query**: `calendar`, `query`, `isTask`, `isCompleted`, `start`, `end` | Returns matching events array. (`200 OK`) |
| `POST` | `/api/v1/events` | `events:write` | **Body**: `{ calendarId, event, options? }` | Creates new event in target calendar. (`201 Created`) |
| `GET` | `/api/v1/events/:id` | `events:read` | Path param `:id` | Returns detailed event & vault file path. (`200 OK` / `404`) |
| `PUT` | `/api/v1/events/:id` | `events:write` | Path param `:id`, **Body**: `{ event, options? }` | Updates existing event data. (`200 OK` / `400`) |
| `DELETE` | `/api/v1/events/:id` | `events:write` | Path param `:id`, **Body**: `{ options? }` | Deletes or suppresses event. (`200 OK`) |
| `POST` | `/api/v1/ui/open-calendar` | `ui:open-calendar` | None | Focuses/opens main calendar tab leaf. (`200 OK`) |
| `POST` | `/api/v1/ui/open-sidebar` | `ui:open-sidebar` | None | Focuses/opens calendar right sidebar. (`200 OK`) |
| `POST` | `/api/v1/ui/change-view` | `ui:change-view` | **Body**: `{ viewName: string }` | Switches active view (e.g. `timeGridWeek`). (`200 OK`) |
| `GET` | `/api/v1/calendars` | `providers:read` | None | Returns list of configured calendar sources. (`200 OK`) |
| `POST` | `/api/v1/providers/revalidate` | `providers:write` | **Body**: `{ force?: boolean }` | Triggers background remote calendar reload. (`200 OK`) |
| `GET` | `/api/v1/settings` | `settings:read` | None | Reads current plugin configuration settings. (`200 OK`) |
| `PUT` | `/api/v1/settings` | `settings:write` | **Body**: `{ settings: Partial<FullCalendarSettings>, options? }` | Updates and persists plugin settings. (`200 OK`) |

---

## 4. Endpoint Deep Dives & Payload Schemas

### `GET /api/v1/events`
Query parameters:
* `calendar` (`string` or comma-separated): Filter by calendar IDs.
* `query` (`string`): Text search query against title and contents.
* `isTask` (`'true'` \| `'false'`): Filter task items.
* `isCompleted` (`'true'` \| `'false'`): Filter completed tasks.
* `start` (`ISO string` or `epoch ms`): Start range bound.
* `end` (`ISO string` or `epoch ms`): End range bound.

**Success Response (`200 OK`)**:
```json
{
  "success": true,
  "count": 1,
  "events": [
    {
      "id": "fullnote:Work/Project.md",
      "title": "Quarterly Review",
      "date": "2026-06-15",
      "endDate": "2026-06-15",
      "allDay": true,
      "calendarId": "work-calendar"
    }
  ]
}
```

---

### `POST /api/v1/events`
**Request Body (`application/json`)**:
```json
{
  "calendarId": "work-calendar",
  "event": {
    "title": "Sprint Planning",
    "date": "2026-06-16",
    "startTime": "09:00",
    "endTime": "10:30",
    "allDay": false
  },
  "options": {
    "silent": false
  }
}
```

**Success Response (`201 Created`)**:
```json
{
  "success": true,
  "result": true
}
```

---

### `GET /api/v1/events/:id`
Retrieves event details including vault file path and line location.

**Success Response (`200 OK`)**:
```json
{
  "success": true,
  "details": {
    "calendarId": "fullnote-calendar",
    "event": {
      "id": "fullnote:Meetings/Standup.md",
      "title": "Daily Standup",
      "date": "2026-06-16"
    },
    "location": {
      "file": { "path": "Meetings/Standup.md" },
      "lineNumber": 1
    }
  }
}
```

---

## 5. Error Response Schema & HTTP Status Codes

When an error occurs, `LocalServer` returns a consistent JSON payload:

```json
{
  "error": "Short Error Identifier",
  "message": "Detailed human-readable failure explanation."
}
```

### Standard Status Code Matrix

| Status Code | Meaning | Cause |
|---|---|---|
| `200 OK` | Request succeeded | Query or action executed cleanly. |
| `201 Created` | Resource created | `POST /api/v1/events` created event note. |
| `204 No Content` | Options preflight | Standard CORS preflight response. |
| `400 Bad Request` | Invalid payload | Missing required body fields (e.g. `calendarId`, `event`). |
| `401 Unauthorized` | Missing auth header | Request lacked `Authorization: Bearer <token>` header. |
| `403 Forbidden` | Invalid/expired token | Token was revoked, invalid, or lacks required scope. |
| `404 Not Found` | Route or ID missing | Event ID not found or endpoint path non-existent. |
| `500 Server Error` | Unexpected exception | Internal exception thrown during execution. |

---

[Back to API Index](index.md) · [Overview](overview.md) · [Public JS API](public-api.md) · [Scopes & Permissions](scopes-permissions.md)
