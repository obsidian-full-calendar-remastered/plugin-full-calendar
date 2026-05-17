/**
 * @file renderWhatsNew.ts
 * @brief Renders the "What's New" section using native Obsidian components.
 * @license See LICENSE.md
 */

import { PluginState } from '../../../core/PluginState';
import { Setting } from 'obsidian';
import { changelogData } from './changelogData';
import './changelog.css';
import { t } from '../../../features/i18n/i18n';
import FullCalendarPlugin from '../../../main';
import { WhatsNewModal } from '../../modals/WhatsNewModal';
import { createMarkdownLinksFragment } from '../linkTextFragments';

/**
 * Checks if the plugin version has changed and displays the "What's New" modal if necessary.
 * This should be called after settings are loaded.
 */
export function checkAndShowWhatsNew(plugin: FullCalendarPlugin): void {
  const releaseVersion = plugin.manifest.version;

  // Defer to onLayoutReady to ensure the UI is initialized before showing the modal
  plugin.app.workspace.onLayoutReady(async () => {
    if (
      PluginState.getSettings().currentVersion === null ||
      PluginState.getSettings().currentVersion !== releaseVersion
    ) {
      new WhatsNewModal(plugin.app, plugin).open();

      const { refreshRemoteAssetsForVersionUpdate } =
        await import('../../../features/remoteAssets/versionedAssetRefresh');
      await refreshRemoteAssetsForVersionUpdate(plugin.app, plugin.manifest.id);

      // Update the persisted version
      PluginState.getSettings().currentVersion = releaseVersion;
      await PluginState.saveSettings();
    }
  });
}

export function renderWhatsNew(containerEl: HTMLElement, onShowChangelog: () => void): void {
  const whatsNewContainer = containerEl.createDiv('full-calendar-whats-new-container');
  const latestVersion = changelogData[0];

  const headerEl = whatsNewContainer.createDiv('full-calendar-whats-new-header');
  new Setting(headerEl)
    .setName(t('settings.changelog.whatsNew'))
    .setHeading()
    .setDesc(t('settings.changelog.versionWithNumber', { version: latestVersion.version }));
  new Setting(headerEl).addExtraButton(button => {
    button
      .setIcon('ellipsis')
      .setTooltip(t('settings.changelog.viewFull'))
      .onClick(onShowChangelog);
  });

  whatsNewContainer.createEl('hr', { cls: 'settings-view-new-divider' });

  const whatsNewList = whatsNewContainer.createDiv('full-calendar-whats-new-list');
  latestVersion.changes.forEach(change => {
    const item = new Setting(whatsNewList)
      .setName(change.title)
      .setDesc(createMarkdownLinksFragment(change.description));

    const iconEl = containerEl.ownerDocument.createElement('span');
    iconEl.className = `change-icon-settings change-type-${change.type}`;
    if (change.type === 'new') {
      iconEl.textContent = '+';
    } else if (change.type === 'improvement') {
      iconEl.textContent = '🔧';
    } else if (change.type === 'fix') {
      iconEl.textContent = '🐛';
    }

    item.nameEl.prepend(iconEl);
    item.settingEl.addClass('full-calendar-whats-new-item');
    item.controlEl.empty();
  });
}
