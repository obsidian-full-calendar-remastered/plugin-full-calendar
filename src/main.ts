import { showNotice } from './utils/showNotice';
/**
 * @file main.ts
 * @brief Main plugin entry point for Obsidian Full Calendar.
 *
 * @description
 * This file contains the `FullCalendarPlugin` class, which is the primary
 * controller for the entire plugin. It manages the plugin's lifecycle,
 * including loading/unloading, settings management, command registration,
 * and view initialization. It serves as the central hub that wires together
 * the event cache, UI components, and Obsidian's application workspace.
 *
 * @license See LICENSE.md
 */

import { PluginState } from './core/PluginState';
import { NotificationManager } from './features/notifications/NotificationManager';
import { FcrReminderManager } from './features/fcr_reminder/FcrReminderManager';
import { StatusBarManager } from './features/statusbar/StatusBarManager';
import { LazySettingsTab } from './ui/settings/LazySettingsTab';
import { ensureCalendarIds, migrateAndSanitizeSettings } from './ui/settings/utilsSettings';
import { PLUGIN_SLUG } from './types';
import EventCache from './core/EventCache';
import { manageTimezone } from './features/timezone/Timezone';
import { Plugin, TFile, App, EventRef, ButtonComponent } from 'obsidian';
import type { Workspace } from 'obsidian';
import { initializeI18n, t } from './features/i18n/i18n';
import './styles.css';
import {
  livePreviewCoordinator,
  livePreviewStateField
} from './features/livepreview/LivePreviewCoordinator';

import { AppWithSettings } from './types/obsidian-ext';
import { FullCalendarSettings, DEFAULT_SETTINGS } from './types/settings';
import { ProviderRegistry } from './providers/ProviderRegistry';
import { PublicAPI, InternalAPI } from './api/FullCalendarAPI';
import { openNLPCommandModal, registerNLPCommand } from './features/nlp/registerNLPCommand';
import { registerCodeBlockProcessor } from './features/codeblock/CodeBlockProcessor';
import { triggerDevMilestoneIfActive } from './features/milestones/milestones';
/* Unplugged monthly report imports
import {
  registerMilestoneProtocolHandler,
  runMonthlyReportScheduler,
  checkAndCleanupTempNote,
  startupCleanupTempNote,
  generateAndOpenMonthlyReport
} from './features/milestones/monthlyReport';
*/

// Inline the view type constants to avoid loading the heavy view module at startup
const FULL_CALENDAR_VIEW_TYPE = 'full-calendar-view';
const FULL_CALENDAR_SIDEBAR_VIEW_TYPE = 'full-calendar-sidebar-view';

export default class FullCalendarPlugin extends Plugin {
  #activityWatchAutoSyncTimer: number | null = null;
  #activityWatchAutoSyncInFlight = false;

  #notificationManager!: NotificationManager;
  #statusBarManager!: StatusBarManager;
  #fcrReminderManager!: FcrReminderManager;

  #isMobile: boolean = false;
  #settingsTab?: LazySettingsTab;
  api!: PublicAPI;

  get fcrReminderManager(): FcrReminderManager {
    return this.#fcrReminderManager;
  }

  get notificationManager(): NotificationManager {
    return this.#notificationManager;
  }

  // Keep a snapshot of the last saved settings to detect changes reliable
  #loadedSettings: string = '';

  loadData(): Promise<unknown> {
    return Promise.reject(
      new Error('Full Calendar: direct data access is not exposed. Use the authorized API.')
    );
  }

  saveData(_data: unknown): Promise<void> {
    return Promise.reject(
      new Error('Full Calendar: direct data writes are not exposed. Use the authorized API.')
    );
  }

