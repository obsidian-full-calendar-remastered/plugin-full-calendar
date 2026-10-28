# Workspaces Settings

!!! abstract "Philosophy"
    Create focused planning environments. Workspaces allow you to save sets of visible calendars, category filters, and view overrides that you can switch between instantly.

## Managing Workspaces

Access these settings in **Full Calendar Settings → Workspaces**.

*   **Active Workspace**: Choose which workspace is currently active. Selecting `None` reverts to your global default settings.
*   **Workspace List**: Add, rename, or delete workspace profiles.

## Workspace Configuration Overrides

Each workspace can store its own set of display and filtering rules:

*   **View Defaults**: Set a specific initial view (Desktop/Mobile) and default date (e.g., `Today`, `Start of Month`) for when this workspace is activated.
*   **Visible Calendars**: Choose a subset of your [Calendar Sources](sources.md) to display.
*   **Default Calendar**: Override which calendar is pre-selected when creating an event in this workspace. Defaults to *Use global default*, which falls back to the [global setting](sources.md#global-source-settings). A calendar hidden by **Visible Calendars** is skipped, so new events never land somewhere this workspace cannot show them.
*   **Category Filtering**: 
    *   **Show Only**: Display only events matching the selected categories.
    *   **Hide**: Display all events *except* those matching the selected categories.
*   **Business Hours Override**: Define custom business hours specific to this planning context.
*   **View Constraints**: Override global `slotMinTime`, `slotMaxTime`, and header formats.

## UI Integration

*   **Command Palette**: Use the command [`Full Calendar: Switch Workspace`](../guides/commands-and-shortcuts.md) to jump between profiles without opening settings.
*   **FCR Command**: Trigger workspace switches via [natural language](../features/nlp.md) (e.g., `switch to Work workspace`).

---

[Advanced Categorization](categories.md) · [Reminders](reminders.md) · [Back to Index](index.md)
