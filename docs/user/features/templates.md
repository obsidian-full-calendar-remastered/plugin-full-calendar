# Note Templating System

The template engine allows you to define custom Markdown layouts for note generation in Full Calendar. Templates are supported for:
- **[Full Note Calendars](../calendars/local.md)**: Custom templates applied when creating new local calendar event notes in your vault.
- **[Event Linked Notes](event-linked-notes.md)**: Dedicated local Markdown notes associated with remote calendar events (such as Google Calendar, CalDAV, ICS, or Outlook).

---

## Supported Placeholders

You can use standard Markdown syntax along with dynamic placeholders wrapped in double curly braces `{{placeholder}}`. These will automatically be replaced with the event's actual metadata at the time of creation:

| Placeholder | Replaced With | Example Output |
| :--- | :--- | :--- |
| `{{title}}` | The title of the calendar event | `Interview - John Doe` |
| `{{date}}` | Localized long-form date | `Wednesday, May 20, 2026` |
| `{{timeString}}` | Start & end time or "All Day" | `10:00 AM - 11:30 AM` or `All Day` |
| `{{location}}` | The location of the event | `Room 302` or `https://zoom.us/...` |
| `{{url}}` | The primary URL link associated with the event | `https://github.com/YouFoundJK/...` |
| `{{description}}` | The full description / notes of the event | `Discuss next major features and UI remastering.` |
| `{{calendarName}}` | The name of the calendar source in Obsidian | `Work Calendar` |

---

## Default Template

If no custom template is specified, the system uses the following default layout:

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

## How to Configure

### 1️⃣ For Local Note (Full Note) Calendars
1. Go to **Settings** → **Calendars**.
2. When creating a new **Local Notes** calendar source, a configuration modal will appear.
3. Choose the storage directory.
4. Input your custom Markdown template into the **Custom template** text area.

### 2️⃣ For Linked Notes (Remote Calendars)
1. Go to **Settings** → **Calendars**.
2. Locate the **Linked Note Settings** section at the top of the tab.
3. Input your custom Markdown template into the **Linked note template** text area.
4. Newly generated linked notes across any remote provider will use this template structure.