  /**
   * Plugin load lifecycle method.
   * This method is called when the plugin is enabled.
   * It initializes settings, sets up the EventCache, registers the calendar
   * and sidebar views, adds the ribbon icon and commands, and sets up
   * listeners for Vault file changes (create, rename, delete).
   */
  async onload() {
    // Polyfill ButtonComponent prototype for backwards compatibility with older Obsidian versions (pre-1.13.0)
    if (
      typeof ButtonComponent !== 'undefined' &&
      typeof ButtonComponent.prototype !== 'undefined'
    ) {
      if (!ButtonComponent.prototype.setDestructive) {
        interface LegacyButton {
          setWarning(): ButtonComponent;
        }
        ButtonComponent.prototype.setDestructive = function (this: ButtonComponent) {
          return (this as unknown as LegacyButton).setWarning();
        };
      }
      if (!ButtonComponent.prototype.removeDestructive) {
        ButtonComponent.prototype.removeDestructive = function (this: ButtonComponent) {
          this.buttonEl.classList.remove('mod-warning');
          return this;
        };
      }
    }

    // Initialize i18n system first, before any UI is rendered
    await initializeI18n(this.app, this.manifest.id);

    this.#isMobile = (this.app as App & { isMobile: boolean }).isMobile;

    PluginState.setPlugin(this);
    PluginState.setSettings(DEFAULT_SETTINGS);
    PluginState.setCache(new EventCache(this));
    PluginState.setProviderRegistry(new ProviderRegistry(this));
    PluginState.setInternalAPI(new InternalAPI());
    PluginState.setSaveSettings(() => this.#saveSettings());
    PluginState.setPersistData(() => this.#persistData());
    PluginState.setLoadSettings(() => this.#loadSettings());
    PluginState.setNonBlockingProcess((files, processor, description) =>
      this.#nonBlockingProcess(files, processor, description)
    );

    const openPluginSettingsTab = (): boolean => {
      const setting = (this.app as AppWithSettings).setting;
      if (!setting) return false;
      setting.open();
      setting.openTabById(this.manifest.id);
      return true;
    };

    const openPluginSettingsSubview = (openSubview: (tab: LazySettingsTab) => void): void => {
      openPluginSettingsTab();
      if (this.#settingsTab) {
        openSubview(this.#settingsTab);
      }
    };

    PluginState.setDisplaySettingsTab(() => {
      if (!openPluginSettingsTab()) {
        this.#settingsTab?.renderSettings();
      }
    });
    PluginState.setShowChangelog(() =>
      openPluginSettingsSubview(tab => {
        tab.showChangelog();
      })
    );
    PluginState.setShowMilestones(() =>
      openPluginSettingsSubview(tab => {
        tab.showMilestones();
      })
    );
    PluginState.setIsMobile(() => this.#isMobile);

    this.api = new PublicAPI(this);

    // Register all built-in providers in one call
    PluginState.getProviderRegistry().registerBuiltInProviders();

    await this.#loadSettings(); // This now handles setting and syncing

    await PluginState.getProviderRegistry().initializeInstances();

    this.#setupActivityWatchAutoSync();

    // Ensure the task backlog view is available immediately if a provider supports it.
    PluginState.getProviderRegistry().syncBacklogManagerLifecycle();

    await manageTimezone(this);

    // Link the two singletons.
    PluginState.getProviderRegistry().setCache(PluginState.getCache());
    PluginState.getProviderRegistry().listenForSourceChanges();

    PluginState.getCache().reset();
    PluginState.getCache().listenForSettingsChanges(this.app.workspace);

    // Start NotificationManager after providerRegistry is initialized
    this.#notificationManager = new NotificationManager(this);
    this.#notificationManager.update(PluginState.getSettings());
    this.#statusBarManager = new StatusBarManager(this);
    this.#statusBarManager.update(PluginState.getSettings());
    this.#fcrReminderManager = new FcrReminderManager(this);
    this.#fcrReminderManager.update(PluginState.getSettings());
    type WorkspaceEvents = Workspace & {
      on: Workspace['on'] &
        ((
          name: 'full-calendar:settings-updated',
          cb: (settings: FullCalendarSettings) => unknown,
          ctx?: unknown
        ) => EventRef) &
        ((name: string, cb: (...args: unknown[]) => unknown, ctx?: unknown) => EventRef);
      trigger: (name: string, ...data: unknown[]) => void;
      registerHoverLinkSource?: (id: string, def: { display: string; defaultMod: boolean }) => void;
    };

    const workspaceEvents = this.app.workspace as WorkspaceEvents;
    this.registerEvent(
      workspaceEvents.on(
        'full-calendar:settings-updated',
        this.#notificationManager.update.bind(this.#notificationManager)
      )
    );
    this.registerEvent(
      workspaceEvents.on(
        'full-calendar:settings-updated',
        this.#statusBarManager.update.bind(this.#statusBarManager)
      )
    );
    this.registerEvent(
      workspaceEvents.on(
        'full-calendar:settings-updated',
        this.#fcrReminderManager.update.bind(this.#fcrReminderManager)
      )
    );
    this.registerEvent(
      workspaceEvents.on(
        'full-calendar:settings-updated',
        PluginState.getCache().updateSettings.bind(PluginState.getCache())
      )
    );

    // Respond to obsidian events
    this.registerEvent(
      this.app.metadataCache.on('changed', file => {
        void PluginState.getProviderRegistry().handleFileUpdate(file);
      })
    );
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (file instanceof TFile) {
          // A rename is a delete at the old path.
          // The 'changed' event will pick up the creation at the new path.
          void PluginState.getProviderRegistry().handleFileDelete(oldPath);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on('delete', file => {
        if (file instanceof TFile) {
          void PluginState.getProviderRegistry().handleFileDelete(file.path);
        }
      })
    );

    /* Unplugged monthly statistics report file-cleaning layout observers
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        void checkAndCleanupTempNote(this.app);
      })
    );
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        void checkAndCleanupTempNote(this.app);
      })
    );
    */

    const { CalendarView } = await import('./ui/view');

    this.registerView(FULL_CALENDAR_VIEW_TYPE, leaf => new CalendarView(leaf, this, false));

    this.registerView(FULL_CALENDAR_SIDEBAR_VIEW_TYPE, leaf => new CalendarView(leaf, this, true));

    if (!this.#isMobile) {
      // Lazily import the view to avoid loading plotly on mobile.
      import('./chrono_analyser/AnalysisView')
        .then(({ AnalysisView, ANALYSIS_VIEW_TYPE }) => {
          this.registerView(ANALYSIS_VIEW_TYPE, leaf => new AnalysisView(leaf, this));
        })
        .catch(err => {
          console.error('Full Calendar: Failed to load Chrono Analyser view', err);
          showNotice(t('notices.chronoAnalyserLoadFailed'));
        });
    }

    // Register the calendar icon on left-side bar
    this.addRibbonIcon('calendar-glyph', t('ribbon.openCalendar'), async (_: MouseEvent) => {
      await PluginState.getInternalAPI().openCalendar();
    });

    // Register the NLP quick-add icon on left-side bar for fast access on mobile
    this.addRibbonIcon('file-text', t('commands.nlpQuickAdd'), (_: MouseEvent) => {
      openNLPCommandModal(this);
    });

    this.#settingsTab = new LazySettingsTab(this.app, this, PluginState.getProviderRegistry());
    this.addSettingTab(this.#settingsTab);

    // Commands visible in the command palette
    this.addCommand({
      id: 'full-calendar-new-event',
      name: t('commands.newEvent'),
      callback: () => {
        PluginState.getInternalAPI().openCreateModal();
      }
    });
    this.addCommand({
      id: 'full-calendar-reset',
      name: t('commands.resetCache'),
      callback: () => {
        PluginState.getCache().reset();
        this.app.workspace.detachLeavesOfType(FULL_CALENDAR_VIEW_TYPE);
        this.app.workspace.detachLeavesOfType(FULL_CALENDAR_SIDEBAR_VIEW_TYPE);
        showNotice(t('notices.cacheReset'));
      }
    });
    this.addCommand({
      id: 'full-calendar-revalidate',
      name: t('commands.revalidateRemote'),
      callback: () => {
        PluginState.getProviderRegistry().revalidateRemoteCalendars(true);
      }
    });
    this.addCommand({
      id: 'full-calendar-sync-activitywatch',
      name: t('commands.syncActivityWatch'),
      checkCallback: checking => {
        const isEnabled = PluginState.getSettings().activityWatch.enabled;
        if (!isEnabled) {
          return false;
        }
        if (!checking) {
          void (async () => {
            const { syncActivityWatch } = await import('./features/activitywatch/sync');
            await syncActivityWatch(this);
          })();
        }
        return true;
      }
    });
    this.addCommand({
      id: 'full-calendar-sync-fcr-reminder',
      name: t('commands.syncFcrReminder'),
      checkCallback: checking => {
        const companionSettings = PluginState.getSettings().fcrReminderCompanion;
        const isEnabled = companionSettings && companionSettings.enabled;
        if (!isEnabled) {
          return false;
        }
        if (!checking) {
          void (async () => {
            await this.#fcrReminderManager.syncToCompanion();
            showNotice(
              t('notices.fcrReminderSynced') || 'FCR Reminder Companion synchronized successfully.'
            );
          })();
        }
        return true;
      }
    });
    this.addCommand({
      id: 'full-calendar-open',
      name: t('commands.openCalendar'),
      callback: () => {
        void PluginState.getInternalAPI().openCalendar();
      }
    });

    if (this.#isMobile) {
      this.addCommand({
        id: 'full-calendar-open-analysis-mobile-disabled',
        name: t('commands.openChronoAnalyser'),
        callback: () => {
          showNotice(t('notices.chronoAnalyserMobileDisabled'));
        }
      });
    }

    this.addCommand({
      id: 'full-calendar-open-sidebar',
      name: t('commands.openSidebar'),
      callback: () => {
        void PluginState.getInternalAPI().openSidebar();
      }
    });

    /* Unplugged monthly report command palette command
    this.addCommand({
      id: 'full-calendar-show-monthly-report',
      name: 'Show monthly milestones & usage report',
      callback: () => {
        const now = new Date();
        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
        void generateAndOpenMonthlyReport(this.app, this, prevMonthStr);
      }
    });
    */

    // Register FCR Command (Natural Language Orchestrator)
    registerNLPCommand(this);

    // Register view content on hover
    workspaceEvents.registerHoverLinkSource?.(PLUGIN_SLUG, {
      display: 'Full Calendar',
      defaultMod: true
    });

    // registerMilestoneProtocolHandler(this);

    this.registerObsidianProtocolHandler('full-calendar-google-auth', async params => {
      if (params.code && params.state) {
        const { exchangeCodeForToken } = await import('./providers/google/auth/auth');
        await exchangeCodeForToken(params.code, params.state, this);
        this.#settingsTab?.renderSettings();
      } else {
        showNotice(t('notices.googleAuthFailed'));
        console.error('Google Auth Callback Error: Missing code or state.', params);
      }
    });

    this.registerEditorExtension(livePreviewStateField);
    this.registerEditorExtension(livePreviewCoordinator);

    // Register embedded calendar markdown code block processor
    registerCodeBlockProcessor(this);

    // Delayed background cache population for lazy start optimization
    this.app.workspace.onLayoutReady(() => {
      // void startupCleanupTempNote(this.app);
      // void runMonthlyReportScheduler(this.app, this);
      void triggerDevMilestoneIfActive();
      window.setTimeout(() => {
        const cache = PluginState.getCache();
        if (cache && !cache.initialized) {
          void cache.populate();
        }
      }, 3000); // 3 seconds delay after layout is ready
    });
  }

  /**
   * Plugin unload lifecycle method.
   * This method is called when the plugin is disabled.
   * It cleans up by detaching all calendar and sidebar views.
   */
  onunload() {
    this.#clearActivityWatchAutoSync();
    if (this.#notificationManager) {
      this.#notificationManager.unload();
    }
    if (this.#statusBarManager) {
      this.#statusBarManager.unload();
    }
    if (this.#fcrReminderManager) {
      this.#fcrReminderManager.unload();
    }
    PluginState.getProviderRegistry().stopListening();
    PluginState.getCache().stopListening();
    PluginState.clear();
    // NOTE: Per Obsidian plugin guidelines, do NOT detach leaves of custom views here.
    // Obsidian will handle stale views; detaching in onunload is considered an anti-pattern.
  }

  /**
   * Loads plugin settings from disk, merging them with default values.
   */
  async #loadSettings() {
    const persisted = (await super.loadData()) as Partial<FullCalendarSettings> | null;
    const loadedData: FullCalendarSettings = { ...DEFAULT_SETTINGS, ...(persisted ?? {}) };

    // All migration and sanitization logic is now encapsulated in this utility function.
    const { settings: migratedSettings, needsSave } = migrateAndSanitizeSettings(loadedData);

    PluginState.setSettings(migratedSettings);
    this.#loadedSettings = JSON.stringify(PluginState.getSettings());
    PluginState.getCache().enhancer.updateSettings(PluginState.getSettings());

    // Save back to disk if any migration or sanitization occurred.
    if (needsSave) {
      showNotice(t('notices.settingsUpdated'));
      await super.saveData(PluginState.getSettings());
    }

    // Check if we need to show the changelog
    const { checkAndShowWhatsNew } = await import('./ui/settings/changelogs/renderWhatsNew');
    checkAndShowWhatsNew(this);
  }

  /**
   * Saves the current plugin settings to disk.
   * After saving, it triggers a reset and repopulation of the event cache
   * to ensure all calendars are using the new settings.
   */
  async #saveSettings() {
    // Deep copy of settings BEFORE any modifications.
    const oldSettings = JSON.parse(
      JSON.stringify(PluginState.getSettings())
    ) as FullCalendarSettings;

    // Create a mutable copy to work with.
    const newSettings = { ...PluginState.getSettings() };

    // Sanitize calendar sources before saving to ensure all have IDs.
    const { sources } = ensureCalendarIds(newSettings.calendarSources);
    newSettings.calendarSources = sources;

    // Now, assign the fully-corrected settings object in one go.
    PluginState.setSettings(newSettings);

    await super.saveData(PluginState.getSettings());

    // Publish general settings update event for all subscribers
    this.app.workspace.trigger('full-calendar:settings-updated', PluginState.getSettings());

    // Compare old and new settings to determine which specific events to publish.
    const newSettingsString = JSON.stringify(PluginState.getSettings());

    // Parse both to objects to compare specific fields without worrying about property order
    const oldSettingsObj: FullCalendarSettings = this.#loadedSettings
      ? (JSON.parse(this.#loadedSettings) as FullCalendarSettings)
      : oldSettings;
    const newSettingsObj = PluginState.getSettings();

    const newSourcesString = JSON.stringify(newSettingsObj.calendarSources);
    const oldSourcesString = JSON.stringify(oldSettingsObj.calendarSources);

    if (newSourcesString !== oldSourcesString) {
      this.app.workspace.trigger('full-calendar:sources-changed');
    }

    const viewSettingsChanged =
      oldSettingsObj.firstDay !== newSettingsObj.firstDay ||
      oldSettingsObj.timeFormat24h !== newSettingsObj.timeFormat24h ||
      JSON.stringify(oldSettingsObj.initialView) !== JSON.stringify(newSettingsObj.initialView) ||
      oldSettingsObj.activeWorkspace !== newSettingsObj.activeWorkspace ||
      JSON.stringify(oldSettingsObj.businessHours) !==
        JSON.stringify(newSettingsObj.businessHours) ||
      oldSettingsObj.enableAdvancedCategorization !== newSettingsObj.enableAdvancedCategorization ||
      oldSettingsObj.displayTimezone !== newSettingsObj.displayTimezone ||
      JSON.stringify(oldSettingsObj.categorySettings) !==
        JSON.stringify(newSettingsObj.categorySettings);

    if (viewSettingsChanged) {
      this.app.workspace.trigger('full-calendar:view-config-changed');
    }

    // Update the snapshot
    this.#loadedSettings = newSettingsString;
    this.#setupActivityWatchAutoSync();

    // This manual call is now redundant and will be removed.
    // if (this.notificationManager) {
    //   this.notificationManager.update(PluginState.getSettings());
    // }
  }

  async #persistData() {
    await super.saveData(PluginState.getSettings());
    this.#loadedSettings = JSON.stringify(PluginState.getSettings());
  }

  #clearActivityWatchAutoSync(): void {
    if (this.#activityWatchAutoSyncTimer !== null) {
      window.clearInterval(this.#activityWatchAutoSyncTimer);
      this.#activityWatchAutoSyncTimer = null;
    }
  }

  #setupActivityWatchAutoSync(): void {
    this.#clearActivityWatchAutoSync();

    const aw = PluginState.getSettings().activityWatch;
    if (!aw.enabled || !aw.autoSyncEnabled || aw.syncStrategy !== 'auto') {
      return;
    }

    const intervalMinutes = Math.max(1, aw.autoSyncIntervalMins || 10);
    const intervalMs = intervalMinutes * 60 * 1000;

    this.#activityWatchAutoSyncTimer = window.setInterval(() => {
      void this.#runActivityWatchAutoSyncTick();
    }, intervalMs);
    this.registerInterval(this.#activityWatchAutoSyncTimer);
  }

  async #runActivityWatchAutoSyncTick(): Promise<void> {
    if (this.#activityWatchAutoSyncInFlight) {
      return;
    }

    const aw = PluginState.getSettings().activityWatch;
    if (!aw.enabled || !aw.autoSyncEnabled || aw.syncStrategy !== 'auto') {
      return;
    }

    this.#activityWatchAutoSyncInFlight = true;
    try {
      const { syncActivityWatch } = await import('./features/activitywatch/sync');
      await syncActivityWatch(this, { suppressNotices: true, trigger: 'auto' });
    } catch (error) {
      console.error('ActivityWatch auto-sync failed:', error);
    } finally {
      this.#activityWatchAutoSyncInFlight = false;
    }
  }

  /**
   * Performs a non-blocking iteration over a list of files to apply a processor function.
   * Shows a progress notice to the user.
   * @param files The array of TFile objects to process.
   * @param processor The async function to apply to each file.
   * @param description A description of the operation for the notice.
   */
  #nonBlockingProcess(
    files: TFile[],
    processor: (file: TFile) => Promise<void>,
    description: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const BATCH_SIZE = 10;
      let index = 0;
      const notice = showNotice('', 0); // Indefinite notice

      const processBatch = () => {
        // End condition
        if (index >= files.length) {
          notice.hide();
          resolve();
          // The calling function will show the final completion notice.
          return;
        }

        notice.setMessage(`${description}: ${index}/${files.length}`);
        const batch = files.slice(index, index + BATCH_SIZE);

        Promise.all(batch.map(processor))
          .then(() => {
            index += BATCH_SIZE;
            // Yield to the main thread before processing the next batch
            window.setTimeout(processBatch, 20);
          })
          .catch(err => {
            console.error('Error during bulk processing batch', err);
            notice.hide();
            showNotice(t('notices.bulkUpdateError'));
            reject(err instanceof Error ? err : new Error(String(err)));
          });
      };

      processBatch();
    });
  }
}
