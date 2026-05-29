# What's New in Full Calendar

This page highlights the latest **major features and improvements** to help you get the most out of the plugin.  
For a detailed version-by-version breakdown, see the [Changelog](changelog.md).


## 🌤️ Weather Forecast Integration

Plan your schedule in harmony with the weather! Full Calendar now includes a fully integrated, live weather forecast feature for your daily, weekly, and monthly views.

*   **Autonomic Free Geocoding**: Enter any city or region (e.g., `Prague`), and the plugin will dynamically resolve its geographic coordinates using Open-Meteo's free geocoding API—completely keyless and zero-configuration!
*   **Daily & Weekly Overview**: Displays full details directly in column headers, including mapped WMO conditions emojis, max daily temperatures, and readable forecasts (e.g., "Partly cloudy", "Heavy rain").
*   **Monthly Footprint**: Shows compact conditions emojis in month day cells without cluttering your scheduled events.
*   **Secure Caching**: Uses a composite in-memory cache to keep page switching instant, saving network requests.
*   **Interactive Onboarding**: If coordinates are unconfigured, a helpful "Configure weather location" placeholder panel will guide you directly to settings in a single click.

➡️ Learn more in the **[Weather Forecast Integration Guide](user/features/weather.md)**.

---

## 📋 Unified Task Backlog & CalDAV Tasks

The task backlog has been completely reimagined as a **generalized, multi-source task backlog framework**! It is now fully decoupled from specific integrations, adhering to strict SOLID design principles, and aggregates unscheduled tasks from multiple sources in a single aggregated side panel.

*   **CalDAV Tasks (VTODO)**: You can now fetch remote unscheduled `VTODO` tasks from your private iCloud, Fastmail, or self-hosted CalDAV servers directly into the Task Backlog sidebar.
*   **Drag-and-Drop Scheduling**: Drag any remote CalDAV task or local Obsidian task from the backlog onto the calendar. The plugin automatically schedules the task (as all-day or timed) and syncs it back to your CalDAV server or local markdown files in real-time.
*   **Task Creation**: Create new remote CalDAV tasks directly inside the backlog side panel, choosing your preferred destination account.
*   **Event Linked Notes**: Clicking the note icon next to a backlog CalDAV task instantly generates and opens a local templates-driven markdown note, keeping your rich detail vault-local and your sync lightweight.

---

## 🔗 Event Linked Notes

You can now link unique, template-driven Obsidian notes to your calendar events! This fully reactive system automatically manages association metadata and works seamlessly across both local and remote calendars (Google Calendar, CalDAV, ICS, Outlook).

*   **Reactive Metadata Mapping**: Uses `fc-event-uid` and `fc-calendar-id` frontmatter keys to automatically and dynamically index note-to-event relationships in an in-memory catalog.
*   **Template-Driven Body Creation**: Utilize a robust `TemplateEngine` to design custom, context-aware event note bodies and layouts.
*   **Seamless Interoperability**: Create, manage, and open linked notes for Google, CalDAV, ICS, and Outlook events with inline editor and event modal shortcuts.
*   **Settings Controls**: Easily configure directory targets and template files per calendar source.

➡️ Learn more about **[Event Linked Notes Guide](user/features/event-linked-notes.md)** and the **[Event Linked Notes Technical Architecture](architecture/system/features/event-linked-notes.md)**.

---

## 🚀 NLP & Milestones System

Full Calendar now features an advanced Natural Language Processing (NLP) engine for smarter event parsing, along with a brand new Milestones system to track and reward your productivity achievements. We've also deeply integrated TaskNotes to keep your workflows seamless.

➡️ Learn more about **[NLP](user/features/nlp.md)**, **[Milestones](user/features/milestones.md)**, and **[TaskNotes](user/calendars/tasknotes.md)**.

---

## 📧 Outlook Integration

You can now synchronize your Outlook calendars directly into Obsidian. This integration comes with full recurrence support and improved metadata/frontmatter handling.

➡️ Learn more about **[Outlook Integration](user/calendars/outlook.md)**.

---

## 📡 ActivityWatch Sync

