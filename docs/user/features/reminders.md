# Reminders and Notifications

!!! abstract "Feature Overview"
    Full Calendar provides a robust, native notification system to keep you on track. It integrates with your operating system's notification center and provides interactive modals for immediate action.

!!! tip "Recommended"
    For offline OS native reminder use the [FCR Reminder](#offline-alerts-with-fcr-reminder-companion) companion. This will work even when Obsidian is closed!



## Configuration

In **Settings → Reminders**, you can define the baseline behavior:

*   **Enable Reminders**: The global toggle for the notification engine.
*   **Default Reminder Time**: The number of minutes before an event start to trigger a notification (default: 10).
*   **Default Notification Body**: Choose if you want the notification to show just the title or include the start time.

## Custom Per-Event Reminders

You can override the global default for any specific event by adding a `notify` key to its YAML frontmatter:

```yaml
title: Important Meeting
date: 2025-03-28
startTime: "14:00"
notify: 15  # Trigger 15 minutes before start
```

## Calendar Provider Reminders

Some remote calendars also have their own reminder model. Full Calendar maps those provider reminders into `alarms` event data:

*   CalDAV reminders are stored as ICS `VALARM` entries.
*   Google popup reminders are stored as Google reminder overrides.
*   Outlook reminders are stored as Outlook reminder minutes.

When a calendar supports provider reminders, the event editor shows separate controls for the Obsidian reminder and the calendar-provider reminder. Recurring instance overrides inherit the parent reminder settings unless you explicitly change the override.

## The Reminder Modal

When you click a system notification (or when a reminder triggers while Obsidian is focused), an interactive modal appears:

*   **Open Note**: Immediately opens the markdown file associated with the event.
*   **Dismiss**: Closes the reminder and silences further notifications for this instance.
*   **Snooze**: Postpones the reminder by a chosen interval.

### ⚠️ Important: How Snooze Works

Full Calendar uses a **destructive snooze** strategy to ensure your notifications remain synchronized across all your devices and external calendars (like Google or CalDAV).

!!! danger "How Snooze Works"
    Snoozing an event **modifies the source data** in your note or remote calendar. This ensures you aren't "re-notified" by other apps for a task you have already addressed on one device.

For a detailed breakdown of how different event types are shifted during a snooze, see the **[Reminders Architecture](../../architecture/system/features/reminders-architecture.md#destructive-snooze-implementation)**.

---

## Offline Alerts with FCR Reminder Companion

Standard reminders rely on Obsidian running in the background. If you close Obsidian, you may miss important notifications. To solve this, you can enable the **[FCR Reminder Companion](fcr-reminder.md)**.

When enabled:  

*   Standard Obsidian toast alerts and interactive modal popups are **automatically bypassed** while Obsidian is open to prevent duplicates.
*   Alerting is delegated entirely to a lightweight loopback background daemon.
*   You receive native OS-level toast notifications that deep-link directly to your Obsidian notes even when Obsidian is completely closed.

➡️ [FCR Companion App Releases](https://github.com/obsidian-full-calendar-remastered/FCR-Reminder-Companion-App/releases) | [Documentation](https://obsidian-full-calendar-remastered.github.io/FCR-Reminder-Companion-App/)

---

[Status Bar Integration](statusbar.md) · [FCR Reminder Companion](fcr-reminder.md) · [Technical Architecture](../../architecture/system/features/reminders-architecture.md) · [Troubleshooting](../guides/troubleshooting.md#why-are-my-reminders-not-firing)
