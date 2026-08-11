import { showNotice } from '../../utils/showNotice';
import { PluginState } from '../../core/PluginState';
import { DateTime } from 'luxon';

import { FullCalendarSettings } from '../../types/settings';
import FullCalendarPlugin from '../../main';
import { TimeState, EnrichedOFCEvent } from '../../core/TimeEngine';
import { t } from '../i18n/i18n';
import { launchReminderModal } from './ui/reminder_modal';

export class NotificationManager {
  #plugin: FullCalendarPlugin;
  #timeTickCallback: ((state: TimeState) => void) | null = null;
  // Store notified events to prevent duplicate notifications in the same session.
  // Format: `${sessionId}::${type}::${triggerTimeISO}`
  #notifiedEvents = new Set<string>();

  constructor(plugin: FullCalendarPlugin) {
    this.#plugin = plugin;
  }

  public unload(): void {
    if (this.#timeTickCallback) {
      PluginState.getCache().off('time-tick', this.#timeTickCallback);
      this.#timeTickCallback = null;
    }
  }

  public update(settings: FullCalendarSettings): void {
    const shouldBeRunning = settings.enableReminders;
    const isRunning = this.#timeTickCallback !== null;

    if (shouldBeRunning && !isRunning) {
      this.#notifiedEvents.clear();
      this.#timeTickCallback = (state: TimeState) => this.handleTimeTick(state);
      PluginState.getCache().on('time-tick', this.#timeTickCallback);
    } else if (!shouldBeRunning && isRunning) {
      if (this.#timeTickCallback) {
        PluginState.getCache().off('time-tick', this.#timeTickCallback);
        this.#timeTickCallback = null;
      }
    }
  }

  private handleTimeTick(state: TimeState) {
    if (!PluginState.getCache().initialized) return;

    const now = DateTime.now();
    // Optimization: Only process events starting within the next 48 hours.
    const lookaheadLimit = now.plus({ hours: 48 });

    // Combine current and upcoming for processing
    const candidates = [...(state.current ? [state.current] : []), ...state.upcoming];

    for (const occurrence of candidates) {
      // Optimization check
      if (occurrence.start > lookaheadLimit) continue;

      this.checkAndNotify(occurrence, now);
    }
  }

  public getTriggerTime(occurrence: EnrichedOFCEvent): DateTime | null {
    const { event, start } = occurrence;
    const { enableDefaultReminder, defaultReminderMinutes } = PluginState.getSettings();

    // 1. Check Custom Reminder (High Priority)
    if (event.notify && typeof event.notify.value === 'number') {
      return start.minus({ minutes: event.notify.value });
    }

    // 2. Check Default Reminder (Only if no custom reminder is set)
    if (enableDefaultReminder) {
      return start.minus({ minutes: defaultReminderMinutes });
    }

    return null;
  }

  public getUpcomingRemindersPayload(): Record<string, unknown>[] {
    const occurrences = PluginState.getCache().getOccurrenceCache();
    if (!occurrences) {
      return [];
    }

    const now = DateTime.now();
    const lookahead24h = now.plus({ hours: 24 });
    const payload = [];

    for (const occurrence of occurrences) {
      const { event, start } = occurrence;

      const triggerTime = this.getTriggerTime(occurrence);
      if (!triggerTime) continue;

      // Skip reminders that are more than 24 hours into the future (based on their reminder time)
      if (triggerTime > lookahead24h) continue;

      const trigger_at_epoch = Math.floor(triggerTime.toMillis() / 1000);

      // Filter for trigger epochs in the future
      if (trigger_at_epoch <= Math.floor(Date.now() / 1000)) {
        continue;
      }

      // Map identifier: append start timestamp to ensure uniqueness and stability for recurring instances
      const isRecurring = event.type === 'recurring' || event.type === 'rrule';
      const finalId = isRecurring ? `${occurrence.id}-${start.toMillis()}` : occurrence.id;

      // Map Vault Deep Link
      const vaultName = encodeURIComponent(this.#plugin.app.vault.getName());
      const filePath = occurrence.location ? encodeURIComponent(occurrence.location.file.path) : '';
      const action_url = filePath
        ? `obsidian://open?vault=${vaultName}&file=${filePath}`
        : `obsidian://open?vault=${vaultName}`;

      payload.push({
        id: finalId,
        title: event.title.slice(0, 64),
        body: (event.description || '').slice(0, 256),
        trigger_at_epoch,
        action_url
      });
    }

    return payload;
  }

  private checkAndNotify(occurrence: EnrichedOFCEvent, now: DateTime) {
    const triggerTime = this.getTriggerTime(occurrence);
    if (!triggerTime) return;

    const recencyCutoff = { minutes: 5 };
    const isDue = now >= triggerTime;
    const isTooLate = triggerTime.plus(recencyCutoff) < now;

    if (isDue && !isTooLate) {
      const type =
        occurrence.event.notify && typeof occurrence.event.notify.value === 'number'
          ? 'custom'
          : 'default';
      this.tryTrigger(occurrence, type, triggerTime);
    }
  }

  private tryTrigger(
    occurrence: EnrichedOFCEvent,
    type: 'default' | 'custom',
    triggerTime: DateTime
  ) {
    const { id: sessionId } = occurrence;
    // Deduplication key: Unique per session, type, and specific trigger instance
    const key = `${sessionId}::${type}::${triggerTime.toISO()}`;

    if (this.#notifiedEvents.has(key)) return;

    // Check if FCR reminder companion is enabled
    const companionSettings = PluginState.getSettings().fcrReminderCompanion;
    if (companionSettings && companionSettings.enabled) {
      // Toast notification in obsidian won't happen rather it will be taken over by FCR reminder
      return;
    }

    this.triggerNotification(occurrence, sessionId, type);
    this.#notifiedEvents.add(key);
  }

  private triggerNotification(
    occurrence: EnrichedOFCEvent,
    eventId: string,
    type: 'default' | 'custom'
  ) {
    const { event, start } = occurrence;
    const title = t('notifications.eventStarting.title'); // "Event Starting"

    // Customize body based on type
    const timeStr = !event.allDay && start ? start.toLocal().toFormat('h:mm a') : '';

    let body = `${event.title}`;
    if (timeStr) body += ` at ${timeStr}`;

    if (type === 'custom') {
      const mins = event.notify?.value || 0;
      body += `\n${t('notifications.inMinutes', { mins: mins.toString() })}`;
    } else {
      const mins = PluginState.getSettings().defaultReminderMinutes;
      body += `\n${t('notifications.inMinutes', { mins: mins.toString() })}`;
    }

    try {
      const notification = new Notification(title, { body });

      notification.onclick = () => {
        // Launch the interactive modal instead of just opening the file
        launchReminderModal(this.#plugin, occurrence, eventId, type);
      };
    } catch (e) {
      console.error(t('notifications.failed'), e);
      showNotice(t('notifications.errorBody'));
    }
  }
}
