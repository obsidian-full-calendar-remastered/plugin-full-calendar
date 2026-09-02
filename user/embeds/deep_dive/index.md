# Parameter Reference

This page provides the complete technical specification of the parameters, filters, layout cascading, and custom styling rules available in the `fc-calendar` codeblock.

---

## Layout & View Config

These parameters control the appearance, density, and layout structure of the calendar and widgets:

| Parameter | Type | Allowed Values | Description | Cross-Link / Context |
|---|---|---|---|---|
| `type` / `widget` | `string` | `calendar`, `weather`, `analysis`, `backlog` | The strategy class to render (default: `calendar`). | [Widget Engine](../../architecture/views/embedded_widgets.md) |
| `view` | `string` | `dayGridMonth`, `timeGridWeek`, `timeGridDay`, `listWeek`, `listMonth`, `resourceTimelineDay`, `resourceTimelineWeek` | The [FullCalendar view](../views/index.md) style to load. | [Timeline View](../views/timeline_view.md) |
| `height` | `string` | `400px`, `100%`, `fit` | Visual height. `fit` collapses/expands the widget dynamically. | [Sizing Engine](../../architecture/views/embedded_widgets.md) |
| `width` | `string` | `100%`, `350px` | Visual width. Columns stack vertically on screens <= 600px. | [Mobile Layouts](#architecture-performance) |
| `defaultDate` | `string` | `auto`, `today`, `YYYY-MM-DD` | Reference date. `auto` checks for the active [Daily Note](../calendars/dailynote.md). | [Time Engine](../../architecture/system/interop.md) |
| `header` | `boolean` | `true`, `false` | Hides both top and bottom navigation bars. | [Display Settings](../settings/fc_config.md) |
| `zoomLevel` | `number` | `0` to `4` | Density multiplier for the timeline timeslots. | [Zoom Settings](../settings/fc_config.md) |
| `slotDuration` | `string` | `00:15:00`, `00:30:00` | Custom agenda row time block size. | [Display Settings](../settings/fc_config.md) |
| `slotLabelInterval` | `string` | `01:00:00`, `02:00:00` | Grid line label occurrence frequency. | [Display Settings](../settings/fc_config.md) |
| `weather` | `boolean` | `true`, `false` | Displays weather forecast icons inline. | [Weather Forecasts](../features/weather.md) |
| `inheritFilters` | `boolean` | `true`, `false` | Toggles parent-to-child filter cascading. | [Dashboard Layouts](#dashboard-layouts-inheritance) |

---

## Query Filters

These parameters query the [Event Cache](../../architecture/system/eventcache.md) to dynamically select which events are displayed:

| Parameter | Type | Description | Cross-Link |
|---|---|---|---|
| `calendars` | `string[]` | Specific calendar source IDs or user-configured names. | [Sources Configuration](../settings/sources.md) |
| `categories` | `string[]` | Filter events matching specific high-level category names. | [Category Settings](../settings/categories.md) |
| `completed` | `boolean` | Filter checklist tasks by status (`true` = completed, `false` = open). | [Tasks Integration](../calendars/tasks-plugin-integration.md) |
| `isTask` | `boolean` | If `true`, includes checklist tasks only. If `false`, includes standard events only. | [Task Backlog](../features/tasks-backlog.md) |
| `tagFilter` | `string` | Filters by tag string matching (e.g. `#work` or `project-blue`). | [Local Note Calendars](../calendars/local.md) |
| `pathFilter` | `string` | Limits events to notes residing under a specific subfolder path. | [Event Linked Notes](../features/event-linked-notes.md) |
| `textSearch` | `string` | Substring match against titles, descriptions, and inline notes. | [Interactions & Gestures](../features/interactions.md) |
| `titleFilter` | `string` | Regex-friendly substring filter matching event titles. | [NLP Smart Matching](../features/nlp.md) |
| `startOffset` | `string` | Relative start date sliding range offset (e.g., `-7d`, `-1m`). | [Relative Offsets](#relative-date-offsets) |
| `endOffset` | `string` | Relative end date sliding range offset (e.g., `+7d`, `+2w`). | [Relative Offsets](#relative-date-offsets) |

---

## Sorting Engine

Applied to list, agenda, and timeline views:

| Parameter | Type | Allowed Values | Description | Cross-Link |
|---|---|---|---|---|
| `sortBy` | `string` | `start`, `end`, `title`, `category`, `priority` | Field to sort events. | [Sorting Engine](../../architecture/system/event-filtering-sorting.md) |
| `sortOrder` | `string` | `asc`, `desc` | Ordering direction (default: `asc`). | [Workspace Settings](../settings/workspaces.md) |

---

## Relative Date Offsets

Offsets calculate relative windows relative to the `defaultDate`. Supported units:
*   `d`: Days
*   `w`: Weeks
*   `m`: Months
*   `y`: Years

!!! example "Relative Range Configurations"
    === "Weekly Window"
        Show a bi-weekly window centered around the active note:
        ```yaml
        defaultDate: auto
        startOffset: -7d
        endOffset: +7d
        ```
    === "Monthly Planner"
        Show events from the beginning of this month up to the next two months:
        ```yaml
        defaultDate: today
        startOffset: -0m
        endOffset: +2m
        ```

---

## Dashboard Layouts & Inheritance

You can combine multiple widgets inside a single codeblock by defining a `layout` object with an `orientation` (`horizontal` or `vertical`) and an array of `views`:

*   **Filter Cascading**: Child views automatically inherit all parent query settings when `inheritFilters` is `true` (default). Individual views can override specific parameters.
*   **Inheritance Override**: To isolate a child view from parent settings entirely, set `inheritFilters: false` directly on that view.

---

## Scoped Custom Styling (`styles`)

Local custom styles can be specified under the `styles` property. They are safely applied as inline custom properties to prevent leakage:

*   `--fc-event-bg-color`: Event background color (e.g. `"#7b2cbf"`).
*   `--fc-event-border-color`: Event border color (e.g. `"#9d4edd"`).
*   `--fc-event-text-color`: Text color inside event blocks (e.g. `"#ffffff"`).
*   `--fc-border-color`: Grid line color (e.g. `rgba(255,255,255,0.1)`).
*   `--fc-today-bg-color`: Today's cell background highlight (e.g. `rgba(123,44,191,0.05)`).
*   `fontSize`: Font size inside the widget (e.g. `"12px"`).
*   `borderRadius`: Corner roundness of event blocks (e.g. `"6px"`).

---

## Architecture & Performance

*   **Lazy Rendering**: An [IntersectionObserver](../../architecture/system/performance.md) defers rendering until the container is within `100px` of the viewport.
*   **Dynamic Resize**: A root [ResizeObserver](../../architecture/views/embedded_widgets.md) listens to pane resizing and panel splitting to reflow widget dimensions automatically.
*   **Mobile Responsiveness**: Horizontal columns automatically stack vertically when screen width is <= 600px.
---

[Overview](index.md) · [Deep Dive Parameter Specs](deep_dive.md) · [Dashboard Showcase](showcase.md) · [Widget Architecture](../../architecture/views/embedded_widgets.md)