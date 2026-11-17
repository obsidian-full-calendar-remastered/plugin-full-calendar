# Reminders Settings

!!! abstract "Philosophy"
    Stay on top of your schedule. Reminder settings control how and when the plugin alerts you about upcoming events using Obsidian's system notifications.

## Notification Controls

Access these settings in **Full Calendar Settings → Reminders**.

*   **Enable Reminders**: The global master toggle for the reminder system.
*   **Enable Default Reminder**: When turned on, every new event created will automatically have a reminder attached.
*   **Default Reminder Time**: Set the offset (in minutes) before an event starts for the notification to trigger (default: `10`).

## Interaction Behavior

*   **Show Event in Status Bar**: If enabled, the time remaining until your next event is shown in the bottom [status bar](../features/statusbar.md).
*   **Highlight Current/Next Event**: Visually distinguishes the active event in the calendar grid.

## System Integration

*   **Notification Deduplication**: The plugin automatically manages notification state to prevent duplicate alerts during Obsidian restarts. See: [Data Integrity](../reference/data_integrity.md).
*   **Reminder Modal**: Clicking a notification opens a focused view of the event with options to [open the source note](../events/manage.md) or dismiss the alert.

---

## FCR Reminder Companion Settings

For users utilizing the offline-first [FCR Reminder Companion](../features/fcr-reminder.md), the following settings configure active synchronization:

*   **Enable Companion**: Toggles the synchronization pipeline on or off. When enabled, local Obsidian reminders are automatically suppressed, handing full alerting responsibility over to the companion daemon to prevent duplicate alerts.
*   **API URL**: The loopback address of the companion app daemon (defaults to `http://127.0.0.1:45677`). The plugin performs liveness status checks on this endpoint during startup.

---

[Workspaces](workspaces.md) · [API and Security](api.md) · [Back to Index](index.md)
