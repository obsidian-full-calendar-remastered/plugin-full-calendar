# Embedded Chrono Analyzer Charts

The **Full Calendar Extensible Widget Framework** allows you to embed fully interactive productivity charts and analysis statistics directly inside any Obsidian note (such as homepages, dashboard canvases, or sprint review logs) using simple YAML code blocks.

Chrono Analyzer code blocks are **100% reactive**—they subscribe to your vault's `EventCache` and update their charts instantly when events are created, modified, or deleted, providing real-time data insights scrollbar-free.

---

## 1. Parameters & Configuration

Embed an analytical widget by writing an `fc-analysis` code block:

````yaml
```fc-analysis
chart: sunburst          # sunburst, pie, time-series, activity
metric: duration          # duration (total hours) or count (total event occurrences)
height: 350px             # Custom height (e.g., 350px, 400px)
width: 100%               # Custom width (e.g., 100%, 500px)
```
````

### Chart-Specific Options

Depending on the `chart` type, you can supply additional options to customize the layout and aggregations:

#### A. Sunburst Chart (`chart: sunburst`)
Aggregates time-tracking data into interactive hierarchical rings. Clicking an inner ring drills down into its details.
* `level`: The breakdown layer.
  * `project` (default): Groups projects inside folder hierarchies.
  * `subcategory`: Groups subprojects inside parent projects.

#### B. Pie Chart (`chart: pie`)
Categorizes time-tracking events into standard slice breakdowns.
* `breakdownBy`: The TimeRecord field to partition slices by.
  * `hierarchy` (default): Folders / calendars.
  * `project`: Event titles.
  * `subproject`: Parsed event subprojects.

#### C. Time-Series Trends (`chart: time-series`)
Plots your productivity over time.
* `granularity`: The time bucket size (`daily`, `weekly`, `monthly`).
* `type`: The series layout style.
  * `line` (default): Simple overall trend line.
  * `stackedArea`: Areas stacked vertically by categories.
* `stackBy`: What field to stack areas by (`hierarchy`, `project`, `subproject`).

#### D. Activity Heatmap (`chart: activity`)
Displays when you are most active.
* `patternType`: The time focus.
  * `dayOfWeek`: Column bar chart grouping by Monday-Sunday.
  * `hourOfDay`: Line chart grouping by hours (0-23).
  * `heatmapDOWvsHOD`: Full 2D weekly grid heatmap matching hours vs days of the week.

---

## 2. Advanced Sizing, Filtering & Styles

### Safe Scoped Styles (`styles`)
You can fully customize the look of each embedded chart by passing a style overrides dictionary under `styles`. These properties are safely scoped to this specific chart widget:

```yaml
styles:
  --fc-event-bg-color: "#7b2cbf"   # Event primary color
  --fc-border-color: "#3c096c"     # Grid borders line color
  fontSize: "12px"                 # Chart typography size
  borderRadius: "8px"              # Grid edge corners
```

### Metadata & Content Filters
Limit the analysis strictly to a subset of events:
* `titleFilter`: Case-insensitive title match (e.g. `"Focus"`).
* `tagFilter`: Only include events tagged with a specific tag (e.g. `"#milestone"`).
* `pathFilter`: Only include events defined under a folder path (e.g. `"Work/Sprints/"`).
* `startDate` / `endDate`: Limit analysis to a specific date window (format: `YYYY-MM-DD`).

---

## 3. Copy-Paste Dashboard Examples

Here are three premium dashboards you can copy and paste directly into your notes.

### Example A: Sprint Review Sunburst
Embed this inside a specific project hub. It filters your calendars to display *only* files under your project's folder, showing a subproject drilldown sunburst:

````yaml
```fc-analysis
chart: sunburst
level: subcategory
metric: duration
pathFilter: "Projects/Sprint-Alpha/"
height: 400px
```
````

### Example B: Category Time-Series Stack
Create a gorgeous trend stack in your Weekly Review notes showing how much time you spent per calendar/folder this month:

````yaml
```fc-analysis
chart: time-series
type: stackedArea
stackBy: hierarchy
granularity: daily
metric: duration
startDate: "2026-05-01"
endDate: "2026-05-31"
height: 380px
```
````

### Example C: Productivity Weekly Heatmap
Identify your most active working hours on your homepage dashboard:

````yaml
```fc-analysis
chart: activity
patternType: heatmapDOWvsHOD
metric: count
height: 300px
```
````
