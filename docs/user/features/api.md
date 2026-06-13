# Developer API & Local REST Server

Full Calendar Remastered provides a permission-gated developer API and local REST server, allowing you to control and query your calendar data programmatically from other Obsidian plugins, in-vault user scripts (DataviewJS, Templater), or external command-line tools (CLI, shell scripts, Python, cron tasks).

!!! tip "Security Philosophy"
    You own your data. The API is **disabled by default**, runs strictly on your local machine (`127.0.0.1`), and requires explicit authorization via scoped tokens.

---

## 1. Setup & Configuration

To set up programmatic access:

1. Open **Settings** → **API & Security** (under Integrations).
2. Toggle **Enable REST Server** to start the local HTTP listener.
3. Configure the **REST Server Port** (default: `8540`) if needed.
4. Under **Personal Access Tokens (PATs)**, click **Generate Token**.
5. Give your token a name (e.g. `PythonCLI` or `DataviewDashboard`) and select the required [Permission Scopes](#permission-scopes).
6. Copy the generated `ofc_pat_...` secret token. **It will only be shown once!**

!!! warning "Keep Your Tokens Secret"
    Treat Personal Access Tokens like passwords. Anyone with access to your token can read or edit your calendar data.
    Note that this may not be security scoped and sandboxe at the moment, but this is aa beta attempt to sandbox the plugin cache from other Obsidian plugins (OBSIDIAN does not natively provide such sandboxing options for plugins).

---

## 2. Integration Code Recipes

Use the tabs below to copy code recipes for your scripting environment:

=== "Bash / CLI (curl)"

    Ensure your requests include the `Authorization: Bearer <token>` header.
    
    ```bash
    # 1. Fetch all events scheduled for June 15th, 2026
    curl -H "Authorization: Bearer ofc_pat_your_token" \
      "http://localhost:8540/api/v1/events?start=2026-06-15T00:00:00Z&end=2026-06-15T23:59:59Z"

    # 2. Programmatically create an all-day event
    curl -X POST \
      -H "Authorization: Bearer ofc_pat_your_token" \
      -H "Content-Type: application/json" \
      -d '{
        "calendarId": "work-calendar-id",
        "event": {
          "title": "System Migration",
          "date": "2026-06-18",
          "endDate": "2026-06-18",
          "allDay": true
        }
      }' \
      "http://localhost:8540/api/v1/events"

    # 3. Focus/open the calendar UI tab in Obsidian
    curl -X POST \
      -H "Authorization: Bearer ofc_pat_your_token" \
      "http://localhost:8540/api/v1/ui/open-calendar"
    ```

=== "Python"

    ```python
    import requests

    TOKEN = "ofc_pat_your_token"
    BASE_URL = "http://localhost:8540/api/v1"
    headers = {"Authorization": f"Bearer {TOKEN}"}

    # Query today's incomplete tasks
    params = {"isTask": "true", "isCompleted": "false"}
    response = requests.get(f"{BASE_URL}/events", headers=headers, params=params)

    if response.status_code == 200:
        events = response.json().get("events", [])
        print(f"You have {len(events)} incomplete tasks for today:")
        for e in events:
            print(f"- {e['title']} ({e.get('calendarName')})")
    ```

=== "DataviewJS (Obsidian)"

    You can run JS snippets directly inside your notes to query calendar events dynamically.

    ```javascript
    const pat = "ofc_pat_your_token";
    const api = app.plugins.plugins['full-calendar']?.api?.withToken(pat);

    if (api) {
        // Query completed events from the last 7 days
        const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const events = api.getEvents({
            isCompleted: true,
            dateRange: { startMillis: oneWeekAgo }
        });

        dv.header(3, "Recent Completions");
        dv.table(["Event", "Completed Date"], events.map(e => [
            `[[${e.filePath}|${e.title}]]`, 
            e.date
        ]));
    } else {
        dv.paragraph("⚠️ Full Calendar API unauthorized or offline.");
    }
    ```

=== "Templater (Obsidian)"

    Automatically insert today's calendar events into your Daily Note template.

    ```javascript
    <%*
    const pat = "ofc_pat_your_token";
    const api = app.plugins.plugins['full-calendar']?.api?.withToken(pat);
    if (api) {
        const today = new Date().toISOString().split('T')[0];
        const events = api.getEvents({
            dateRange: {
                startMillis: new Date(today + "T00:00:00").getTime(),
                endMillis: new Date(today + "T23:59:59").getTime()
            }
        });
        tR += events.map(e => `- [ ] ${e.title} (at ${e.startMillis ? new Date(e.startMillis).toLocaleTimeString() : 'All Day'})`).join('\n');
    }
    -%>
    ```

---

## 3. API Endpoint Reference

| Route | Method | Required Scope | Description |
|---|---|---|---|
| `/api/v1/events` | `GET` | `events:read` | Queries cached events. Filters: `start`, `end`, `calendar`, `query`, `isTask`, `isCompleted`. |
| `/api/v1/events` | `POST` | `events:write` | Creates a new event in the specified `calendarId`. |
| `/api/v1/events/:id` | `GET` | `events:read` | Fetches a specific event details including vault file path. |
| `/api/v1/events/:id` | `PUT` | `events:write` | Modifies an existing event's details. |
| `/api/v1/events/:id` | `DELETE` | `events:write` | Deletes an event from its source calendar. |
| `/api/v1/calendars` | `GET` | `providers:read` | Returns a list of all configured calendar sources. |
| `/api/v1/providers/revalidate` | `POST` | `providers:write` | Force refreshes and revalidates remote sync calendars. |
| `/api/v1/ui/open-calendar` | `POST` | `ui:open-calendar` | Focuses or opens the main calendar tab. |
| `/api/v1/ui/open-sidebar` | `POST` | `ui:open-sidebar` | Focuses or opens the calendar right sidebar. |
| `/api/v1/ui/change-view` | `POST` | `ui:change-view` | Switches active calendar view (e.g. `timeGridWeek`). |
| `/api/v1/settings` | `GET` | `settings:read` | Reads the current plugin configuration. |
| `/api/v1/settings` | `PUT` | `settings:write` | Updates and persists plugin configurations. |

---

## 4. Permission Scopes

Granular permission scopes govern token access to internal features:

*   **`events:read`**: Allows searching/viewing events, viewing source notes, and reading metadata.
*   **`events:write`**: Allows creating, updating, moving, completing, or deleting events.
*   **`ui:open-calendar` / `ui:open-sidebar` / `ui:change-view`**: Access to focus and change the Obsidian workspace calendar views.
*   **`providers:read` / `providers:write`**: Access to list calendar sources, check capabilities, and trigger manual remote synchronization.
*   **`settings:read` / `settings:write`**: Access to read and modify all plugin configuration settings.
*   **`system:full-access`**: Raw developer access bypasses. Recommended only for secure local scripting.

---

[Security Settings](api.md) · [NLP Orchestrator](nlp.md) · [Back to Index](../index.md)
