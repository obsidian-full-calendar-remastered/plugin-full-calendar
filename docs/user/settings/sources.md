# Calendar Sources Settings

!!! abstract "Philosophy"
    Manage where your events come from. Full Calendar can aggregate data from your local vault, external cloud providers, and other Obsidian plugins into a single unified view.

## Source Management

Access these settings in **Full Calendar Settings → Calendar Sources**.

![Add calendar](../../assets/calendars/add-calendar-source.gif)

### Local Vault Sources

*   **Full Note Calendar**: Point this to a folder in your vault. Every `.md` file in this folder with appropriate frontmatter becomes an event. See: [Full Note Calendar Guide](../calendars/local.md).
*   **Daily Note Calendar**: Link to your Daily Notes folder. When adding the source, choose the heading to write under and the timed-event write format (`Default` or `DayPlanner Format`). Parsing supports both formats automatically. See: [Daily Note Calendar Guide](../calendars/dailynote.md).

### Remote Cloud Sources

*   **Google Calendar**: 
    *   **Standard Setup**: Connect using the built-in [OAuth flow](../calendars/gcal.md).
    *   **Custom Client**: Enable `Use custom Google client` to provide your own `Client ID` and `Client Secret` for increased privacy or rate-limit control.
*   **CalDAV**: Connect to iCloud, Nextcloud, or Fastmail. See: [CalDAV Setup](../calendars/caldav.md).
*   **ICS (Remote/Local)**: 
    *   **Remote**: Provide a public or secret `.ics` URL.
    *   **Local**: Provide a path to a `.ics` file stored within your Obsidian vault. See: [ICS Guide](../calendars/ics.md).

### Plugin Integrations

*   **Tasks Plugin**: Enable to pull tasks into your calendar. See: [Tasks Integration](../calendars/tasks-plugin-integration.md).
    *   **Date Mapping**: Choose which task date to use: `Scheduled`, `Due`, or `Start`.
    *   **Backlog Behavior**: Enable `Open edit modal after backlog drop` to immediately refine tasks dragged onto the calendar.
*   **TaskNotes Plugin**: Enable to sync scheduled TaskNotes tasks into your calendar. See: [TaskNotes Integration](../calendars/tasknotes.md).
    *   **NLP Endpoint Mode**: Configure whether NLP creation opens `Search + Create` (default) or `Direct Create`.
    *   **Integration Visibility**: TaskNotes Integration always appears in **Settings → Integrations** and will prompt you to add a TaskNotes source if one is missing.
*   **ActivityWatch**: Sync your system activity as background events. See: [ActivityWatch Integration](../calendars/activitywatch.md).
    *   **API URL**: Defaults to `http://127.0.0.1:5600`.
    *   **Sync Strategy**: Choose `Auto` or `Custom` date ranges.
    *   **Profiles**: Create matching rules to categorize raw ActivityWatch data into meaningful calendar events.

---

## Global Source Settings

*   **Default Calendar**: Choose which calendar is selected by default when creating a new event via the UI or [FCR Command](../features/nlp.md).
*   **Revalidate Remote Calendars**: Manually trigger a refresh of all external feeds.
*   **Reset Event Cache**: A deep reload that forces the plugin to re-read all data from all sources. See [Data Integrity](../reference/data_integrity.md).

---

[Display and Behavior](fc_config.md) · [Advanced Categorization](categories.md) · [Back to Index](index.md)
