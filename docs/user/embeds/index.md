# Embedded Code Block

!!! info "Power Dashboard Launcher"
    Embed interactive calendar grids, weather forecasting panels, task backlogs, or productivity analyses directly inside any Obsidian note. Use this section to choose your widget layout, configure query parameters, and build beautiful multi-view layouts.

## QTLDR (Quick Too Long; Didn't Read) Router

Use this matrix to quickly select the configuration type that fits your immediate workflow:

| Operational Goal | Recommended Widget | Configuration Key | Primary Use Case |
|---|---|---|---|
| Standard calendar grids | [Interactive Calendar](deep_dive.md#calendar-widget-type-calendar) | `type: calendar` (default) | Daily planners, monthly agendas, resource timelines |
| Drag-and-drop task planning | [Task Backlog](deep_dive.md#task-backlog-widget-type-backlog) | `type: backlog` | Unscheduled task pool next to a calendar schedule |
| Glance at local conditions | [Weather Strip/Card](deep_dive.md#weather-widget-type-weather) | `type: weather` | Daily note headers, sidebar temperature strips |
| Review habits & time spent | [Productivity Analytics](deep_dive.md#productivity-analysis-widget-type-analysis) | `type: analysis` | Weekly review summaries, sunburst category charts |
| Multi-column side-by-side | [Horizontal Flex Dashboard](deep_dive.md#multi-view-dashboards-layouts) | `layout.orientation: horizontal` | Workspace control centers, split daily note dashboards |
| Row-by-row stacked grids | [Vertical Flex Dashboard](deep_dive.md#multi-view-dashboards-layouts) | `layout.orientation: vertical` | Mobile-friendly note feeds, list-heavy widgets stacking |

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
