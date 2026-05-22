# Reminders & Notifications Architecture

!!! abstract "State Contract"
    The notification system is a reactive consumer of the `EventCache`'s `time-tick` stream. It maintains zero persistent state of its own, relying entirely on the canonical event data, runtime deduplication, and centralized trigger evaluations.

---

## The Notification Pipeline

1.  **Subscription**: The `NotificationManager` subscribes to the high-frequency `time-tick` event from the `EventCache` (ticking every 60 seconds).
2.  **Lookahead Filtering**: On every tick, the manager filters the cache for events starting within the next 48 hours to minimize processing overhead.
3.  **Centralized Trigger Evaluation**:
    *   The manager calculates a trigger time for each occurrence using the public helper `getTriggerTime(occurrence: EnrichedOFCEvent)`.
    *   **Custom Priority**: If an event has a `notify` property in its metadata (e.g. `notify: 15`), the trigger point is computed as `start.minus({ minutes: event.notify.value })`.
    *   **Default Fallback**: If no custom value exists and global default reminders are enabled, the trigger point is computed as `start.minus({ minutes: defaultReminderMinutes })`.
4.  **Mutex and FCR Takeover**:
    *   Before firing local OS notifications or launching the interactive snooze/dismiss modal, the manager checks if the FCR Reminder Companion is enabled (`fcrReminderCompanion.enabled`).
    *   If enabled, the native toast notification is bypassed (returning immediately), allowing the background daemon to handle alerting.
5.  **Deduplication**: To prevent "notification storms" (especially during startup or timezone shifts), every locally triggered notification is keyed by `sessionId::type::triggerTime`. Once a key is added to the runtime `notifiedEvents` set, it cannot trigger again in the current session.

---

## Destructive Snooze Implementation

The decision to use a destructive snooze (modifying source data) rather than a runtime-only snooze was made to solve the **Multi-Device Conflict** problem.

### Rationale
If snooze was runtime-only, snoozing on a Desktop would not prevent a mobile device (or a Google Calendar notification) from firing at the original time. By modifying the source YAML or Google Event, the "snooze" state is synchronized across the entire ecosystem.

### Logic
*   **Time Shift**: For events without custom `notify` values, the `startTime` is incremented.
*   **Threshold Shift**: For events with `notify` values, the `notify` integer is decremented.

---

## Startup Safety (Recency Cutoff)

The manager implements a **5-minute recency cutoff**. If a reminder's trigger point was more than 5 minutes in the past (e.g., you open Obsidian at 14:05 for a 14:00 event with a 10-minute reminder), the notification is suppressed. This prevents a "spam" of missed notifications when starting the app after a long break.

---

[FCR Reminder Companion Architecture](fcr-reminder-architecture.md) · [Event Cache](../../system/eventcache.md) · [Timezone Architecture](../../system/features/timezone-architecture.md) · [API Architecture](../../system/api-architecture.md)
