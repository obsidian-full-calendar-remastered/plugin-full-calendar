/**
 * @file LazySettingsTab.ts
 * @brief Lightweight wrapper for lazy-loading the heavy SettingsTab component.
 *
 * @description
 * This wrapper implements the PluginSettingTab interface but defers loading
 * the actual FullCalendarSettingTab until it's needed. This prevents the
 * heavy React/settings dependencies from being loaded during plugin startup,
 * significantly improving Obsidian's startup performance.
 */

import { App, PluginSettingTab } from 'obsidian';
import type FullCalendarPlugin from '../../main';
import type { FullCalendarSettingTab } from './SettingsTab';
import type { ProviderRegistry } from '../../providers/ProviderRegistry';

export class LazySettingsTab extends PluginSettingTab {
  private actualTab?: FullCalendarSettingTab;
  private plugin: FullCalendarPlugin;
  private registry: ProviderRegistry;

  constructor(app: App, plugin: FullCalendarPlugin, registry: ProviderRegistry) {
    super(app, plugin);
    this.plugin = plugin;
    this.registry = registry;
  }

  /**
   * Lazy-loads the actual SettingsTab when first accessed.
   */
  private async ensureActualTab(): Promise<FullCalendarSettingTab> {
    if (!this.actualTab) {
      const { FullCalendarSettingTab } = await import('./SettingsTab');
      this.actualTab = new FullCalendarSettingTab(this.app, this.plugin, this.registry);
    }
    return this.actualTab;
  }

  private runWithActualTab(action: (tab: FullCalendarSettingTab) => void): void {
    void (async () => {
      const tab = await this.ensureActualTab();
      // Use the container provided by Obsidian for this lazy wrapper tab.
      (tab as PluginSettingTab).containerEl = this.containerEl;
      action(tab);
    })();
  }

  display(): void {
    this.renderSettings();
  }

  renderSettings(): void {
    this.runWithActualTab(tab => {
      tab.renderSettings();
    });
  }

  hide(): void {
    // Only call hide if the tab has been loaded
    this.actualTab?.hide();
  }

  showChangelog(): void {
    this.runWithActualTab(tab => {
      tab.showChangelog();
    });
  }

  showMilestones(): void {
    this.runWithActualTab(tab => {
      tab.showMilestones();
    });
  }
}
