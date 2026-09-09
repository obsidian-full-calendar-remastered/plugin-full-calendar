# FCR Reminder Companion

!!! abstract "Feature Overview"
    The FCR Reminder Companion allows you to synchronize your upcoming calendar events with a lightweight persistent background daemon. This enables native, OS-level toast notifications even when Obsidian is completely closed.


➡️ Download the [latest release](https://github.com/obsidian-full-calendar-remastered/FCR-Reminder-Companion-App/releases) or checkout the [FCR Companion App Repository](https://obsidian-full-calendar-remastered.github.io/FCR-Reminder-Companion-App/) for full details.

!!! warning "Currently supported OS"
    The app is only built currently for Windows OS. Feel free to raise a [feature request](https://github.com/obsidian-full-calendar-remastered/FCR-Reminder-Companion-App/issues/new?template=feature_request.yaml) for other platform support.


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

1. Open [Settings → FCR Reminder Companion](../settings/reminders.md#fcr-reminder-companion-settings).
2. **Enable Companion**: Toggle the switch to `On`.
3. **API URL**: Define the local address of the companion app daemon (default: `http://127.0.0.1:45677`).

The plugin will automatically perform a status check on startup to ensure the daemon is running. If the daemon is offline, a warning will be displayed in the settings panel.

---

## Sync Behavior

Once configured, the synchronization happens completely in the background:  

- **Automatic Sync**: Full Calendar automatically synchronizes any event starting or triggering within the next 24 hours.
- **Debounced Updates**: Whenever you create, modify, or delete events, the plugin debounces the update by `800ms` and pushes the updated reminder list to the daemon.
- **Zero Configuration Reminders**: The daemon respects both your custom per-event reminders (`notify` frontmatter) and global default reminder time settings.
- **Startup Checks & Retries**: When Obsidian loads or when you enable the companion, Full Calendar performs up to 5 status checks spaced 3 seconds apart. If the companion integration is disabled or global reminders are turned off mid-run, background liveness checks and synchronization tasks are immediately and cleanly aborted. If the daemon remains offline after all attempts and the integration is still active, a prominent, bold warning notification is displayed to inform you that native alerts will not fire.

---

## Obsidian Toast Suppression

!!! info "Alert Takeover"
    When the FCR Reminder Companion is enabled, standard Obsidian toast alerts and interactive modal popups are **automatically suppressed** while Obsidian is open. This prevents [duplicate system notifications](reminders.md#offline-alerts-with-fcr-reminder-companion), handing full alerting responsibility over to the companion daemon.

---

## Manual Synchronization

While Full Calendar automatically keeps your companion daemon synchronized in the background, you can trigger an immediate refresh of the companion app memory at any time:

*   **Command Palette**: Open the Obsidian [Command Palette](../guides/commands-and-shortcuts.md) (`Ctrl/Cmd + P`) and execute the command:
    `Full Calendar: Sync FCR Reminder Companion`
*   **FCR Command (NLP)**: Open the FCR Command modal (`Ctrl/Cmd + P` → `FCR Command`) and type one of the following commands:
    *   `sync companion`
    *   `sync reminder companion`
    *   `update reminder companion`

Obsidian will compile the latest 24-hour reminder lookahead array, dispatch it immediately to the local daemon, and show a success confirmation toast.

---

### 📚 Related Resources

=== "Guides & Tools"
    *   [Local Reminders and Snooze](reminders.md) — Standard in-app notifications and destructive snooze logic.
    *   [NLP Quick-Add & Commands](nlp.md) — Master voice/text command scheduling in Full Calendar.
    *   [Commands & Shortcuts](../guides/commands-and-shortcuts.md) — Complete checklist of hotkeys and command palette options.

=== "Technical Deep-Dives"
    *   [FCR Reminder Companion Architecture](../../architecture/system/features/fcr-reminder-architecture.md) — Learn about loopback daemons, liveness retries, and synchronization payloads.

