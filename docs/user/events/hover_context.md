# Hover Preview & Context Menu

Interact with events quickly without leaving the calendar view using hover previews and the right-click context menu.

## Hover for Event Details

Using the core **Page Preview** plugin, hold `Ctrl`/`Cmd` and hover over an event to preview its local source or [linked note](../features/event-linked-notes.md).

With the **Name-based** linked-note strategy, preview lookup uses the sanitized event title in the configured linked-notes folder. Every event with that same title previews the shared note—even when later scheduling creates a different calendar UID. Deadline-based mode continues to preview the note attached to the specific event or occurrence.

Hover boundaries are event-specific: moving directly from an event without a note to one with a linked note still opens the second event's preview; you do not need to move through empty calendar space first.

This is a great way to quickly see meeting notes, agendas, or other context you've added to an event's note.

!!! note
    You can disable the `Ctrl`/`Cmd` key requirement in the "Page Preview" core plugin settings.

![Hover for Preview](../../assets/events/hover-description.gif)

## Right-Click Context Menu

Right-click on any event to open a context menu with quick actions.

For local, editable events, you can:
-   **Turn into task / Remove checkbox:** Quickly toggle an event's task status.
-   **Go to note:** Jump directly to the event's source note, opening it in a **new tab**.
-   **Delete:** Delete the event without opening the editor.

![Context Menu](../../assets/events/context-menu.gif)
