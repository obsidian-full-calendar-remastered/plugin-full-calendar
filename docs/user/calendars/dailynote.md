# Daily Note Calendar

Store events in-line in Daily Notes. Each event is a list item. Timed events can be written either with [Dataview inline fields](https://blacksmithgu.github.io/obsidian-dataview/data-annotation/) or in a strict DayPlanner-style prefix, depending on the format selected when you add the Daily Note calendar source.

[Tasks](../events/tasks.md) are supported with [checkboxes](https://help.obsidian.md/How+to/Format+your+notes) so you can easily track your to-dos for the day.

!!! tip "Power Up with Categories"
    Daily Note calendars also support **[Advanced Categories](../events/categories.md)**. You can add a category to your task list items (e.g., `- [ ] Work - Finish report`) to color-code your daily agenda.

## Prerequisites

You must be using one of the supported daily notes plugins in order to create a daily note calendar:

-   [Daily Notes core plugin](https://help.obsidian.md/Plugins/Daily+notes)
-   [Periodic Notes community plugin](https://github.com/liamcain/obsidian-periodic-notes)
-   [Journals community plugin](https://github.com/srg-kostyrko/obsidian-journal) with a **Day** journal configured

## Configuring the Daily Notes calendar

Add a new calendar with the "Daily note" type, then choose:

- the note provider: Daily Notes / Periodic Notes, or Journals
- the Day journal to use when Journals is selected
- which heading from your daily note template events should be placed under
- which write format timed events should use

Journals is optional. When selected, Full Calendar asks the chosen Day journal to resolve and create entries, preserving its normal folder, filename, template, and journal frontmatter behavior. Obsidian's core Daily Notes plugin can be disabled in this setup.

If your template does not have any headings, then you can enter free-form text to specify the heading that events will be placed under.

If a heading does not exist in a daily note, it will be appended to the end of the file before adding any events to it.

Timed events support two write formats:

- Default: `- Learning - Reading - Grocery Run [uid:: 2]  [timezone:: Europe/Budapest]  [startTime:: 02:30]  [endTime:: 03:30]  [location:: Library]  [description:: Bring library card]`
- DayPlanner Format: `- 02:30 - 03:30 Learning - Reading - Grocery Run [uid:: 2]  [timezone:: Europe/Budapest]  [location:: Library]  [description:: Bring library card]`

The default format remains the inline-field layout.

The chosen format applies to new event creation and later edits written through that Daily Note source. If you want a different write format later, remove the Daily Note source and add it again with the other option. This does not change your existing notes by itself.

Note that only one daily note calendar can be active at a time.

![Daily note inline event parsing walkthrough](../../assets/calendars/dailynote.gif)

---

## Limitations and behavior nuances

- Recurring events cannot be created or edited in Daily Notes. Use a Full Note calendar for recurring series.
- Multi-day single events (with an `endDate`) are not supported in Daily Notes.
- Duplicate titles on the same day are not allowed. The editor will warn if another item under the heading already has the same visible title for that date.
- Only one Daily Note calendar source is supported at a time in settings.
- Parsing remains backward-compatible across both timed-event formats. Full Calendar first prefers inline `[startTime::]` and `[endTime::]` fields, then falls back to the strict `HH:mm - HH:mm Title` DayPlanner prefix if those fields are absent.

---

## Multiple Daily Note Calendars

Daily Note calendars have a single-instance limitation: only one Daily Note calendar source can be active at a time in settings. This prevents conflicts when parsing and writing to daily notes.

If you need multiple calendar sources from notes, consider using [Full Note calendars](local.md) instead, which support multiple instances with nested folder structures.

---

## Timezone handling (Daily Notes)

Daily Note calendars support two modes, configurable in Settings → General → Daily note timezone:

- Local (default): Event times are interpreted relative to your computer's current timezone and are not stamped into the line.
- Strict: Event times are stamped with the current Display Timezone and are treated as anchored timestamps when written back.

In both modes, events are rendered in the Display Timezone you choose for the calendar view.

---

## Navigation to Daily Notes

If the **Open daily note on date click** option is enabled in **Settings → General**, you can left-click directly on date headers in Week/Day views and the day number cushion in Month view to open (or create) the corresponding daily note file.

Left-clicking on the main day cell body in Month view will continue to open the "Create Event" modal.
