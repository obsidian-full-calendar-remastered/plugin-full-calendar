# FCR Reminder Companion

!!! abstract "Feature Overview"
    The FCR Reminder Companion allows you to synchronize your upcoming calendar events with a lightweight persistent background daemon. This enables native, OS-level toast notifications even when Obsidian is completely closed.

---

## Why use the Companion App?

Obsidian's native notification system is powerful but requires Obsidian to be actively running in the foreground or background. If you close Obsidian, you will miss your event notifications.

The **FCR Reminder Companion** solves this:
- **Offline & Closed Operation**: Notifications will trigger exactly on time, even if Obsidian is fully closed.
- **Native OS Integration**: Integrates directly with Windows, macOS, or Linux native toast notifications.
- **Deep Linking**: Clicking on a system toast notification will instantly launch Obsidian and navigate to the associated note.

---

## Configuration

To activate the companion:

1. Open **Settings → FCR Reminder Companion**.
2. **Enable Companion**: Toggle the switch to `On`.
3. **API URL**: Define the local address of the companion app daemon (default: `http://127.0.0.1:45677`).

The plugin will automatically perform a status check on startup to ensure the daemon is running. If the daemon is offline, a warning will be displayed in the settings panel.

---

## Sync Behavior

Once configured, the synchronization happens completely in the background:
- **Automatic Sync**: Full Calendar automatically synchronizes any event starting or triggering within the next 24 hours.
- **Debounced Updates**: Whenever you create, modify, or delete events, the plugin debounces the update by `800ms` and pushes the updated reminder list to the daemon.
- **Zero Configuration Reminders**: The daemon respects both your custom per-event reminders (`notify` frontmatter) and global default reminder time settings.

---

## Obsidian Toast Suppression

!!! info "Alert Takeover"
    When the FCR Reminder Companion is enabled, standard Obsidian toast alerts and interactive modal popups are **automatically suppressed** while Obsidian is open. This prevents duplicate system notifications, handing full alerting responsibility over to the companion daemon.

---

[Local Reminders and Snooze](reminders.md) · [Technical Architecture](../../architecture/system/features/fcr-reminder-architecture.md) · [NLP Quick-Add](nlp.md)
