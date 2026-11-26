# Commands and Shortcuts

This page lists user-facing commands and high-value shortcuts.

## Command Palette Commands

Open command palette with Ctrl/Cmd + P and search for these commands:

- **`Full Calendar: New Event`** — The **[Natural Language Orchestrator](../features/nlp.md)**. Use this for almost everything: creating events, navigating views, and syncing data.
- `Full Calendar: Open Calendar` — opens the main [Calendar View](../views/index.md)
- `Full Calendar: Open in sidebar` — opens the [Sidebar View](../views/index.md)
- `Full Calendar: Reset Event Cache` — performs a deep reload (see [Data Integrity](../reference/data_integrity.md))
- `Full Calendar: Revalidate remote calendars` — refreshes [Remote Sources](../calendars/index.md)
- `Full Calendar: Open Chrono Analyser (Desktop Only)` — launches the [Chrono Analyser](../chrono_analyser/introduction.md)

Conditional command:

- `Open tasks backlog` (appears when a [Tasks provider](../calendars/tasks-plugin-integration.md) is configured)

## Shortcuts and Fast Actions

- Left/Right arrow keys: [navigate](../views/index.md) to previous or next time range when the calendar is focused.
- Arrow keys in text fields stay native (cursor movement) and do not trigger calendar navigation.
- Ctrl/Cmd + click on an event: [open the event's source note](../events/manage.md).
- Ctrl/Cmd + mouse wheel: [zoom time grid](../views/index.md) in supported calendar views.
- Right-click on an event: open [event context menu](../events/hover_context.md).
- Right-click on date/view area: open [date navigation](../views/index.md) context menu.

## Where this behavior comes from

These interactions are defined in the calendar view implementation and command registration.  
See [Interactions and Gestures](../features/interactions.md)  |   [Event Management](../events/manage.md)  | [Troubleshooting](troubleshooting.md)  
