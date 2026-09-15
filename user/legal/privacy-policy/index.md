# Privacy Policy

_Last updated: June 17, 2026_

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

## Data Protection, Storage, and Security

### **Security & Data Protection**

We take appropriate technical and organizational measures to protect user data:

* **Encryption in transit:** All calendar and task data is transmitted securely using HTTPS/TLS when communicating with Google, Microsoft, and other providers.
* **Local storage only:** OAuth tokens and configuration data are stored locally within the user’s Obsidian vault and are NEVER transmitted to or stored on external servers controlled by the plugin / third party.
* **No persistent external storage:** Calendar data is cached only in memory during runtime and is discarded after the session ends.
* **Limited data access:** The plugin accesses only the minimum necessary calendar data required to provide its functionality, and data is never shared with third parties.
* **User-controlled environment:** Data security within the local vault depends on user-controlled protections such as operating system security, filesystem permissions, and Obsidian vault / device-level encryption.

We do not sell, transfer, or use user data for advertising purposes, and we do not access user data outside of the functioning of the plugin.

### **Data Transmission**

Calendar and task data is transmitted directly between the user’s device and the respective calendar providers (Google, Microsoft, CalDAV, ICS) over secure HTTPS connections. The plugin does not proxy or store this data.

### **Intermediary Server Usage**

During OAuth authentication (when using the default client), a temporary intermediary server hosted on Vercel processes the authorization code solely to complete the OAuth flow. This data:

* Is processed in memory only
* Is not logged or stored
* Is immediately discarded after use

## OAuth Scopes

For Google integrations, the plugin requests the following OAuth scopes:

- `https://www.googleapis.com/auth/calendar.events` — View and edit events on all your calendars (required for core calendar synchronization and event management).
- `https://www.googleapis.com/auth/calendar.readonly` — See and download any calendar you can access using your Google Calendar (required to list and import your calendars).
- `https://www.googleapis.com/auth/tasks` — Create, edit, organize, and permanently delete your tasks (required for Google Tasks synchronization and management).
- `email` — View your primary email address. This is used solely to identify and display the connected account inside the plugin settings interface within Obsidian.

These scopes are used strictly for their designated purposes to enable integration with Obsidian.

## Opt out Policy

- You are free to opt out at any time — simply disconnect your accounts and all your synchronized calendar data will be immediately removed from FCR Plugin.

## Contact

If you have any questions or concerns about this Privacy Policy or data handling practices, please contact us at [here](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar).

