# ICS Export Architecture

This document details the architectural design and implementation of the **ICS Export** feature in Full Calendar Remastered. The feature provides functionality to serialize the in-memory event cache into a standard `.ics` (iCalendar RFC 5545) document.

---

## Architectural Workflow

The pipeline for selecting, serializing, and writing calendar cache entries as `.ics` is outlined below:

```
[IcsExportModal] ──► Query Event Cache (retrieves active events)
       │
       ▼
[Filter & Compile] ──► Filter by user-selected Calendars
       │
       ▼
[formatter.ts: eventsToIcs] ──► Map each event to VEVENT/VTODO
       │
       ├──► [Save to Vault] ──► Write to selected folder in vault (app.vault)
       │
       └──► [Direct Download] ──► Generate Blob & trigger browser download
```

---

## Key Components

### 1. Multi-Event Formatter (`src/providers/ics/formatter.ts`)
We extend the existing iCal formatter (`formatter.ts`) by introducing and exporting `eventsToIcs(events: OFCEvent[]): string`:
- Instantiates a single top-level `ical.Component('vcalendar')` envelope.
- Loops through the compiled `OFCEvent` list.
- Calls the internal `createVEventComponent` (for standard events) or `createVTodoComponent` (for tasks) to format each event.
- Serializes the entire component tree into a single standard `.ics` string.

### 2. User Interface Modal (`src/features/export/IcsExportModal.ts`)
The `IcsExportModal` orchestrates the user interaction:
- **Calendar Registry Integration:** Retrieves all active calendars using `PluginState.getProviderRegistry().getAllSources()`.
- **Toggle Settings:** Renders toggle items for each calendar so users can selectively export subsets of calendars.
- **Export Paths:** Persists default export folder path configurations to the `icsExportPath` plugin settings.
- **Advanced Filtration Controls:**
  - **Export Period:** Options for "Export All Events" (entire history) or "Specific Date Range" (with side-by-side date pickers).
  - **Daily Time Range Filter:** Restricts exported timed events to a daily time window (with side-by-side time pickers).
  - **Include All-Day Events:** Toggle to include or exclude all-day events/tasks.
  - **Exclude Weekends:** Toggle to filter out weekend occurrences.
  - **Categories to Include:** Checklist dynamically populated from unique categories present in the event store.
  - **Include Types & Task Completion:** Dropdowns to filter by events, tasks, and task completion status.
- **Save to Vault Pipeline:** Resolves file paths, automatically creates target subfolders if they do not exist, checks for file existence, and writes to disk utilizing `app.vault`.
- **Direct Download Pipeline:** Uses standard HTML5 Blob ObjectURLs (`URL.createObjectURL`) to trigger local browser download prompts, working seamlessly across desktop and mobile.

### 3. Settings Rendering (`src/features/export/ui/renderExportSettings.ts`)
Exposes settings for default export configuration:
- Placed in the "Integrations" section of the main settings panel (`SettingsTab.tsx`).
- Allows editing the default `icsExportPath` vault directory folder.

---

## Data Model and iCalendar Mapping

The mapping from the plugin's canonical `OFCEvent` model to standard iCalendar structures is handled as follows:

| `OFCEvent` Property | iCalendar Component | Property Type | Details |
|---|---|---|---|
| `title` | `VEVENT`/`VTODO` | `SUMMARY` | Cleaned title string |
| `description` | `VEVENT`/`VTODO` | `DESCRIPTION` | Markdown/text |
| `date`/`startTime`/`timezone` | `VEVENT`/`VTODO` | `DTSTART` | Formatted based on all-day and timezone settings |
| `endDate`/`endTime`/`timezone` | `VEVENT`/`VTODO` | `DTEND` / `DUE` | Formatted based on all-day and timezone settings |
| `completed` (task) | `VTODO` | `STATUS` / `COMPLETED` | Marks `COMPLETED` or `NEEDS-ACTION` |
| `alarms` | `VEVENT`/`VTODO` | `VALARM` | Nested alarm triggers |
| `rrule`/`recurring` | `VEVENT`/`VTODO` | `RRULE` | Recurrence rules |
| `skipDates` | `VEVENT`/`VTODO` | `EXDATE` | Exception dates |
