# Privacy Policy

_Last updated: June 2, 2026_

**Full Calendar (Remastered) Plugin** is a privacy-first plugin for Obsidian that allows you to synchronize your calendar data and manage it within Obsidian. 

All calendar data is processed locally. No personal data, calendar events, or credentials are sent to or stored on our servers (except for standard OAuth token exchanges where required for authentication).

---

## Outbound Network Requests

To support synchronization with external calendar providers (Google, Microsoft, CalDAV, ICS), load dynamic UI/date assets (Plotly, date-holidays), fetch weather forecasts, or interface with local companions, the plugin makes outbound network connections.

For a detailed and complete listing of all outbound endpoints, triggers, and purposes, please refer to the **[Outbound Network Requests](../reference/network_requests.md)** documentation page.

---

## Information We Access

With your permission, the plugin accesses the following data from your configured calendar sources:

- Your calendar lists (metadata about your calendars)
- Calendar events (including event titles, descriptions, start/end times, and attendees)

We do **not** access any other account data or local vault files beyond what is required to display and manage your calendar events in Obsidian.

## How Data Is Used

The accessed calendar data is used **solely for displaying and managing events** within Obsidian. The plugin caches calendar data during the session and it is discarded when the session ends. **No Data** is stored in any remote servers. All data is fetched in real-time or synced directly between Obsidian and your providers.

## Data Protection and Security

- Calendar data is transmitted **directly between Obsidian and Google/Microsoft/CalDAV/ICS servers** using secure HTTPS connections (or localhost for local companions).
- No calendar data is stored on our intermediary server.
- During the OAuth authentication process, our intermediary server **temporarily receives an authorization code**, which is used only to complete the authentication flow and is **immediately discarded** after use.
- We do **not store**, share, or process any user data beyond what is necessary to facilitate authentication and access to your calendars.

## OAuth Scopes

For Google integrations, the plugin requests the following OAuth scopes:

- `https://www.googleapis.com/auth/calendar.events` — View and edit events on all your calendars (core functionality of the plugin).
- `https://www.googleapis.com/auth/calendar.readonly` — See and download any calendar you can access using your Google Calendar.

These scopes are required to enable synchronization between Google Calendar and Obsidian and are used strictly for their intended purpose.

## Opt out Policy

- You are free to opt out at any time — simply disconnect your accounts and all your synchronized calendar data will be immediately removed from Obsidian.

## Contact

If you have any questions or concerns about this Privacy Policy or data handling practices, please contact us at [here](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar).

