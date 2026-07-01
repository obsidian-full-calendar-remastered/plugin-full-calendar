/**
 * @file BreakTimerManager.ts
 * @brief Manages the Break Timer state, user activity tracking, background check loop, and overlay triggers.
 * @license See LICENSE.md
 */

import { requestUrl, normalizePath } from 'obsidian';
import { showNotice } from '../../utils/showNotice';
import { PluginState } from '../../core/PluginState';
import { FullCalendarSettings } from '../../types/settings';
import FullCalendarPlugin from '../../main';
import { showBreakTimerOverlay } from './BreakTimerOverlay';

export class BreakTimerManager {
  private plugin: FullCalendarPlugin;
  private lastActiveTime: number;
  private nextBreakTime: number;
  private checkIntervalId: number | null = null;
  private activeOverlayCleanup: (() => void) | null = null;
  private attachedWindows = new Set<Window>();

  // Track event listener bound handlers so they can be removed correctly
  private boundActivityHandler = this.handleActivity.bind(this);

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
    this.lastActiveTime = Date.now();
    this.nextBreakTime = Date.now();
  }

  /**
   * Initializes or updates the manager based on settings.
   */
  public update(settings: FullCalendarSettings): void {
    const breakSettings = settings.breakTimer;
    const isRunning = this.checkIntervalId !== null;

    if (breakSettings.enabled && !isRunning) {
      this.lastActiveTime = Date.now();
      this.nextBreakTime = Date.now() + breakSettings.intervalMins * 60 * 1000;
      this.registerListeners();
      this.startCheckLoop();
      void this.ensureAssets();
    } else if (!breakSettings.enabled && isRunning) {
      this.unload();
    } else if (breakSettings.enabled && isRunning) {
      // Re-calculate next break time if interval or settings changed
      const currentIntervalMs = breakSettings.intervalMins * 60 * 1000;
      this.nextBreakTime = this.lastActiveTime + currentIntervalMs;
      void this.ensureAssets();
    }
  }

  /**
   * Clean up all listeners and intervals.
   */
  public unload(): void {
    this.unregisterListeners();
    this.stopCheckLoop();
    if (this.activeOverlayCleanup) {
      this.activeOverlayCleanup();
      this.activeOverlayCleanup = null;
    }
  }

  private startCheckLoop(): void {
    this.stopCheckLoop();
    this.checkIntervalId = window.setInterval(() => {
      this.checkTimer();
    }, 1000);
  }

  private stopCheckLoop(): void {
    if (this.checkIntervalId !== null) {
      window.clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
  }

  private registerListeners(): void {
    // Attach to the main window
    this.attachToWindow(window);

    // Attach to active window if it differs
    if (typeof activeWindow !== 'undefined' && activeWindow !== window) {
      this.attachToWindow(activeWindow);
    }

    // Capture future popout window openings
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('window-open', (winLeaf, win) => {
        this.attachToWindow(win);
      })
    );
  }

  private attachToWindow(win: Window): void {
    if (this.attachedWindows.has(win)) return;
    this.attachedWindows.add(win);

    const doc = win.document;
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      doc.addEventListener(event, this.boundActivityHandler, { capture: true, passive: true });
      win.addEventListener(event, this.boundActivityHandler, { capture: true, passive: true });
    });
  }

  private unregisterListeners(): void {
    this.attachedWindows.forEach(win => {
      try {
        const doc = win.document;
        const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
        events.forEach(event => {
          doc.removeEventListener(event, this.boundActivityHandler, { capture: true });
          win.removeEventListener(event, this.boundActivityHandler, { capture: true });
        });
      } catch {
        // Window may have already closed, ignore safely
      }
    });
    this.attachedWindows.clear();
  }

  private handleActivity(): void {
    const now = Date.now();
    const settings = PluginState.getSettings().breakTimer;

    if (settings.enabled) {
      const idleThresholdMs = settings.idleThresholdMins * 60 * 1000;

      // If user returns after being idle longer than the threshold, reset the next break time
      if (idleThresholdMs > 0 && now - this.lastActiveTime > idleThresholdMs) {
        this.nextBreakTime = now + settings.intervalMins * 60 * 1000;
      }
    }

    this.lastActiveTime = now;
  }

  private checkTimer(): void {
    if (this.activeOverlayCleanup) {
      return; // Already showing break overlay
    }

    const now = Date.now();
    const settings = PluginState.getSettings().breakTimer;
    const idleThresholdMs = settings.idleThresholdMins * 60 * 1000;

    // Check if user is currently idle (exceeded idle threshold)
    const isCurrentlyIdle = idleThresholdMs > 0 && now - this.lastActiveTime > idleThresholdMs;

    if (now >= this.nextBreakTime) {
      if (!isCurrentlyIdle) {
        this.triggerBreak();
      } else {
        // If they are idle, just push the break time forward to when they return
        this.nextBreakTime = now + settings.intervalMins * 60 * 1000;
      }
    }
  }

  public triggerBreak(): void {
    const settings = PluginState.getSettings().breakTimer;

    // 1. Send native desktop notification
    this.triggerNotification();

    // 2. Launch fullscreen overlay
    this.activeOverlayCleanup = showBreakTimerOverlay(
      this.plugin,
      settings.breakDurationSecs,
      () => {
        this.activeOverlayCleanup = null;
        // Schedule next break
        this.nextBreakTime = Date.now() + settings.intervalMins * 60 * 1000;
        this.lastActiveTime = Date.now();
      }
    );
  }

  private triggerNotification(): void {
    try {
      if (typeof Notification !== 'undefined') {
        if (Notification.permission === 'granted') {
          new Notification('Time to take a break!', {
            body: 'Rest your eyes, stand up, and stretch a bit.'
          });
        } else if (Notification.permission !== 'denied') {
          void Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
              new Notification('Time to take a break!', {
                body: 'Rest your eyes, stand up, and stretch a bit.'
              });
            }
          });
        }
      }
    } catch (e) {
      console.warn('Failed to trigger OS notification:', e);
    }
  }

  private async ensureAssets(): Promise<void> {
    const app = this.plugin.app;
    const pluginId = 'full-calendar-remastered';
    const assetsFolder = normalizePath(`${app.vault.configDir}/plugins/${pluginId}/assets`);
    const filenames = ['assets_neko1.webm', 'assets_neko2.webm'];

    // Ensure assets folder exists
    let folderExists = false;
    try {
      folderExists = await app.vault.adapter.exists(assetsFolder);
    } catch {
      // Ignore
    }
    if (!folderExists) {
      try {
        await app.vault.adapter.mkdir(assetsFolder);
      } catch (e) {
        console.error('Failed to create assets folder:', e);
      }
    }

    const githubBaseUrls = [
      'https://raw.githubusercontent.com/obsidian-full-calendar-remastered/plugin-full-calendar/main/docs/assets/break-timer'
    ];

    for (const filename of filenames) {
      const assetPath = normalizePath(`${assetsFolder}/${filename}`);
      let fileExists = false;
      try {
        fileExists = await app.vault.adapter.exists(assetPath);
      } catch {
        // Ignore
      }

      if (!fileExists) {
        showNotice(`Downloading break timer asset ${filename}...`);

        let downloaded = false;
        const errors: string[] = [];
        for (const baseUrl of githubBaseUrls) {
          const url = `${baseUrl}/${filename}`;
          try {
            const response = await requestUrl({ url, method: 'GET' });
            if (response.status === 200 && response.arrayBuffer) {
              await app.vault.adapter.writeBinary(assetPath, response.arrayBuffer);
              showNotice(`Successfully downloaded ${filename}`);
              downloaded = true;
              break;
            }
          } catch (err) {
            errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        if (!downloaded) {
          console.error(
            `Failed to download break timer asset ${filename} from all fallback URLs:\n${errors.join('\n')}`
          );
          showNotice(
            `Failed to download break timer asset ${filename}. Check console for details.`
          );
        }
      }
    }
  }
}
