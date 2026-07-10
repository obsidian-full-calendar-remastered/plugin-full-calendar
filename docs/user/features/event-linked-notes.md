# Event Linked Notes

!!! abstract "Feature Overview"
    Take rich, local markdown notes for all your remote calendar events! **Event Linked Notes** allow you to connect a dedicated, local markdown note inside Obsidian to any event from your remote calendars (such as [Google Calendar](../calendars/gcal.md), [CalDAV](../calendars/caldav.md), [ICS](../calendars/ics.md), or [Outlook](../calendars/outlook.md)). Organize meeting agendas, track action items, and store private references—all while keeping your external calendars cleanly synchronized.

---

## How It Works: The User Workflow

When you click on a remote calendar event in Obsidian, the event details modal opens.

1. **Open Note**: Click the **Open Note** button in the top-right corner of the event modal. If no linked note exists yet, one will be created automatically in your configured directory.
2. **Automated Templating**: The new note is populated with rich event details (date, time, location, description, calendar name) according to your template.
3. **Instant Access**: On subsequent clicks, the same note is opened according to your selected link strategy. Name-based mode checks the exact title path first; deadline-based mode uses event and occurrence identity.

---

## Handling Recurring Events

The **Linked note link strategy** setting controls how recurring remote events and rescheduled task instances use notes:

* **Deadline-based** is the compatibility default. Each occurrence gets an instance-specific note.
* **Name-based** first checks for an exact title-matched file in the configured linked-notes folder. It opens that file when present, or creates it without a suffix when absent. Moving a task deadline or opening another occurrence continues to use the same note.

When name mode reuses an existing title-matched file, it adds or updates only the calendar ID and event UID properties; the existing body and unrelated properties remain unchanged. These stable frontmatter IDs preserve lookup after the note is later renamed or moved.

Name-based matching is folder-specific and exact after filename sanitization. For example, an event titled `Project / Launch` matches `Project Launch.md` inside the configured linked-notes folder. It does not search other folders or add collision suffixes such as `-_-_-1`.

In deadline-based mode:

* **Collision-Free Filenames**: Newly generated notes automatically append the occurrence date directly to the filename to avoid vault conflicts in your notes folder (e.g., `Weekly Sync 2026-05-20.md`).
* **Instance Frontmatter Identity**: The note's YAML frontmatter includes an additional field `fc-event-recurrence-id` specifying the exact date of that occurrence:
  ```yaml
  fc-event-uid: 0q5u45oijpqnkljsndpfoiash98
  fc-calendar-id: google-calendar-work
  fc-event-recurrence-id: "2026-05-20"
  ```
* **Smart Template Substitution**: The `{{date}}` placeholder in your note body template automatically resolves to the specific instance's date (e.g. `Wednesday, May 20, 2026`) instead of the series start date.

---

## Configuration Settings

Go to [Settings → Calendars](../settings/sources.md) to set up the default behavior. The Linked Note Settings section appears at the top of the Calendars tab.

### 1️⃣ Linked Notes Directory
Choose the folder inside your Obsidian vault where all newly created event notes will be stored (e.g., `Meetings` or `Inbox/Calendar`). Use the folder dropdown to select an existing folder. If the folder does not exist, it will be automatically created upon the first note generation.

### 2️⃣ Linked Note Link Strategy

Choose **Name-based** when a project, recurring series, or rescheduled task should keep one shared note. Exact matching uses the sanitized event title inside the configured linked-notes folder, so events with the same title intentionally share that note. Choose **Deadline-based** when every dated occurrence needs its own note. Changing this setting affects future lookup and creation; it does not rename or merge existing notes.

### 3️⃣ Linked Note Template
Write a custom template that will populate the body of every new note. You can use standard markdown and insert the following double-braced dynamic placeholders:

| Placeholder | Replaced With | Example Output |
|---|---|---|
| `{{title}}` | The title of the calendar event | `Brainstorming Session` |
| `{{date}}` | Localized long-form date | `Wednesday, May 20, 2026` |
| `{{timeString}}` | Start & end time or "All Day" | `10:00 AM - 11:30 AM` or `All Day` |
| `{{location}}` | The location of the event | `Meeting Room A` or `https://zoom.us/j/123...` |
| `{{url}}` | The primary URL link associated with the event | `https://zoom.us/j/123456789` |
| `{{description}}` | The full description / notes of the event | `Discuss next major features and UI remastering.` |
| `{{calendarName}}` | The name of the calendar source in Obsidian | `Work Calendar` |

#### Default Template Example
```markdown
# {{title}}

**Date**: {{date}}
**Time**: {{timeString}}
**Location**: {{location}}
**Calendar**: {{calendarName}}

## Description
{{description}}

## Notes
- 
```

### 4️⃣ Template Presets (Power Users)
If you require different layouts/templates for different types of events, enable the **Enable template presets** setting.

* **Decoupling from Default**: Enabling this setting hides the default "Linked note template" editor row. Instead, you configure one or more note files inside your vault to serve as your templates list.
* **Selection Modal**: When creating or linking a remote event note, Obsidian will display a modal prompting you to select which template preset to load the note with.
* **Configuration**: Select any existing markdown note in your vault via the dropdown to add it to your active presets list.

---

## Privacy & Robustness Invariants

!!! success "Privacy First"
    All event notes reside **locally** in your Obsidian vault. They are never sent to external servers (like Google or CalDAV host servers). Your private thoughts, notes, and tasks remain strictly yours.

!!! info "Robust Link Preservation"
    The link between your note and the remote event is stored via lightweight parameters inside the note's [YAML frontmatter](../reference/data_integrity.md):
    ```yaml
    fc-event-uid: 0q5u45oijpqnkljsndpfoiash98
    fc-calendar-id: google-calendar-work
    ```
    These IDs support reactive indexing and preserve the connection after a linked note is renamed or moved:
    * **Rename and Move Recovery**: After identity properties are attached, the reactive index can continue resolving a linked note that is renamed or moved within the configured linked-notes directory.
    * **Re-sync Recovery**: Clearing the local calendar cache does not remove the identity properties stored in the note.
    * **Minimal Changes**: Reusing an existing name-based note updates only managed identity properties. CalDAV task notes may additionally contain managed scheduled/due properties.
    * **Predictable Reuse**: Name-based mode intentionally shares one file between events with the same sanitized title in the configured folder. Deadline-based mode keeps dated occurrences separate.

---

### 📚 Related Resources

=== "Setup Guides"
    *   [Google Calendar Setup](../calendars/gcal.md) — Connect your Google account with two-way sync.
    *   [CalDAV Setup](../calendars/caldav.md) — Connect iCloud, Nextcloud, Fastmail, and other CalDAV servers.
    *   [ICS (Remote & Local)](../calendars/ics.md) — Link public web calendars or vault-relative `.ics` files.
    *   [Outlook Integration](../calendars/outlook.md) — Sync with Outlook/Exchange calendars.

=== "Technical Deep-Dives"
    *   [Event Linked Notes Architecture](../../architecture/system/features/event-linked-notes.md) — Decoupled reactive architecture and SOLID principles.
