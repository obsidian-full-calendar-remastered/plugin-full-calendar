# Obsidian Bases Calendar (Deprecated)

!!! warning "Deprecated"
    The standalone **Obsidian Bases calendar provider** is deprecated and will be removed in the next major version. 
    
    Instead, please migrate your event files to a **[Local Folder calendar](local.md)** and use the new **[Workspaces Advanced Bases Filtering](../views/workspaces.md)** to dynamically filter your events.

Use your Obsidian **Bases** tables as a read-only calendar source. This provider reads a `.base` file, applies the Base filters to your vault, and turns matching notes into calendar events.


!!! tip "Power Up with Categories"
    Bases calendars also support **[Advanced Categories](../events/categories.md)**. You can add a `category` key to your note frontmatter to automatically color-code it based on your plugin settings.


---

## Requirements

- Obsidian **Bases** core plugin enabled
- A `.base` file in your vault (created via Bases) with filters that select the files you want to see as events
- Each matching note must include date metadata in its frontmatter

---

## Adding a Bases calendar

1. Enable the **Bases** core plugin in Obsidian (Settings → Core plugins → Bases).
2. Create or open a `.base` file that describes the notes you want to surface. (See filter tips below.)
3. In Full Calendar settings → Calendars, click **Add calendar** and choose **Bases**.
4. Pick your `.base` file from the dropdown, optionally rename it, and save. The provider will load immediately.

If the Bases plugin is disabled, Full Calendar will prompt you to enable it before adding the source.

---

## How events are built

For each file selected by your Base:

- **Date / time:** pulled from frontmatter keys `date`, `start`, `startTime`, or `due` (first match). If none are present, the note is skipped.
- **Title:** `title` frontmatter, otherwise the note filename.
- **Category / subcategory:** taken from `category`/`Category` and `sub category`/`subCategory` frontmatter. The title is expanded to `Category - Subcategory - Title` when present.
- **All-day:** defaults to `true` unless `allDay` frontmatter is provided.
- **Type:** defaults to `single` unless you set `type` in frontmatter.
- **UID / navigation:** the event UID is the note path so you can jump back to the note.

Events from Bases are **read-only** in the calendar. Edit the underlying note to change the event.

---

## Filter tips

The provider currently supports a subset of Bases filters evaluated against each file:

- Logical operators: `and`, `or`, `not`
- Simple statements:
  - `file.hasTag("tag")`
  - `file.inFolder("path/")`
  - `file.ext == "md"`

Example `.base` snippet to only include markdown notes in `Projects/Events` tagged `#calendar`:

```yaml
filters:
  and:
    - 'file.inFolder("Projects/Events")'
    - 'file.hasTag("calendar")'
    - 'file.ext == "md"'
```

If no filters are defined, all vault files are considered.

---

## Limitations

- Read-only: create/edit/delete from calendar is not yet supported.
- Recurrence is not inferred; use explicit recurrence metadata if you need repeats.
- The filter evaluator is intentionally simple and may not cover all Bases expressions; stick to tags, folder checks, and file extension checks for best results.

---

## Troubleshooting

See the **[Central Troubleshooting Guide](../guides/troubleshooting.md#bases-calendar)** for help with missing events, filtering issues, or category coloring.

For more about Bases, see the official help: https://help.obsidian.md/bases
