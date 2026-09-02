# TaskNotes Integration

!!! info "Obsidian Ecosystem Integration"
    TaskNotes is a specialized provider that allows you to sync and manage scheduled tasks from the [TaskNotes plugin](https://github.com/YouFoundJK/obsidian-tasknotes) directly on your calendar.


!!! tip "Power Up with Categories"
    TaskNotes also support **[Advanced Categories](../events/categories.md)**. You can categorize your tasks (e.g., `Personal - Grocery list`) to apply specific colors and styles on your agenda.


## How it Works

The TaskNotes provider connects to the TaskNotes internal cache. It interprets any task with a `scheduled` property as a calendar event.


*   **Bidirectional Sync**: Dragging a TaskNotes event on the calendar updates its scheduled date/time in the original note.
*   **FCR Command Support**: Use the **[FCR Command](../features/nlp.md)** to quickly create TaskNotes tasks using TaskNotes-native NLP UI.
*   **Custom UI**: Clicking a TaskNotes event opens the native TaskNotes edit modal for advanced task refinement.
*   **Status Awareness**: The provider respects completion statuses. Completed tasks are visually distinguished on the calendar.

## Rescheduling and TaskNotes Properties

Dragging or resizing a TaskNotes event in Full Calendar updates the original task note in your vault.

Full Calendar always writes these TaskNotes scheduling properties:

```yaml
scheduled: 2026-04-23
scheduled-link: "[[2026-04-23]]"
```

The `scheduled` value is the date, or date and time, that TaskNotes uses to place the task on the calendar. The `scheduled-link` value is the matching daily-note link.

Full Calendar may also update these companion properties when they still point at the old scheduled date:

```yaml
due: 2026-04-23
due-link: "[[2026-04-23]]"
deadline: 2026-04-23
deadline-link: "[[2026-04-23]]"
```

`due` is the task's due date and `deadline` is the task's deadline date. The `-link` properties are daily-note links for those dates. If a `due` or `deadline` value is different from the previous scheduled date, Full Calendar leaves it unchanged so intentional due/deadline metadata is preserved.

These properties are part of TaskNotes task metadata. See the [TaskNotes documentation](https://github.com/YouFoundJK/obsidian-tasknotes) for the current TaskNotes field definitions.

## NLP Endpoint Modes

When an [NLP create command](../features/nlp.md) targets a TaskNotes calendar, Full Calendar delegates creation to TaskNotes UI.

The endpoint mode is configurable at **Settings → Integrations → TaskNotes Integration**:

*   **Search + Create (selector modal)** *(default)*: Opens TaskNotes selector + create flow with NLP text prefilled.
*   **Direct Create (creation modal NLP)**: Opens TaskNotes create modal directly with NLP text prefilled.

This default is intentionally conservative and discoverable: Search + Create helps users validate the target task context before confirming.

## Setup

1.  Ensure the **TaskNotes** plugin is installed and enabled in your vault.
2.  Go to **[Full Calendar Settings](../settings/index.md) → [Calendar Sources](../settings/sources.md)**.
3.  Click **Add Source** and select **TaskNotes**.
4.  The provider will automatically attempt to link with the TaskNotes cache.
5.  (Optional) Open **Integrations → TaskNotes Integration** and change NLP endpoint mode.

## Capabilities

| Feature | Supported | Notes |
|---|---|---|
| Create Events | ✅ Yes | Full Calendar delegates creation to TaskNotes native UI (Search + Create by default). |
| Edit Date/Time | ✅ Yes | Drag-and-drop support for rescheduling. |
| Edit Metadata | ✅ Yes | Uses TaskNotes' native edit modal. |
| Delete Events | ❌ No | Delete is delegated to TaskNotes. |
| Recurring Events| ❌ No | TaskNotes recurring logic is managed internally. |

---

[Tasks Plugin Integration](tasks-plugin-integration.md) · [Full Note Calendar](local.md) · [Back to Index](index.md)
