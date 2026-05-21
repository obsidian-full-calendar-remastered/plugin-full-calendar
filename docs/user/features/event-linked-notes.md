# Event Linked Notes

!!! abstract "Feature Overview"
    Take rich, local markdown notes for all your remote calendar events! **Event Linked Notes** allow you to connect a dedicated, local markdown note inside Obsidian to any event from your remote calendars (such as **Google Calendar**, **CalDAV**, **ICS**, or **Outlook**). Organize meeting agendas, track action items, and store private references—all while keeping your external calendars cleanly synchronized.

---

## How It Works: The User Workflow

When you click on a remote calendar event in Obsidian, the event details modal opens.

1. **Open Note**: Click the **Open Note** button in the top-right corner of the event modal. If no linked note exists yet, one will be created automatically in your configured directory.
2. **Automated Templating**: The new note is populated with rich event details (date, time, location, description, calendar name) according to your template.
3. **Instant Access**: On subsequent clicks, the same note is opened — the plugin uses frontmatter-based identity matching to find the existing note, so you'll never get duplicates.

---

## Configuration Settings

Go to **Settings → Calendars** to set up the default behavior. The Linked Note Settings section appears at the top of the Calendars tab.

### 1️⃣ Linked Notes Directory
Choose the folder inside your Obsidian vault where all newly created event notes will be stored (e.g., `Meetings` or `Inbox/Calendar`). Use the folder dropdown to select an existing folder. If the folder does not exist, it will be automatically created upon the first note generation.

### 2️⃣ Linked Note Template
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

---

## Privacy & Robustness Invariants

!!! success "Privacy First"
    All event notes reside **locally** in your Obsidian vault. They are never sent to external servers (like Google or CalDAV host servers). Your private thoughts, notes, and tasks remain strictly yours.

!!! info "Robust Link Preservation"
    The link between your note and the remote event is stored via lightweight parameters inside the note's YAML frontmatter:
    ```yaml
    fc-event-uid: 0q5u45oijpqnkljsndpfoiash98
    fc-calendar-id: google-calendar-work
    ```
    Because of this metadata-driven design:
    * **Rename Safe**: You can rename your note files or move them between directories inside your vault; the calendar will never lose the link.
    * **Re-sync Safe**: If you disconnect your calendar and add it back, or clear the local calendar cache, the plugin reactively re-indexes the frontmatter and restores the link immediately.
    * **No Vault Bloat**: We only add these two simple IDs to the frontmatter, keeping the rest of your note completely customizable and clean.
    * **No Duplicates**: The plugin checks for existing notes before creating new ones, so pressing "Open Note" multiple times always opens the same file.

---

[Google Calendar Setup](../calendars/gcal.md) · [CalDAV Setup](../calendars/caldav.md) · [Technical Architecture](../../architecture/system/features/event-linked-notes.md)
