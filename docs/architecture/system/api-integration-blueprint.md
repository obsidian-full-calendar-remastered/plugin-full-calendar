# API Integration Blueprint

!!! abstract "Audience"
    Use this page when writing a third-party Obsidian plugin, inside-vault scripts (DataviewJS, Templater), or external automation CLI tools/scripts that need to interact with Full Calendar.

## Integration Strategies

Choose the integration path matching your environment:

1. **Third-Party Plugins**: Use the Obsidian plugin registry to exchange tokens dynamically.
2. **In-Obsidian User Scripts (DataviewJS/Templater)**: Generate a [Personal Access Token (PAT)](api-architecture.md#personal-access-tokens-pats) and call the plugin API directly.
3. **CLI / External Automation (Bash, Python, Cron)**: Enable the [Local REST Server](api-architecture.md#local-rest-server) and authenticate requests via HTTP `Bearer` tokens.

---

## 1. Third-Party Obsidian Plugins

Plugins should request scopes programmatically to trigger a user-facing authorization modal:

```ts
// 1. Resolve PublicAPI from registry
const fcPlugin = app.plugins?.plugins?.['full-calendar'] as { api?: any } | undefined;
const publicApi = fcPlugin?.api;
if (!publicApi) return; // Full Calendar not loaded

// 2. Request Access (shows authorization modal on first run)
let token = await publicApi.requestAccess(
  'my-custom-plugin',
  'Retrieve events to display inside project dashboards.',
  ['events:read', 'ui:open-calendar']
);
if (!token) return; // User denied access

// 3. Obtain AuthorizedAPI reference (keep this in memory/settings)
const api = publicApi.withToken(token);
if (!api) return;

// 4. Invoke methods
const events = api.getEvents({ isTask: true });
console.log(`Found ${events.length} pending tasks.`);
```

---

## 2. In-Obsidian User Scripts (DataviewJS / Templater)

Avoid modals by generating a [Personal Access Token (PAT)](api-architecture.md#personal-access-tokens-pats) in **Settings > API Access > Personal Access Tokens > Generate Token**.

```javascript
// DataviewJS Example
const pat = "ofc_pat_your_generated_uuid_here";
const fcApi = app.plugins?.plugins?.['full-calendar']?.api?.withToken(pat);

if (fcApi) {
  // Query all completed tasks in a calendar
  const doneTasks = fcApi.getEvents({
    calendarIds: ['my-personal-calendar'],
    isTask: true,
    isCompleted: true
  });
  
  dv.table(["Task Title", "Calendar"], doneTasks.map(t => [t.title, t.calendarName]));
} else {
  dv.span("Full Calendar API access unauthorized.");
}
```

---

## 3. CLI / External Integration (REST API)

Enable the local server in Settings and configure the listening port (default `8540`). Scripts can then interact with Full Calendar via localhost requests.

### Authentication Header
Every REST request must include:
`Authorization: Bearer <Your-Personal-Access-Token>`

### Querying Events (`GET`)
Retrieves filtered event list.

```bash
# Query tasks scheduled for today
curl -X GET \
  -H "Authorization: Bearer ofc_pat_your_generated_uuid" \
  "http://localhost:8540/api/v1/events?isTask=true&start=2026-06-13&end=2026-06-14"
```

### Creating Events (`POST`)
Creates an event in a specified calendar.

```bash
curl -X POST \
  -H "Authorization: Bearer ofc_pat_your_generated_uuid" \
  -H "Content-Type: application/json" \
  -d '{
    "calendarId": "local-ics-source-id",
    "event": {
      "title": "Automated Sync Meeting",
      "date": "2026-06-15",
      "endDate": "2026-06-15",
      "allDay": true
    }
  }' \
  "http://localhost:8540/api/v1/events"
```

### Focusing the UI (`POST`)
Toggles Obsidian panels programmatically.

```bash
# Force Obsidian window to open or focus the main calendar view
curl -X POST \
  -H "Authorization: Bearer ofc_pat_your_generated_uuid" \
  "http://localhost:8540/api/v1/ui/open-calendar"
```

## Best Practices

* **Scope Minimization**: Only grant the exact permission scope needed (e.g., `events:read`).
* **Handling Nulls**: Always handle cases where `withToken` or local server requests return `401`/`403`/`null` (due to user revoking the token).
* **Security Warning**: Treat PATs as secrets. Do not publish scripts containing hardcoded PATs to public vaults or GitHub repositories.