ActivityWatch now has a dedicated sync engine that can turn local activity data into calendar blocks with continuity-aware updates, auto-sync scheduling, and dynamic title templating. 

➡️ Learn more about **[ActivityWatch Sync](user/calendars/activitywatch.md)**.

---

## 📅 CalDAV Two-Way Sync

You asked, we delivered. CalDAV calendars now support full two-way synchronization. Create, modify, and delete events from your private iCloud, Fastmail, or self-hosted CalDAV servers directly within Obsidian.

---

## ✅ CalDAV validation & Google recurrence fixes

CalDAV imports now verify that the URL is a real calendar collection via PROPFIND, with clearer errors when a non-calendar endpoint is pasted. Google Calendar recurring events respect their source timezone, hide deleted instances reliably, and the mobile OAuth flow opens a safe placeholder tab to avoid popup blockers.

---


## 🌐 Multi-Language Support

Full Calendar now supports multiple languages! The UI will automatically switch based on your Obsidian language setting. Developers can contribute new translations using the i18n system with type-safe keys. 

➡️ Learn more about [i18n documentation](user/features/i18n.md).

---

## ✔️ Tasks Integration Reimagined

The integration with the **Obsidian Tasks plugin** has been completely overhauled for maximum performance and reliability. It's now faster, safer, and more intuitive than ever.

- **Live Sync with Tasks Cache:** No more slow vault scans. The calendar now syncs directly with the Tasks plugin's live cache for instant updates.
- **Surgical Edits:** Modifying a task (e.g., scheduling or completing it) no longer rewrites the entire line. The plugin surgically updates only the necessary parts, preserving your custom metadata like links, tags, and comments.
- **Robust Drag-and-Drop:** Drag tasks from the backlog or between dates with confidence. The new provider ensures that scheduling is reliable and predictable.
- **Seamless Experience:** Create, update, and complete tasks directly from the calendar. All changes are powered by the Tasks plugin's own engine for data integrity.

➡️ Learn more about [Tasks Integration](user/calendars/tasks-plugin-integration.md).

---

## 🔔 [Event Reminder System](user/features/reminders.md)

Never miss an important meeting again! The new **[Event Reminder System](user/features/reminders.md)** brings native desktop notifications to Full Calendar. Get notified 10 minutes before your events start, and optionally before they end.

- **Smart Notifications:** Native desktop notifications work across all operating systems
- **Flexible Timing:** 10-minute advance warning with optional end-time reminders
- **Universal Support:** Works with all calendar sources - local notes, Google Calendar, CalDAV, and ICS feeds
- **Privacy-First:** All reminder processing happens locally in your vault

➡️ Enable notifications in Settings → General → Event Notifications

---

## 🧩 Calendar Workspaces

Create and switch between tailored calendar setups with Workspaces. Save your selected sources, filters (categories, tasks, all‑day), and view preferences (month/week/day/timeline) into named workspaces like "Planning" or "Deep Work" and swap in a click. Optimized to apply changes incrementally for fast transitions.

- Save sources, filters, and display preferences per workspace
- Quick switcher in the calendar header and command palette support
- Optional default workspace on startup

➡️ See how to use it: [Workspaces](user/views/workspaces.md)

---

## 🗓️ Google Calendar Integration

Full Calendar now supports **two-way sync with Google Calendar**! Connect your Google account to create, modify, and delete events (including recurring events) directly in Obsidian. OAuth 2.0 authentication, calendar selection, and automatic token refresh are all built-in.

- **Seamless Sync:** Events created in Obsidian appear instantly in Google Calendar, and vice versa.
- **Recurring Events:** Full support for recurring events and per-instance overrides.
- **Advanced Categories:** Google Calendar events can use category coloring and sub-category organization for powerful visual management.
- **Multi-Account Multi-Calendar:** Now supports multiple calendars across different Google Accounts.

➡️ **[Learn how to set up OAUTH2.0 for Google Calendar Sync](user/calendars/gcal.md)**

---

## 🏷️ Timeline View for Categories & Projects

