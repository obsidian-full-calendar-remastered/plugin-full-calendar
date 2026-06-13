# Full Note Calendar

This is the most powerful and flexible calendar type. Each event is a separate note in your Obsidian vault, allowing you to add extensive notes, tasks, and links directly related to an event.

Events are defined by the YAML frontmatter at the top of the note. The plugin manages this frontmatter when you [create or edit events](../events/manage.md) in the calendar view.

The note's filename is also managed by the plugin to ensure it's easy to find, typically in the format `<YYYY-MM-DD> <Event title>.md`.

!!! success "Best for..."
    Users who want to treat events as first-class notes, adding rich context like meeting agendas, personal reflections, or related tasks. This is the only calendar type that supports all features, including multi-day events.

!!! tip "Power Up with Categories"
    Full Note calendars work seamlessly with the **[Advanced Categories](../events/categories.md)** feature, allowing you to color-code your events and organize them for timeline views. It's highly recommended!

## Setup

1.  In Full Calendar settings, add a new calendar source.
2.  Select the type **Full Note**.
3.  Choose an existing folder in your vault where your event notes will be stored.
4.  Optionally, specify a custom event note template in the template text box.

![Add Full Note Calendar](../../assets/calendars/add-calendar-source.gif)

### Event Notes Templating

You can define a custom Markdown template to automatically populate the body content of newly created event notes inside your Full Note calendar directory. This template uses double-braced placeholders (e.g., `{{title}}`, `{{date}}`, etc.) to embed event metadata.

For details on syntax, list of placeholders, and default layouts, see the **[Note Templating System Guide](../features/templates.md)**.

## Frontmatter Schema

When you create or edit an event note, the plugin manages its YAML frontmatter. The standard schema supports the following fields:

| Key | Type | Description |
| --- | --- | --- |
| `title` | String | The clean title of the event (excluding any category prefixes). |
| `category` | String | The optional category tag. |
| `location` | String | The optional location or address string (e.g., `Office Room 4B`). |
| `description` | String | A multiline description/notes block. |
| `allDay` | Boolean | True for all-day events. |
| `date` | Date | The event date in `YYYY-MM-DD` format. |
| `startTime` | Time | Start time for timed events (`HH:mm`). |
| `endTime` | Time | End time for timed events (`HH:mm`). |
| `timezone` | String | The source timezone anchor (e.g., `America/New_York`). |

---

## Filename conventions and duplicates

- Each event is stored as one Markdown file whose filename is derived from the event date and title. When Advanced Categories are enabled, the category/subcategory prefix is included in the filename.
- Invalid filename characters are sanitized (e.g., `:/\\*?"<>|` are replaced with spaces, consecutive spaces collapsed).
- Because filenames must be unique within the folder, two events with the same date and same final title resolve to the same filename and cannot both exist. Practically, this means:
    - Two single-day events on the same date with the same title are not allowed in the same Full Note calendar folder.
    - Recurring events use descriptive filenames (e.g., `(Every M,W) Title.md` or `(Every year on Jan 5) Title.md`) and will also be unique per series.

When creating or editing from the modal, the plugin performs a duplicate check and will block creation if a file with the target filename already exists.

---

## Timezone handling (Full Note)

- Full Note events are anchored to a specific timezone via the `timezone` field in frontmatter.
- When reading legacy notes that lack `timezone`, the plugin auto-upgrades them by writing your current display timezone into frontmatter to preserve accurate conversions.
- All times are converted to your chosen Display Timezone for viewing. See [Timezone Support](../events/timezones.md).

---

## Multiple Full Note Calendars with overlapping folders

When you configure multiple Full Note calendars with nested directory structures (e.g., `Events/` and `Events/Work/`), the plugin uses a **specificity-based ownership model** to prevent duplication:

**Rule**: The calendar with the **most specific (deepest) folder path** claims ownership of events in that folder.

**Example**:
```
- Calendar 1: Events/
- Calendar 2: Events/Work/
```

- Files in `Events/Work/` → Calendar 2 (more specific)
- Files in `Events/` (but not in a subdirectory) → Calendar 1

This ensures each event belongs to exactly one calendar, even if multiple calendars could technically "see" the same file.

---

## Moving events between calendars

- Moving events between calendars is currently supported only between Full Note calendars.
- Moving to or from a Daily Note calendar is not supported.

---

## Task Completion Style

When you mark a task complete in a Full Note calendar, the plugin updates the frontmatter's `completed` field. You can configure which style you prefer under the calendar settings:

*   **ISO Date/Time String** (Default): Saves the completion date and time as an ISO string (e.g. `completed: 2026-06-13T14:02:48+02:00`). This is recommended because it preserves exact completion timestamps.
*   **Boolean**: Saves completion as a standard YAML boolean (`completed: true` when checked, `completed: false` when unchecked). Use this style if you manually edit your frontmatter or use other metadata-based plugins (such as Dataview or Metadata Menu) that expect simple boolean properties.
