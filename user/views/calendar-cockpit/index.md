# Calendar Cockpit (Left Panel)

The **Calendar Cockpit** is an integrated, collapsible command panel situated alongside the main calendar leaf. Designed specifically to solve horizontal sprawl on desktop and ultrawide displays, the Cockpit aggregates high-value scheduling context into a unified sidebar so you never have to hop between daily, weekly, and monthly views.

!!! info "Desktop Information Density"
    Standard weekly and daily calendar grids on wide desktop monitors often leave excessive horizontal whitespace. The Cockpit transforms this space into an actionable productivity command center containing a persistent mini month navigator, real-time upcoming event stream with hourly weather, and an unscheduled task backlog.

---

## Cockpit Overview & Layout

```
+---------------------------------------------------------------------------------------------------------------+
| [<- Calendar] Workspace: [Default v]  < Today > [🔍]       October 11 – 17, 2026        [Analysis] [View v]   |
+----------------------+----------------------------------------------------------------------------------------+
| LEFT COCKPIT PANEL   | MAIN CALENDAR GRID (Adaptive Remaining Width)                                         |
| [<< Fold]            |                                                                                        |
|----------------------|  Sun 11/10     Mon 12/10     Tue 13/10     Wed 14/10     Thu 15/10    Fri 16/10 ...    |
| 📅 MINI CALENDAR     | [⛅ 12-16°C]  [🌧️ 8-14°C]   [⛅ 10-18°C]  [🌧️ 9-15°C]   [🌫️ 6-15°C]  [☀️ 11-19°C]      |
|  < October 2026 >    |----------------------------------------------------------------------------------------|
|  Mo Tu We Th Fr Sa Su| 9 AM                        [09:16 - 10:16 Yoga]         [09:16 - 10:16 Yoga]          |
|         1  2  3  4  5| 10 AM                                                                                   |
|   6  7  8  9 10[11]12| 11 AM                                                                                  |
|  13 14 15 16 17 18 19| 12 PM                                                                                   |
|  20 21 22 23 24 25 26| 1 PM                                                                                   |
|  27 28 29 30 31      | 2 PM                                                    [14:07 - 15:07 Project Alpha]  |
|----------------------| 3 PM                                                                                   |
| ⚡ UP NEXT            |                                                                                        |
| • [Now] Team Sync    |                                                                                        |
|   09:00 - 10:00      |                                                                                        |
|   ⛅ 16°C            |                                                                                        |
| • [in 25m] Review    |                                                                                        |
|   14:00 - 15:00      |                                                                                        |
|   🌧️ 12°C (Rain 60%) |                                                                                        |
|----------------------|                                                                                        |
| 📋 TASK BACKLOG      |                                                                                        |
| ⁞⁞ Prep presentation |  == Drag directly from backlog into timegrid slots to schedule! ==>                    |
| ⁞⁞ Finalize Q4 plan  |                                                                                        |
+----------------------+----------------------------------------------------------------------------------------+
```

---

## Core Modules

The Cockpit is built on a modular widget system. Every module is wrapped in a collapsible accordion card with an action header and persistent fold/unfold state.

### 1. Mini Month Navigator (`MiniMonthModule`)

* **Persistent Spatial Context:** Provides a full 7x6 month datepicker right beside your timegrid week or day views.
* **Busy Heatmap Indicators:** Analyzes scheduled occurrences across local, remote, and CalDAV calendars, rendering colored indicator dots under days that contain events.
* **Bi-directional Navigation:**
    * Click any date to immediately navigate the main calendar view to that target day or week (`calendar.gotoDate()`).
    * Use `<` and `>` chevrons to browse upcoming or past months.
    * Click the **Today** button in the section header to synchronize both the mini calendar and the main view back to the current day.
* **First Day Preference:** Automatically respects the `First Day of Week` configuration (Sunday or Monday) configured in your plugin settings.

!!! tip "Fast Date Hopping"
    When in weekly or daily timegrid view, clicking any date in the Mini Month immediately navigates the main view without switching calendar modes. The selected day is highlighted with an accent ring.

### 2. Up Next & Contextual Weather (`UpNextWeatherModule`)

* **Chronological 24-Hour Stream:** Surfaces the immediate next 5 events scheduled between `now` and the next 24 hours.
* **Relative Countdown Pills:** Real-time visual status pills indicate immediacy:
    * `Now` (accent green) for currently active events.
    * `in 15m` / `in 45m` (amber) for upcoming events starting within the hour.
    * `HH:mm` for later scheduled items.
* **Hourly Weather Integration:** Hooks directly into the [Weather Forecasts](../features/weather.md) service. By matching the event start time with the hourly weather forecast:
    * Displays the predicted temperature and condition emoji (`⛅ 16°C`).
    * Shows an alert accent badge when precipitation probability exceeds 40% (`🌧️ 60%`), allowing you to prepare for inclement weather during outdoor activities.
* **Fast Navigation:** Clicking any card smoothly focuses and highlights that event in the main calendar.

!!! note "Weather Cache & Privacy"
    Weather forecasts are powered by Open-Meteo, fetched client-side, and cached in-memory. If weather is disabled in settings or coordinates are unconfigured, events gracefully render without weather badges.

