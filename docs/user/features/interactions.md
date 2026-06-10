# Interactions and Gestures

This page documents direct interactions in the calendar UI.

## Mouse and Trackpad

- Click empty date/time slot: create event.
- Click a date label above a time-grid column: open or create that day's Obsidian daily note when the Daily Notes core plugin is enabled.
- Drag event: move event to a new day or time.
- Resize event edge: change event duration.
- Right-click event: open context actions.
- Right-click date or view area: open date navigation actions.
- Swipe left or right on the calendar grid (touch): move to next or previous range.

## Event Search (Toolbar)

- Use the search icon in the top toolbar (next to date navigation) to find events quickly.
- When inactive, only the icon is shown; clicking it expands the search input inline.
- Search filters events in-place across the current view and hides non-matching events.
- Press `Esc` to clear/collapse quickly, or use the clear button.
- When a search is active, the input shows a red glow so the filter state is obvious.

### Matching behavior

- Search is intentionally strict to reduce false positives.
- Exact/contiguous matches are prioritized.
- Small typos can still match for longer terms.
- Multi-word queries require each term to match.

## Keyboard Modifiers

- Left/Right arrow keys: previous or next range when the calendar view is focused.
- Arrow keys are ignored for calendar navigation while typing in inputs/editors.
- Ctrl/Cmd + click event: open note directly.
- Ctrl/Cmd + hover event: trigger note preview (requires Obsidian Page Preview support).
- Ctrl/Cmd + mouse wheel: zoom the time axis for supported views.

## Zoom Levels

The time grid supports multiple zoom levels and adjusts slot duration and label interval.

Typical progression in standard time-grid views:
- 1 hour
- 30 minutes
- 15 minutes
- 5 minutes

## Context Menu Actions

Editable events include:
- Turn into task / Remove checkbox
- Go to note
- Delete

See also: [Hover and Context Menu](../events/hover_context.md)
