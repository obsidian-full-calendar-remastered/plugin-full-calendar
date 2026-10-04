# Interactions and Gestures

This page documents direct interactions in the calendar UI.

## Mouse and Trackpad

- Click empty date/time slot: create event.
- With **Settings → General → Open daily note on date click** enabled, click a date label or day number to open that day's Obsidian daily note, creating it from your configured daily-note template when necessary.
- With the same option enabled, hover a date label or day number to preview an existing daily note with Obsidian's Page Preview popover. Hovering never creates a missing note.
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
- Ctrl/Cmd + click event: open the associated note directly. For remote events (Google, CalDAV, Outlook, ICS) this also **creates** the linked note when none exists yet, then opens it.
- Ctrl/Cmd + hover event: trigger note preview (requires Obsidian Page Preview support).
- Ctrl/Cmd + mouse wheel: zoom the time axis for supported views.

## Date Links and Daily Notes

Calendar date links use the same Daily Notes integration as Obsidian. The filename, folder,
date format, and template therefore come from the active **Daily Notes** core plugin or the
supported **Periodic Notes** configuration; Full Calendar does not guess a path of its own.

| Calendar surface | Interactive target | Left click | Hover |
| --- | --- | --- | --- |
| Month | Day number, such as `9` | Open/create the daily note | Preview it when it exists |
| Week | Column date, such as `Mon 7/9` | Open/create the daily note | Preview it when it exists |
| Day | Date column header | Open/create the daily note | Preview it when it exists |
| 3-day | Each date column header | Open/create the daily note | Preview it when it exists |
| List | Either date in each day heading | Open/create the daily note | Preview it when it exists |

Only the visible date label is a daily-note link. The rest of a Month-view day cell retains
its normal event-creation or mobile-selection behavior. Right-click also retains Full
Calendar's date navigation menu.

First enable **Open daily note on date click** in Full Calendar's General settings. Page
Preview must also be enabled in Obsidian for hover popovers to appear. If the note does not
exist yet, there is no content to preview and hover deliberately does nothing. Click once to
create the note; subsequent hovers can then preview its contents. Turning off **Open daily
note on date click** disables both navigation and preview behavior on these date labels.

## Zoom Levels

The time grid supports multiple zoom levels and adjusts slot duration and label interval.

Typical progression in standard time-grid views:
- 1 hour
- 30 minutes
- 15 minutes
- 5 minutes

## Mobile Navigation

- On mobile, the month view uses compact event markers to reduce clutter while still keeping per-day occupancy visible.
- Supported day and 3-day views accept pinch-to-zoom gestures for faster density changes.
- Layout switching is grouped into the mobile `More` menu so the main toolbar stays readable on narrow screens.

## Context Menu Actions

Editable events include:
- Turn into task / Remove checkbox
- **Open linked note** — shown for remote events whose provider supports linked notes (Google, CalDAV, Outlook, ICS, Holidays). Creates the note on first use, opens it on subsequent uses.
- Go to note — shown for local note events (frontmatter / daily note sources).
- Delete

## Opening Linked Notes — Smart Tab Reuse

All paths that open a linked note (Ctrl/Cmd+click, context menu, event popup note button) share the same behaviour:

- **Existing tab reused**: if the note is already open in a tab, that tab is focused and brought to the front — no duplicate tabs.
- **Fresh tab for new notes**: a brand-new note (just created) always opens in a new tab, because it cannot already be open.
- **Recurring events**: the correct per-instance note is resolved automatically in both link strategies (deadline-based and name-based).

See also: [Hover and Context Menu](../events/hover_context.md)