Visualize your schedule by category and sub-category with the new **Timeline View**! This advanced view organizes events into horizontal lanes, making it perfect for project management, resource planning, and complex schedules.

- **Hierarchical Lanes:** Events are grouped by category and sub-category, with expandable/collapsible groups.
- **Drag-and-Drop:** Move events between lanes to change their category or sub-category instantly.
- **Shadow Events:** Parent categories can show aggregate shadow events for a quick overview.
- **Custom Colors:** Color-code categories and sub-categories for instant recognition.
- **Works with All Sources:** Timeline View supports local, remote, and Google Calendar events.

➡️ **[See Timeline View Usage](user/views/timeline_view.md)**

---

## 🎨 Powerful Advanced Categories & Coloring

Supercharge your calendar's organization with Advanced Categories! This new system allows you to override a calendar's default color for specific events based on a category prefix in the event's title. It's the foundation for many powerful features to come.

-   **Universal Organization:** Works for local and remote calendars. An event from Google Calendar titled `Work - Project Deadline` will be colored correctly in Obsidian.
-   **Sub-Categories:** Organize even further with a `Category - SubCategory - Title` format.
-   **Smart Setup:** When you enable the feature, the plugin can automatically categorize your existing events based on their folder structure.
-   **Autocomplete Editor:** The event editor now has a dedicated "Category" field with autocomplete suggestions for all your existing categories, ensuring consistency.

➡️ **[Learn how to set up Advanced Categories](user/events/categories.md)**

---

## ✨ Recurring Events Reimagined

The entire recurring event system has been rebuilt from the ground up to be more powerful, intuitive, and safe.

- **Per-Instance Editing:** Drag, resize, or rename a single occurrence of a recurring event without affecting the entire series. The plugin automatically creates a smart "override" that is linked to the parent.
- **Recurring Tasks That Work:** Check off a single instance of a recurring task as "done." It will be crossed out for that day only, leaving future occurrences ready for action.
- **Safe Deletion:** When deleting a recurring event, you'll now be asked whether you want to delete just that one instance, or the entire series (including any overrides you've made).

➡️ **[Learn more about Recurring Events & Overrides](user/events/recurring.md)**

---

## 🧠 Chrono Analyser Dashboard

Unlock powerful insights into your time with Chrono Analyser! Chrono Analyser is a built-in dashboard that transforms your calendar events into actionable analytics.

- **Proactive Insights Engine:** Automatically analyzes your calendar history and highlights trends, habits, and summaries.
- **Interactive Charting:** Explore your data visually with pie, sunburst, time-series, and activity pattern charts.
- **Persona & Group Analysis:** Create custom insight groups (e.g., "Productivity", "Routine") for tailored analysis.
- **All Sources Supported:** Works with Full Note, Daily Note, Google Calendar, CalDAV, and ICS calendars.
- **Real-Time Filtering:** Instantly filter by category, project, or date range.

➡️ **[Learn more about Chrono Analyser](user/chrono_analyser/introduction.md)**

---

## 🌍 Robust Timezone Support

Travel and collaborate across timezones with confidence. Full Calendar is now fully timezone-aware, ensuring your events always appear at the correct local time, no matter where you are.

-   **Display Timezone:** Set a specific timezone for your calendar view, independent of your system's timezone. Perfect for planning trips or coordinating with remote teams.
-   **Automatic Conversion:** Events from all sources—local notes, daily notes, and remote calendars like Google Calendar—are automatically converted to your chosen display timezone.
-   **DST Safe:** All conversions are Daylight Saving Time aware, so you never have to worry about "fall back" or "spring forward" bugs again.

➡️ **[Read more about Timezone Support](user/events/timezones.md)**

---

##  🖌️ Redesigned Event Editor

The event editor has been completely redesigned from the ground up for a cleaner, more intuitive experience.

-   **Two-Column Layout:** A polished layout makes it easier to find and edit the fields you need.
-   **Logical Grouping:** Date, time, and recurrence options are logically grouped for faster editing.
-   **Dedicated Actions:** Buttons for Save, Delete, and Open Note are neatly organized in the footer.