# Embedded Code Block

Embed interactive calendar grids, weather forecasting panels, task backlogs, or productivity analyses directly inside any Obsidian note.

---

## Quickstart: Embed in 3 Steps

If you are new to coding or Obsidian code blocks, embedding a calendar only takes a few seconds:

### 1. Create a Code Block
In any Obsidian note, type three backticks followed by `fc-calendar` on a new line, and close it with three backticks:

````markdown
```fc-calendar
```
````

By default, an empty `fc-calendar` block will display your standard month calendar!

### 2. Customize Common Settings
You can customize the view, dimensions, or filters by typing simple YAML settings inside the block:

````markdown
```fc-calendar
view: dayGridMonth
height: 500px
```
````

### 3. Copy-Paste Starter Recipes

=== "Monthly Calendar"
    Great for dashboard notes, project homepages, or central overviews.
    ````markdown
    ```fc-calendar
    view: dayGridMonth
    height: 550px
    ```
    ````

=== "Weekly Planner"
    Ideal for weekly review notes or planning your week ahead.
    ````markdown
    ```fc-calendar
    view: timeGridWeek
    height: 600px
    ```
    ````

=== "Daily Note Schedule"
    Locks dynamically to the current note's date using `defaultDate: auto`.
    ````markdown
    ```fc-calendar
    view: timeGridDay
    defaultDate: auto
    height: 500px
    ```
    ````

=== "Agenda / List View"
    A clean, scrollable list of upcoming events for the week or month.
    ````markdown
    ```fc-calendar
    view: listWeek
    height: 400px
    ```
    ````

=== "Filter by Calendar Source"
    Display events only from specific configured calendar sources.
    ````markdown
    ```fc-calendar
    view: timeGridWeek
    calendars:
      - "Work"
      - "Personal"
    height: 500px
    ```
    ````

---

## QTLDR (Quick Too Long; Didn't Read) Router

Use this matrix to quickly select the configuration type that fits your immediate workflow:

| Operational Goal | Recommended Widget | Configuration Key | Primary Use Case |
|---|---|---|---|
| Standard calendar grids | [Interactive Calendar](deep_dive.md#layout-view-config) | `type: calendar` (default) | Daily planners, monthly agendas, resource timelines |
| Drag-and-drop task planning | [Task Backlog](deep_dive.md#layout-view-config) | `type: backlog` | Unscheduled task pool next to a calendar schedule |
| Glance at local conditions | [Weather Strip/Card](deep_dive.md#layout-view-config) | `type: weather` | Daily note headers, sidebar temperature strips |
| Review habits & time spent | [Productivity Analytics](deep_dive.md#layout-view-config) | `type: analysis` | Weekly review summaries, sunburst category charts |
| Multi-column side-by-side | [Horizontal Flex Dashboard](deep_dive.md#dashboard-layouts-inheritance) | `layout.orientation: horizontal` | Workspace control centers, split daily note dashboards |
| Row-by-row stacked grids | [Vertical Flex Dashboard](deep_dive.md#dashboard-layouts-inheritance) | `layout.orientation: vertical` | Mobile-friendly note feeds, list-heavy widgets stacking |

---

## Directory of Modules

<div class="grid cards" markdown>

-   :material-book-open-page-variant:{ .lg .middle } **[Deep Dive Specs](deep_dive.md)**

    Explore parameter schemas, query filters, date offsets, sorting engines, layout cascading, and scoped styling.

-   :material-view-compact-outline:{ .lg .middle } **[Dashboard Showcase](showcase.md)**

    Copy-paste pre-configured blueprints for Daily Planner notes, Homepage Command centers, Project Sprint trackers, and Sidebar strips.

</div>

---


[Views & Workspaces](../views/index.md) · [Working with Events](../events/index.md) · [Calendar Sources](../calendars/index.md) · [Troubleshooting & FAQs](../guides/troubleshooting.md)
