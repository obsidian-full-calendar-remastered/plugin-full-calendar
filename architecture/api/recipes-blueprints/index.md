# Integration Recipes & Blueprints

!!! abstract "Audience & Purpose"
    This page contains production-ready integration blueprints for third-party Obsidian plugin authors, in-vault script creators (DataviewJS, Templater), and external automation developers (Python, Bash, Node.js).

---

## 1. Third-Party Obsidian Plugins

Plugins interact with Full Calendar programmatically by requesting access and receiving a scoped [`AuthorizedAPI`](public-api.md#3-authorizedapi-interface-specification) handle.

```typescript
// main.ts inside your Obsidian Plugin
import { Plugin } from 'obsidian';

export default class MyIntegrationPlugin extends Plugin {
  private fcApiToken: string | null = null;

  async onload() {
    this.addCommand({
      id: 'fetch-today-events',
      name: 'Fetch Today\'s Calendar Events',
      callback: () => this.fetchEvents()
    });
  }

  async getAuthorizedApi() {
    // 1. Resolve Full Calendar API entry point
    const fcPlugin = this.app.plugins.plugins['full-calendar'] as any;
    const publicApi = fcPlugin?.api;
    if (!publicApi) {
      console.warn('Full Calendar plugin is not installed or enabled.');
      return null;
    }

    // 2. Obtain token (prompt modal on first run if token not saved)
    if (!this.fcApiToken) {
      this.fcApiToken = await publicApi.requestAccess(
        'my-integration-plugin',
        'Displays today\'s schedule in custom dashboard.',
        ['events:read', 'ui:open-calendar']
      );
    }

    if (!this.fcApiToken) {
      console.warn('User denied API access.');
      return null;
    }

    // 3. Return AuthorizedAPI handle
    const api = publicApi.withToken(this.fcApiToken);
    if (!api) {
      // Token was revoked; clear saved token
      this.fcApiToken = null;
    }
    return api;
  }

  async fetchEvents() {
    const api = await this.getAuthorizedApi();
    if (!api) return;

    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    
    const endToday = new Date();
    endToday.setHours(23, 59, 59, 999);

    const events = api.getEvents({
      dateRange: {
        startMillis: startToday.getTime(),
        endMillis: endToday.getTime()
      }
    });

    console.log(`Found ${events.length} events for today:`, events);
  }
}
```

---

## 2. DataviewJS Inline Queries & Dashboards

In-vault scripts use a [Personal Access Token (PAT)](scopes-permissions.md#personal-access-tokens-pats) generated in **Full Calendar Settings → API & Security**.

=== "Today's Task Summary"

    ```javascript
    const PAT = "ofc_pat_your_token_here";
    const fcPlugin = app.plugins.plugins['full-calendar'];
    const api = fcPlugin?.api?.withToken(PAT);

    if (api) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const tasks = api.getEvents({
        isTask: true,
        isCompleted: false,
        dateRange: { startMillis: todayStart.getTime() }
      });

      dv.header(3, `📋 Pending Tasks (${tasks.length})`);
      dv.table(
        ["Title", "Calendar", "Date"],
        tasks.map(t => [t.title, t.calendarName || "Default", t.date])
      );
    } else {
      dv.paragraph("⚠️ Full Calendar API unauthorized or unavailable.");
    }
    ```

=== "Recent Completed Events"

    ```javascript
    const PAT = "ofc_pat_your_token_here";
    const api = app.plugins.plugins['full-calendar']?.api?.withToken(PAT);

    if (api) {
      const pastWeek = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const events = api.getEvents({
        isCompleted: true,
        dateRange: { startMillis: pastWeek }
      });

      dv.header(3, "✅ Completed in Last 7 Days");
      dv.table(
        ["Event", "Completed Date"],
        events.map(e => [e.title, e.date])
      );
    }
    ```

---

## 3. Templater Daily Note Automation

Automatically insert scheduled events into your Daily Note template upon note creation.

```javascript
<%*
const PAT = "ofc_pat_your_token_here";
const api = app.plugins.plugins['full-calendar']?.api?.withToken(PAT);

if (api) {
    const todayStr = tp.file.title; // e.g. "2026-06-16"
    const startMillis = new Date(todayStr + "T00:00:00").getTime();
    const endMillis = new Date(todayStr + "T23:59:59").getTime();

    const events = api.getEvents({
        dateRange: { startMillis, endMillis }
    });

    if (events.length > 0) {
        tR += "### Today's Schedule\n";
        events.forEach(e => {
            const timeStr = e.allDay ? "All Day" : `${e.startTime || ''} - ${e.endTime || ''}`;
            tR += `- [ ] **${e.title}** (${timeStr})\n`;
        });
    } else {
        tR += "*No events scheduled for today.*\n";
    }
}
-%>
```

---

## 4. Python CLI & Background Automation

External scripts call the [`LocalServer`](rest-server.md) REST API over HTTP.

```python
import requests
import sys

BASE_URL = "http://localhost:8540/api/v1"
TOKEN = "ofc_pat_your_token_here"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

def create_quick_event(title: str, date: str, calendar_id: str):
    url = f"{BASE_URL}/events"
    payload = {
        "calendarId": calendar_id,
        "event": {
            "title": title,
            "date": date,
            "allDay": True
        }
    }
    response = requests.post(url, json=payload, headers=HEADERS)
    if response.status_code == 201:
        print(f"Successfully created event '{title}' for {date}.")
    else:
        print(f"Failed ({response.status_code}): {response.text}", file=sys.stderr)

def list_upcoming_tasks():
    url = f"{BASE_URL}/events"
    params = {"isTask": "true", "isCompleted": "false"}
    response = requests.get(url, headers=HEADERS, params=params)
    if response.status_code == 200:
        data = response.json()
        print(f"Pending Tasks ({data['count']}):")
        for event in data["events"]:
            print(f"- [{event.get('date')}] {event['title']}")
    else:
        print(f"Error ({response.status_code}): {response.text}")

if __name__ == "__main__":
    list_upcoming_tasks()
    # create_quick_event("System Audit", "2026-06-20", "work-calendar")
```

---

## 5. Shell & Automated cURL Commands

=== "Query Events for Date Range"

    ```bash
    curl -s -H "Authorization: Bearer ofc_pat_your_token" \
      "http://localhost:8540/api/v1/events?start=2026-06-15T00:00:00Z&end=2026-06-15T23:59:59Z" | jq .
    ```

=== "Create Event"

    ```bash
    curl -s -X POST \
      -H "Authorization: Bearer ofc_pat_your_token" \
      -H "Content-Type: application/json" \
      -d '{
        "calendarId": "personal-calendar",
        "event": {
          "title": "Dentist Appointment",
          "date": "2026-06-18",
          "startTime": "14:00",
          "endTime": "15:00",
          "allDay": false
        }
      }' \
      "http://localhost:8540/api/v1/events"
    ```

=== "Open Calendar UI Tab"

    ```bash
    curl -s -X POST \
      -H "Authorization: Bearer ofc_pat_your_token" \
      "http://localhost:8540/api/v1/ui/open-calendar"
    ```

---

## Error Resilience & Defensive Patterns

1. **Plugin Detection**: Always verify that `app.plugins.plugins['full-calendar']` is defined before calling `.api`.
2. **Token Revocation Checking**: Always check if `withToken(token)` returns `null` (handling cases where the user revoked the token in settings).
3. **Scope Assertions**: Wrap API calls in `try...catch` blocks to catch scope mismatch exceptions cleanly.
4. **REST Offline Handling**: When making HTTP calls to `http://localhost:8540`, handle connection refused errors gracefully (Obsidian closed or REST server toggled off).

---

[Back to API Index](index.md) · [Overview](overview.md) · [Public JS API](public-api.md) · [REST Server](rest-server.md)
