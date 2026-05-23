# Embedded Code Block Calendars

The **Full Calendar Code Block Processor** allows you to embed fully interactive schedules, monthly grids, or agenda lists directly inside any Obsidian note (such as dashboards, daily logs, or project homepages).

---

## 1. The Building Blocks (Configuration)

Embed a calendar by writing a custom `fc-calendar` code block using simple YAML options:

````yaml
```fc-calendar
view: timeGridWeek         # View type: dayGridMonth, timeGridWeek, timeGridDay, listWeek, listMonth
height: 400px              # Set custom height (e.g., 400px, 100%, or 'fit' to adjust automatically)
width: 100%                # Custom width (e.g., 100%, 300px)
defaultDate: auto          # auto (detects Daily Note date), today, or a specific date YYYY-MM-DD
header: true               # Show or hide the navigation header toolbar (true/false)
calendars:                 # Optional: filter to specific calendar source IDs
  - "personal"
  - "work-tasks"
titleFilter: "Meeting"     # Optional: only show events containing "Meeting" in their title
pathFilter: "Projects/"    # Optional: only show events defined in files under the "Projects/" folder
tagFilter: "#focus"        # Optional: only show events tagged or matching "#focus"
zoomLevel: 0               # Optional: Preset zoom level (0 to 3) for vertical time grid axis
slotDuration: "00:15:00"   # Optional: Fine-grained slot duration (HH:MM:SS)
slotLabelInterval: "00:30:00" # Optional: Fine-grained axis label interval (HH:MM:SS)
```
````

### Advanced Sizing & Zooming
#### Height Control (`height: fit`)
If you specify `height: fit`, the calendar will automatically adjust its vertical size to fit all rendered events exactly. This collapses any unnecessary empty spaces and removes internal scrollbars, making it blend seamlessly into your notes.

#### Vertical Time Grid Zoom Controls
For time grid views (like `timeGridWeek`, `timeGridDay`, and `timeGrid3Days`), you can customize the zoom level of the time-axis. This controls the height and intervals of the hourly grid, letting you bring your schedule into view without a scrollbar:

1. **Preset Zoom Level (`zoomLevel`)**: An integer from `0` (most zoomed out / compact) to `3` (most zoomed in / detailed).
   - `0`: 1-hour slots (Super compact - great for fitting the entire day in a single scroll-free panel!)
   - `1`: 30-minute slots (Default)
   - `2`: 15-minute slots (Detailed)
   - `3`: 5-minute slots (Extremely detailed)

2. **Granular Control (`slotDuration` & `slotLabelInterval`)**: Pass custom durations (in `HH:MM:SS` format) directly for maximum flexibility.
   - `slotDuration`: The duration of each grid slot (e.g., `"00:15:00"` for 15 minutes).
   - `slotLabelInterval`: The interval at which time labels are displayed on the axis (e.g., `"01:00:00"` for every hour).

#### Scoped Style Customizations (`styles`)
You can fully customize the look and feel of each embedded calendar by specifying a list of style overrides under `styles`. These are safely scoped and applied as inline style custom properties on the calendar container, so they will never leak or interfere with other elements of Obsidian's UI:

* **Custom FullCalendar CSS variables**:
  * `--fc-event-bg-color`: The background color of the event cards (e.g. `"#7b2cbf"`).
  * `--fc-event-border-color`: The border color of the event cards (e.g. `"#9d4edd"`).
  * `--fc-event-text-color`: The text color of events (e.g. `"#ffffff"`).
  * `--fc-border-color`: The grid lines and calendar border color (e.g. `"#3c096c"`).
  * `--fc-today-bg-color`: The background highlight for today (e.g. `"rgba(255, 255, 255, 0.05)"`).
* **Standard CSS properties**:
  * `fontSize`: Adjust font size within the widget (e.g., `"12px"`).
  * `borderRadius`: Round event cards and border grid corners (e.g., `"6px"`).

````yaml
```fc-calendar
view: timeGridWeek
height: 400px
styles:
  --fc-event-bg-color: "#7b2cbf"
  --fc-event-text-color: "#ffffff"
  --fc-border-color: "#3c096c"
  fontSize: "12px"
```
````

#### Transposed Horizontal Views (Horizontal Time Axis)
If you want to view your schedule transposed horizontally—where hours and days of the week are displayed as horizontal columns and categories or calendars are shown as vertical lanes—you can utilize the timeline views:

* `resourceTimelineWeek`: Transposed weekly schedule.
* `resourceTimelineDay`: Transposed daily schedule.

Timeline views utilize the category hierarchy, automatically placing events in their corresponding category lanes and grouping them visually.

````yaml
```fc-calendar
view: resourceTimelineWeek
height: 350px
```
````

---

## 2. Multi-View Dashboards (Layouts)

You can mix-and-match multiple calendars and layouts side-by-side or stacked columns inside a single code block container by utilizing the `layout` configuration block:

````yaml
```fc-calendar
layout:
  orientation: horizontal  # horizontal (side-by-side) or vertical (stacked)
  views:
    - view: timeGridWeek
      width: 40%           # Custom column width (e.g., percentages or pixels)
      header: false        # Hide navigation for a cleaner column look
      calendars:
        - "work"
    - view: dayGridMonth
      width: 60%
      header: true
```
````

---

## 3. Creative Dashboards & Workflows (Copy-Paste Examples)

Here are three premium dashboards you can copy and paste directly into your notes.

### Example A: The Ultimate Daily Planning Dashboard
Perfect for embedding at the very top of your **Daily Note**. It displays today's hourly schedule on the left (automatically locked to today's date), and a clean list of all upcoming work items on the right:

````yaml
```fc-calendar
layout:
  orientation: horizontal
  views:
    # Column 1: Daily Schedule
    - view: timeGridDay
      width: 50%
      height: 450px
      defaultDate: auto    # Automatically locks to the date of your Daily Note!
      header: false
      calendars:
        - "personal-schedule"
        - "daily-notes"

    # Column 2: Weekly Work Focus list
    - view: listWeek
      width: 50%
      height: 450px
      header: true
      calendars:
        - "work-tasks"
      titleFilter: "Focus" # Only show tasks focusing on key projects
```
````

### Example B: The Command Center Homepage
Create a gorgeous, clean dashboard on your homepage. It layouts a mini monthly overview next to your upcoming weekly schedule, filtered specifically to exclude busy-work:

````yaml
```fc-calendar
layout:
  orientation: horizontal
  views:
    # Mini Month Overview
    - view: dayGridMonth
      width: 65%
      height: 500px
      header: true
      calendars:
        - "personal"
        - "work"

    # Upcoming Weekly Agenda
    - view: listWeek
      width: 35%
      height: 500px
      header: false
      tagFilter: "#milestone" # Shows only critical milestones!
```
````

### Example C: The Project & Sprint Planner
Embed this inside a specific project hub. It filters your calendars to display *only* files under your project's sub-folder, rendered using a horizontal weekly schedule that expands to fit its content:

````yaml
```fc-calendar
view: timeGridWeek
height: fit                # Auto-collapses height to fit the events perfectly
header: true
pathFilter: "Projects/Sprint-Alpha/" # Shows only events linked to this folder!
````