### 3. Task Backlog & Drag-to-Schedule (`TaskBacklogModule`)

* **Single Unified Source of Truth:** Reuses the plugin's internal [Task Backlog](../features/tasks-backlog.md) engine and `TaskBacklogProvider` instances (including Obsidian Tasks and CalDAV VTODOs). No separate task database or redundant parsing.
* **Direct Timeblocking:** Integrated with `@fullcalendar/interaction` `Draggable`. Drag any unscheduled task card directly out of the left panel backlog and drop it onto an empty time slot on the weekly or daily grid to schedule it instantly.
* **Filter Search:** Quick filter text bar to pinpoint unscheduled items by title or category.

!!! tip "Timeblocking with Drag-and-Drop"
    Drag any task card from the backlog directly onto a timegrid slot. FullCalendar detects the drop target, opens the scheduling modal or directly creates the event, and writes back the scheduled date to the underlying task note or CalDAV source.

### 4. Calendar Agent Module (`AgentHudModule`)

* **Unobtrusive Docked Assistant:** Keeps natural language scheduling prompts, command suggestions, and event proposals encapsulated cleanly within an accordion card in the Cockpit instead of floating over or shrinking the main calendar grid.
* **Folded by Default:** Starts collapsed to preserve vertical space, unfolding smoothly whenever you want to query your schedule, draft multi-event blocks, or review proposed calendar changes.
* **Integrated Safety & Proposals:** Quick messages, suggestion pills, proposal confirmation cards, and a one-click launcher to open the full-fledged Right Sidebar Agent Panel for deeper conversations and full audit logs.
* **Respects Master Toggle:** Automatically disables itself if the Calendar Agent is switched off in plugin settings.

---

## Responsive Device-Tier Strategy

The Cockpit automatically optimizes its display across different screen sizes:

| Device Tier | Viewport | Default State | Behavior & Mechanics |
| :--- | :--- | :--- | :--- |
| **Desktop** | $\ge 1024\text{ px}$ | **Expanded** | Always open by default. Resizable split pane with persistent width. Can be collapsed via `[<<]` button or double-clicking the splitter. |
| **Tablet** | $768\text{ px} - 1023\text{ px}$ | **Collapsed** | Collapsed by default into a subtle left edge expand tab to preserve calendar column width on medium screens. Clicking the tab slides out the panel. |
| **Mobile** | $< 768\text{ px}$ | **Hidden** | Completely disabled on phone viewports (`.is-phone`) to prevent touch layout crowding and maximize full-screen calendar touch targets. |

---

## Resizer & Splitter Controls

```
[ Left Panel (290px) ] ║<-- Resizer Handle (6px) -->║ [ Main FullCalendar Grid ]
```

* **Drag-to-Resize:** Hovering over the border between the Cockpit and the main calendar reveals a `col-resize` splitter. Drag left or right to set your preferred width.
* **Clamping Constraints:** Clamped safely between **200px** (minimum readable width) and **520px** (maximum comfortable sidebar width).
* **Automatic Reflow:** While dragging or collapsing, FullCalendar dynamically calls `calendar.updateSize()` to ensure day columns reflow at 60fps without graphical tearing.
* **Double-Click Shortcut:** Double-clicking the splitter bar instantly collapses or restores the sidebar.
* **Persistent Settings:** Your chosen width and collapse state are saved automatically to your vault settings under `sidebarConfig.width`, persisting across restarts and workspace changes.

!!! tip "Splitter Shortcuts"
    * **Drag:** Fine-tune the width to match your card preferences.
    * **Double-Click:** Instantly collapses the panel into a compact vertical tab, giving FullCalendar 100% width.
    * **Expand Tab:** Click the floating `>` tab at the left margin to restore your previous width.

---

## Configuration & Settings Reference

Settings for the Cockpit are managed in `FullCalendarSettings.sidebarConfig`:

| Setting Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `sidebarConfig.enabled` | `boolean` | `true` | Enables or disables the left panel globally across calendar views. |
| `sidebarConfig.width` | `number` | `290` | Persistent width in pixels (clamped between 200px and 520px). |
| `sidebarConfig.isCollapsed` | `boolean` | `false` | Tracks whether the entire left panel is currently folded into the expand tab. |
| `sidebarConfig.collapsedModules` | `Record<string, boolean>` | `{'agent': true}` | Remembers accordion open/close state for each module individually. |
| `sidebarConfig.moduleOrder` | `string[]` | `['mini-month', 'up-next', 'task-backlog', 'agent']` | Defines the vertical rendering order of the module cards. |

---

## Related Documentation

* [Workspaces](workspaces.md) — Managing multi-calendar planning workspaces.
* [Timeline View](timeline_view.md) — Category-based resource timeline scheduling.
* [Task Backlog Panel](../features/tasks-backlog.md) — Comprehensive guide to the Task Backlog integration.
* [Weather Forecasts](../features/weather.md) — Configuring coordinates and Open-Meteo forecasts.
* [Cockpit Architecture](../../architecture/views/calendar-sidebar-architecture.md) — Developer blueprint and SOLID module system.
