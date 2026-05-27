# Embedded Code Block Calendars

The **Full Calendar Code Block Processor** allows you to embed fully interactive, dynamic schedules, monthly grids, or agenda lists directly inside any Obsidian note (such as dashboards, daily logs, or project homepages). Hooked directly into the unified [Event Cache](../../architecture/dev-logs/index.md), this engine supports robust, real-time querying, multi-view layout cascading, and relative date ranges.

---

## 1. Capabilities Overview

<div class="grid cards" markdown>

-   :material-filter-variant:{ .lg .middle } **Granular Querying**

    Filter events directly from the [Event Cache](../../architecture/dev-logs/index.md) using title, tags, folders, or task status.
    [:octicons-arrow-right-24: Query Reference](#2-advanced-query-filtering-engine)

-   :material-calendar-sync:{ .lg .middle } **Relative Ranges**

    Define dynamic sliding windows like `-7d` or `+30d` relative to your [Daily Notes](../calendars/dailynote.md).
    [:octicons-arrow-right-24: Relative Offsets](#relative-offsets-relative-ranges)

-   :material-view-dashboard:{ .lg .middle } **Filter Inheritance**

    Cascade parent filters down to horizontal or vertical columns automatically in multi-view dashboards.
    [:octicons-arrow-right-24: Layout Inheritance](#4-multi-view-dashboards-layouts-filter-inheritance)

-   :material-palette:{ .lg .middle } **Scoped Styling**

    Apply local inline styles and CSS variables to individual calendars without affecting Obsidian's main theme.
    [:octicons-arrow-right-24: Custom Styling](#6-advanced-customization)

</div>

---

## 2. Core Configuration & Syntax

Embed a calendar by writing a custom `fc-calendar` code block using declarative YAML options. Every parameter matches the central query engine for consistent behavior across [Task Backlog](tasks-backlog.md) and [FCR Command (NLP)](nlp.md).

=== "Basic Query"

    ````yaml
    ```fc-calendar
    view: timeGridWeek         # View type: dayGridMonth, timeGridWeek, timeGridDay, listWeek, listMonth
    height: 400px              # Set custom height (e.g., 400px, 100%, or 'fit' to adjust automatically)
    width: 100%                # Custom width (e.g., 100%, 300px)
    defaultDate: auto          # auto (detects Daily Note date), today, or YYYY-MM-DD
    calendars:                 # Filter to specific calendar source IDs
      - "personal"
    ```
    ````

=== "Complex Filters"

    ````yaml
    ```fc-calendar
    view: listWeek
    titleFilter: "Meeting"     # Only show events containing "Meeting" in their title
    tagFilter: "#focus"        # Only show events tagged with "#focus"
    completed: false           # Hide completed tasks
    isTask: true               # Show only tasks, hide standard events
    sortBy: "priority"         # Sort list by task priority
    sortOrder: "desc"          # Sort in descending order
    ```
    ````

=== "Multi-View Dashboard"

    ````yaml
    ```fc-calendar
    calendars:
      - "work-tasks"
    inheritFilters: true       # Cascades the "work-tasks" calendar filter to child views
    layout:
      orientation: horizontal  # Place columns side-by-side
      views:
        - view: timeGridDay
          width: 50%
          header: false
        - view: listWeek
          width: 50%
          header: true
    ```
    ````

---

## 3. Advanced Query & Filter Reference

The embedded calendar processor exposes the full capabilities of the [Event Cache Engine](../../architecture/dev-logs/index.md). Below is the comprehensive directory of query parameters you can use:

### Query Parameters

| Parameter | Type | Description | Cross-Link / Context |
|---|---|---|---|
| `calendars` | `string[]` | Specific calendar source IDs to query. | [Calendar Providers](../calendars/index.md) |
| `categories` | `string[]` | Filter events matching specific high-level category names. | [Advanced Categorization](nlp.md) |
| `subCategories` | `string[]` | Filter by nested subcategories. | [Categorization Settings](../settings/index.md) |
| `completed` | `boolean` | Filter tasks by completion status (`true` = completed, `false` = open). | [Tasks Plugin Integration](../calendars/tasks-plugin-integration.md) |
| `isTask` | `boolean` | Differentiate between events (`false`) and checklist tasks (`true`). | [Task Backlog](tasks-backlog.md) |
| `excludeAllDayTasks` | `boolean` | Exclude tasks scheduled as all-day events from views. | [Tasks Settings](../settings/index.md) |
| `textSearch` | `string` | Full-text substring search across titles, descriptions, and notes. | [Interactions & Gestures](interactions.md) |
| `titleFilter` | `string` | Regex-friendly substring filter matching event titles. | [NLP Smart Title Matching](nlp.md) |
| `tagFilter` | `string` | Match specific `#tags` from inline markdown or frontmatter. | [Local Note Calendars](../calendars/local.md) |
| `pathFilter` | `string` | Limit events to those originating from a specific vault subfolder. | [Event Linked Notes](event-linked-notes.md) |

### Relative Offsets & Relative Ranges

To make dashboards truly dynamic, you can specify **relative date ranges** calculated relative to the `defaultDate` (which can be `today` or resolve automatically via `auto` to the [Daily Note](../calendars/dailynote.md) date).

!!! tip "Supported Period Units"
    Offsets use standard Luxon period units:
    *   `d`: **Days** (e.g. `+3d`, `-5d`)
    *   `w`: **Weeks** (e.g. `+2w`, `-1w`)
    *   `m`: **Months** (e.g. `+1m`, `-2m`)
    *   `y`: **Years** (e.g. `+1y`, `-3y`)

!!! example "Relative Range Examples"
    === "Weekly Window"
        Show a bi-weekly window centered around your current Daily Note date:
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

## 4. Sorting Engine

Custom sorting is executed on list, agenda, and [Timeline Views](../views/timeline_view.md). Month and week grid calendars preserve standard FullCalendar placement algorithms to maintain chronological date order.

| Sorting Parameter | Allowed Values | Description | Cross-Link / Context |
|---|---|---|---|
| `sortBy` | `'start' \| 'end' \| 'title' \| 'category' \| 'priority'` | Field to order events by. | [Time Engine Architecture](../../architecture/dev-logs/index.md) |
| `sortOrder` | `'asc' \| 'desc'` | The direction of the sort (default: `'asc'`). | [Workspace Integration](../views/workspaces.md) |

---

## 5. Multi-View Dashboards (Layouts) & Filter Inheritance

You can combine multiple calendar layouts side-by-side (horizontal columns) or stacked (vertical rows) inside a single code block container by using the `layout` configuration block.

### Parent-to-Child Cascading (`inheritFilters: true`)

By default, **nested views within the same code block automatically inherit all parent-level query and filter options** (`inheritFilters: true`). This ensures you only have to specify your filters once at the top of the block, and every nested column or row will synchronize seamlessly. You can explicitly override any inherited filter inside individual view blocks, or disable inheritance entirely by setting `inheritFilters: false`.

!!! note "Inheritance Flow"
    ```
    Parent Container (calendars: ["work", "personal"], tagFilter: "#important")
      ├── Column 1 (Inherits calendars and #important tag filter)
      └── Column 2 (Overrides tagFilter: "#critical", inherits calendars)
    ```

---

## 6. Premium Dashboard Workflows

Copy and paste these pre-configured templates directly into your vault:

=== "A: Daily Planning Dashboard"

    !!! abstract "Daily Note Companion"
        Perfect for placing at the top of your **Daily Note template**. Displays today's schedule on the left (automatically locked to today's date), and a clean list of all upcoming work items on the right:

        ````yaml
        ```fc-calendar
        defaultDate: auto    # Automatically locks to the date of your Daily Note!
        calendars:
          - "personal-schedule"
          - "daily-notes"
        layout:
          orientation: horizontal
          views:
            # Column 1: Daily Schedule
            - view: timeGridDay
              width: 50%
              height: 450px
              header: false

            # Column 2: Weekly Work Focus List
            - view: listWeek
              width: 50%
              height: 450px
              header: true
              titleFilter: "Focus" # Overrides to focus on key items
        ```
        ````

=== "B: Command Center Homepage"

    !!! abstract "Homepage Command Center"
        Create a gorgeous dashboard on your homepage. It layouts a mini monthly overview next to your upcoming weekly schedule, filtered to show milestones:

        ````yaml
        ```fc-calendar
        calendars:
          - "personal"
          - "work"
        tagFilter: "#milestone"
        layout:
          orientation: horizontal
          views:
            # Mini Month Overview
            - view: dayGridMonth
              width: 65%
              height: 500px
              header: true

            # Upcoming Weekly Agenda
            - view: listWeek
              width: 35%
              height: 500px
              header: false
        ```
        ````

=== "C: Sprint & Project Planner"

    !!! abstract "Sprint Hub Overview"
        Embed this inside a specific project hub. It filters your calendars to display *only* files under your project's sub-folder, sorted by priority:

        ```yaml
        ```fc-calendar
        view: listWeek
        height: fit                         # Auto-collapses height to fit the events perfectly
        pathFilter: "Projects/Sprint-Alpha/" # Shows only events linked to this folder!
        sortBy: "priority"
        sortOrder: "desc"
        ```
        ```

---

## 7. Advanced Customization

### Scoped Style Customizations (`styles`)

Customize the look and feel of each embedded calendar by specifying a list of style overrides under `styles`. These are safely scoped and applied as inline style custom properties on the calendar container, so they will never leak or interfere with other elements of Obsidian's UI:

!!! info "Scoped Style Custom Properties"
    === "CSS Variable Overrides"
        *   `--fc-event-bg-color`: The background color of the event cards (e.g. `"#7b2cbf"`).
        *   `--fc-event-border-color`: The border color of the event cards (e.g. `"#9d4edd"`).
        *   `--fc-event-text-color`: The text color of events (e.g. `"#ffffff"`).
        *   `--fc-border-color`: The grid lines and calendar border color (e.g. `"#3c096c"`).
        *   `--fc-today-bg-color`: The background highlight for today (e.g. `"rgba(255, 255, 255, 0.05)"`).
    === "Standard CSS Customizations"
        *   `fontSize`: Adjust font size within the widget (e.g., `"12px"`).
        *   `borderRadius`: Round event cards and border grid corners (e.g., `"6px"`).

---

## Troubleshooting

For dynamic resolution errors, daily note date mismatch, or empty layout rendering issues, refer to the **[Central Troubleshooting Guide](../guides/troubleshooting.md#codeblock-rendering){ .md-button .md-button--primary }**.
