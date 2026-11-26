# Outbound Network Requests

This plugin is designed around privacy and local-first principles. All network communications are executed directly from your local Obsidian application to the respective remote endpoints. 


This page acts as a complete, audited registry of all network communications performed by the plugin. For details on how local data is handled, see the [Privacy Policy](../legal/privacy-policy.md) and the [Data Integrity Guide](data_integrity.md).

---

## Remote Calendar Integrations

> Webworker (deployed on Vercel) for OAuth handshake is used for Google / Outlook Calendar Authentication.

### Google Calendar & Google Tasks
- **Connection:** Inbound & Outbound (Internet)
- **Related Guides:** [Google Calendar Guide](../calendars/gcal.md) | [Google Tasks Guide](../calendars/gtasks.md) | [API & Security Settings](../settings/api.md)
- **Endpoints:**
    - `accounts.google.com` (OAuth authorization page)
    - `oauth2.googleapis.com` (Token generation & refresh)
    - `www.googleapis.com` (API queries for `/calendar/v3` and `/tasks/v1`)
- **Purpose:** Secure OAuth authentication, calendar/task listing, and event synchronization.
- **Trigger:** Background sync sweeps, startup refresh, or manual edits in calendar views.

### Microsoft Outlook Calendar
- **Connection:** Inbound & Outbound (Internet)
- **Related Guides:** [Outlook Calendar Guide](../calendars/outlook.md) | [API & Security Settings](../settings/api.md)
- **Endpoints:**
    - `login.microsoftonline.com` (OAuth login flow)
    - `graph.microsoft.com` (Microsoft Graph API v1.0 queries)
- **Purpose:** Authenticating accounts, fetching remote calendars, and uploading event modifications.
- **Trigger:** Scheduled sync sweeps, calendar view updates, or manual interactions.

### CalDAV Calendar and CalDAV Tasks
- **Connection:** Inbound & Outbound (Internet)
- **Related Guides:** [CalDAV Guide](../calendars/caldav.md) | [CalDAV Tasks](../calendars/caldav-tasks.md)
- **Endpoints:** User-specified custom CalDAV host (e.g. Nextcloud, Fastmail, Apple iCloud, Synology, Radicale).
- **Purpose:** Synchronizing calendar events and tasks (VTODO) using standard HTTP methods (`PROPFIND`, `REPORT`, `GET`, `PUT`, `DELETE`).
- **Trigger:** Periodic background sync cycles or manual refresh.

### ICS (iCalendar) External Feeds
- **Connection:** Inbound (Internet)
- **Related Guides:** [ICS Calendar Guide](../calendars/ics.md)
- **Endpoints:** User-specified remote feed URLs (using `webcal://`, `http://`, or `https://` schemes).
- **Purpose:** Fetching read-only remote iCal events via standard `GET` requests.
- **Trigger:** Automatically when loading or refreshing calendar views.


---

## Weather & Dynamic Utility Resources

### Weather Forecast Services
- **Connection:** Inbound (Internet)
- **Related Guides:** [Weather Forecasts](../features/weather.md)
- **Endpoints:**
    - `api.open-meteo.com` (Retrieving forecast metrics)
    - `geocoding-api.open-meteo.com` (Resolving city coordinate mapping)
- **Purpose:** Resolving configured city/region names to latitude/longitude coordinates and fetching daily/hourly forecasts.
- **Trigger:** Weather widget rendering in active views or settings updates.

### Dynamic Asset Downloads (CDN Scripts)
- **Connection:** Inbound (Internet)
- **Related Features:** [Internationalization](../features/i18n.md) | [FCR Command (NLP)](../features/nlp.md) | [ChronoAnalyser](../chrono_analyser/embedded_charts.md)
- **Endpoints:**
    - `cdn.jsdelivr.net` (for `date-holidays` script)
    - `cdn.plot.ly` (for `plotly.js` interactive charting)
    - `fcr-cdn.plugin-fcr.workers.dev` (for UI translations, NLP locale files and ChronoAnalyzer demo data)
- **Purpose:** Lazy-loading external scripts and payloads to keep the main plugin installation light.
- **Trigger:** English UI & NLP is already hardcoded, translation `.json` for other languages are downloaded when required. *Subsequently redownloaded on plugin updates*. 

!!! info "Local Script Caching"
    All scripts and assets downloaded from these CDNs are cached permanently inside your vault's plugin directory under assets/locales/nlp. Subsequent loads are served **100% offline**.


---

## Local Integration Companions

### ActivityWatch Sync
- **Connection:** Outbound (Localhost only)
- **Related Guides:** [ActivityWatch Integration](../calendars/activitywatch.md) | [Chrono Analyser Settings](../chrono_analyser/settings.md)
- **Endpoints:** User-configured local server port (default: `http://127.0.0.1:5600`).
- **Purpose:** Querying local bucket logs (`/api/0/buckets`) and active application/browser events to construct activity events.
- **Trigger:** User-initiated sync or automatic cycles (if configured).

### FCR Reminder Companion
- **Connection:** Outbound (Localhost only)
- **Related Guides:** [Reminders & Notifications](../features/reminders.md) | [Reminders Settings](../settings/reminders.md)
- **Endpoints:** User-configured local daemon API port (default: `http://127.0.0.1:45677`).
- **Purpose:** Probing daemon status (`/status`) and pushing notification payloads (`/sync`) to trigger desktop notifications.
- **Trigger:** Background timer pinging and sync cycles when reminders are enabled.
