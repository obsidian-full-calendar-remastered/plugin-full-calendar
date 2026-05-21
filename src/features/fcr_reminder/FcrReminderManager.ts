import { PluginState } from '../../core/PluginState';
import { DateTime } from 'luxon';
import { FullCalendarSettings } from '../../types/settings';
import FullCalendarPlugin from '../../main';
import { requestUrl } from 'obsidian';

export class FcrReminderManager {
  private plugin: FullCalendarPlugin;
  private updateCallback: (() => void) | null = null;
  private debounceTimer: number | null = null;
  public companionOnline = false;
  private isCheckingStatus = false;
  private statusTimeoutId: number | null = null;

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
  }

  public getSettings() {
    return PluginState.getSettings();
  }

  public getCompanionSettings() {
    const settings = this.getSettings();
    if (!settings.fcrReminderCompanion) {
      settings.fcrReminderCompanion = {
        enabled: false,
        apiUrl: 'http://127.0.0.1:45677'
      };
    }
    return settings.fcrReminderCompanion;
  }

  public async checkDaemonStatus(): Promise<boolean> {
    if (this.isCheckingStatus) return this.companionOnline;
    this.isCheckingStatus = true;

    const companionSettings = this.getCompanionSettings();
    const apiUrl = companionSettings.apiUrl || 'http://127.0.0.1:45677';
    try {
      // 2-second timeout wrapper
      const responsePromise = requestUrl({
        url: `${apiUrl}/status`,
        method: 'GET',
        throw: false
      });

      const timeoutPromise = new Promise<{ status: number; text: string; json: unknown }>(
        (_, reject) => {
          this.statusTimeoutId = window.setTimeout(() => {
            reject(new Error('Timeout'));
          }, 2000);
        }
      );

      const response = await Promise.race([responsePromise, timeoutPromise]);
      if (this.statusTimeoutId !== null) {
        window.clearTimeout(this.statusTimeoutId);
        this.statusTimeoutId = null;
      }

      if (response.status === 200) {
        let data: Record<string, unknown> = {};
        if (typeof response.json === 'object' && response.json !== null) {
          data = response.json as Record<string, unknown>;
        } else if (response.text) {
          data = JSON.parse(response.text) as Record<string, unknown>;
        }
        this.companionOnline = data.status === 'running';
      } else {
        this.companionOnline = false;
      }
    } catch {
      if (this.statusTimeoutId !== null) {
        window.clearTimeout(this.statusTimeoutId);
        this.statusTimeoutId = null;
      }
      this.companionOnline = false;
    } finally {
      this.isCheckingStatus = false;
    }
    return this.companionOnline;
  }

  public unload(): void {
    if (this.updateCallback) {
      PluginState.getCache().off('update', this.updateCallback);
      this.updateCallback = null;
    }
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  public update(settings: FullCalendarSettings): void {
    const companionSettings = this.getCompanionSettings();
    const shouldBeRunning = companionSettings.enabled;
    const isRunning = this.updateCallback !== null;

    if (shouldBeRunning && !isRunning) {
      this.updateCallback = () => this.handleCacheUpdate();
      PluginState.getCache().on('update', this.updateCallback);

      // Perform initial check and sync on startup/enable
      void (async () => {
        const online = await this.checkDaemonStatus();
        if (online) {
          await this.syncToCompanion();
        }
      })();
    } else if (!shouldBeRunning && isRunning) {
      this.unload();
    }
  }

  private handleCacheUpdate() {
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
    }
    // Debounce sync triggers by 800ms to prevent system lag
    this.debounceTimer = window.setTimeout(() => {
      void this.syncToCompanion();
    }, 800);
  }

  public async syncToCompanion(): Promise<void> {
    const companionSettings = this.getCompanionSettings();
    if (!companionSettings.enabled) return;

    // Check online status first
    const online = await this.checkDaemonStatus();
    if (!online) {
      console.warn('[FCR Reminder] Companion app is offline. Skipping sync.');
      return;
    }

    try {
      const occurrences = PluginState.getCache().getOccurrenceCache();
      if (!occurrences) {
        return;
      }

      const now = DateTime.now();
      const lookahead24h = now.plus({ hours: 24 });
      const { enableDefaultReminder, defaultReminderMinutes } = this.getSettings();

      // Filter and map occurrences for the next 24 hours
      const payload = [];

      for (const occurrence of occurrences) {
        const { event, start } = occurrence;

        // Skip events beyond next 24 hours
        if (start > lookahead24h) continue;

        // Calculate trigger epoch
        let triggerTime = start;
        if (event.notify && typeof event.notify.value === 'number') {
          triggerTime = start.minus({ minutes: event.notify.value });
        } else if (enableDefaultReminder) {
          triggerTime = start.minus({ minutes: defaultReminderMinutes });
        }

        const trigger_at_epoch = Math.floor(triggerTime.toMillis() / 1000);

        // Filter for trigger epochs in the future
        if (trigger_at_epoch <= Math.floor(Date.now() / 1000)) {
          continue;
        }

        // Map identifier: append start timestamp to ensure uniqueness and stability for recurring instances
        const isRecurring = event.type === 'recurring' || event.type === 'rrule';
        const finalId = isRecurring ? `${occurrence.id}-${start.toMillis()}` : occurrence.id;

        // Map Vault Deep Link
        const vaultName = encodeURIComponent(this.plugin.app.vault.getName());
        const filePath = occurrence.location
          ? encodeURIComponent(occurrence.location.file.path)
          : '';
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

      // Execute Sync POST
      const apiUrl = companionSettings.apiUrl || 'http://127.0.0.1:45677';
      const response = await requestUrl({
        url: `${apiUrl}/sync`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        throw: false
      });

      if (response.status < 200 || response.status >= 300) {
        console.error(
          '[FCR Reminder] Failed to synchronize reminders with daemon:',
          response.status
        );
      }
    } catch (error) {
      console.error('[FCR Reminder] Graceful exception handled during sync:', error);
    }
  }
}
