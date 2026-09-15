# Daily-note Date Navigation

Calendar date labels are adapters between FullCalendar's rendered DOM and Obsidian's Daily
Notes and Page Preview APIs. The implementation intentionally separates read-only note
resolution from note creation so pointer movement cannot mutate the vault.

## Data flow

1. FullCalendar calls `dayHeaderDidMount` for time-grid and list headers and
   `dayCellDidMount` for month-grid cells.
2. `renderCalendar` selects only `.fc-col-header-cell-cushion` or
   `.fc-daygrid-day-number`. It marks the element as bound so repeated renders cannot attach
   duplicate listeners.
3. A left click stops FullCalendar's selection handler and calls `openDailyNoteForDate`.
4. `openDailyNoteForDate` resolves the note through `obsidian-daily-notes-interface`. If no
   file exists, it calls `createDailyNote`, then opens the resulting `TFile` in the current
   workspace leaf.
5. A mouseover calls `getDailyNoteForDate`, which only searches the daily-note index. When a
   file exists, the calendar emits Obsidian's `hover-link` workspace event with the date
   element as `targetEl` and the calendar container as `hoverParent`.

## Behavioral invariants

- Hover resolution must never call `createDailyNote`.
- Creation must be delegated to `obsidian-daily-notes-interface`; constructing paths in the
  calendar would bypass folder, format, template, and Periodic Notes compatibility.
- A missing or unloaded Daily Notes integration is a no-op, not an event-creation fallback.
- Only date-label cushions are bound. Month cell bodies remain available to create events,
  and right clicks remain available to date navigation.
- Binding follows the existing opt-in `openDailyNoteOnDateClick` setting. Its default remains
  disabled, while an explicit user choice survives settings migration.
- Page Preview is optional. Errors from the `hover-link` integration are isolated from the
  calendar renderer.

## Test coverage

`openDailyNote.test.ts` verifies existing-note opening, missing-note creation, unavailable
plugin handling, and the non-creating resolver used by hover. Settings migration tests verify
that the established opt-in default and an explicit enabled preference are preserved.
