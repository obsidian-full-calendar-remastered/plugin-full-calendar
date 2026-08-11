import { PluginState } from '../../core/PluginState';
import { FullCalendarSettings } from '../../types/settings';
import FullCalendarPlugin from '../../main';
import { requestUrl } from 'obsidian';
import { showNotice } from '../../utils/showNotice';
import { t } from '../i18n/i18n';

export class FcrReminderManager {
  #plugin: FullCalendarPlugin;
  #updateCallback: (() => void) | null = null;
  #debounceTimer: number | null = null;
  public companionOnline = false;
  #isCheckingStatus = false;
  #statusTimeoutId: number | null = null;

  constructor(plugin: FullCalendarPlugin) {
    this.#plugin = plugin;
  }

  public getCompanionSettings() {
    const settings = PluginState.getSettings();
    if (!settings.fcrReminderCompanion) {
      settings.fcrReminderCompanion = {
        enabled: false,
        apiUrl: 'http://127.0.0.1:45677'
      };
    }
    return settings.fcrReminderCompanion;
  }

  public async checkDaemonStatus(): Promise<boolean> {
    if (this.#isCheckingStatus) return this.companionOnline;
    this.#isCheckingStatus = true;

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
          this.#statusTimeoutId = window.setTimeout(() => {
            reject(new Error('Timeout'));
          }, 2000);
        }
      );

      const response = await Promise.race([responsePromise, timeoutPromise]);
      if (this.#statusTimeoutId !== null) {
        window.clearTimeout(this.#statusTimeoutId);
        this.#statusTimeoutId = null;
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
      if (this.#statusTimeoutId !== null) {
        window.clearTimeout(this.#statusTimeoutId);
        this.#statusTimeoutId = null;
      }
      this.companionOnline = false;
    } finally {
      this.#isCheckingStatus = false;
    }
    return this.companionOnline;
  }

  public unload(): void {
    if (this.#updateCallback) {
      PluginState.getCache().off('update', this.#updateCallback);
      this.#updateCallback = null;
    }
    if (this.#debounceTimer) {
      window.clearTimeout(this.#debounceTimer);
      this.#debounceTimer = null;
    }
  }

  public update(settings: FullCalendarSettings): void {
    const companionSettings = this.getCompanionSettings();
    // Rigorously gate by both global reminders toggle and companion toggle
    const shouldBeRunning = settings.enableReminders && companionSettings.enabled;
    const isRunning = this.#updateCallback !== null;

    if (shouldBeRunning && !isRunning) {
      this.#updateCallback = () => this.#handleCacheUpdate();
      PluginState.getCache().on('update', this.#updateCallback);

      // Perform initial check and sync on startup/enable with lavish retries
      void (async () => {
        const attempts = 5;
        const delayMs = 3000;
        let online = false;

        for (let i = 0; i < attempts; i++) {
          // Double-check active state before each check to abort early if disabled
          if (!this.#updateCallback) return;
          online = await this.checkDaemonStatus();
          if (online) {
            break;
          }
          if (i < attempts - 1) {
            await new Promise(resolve => window.setTimeout(resolve, delayMs));
          }
        }

        // Final active state assertion before syncing
        if (online && this.#updateCallback) {
          await this.syncToCompanion();
        } else if (!online && this.#updateCallback) {
          const message =
            t('notices.fcrReminderCompanionOfflineBold') ||
            'WARNING: FCR Reminder Companion daemon is offline. You will NOT receive native desktop notifications.';
          const notice = showNotice(message, 15000);
          if (notice && notice.messageEl) {
            notice.messageEl.setCssProps({
              fontWeight: 'bold',
              borderLeft: '4px solid var(--text-error, #ff5555)'
            });
          }
        }
      })();
    } else if (!shouldBeRunning && isRunning) {
      this.unload();
    }
  }

  #handleCacheUpdate() {
    if (this.#debounceTimer) {
      window.clearTimeout(this.#debounceTimer);
    }
    // Debounce sync triggers by 800ms to prevent system lag
    this.#debounceTimer = window.setTimeout(() => {
      void this.syncToCompanion();
    }, 800);
  }

  public async syncToCompanion(): Promise<void> {
    const settings = PluginState.getSettings();
    const companionSettings = this.getCompanionSettings();

    // Rigorously gate sync by both general reminders and companion toggles
    if (!settings.enableReminders || !companionSettings.enabled) return;

    // Check online status first
    const online = await this.checkDaemonStatus();
    if (!online) {
      console.warn('[FCR Reminder] Companion app is offline. Skipping sync.');
      return;
    }

    try {
      const payload = this.#plugin.notificationManager.getUpcomingRemindersPayload();

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
