# Calendar Workspaces

Workspaces allow you to save and switch between customized calendar setups. A workspace captures your current calendar configuration so you can quickly jump between different contexts like Planning, Personal, or Team.

---

## What is Saved in a Workspace

- **Calendar Sources**: Selected calendars (e.g. [Local Folder](../calendars/local.md), [Daily Notes](../calendars/dailynote.md), CalDAV, [Google Calendar](../calendars/gcal.md)).
- **Filters**: [Category overrides](../events/categories.md), tasks visibility, and all‑day event toggles.
- **Display Options**: View type (Month, Week, Day, or [Timeline](timeline_view.md)), week start day, and time grid settings.
- **Default Date**: The start date range loaded by default (e.g. `today`, `start-of-month`, etc.).

---

## Creating and Managing Workspaces

1. Configure the calendar view to your liking (enable sources, choose filters, set options).
2. Click the workspace switcher in the header and choose **Save as Workspace**.
3. Provide a name (e.g., "Planning", "Deep Work").
4. Select it from the workspace switcher dropdown in the header to load it instantly.

> [!TIP]
> You can set a **Default Workspace** in the plugin settings to load your favorite configuration automatically on startup.

---

## Advanced Bases Filtering

For power users, workspaces can be integrated with Obsidian **Bases** query files. Point a workspace to a `.base` file, and Full Calendar will dynamically filter event notes and override layout settings.

### Setting Up Bases Integration

1. Go to **Settings** → **Organization** → **Workspaces**.
2. Click **Edit** on your chosen workspace.
3. In the **Bases Query Path** field, enter the relative path to your `.base` file (e.g., `queries/planning.base`).
4. Click **Save**.

---

## The `.base` File Structure

A `.base` file is a YAML document with two optional top-level sections: `filters` and `settings`.

```yaml
filters:
  # Advanced logical event filters
  and:
    - 'file.inFolder("Projects/Phoenix")'
    - 'file.hasTag("meeting")'
    - 'priority >= 3'
settings:
  # Workspace layout and view overrides
  slotMinTime: "08:00"
  slotMaxTime: "18:00"
  weekends: false
```

### 1. Filters Syntax (`filters`)

Filters are evaluated against each calendar event file in your vault. They support nesting using logical operators:

| Operator | Description | Example |
| :--- | :--- | :--- |
| `and` | All nested conditions must evaluate to `true` | `and: [ 'file.ext == "md"', 'priority > 2' ]` |
| `or` | At least one nested condition must evaluate to `true` | `or: [ 'file.hasTag("work")', 'file.hasTag("urgent")' ]` |
| `not` | Negates the nested conditions | `not: [ 'status == "completed"' ]` |

#### Built-in File Properties
- **Tags**: `file.hasTag("tag_name")` checks if the note contains the tag (with or without `#`).
- **Folders**: `file.inFolder("folder/path")` checks if the note path starts with the directory.
- **Extension**: `file.ext == "md"` checks the file extension.

#### Context Variables
You can filter events based on calendar and category properties provided at runtime:
- `file.calendarId == "id"` (e.g. `file.calendarId == "local_1"`)
- `file.calendarName == "name"` (e.g. `file.calendarName == "Personal"`)
- `file.category == "category"` (e.g. `file.category == "Wellness"`)
- `file.subCategory == "subCategory"` (e.g. `file.subCategory == "Gym"`)

#### Frontmatter Metadata Properties
You can filter by any custom YAML frontmatter property:
- **Existence check**: Specify the property name alone (e.g. `status` or `priority`).
- **Equality comparisons** (`==`, `=`): Compares string, number, or boolean values.
  - `status == "done"` (String)
  - `isTask == true` (Boolean)
  - `priority == 3` (Number)
- **Inequality comparisons** (`>`, `<`, `>=`, `<=`, only for numbers):
  - `priority > 3`
  - `difficulty <= 2`

---

### 2. Workspace & View Overrides (`settings`)

You can customize almost all [Full Calendar Configuration](../settings/fc_config.md) options per workspace by adding them to the `settings:` block inside your `.base` file:

#### View Configuration
- `firstDay`: Starts the week on a specific day (`0` for Sunday, `1` for Monday, etc.).
- `timeFormat24h`: Toggle 24-hour time format (`true` / `false`).
- `displayTimezone`: Set a custom timezone (e.g., `America/New_York`).
- `clickToCreateEventFromMonthView`: Toggle creating events directly by clicking month slots.

#### Time & Slot Settings
- `slotMinTime`: Earliest time to display in day/week views (e.g., `"06:00"`).
- `slotMaxTime`: Latest time to display in day/week views (e.g., `"22:00"`).
- `slotDuration`: Grid slot duration (e.g., `"00:30:00"`).
- `slotLabelInterval`: Label interval (e.g., `"01:00:00"`).
- `allDaySlot`: Show/hide all-day event row (`true` / `false`).

#### Layout & Appearance
- `weekends`: Show/hide weekends (`true` / `false`).
- `hiddenDays`: Hide specific days (e.g., `[0, 6]` to hide weekends).
- `dayMaxEvents`: Max events displayed per day in month view (e.g., `3`, or `true` for unlimited).
- `enableBackgroundEvents`: Show/hide background events (`true` / `false`).
- `showEventInStatusBar`: Show currently active event in Obsidian status bar (`true` / `false`).
- `highlightCurrentOrNextEvent`: Highlight the current active event (`true` / `false`).
- `categorySettings`: Custom category color palette overrides:
  ```yaml
  categorySettings:
    - name: Work
      color: "#ff0000"
    - name: Wellness
      color: "#00ff00"
  ```
- `weatherHide`: Hide the weather widget for this workspace (`true` / `false`).

---

## Under the Hood

> [!NOTE]
> **Performance Optimization**
>
> To ensure instantaneous workspace switching, the workspace's `.base` file is parsed asynchronously when you open the calendar or switch workspaces. The parsed filter tree is cached in memory, ensuring that even with thousands of events, filtering remains fast and layout settings apply without lag.

## Troubleshooting

See the **[Central Troubleshooting Guide](../guides/troubleshooting.md#workspaces)** for help with missing events, category coloring overrides, or YAML formatting issues.
