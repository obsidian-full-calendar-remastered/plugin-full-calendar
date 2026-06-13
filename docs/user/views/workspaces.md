# Calendar Workspaces

Save and switch between customized calendar setups with Workspaces. A workspace captures your current calendar configuration so you can quickly jump between different contexts like Planning, Personal, or Team.

## What is saved in a Workspace

- Selected calendar sources (Local, [Daily Notes](../calendars/dailynote.md), ICS, CalDAV, [Google](../calendars/gcal.md))
- Filters: [categories](../events/categories.md)/sub-categories, tasks visibility, all‑day toggles
- Display options: view type (month/week/day/[timeline](timeline_view.md)), week start, time grid settings
- Optional: default start date range for the view

## Create and manage

1. Configure the calendar as you like (sources, filters, view).
2. Open the header menu and choose Save as Workspace.
3. Give it a name (e.g., "Planning", "Deep Work").
4. Use the workspace switcher in the header to load it later.

Tips:
- Set a Default Workspace in Settings to load it when opening the calendar.
- Rename or delete workspaces from the same menu.

## Filtering and quick switching

- Per‑workspace filters for categories and sources let you focus on what matters.
- Switch workspaces instantly from the header dropdown; switching is optimized to avoid full re‑renders.

## Keyboard and commands

- Command Palette: "Full Calendar: Switch Workspace" to pick one quickly.
- Optional hotkeys can be assigned per workspace via Obsidian’s Hotkeys.

## Performance notes

Workspace switching applies incremental updates where possible (sources, filters, and view) to keep transitions snappy even on large calendars.

## Advanced Bases Filtering

For advanced workflows, you can apply Obsidian Bases query logic directly to a workspace. This acts as an overlay filter on top of the workspace's configured calendar sources.

### Setting Up Bases Filtering

1. In the **Workspaces** settings tab, click **Edit** on your workspace.
2. In the **Advanced Bases Filtering** section, enter the path to your `.base` file (e.g., `queries/work.base`).
3. Click **Save**.

Once configured, the calendar will automatically parse the `.base` file and hide any events whose underlying notes do not match the Base's YAML filters.

### Supported Filter Syntax

The workspace filter evaluator supports the standard Obsidian Bases query rules:

- **Logical Groups**: `and`, `or`, `not`
- **File Toggles**:
    - `file.hasTag("tag")`
    - `file.inFolder("folder")`
    - `file.ext == "md"`
- **Metadata Properties**:
    - Equals comparison: `status == "done"`
    - Existence check: `priority` or `date`

!!! note "Performance Optimization"
    To keep UI transitions fast and snappy, the workspace's `.base` filter file is read and parsed asynchronously when switching workspaces or opening the calendar. The filter is cached in memory and applied instantaneously to your events.

## Troubleshooting

- If a source isn’t visible, check that it’s enabled for the current workspace.
- Category filters are additive; clear them to see all events.
- You can always return to an "All Events" default workspace.
- **Bases Filtering Issues**: Verify that the `.base` file path is correct relative to the vault root, and ensure the `.base` file's YAML filters are valid.

