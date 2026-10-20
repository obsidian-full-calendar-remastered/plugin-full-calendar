/**
 * @file renderOutlook.ts
 * @brief Renders the Microsoft Outlook management section and modal content.
 * @license See LICENSE.md
 */

import { Setting } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { PluginState } from '../../../core/PluginState';
import { OutlookAuthManager } from '../auth/OutlookAuthManager';
import { t } from '../../../features/i18n/i18n';
import { createDescWithDocs } from '../../../ui/settings/docsLinks';
import { SettingsModal } from '../../../ui/modals/SettingsModal';

/**
 * Renders the internal Outlook settings controls (used inside the common SettingsModal).
 */
export function renderOutlookSettingsContent(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  const authManager = new OutlookAuthManager(plugin);

  new Setting(containerEl)
    .setName(t('outlook.customCredentials.enable.label'))
    .setDesc(t('outlook.customCredentials.enable.description'))
    .addToggle(toggle => {
      toggle.setValue(PluginState.getSettings().useCustomMicrosoftClient).onChange(async value => {
        PluginState.getSettings().useCustomMicrosoftClient = value;
        await PluginState.saveSettings();
        rerender();
      });
    });

  if (PluginState.getSettings().useCustomMicrosoftClient) {
    new Setting(containerEl)
      .setName(t('outlook.config.clientId.label'))
      .setDesc(t('outlook.config.clientId.description'))
      .addText(text => {
        text.setPlaceholder(t('outlook.config.clientIdPlaceholder'));
        text.setValue(PluginState.getSettings().microsoftClientId || '').onChange(async value => {
          PluginState.getSettings().microsoftClientId = value;
          await PluginState.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t('outlook.config.proxyUrl.label'))
      .setDesc(t('outlook.config.proxyUrl.description'))
      .addText(text => {
        text.setPlaceholder(t('outlook.config.proxyUrl.placeholder'));
        text
          .setValue(PluginState.getSettings().microsoftProxyBaseUrl || '')
          .onChange(async value => {
            PluginState.getSettings().microsoftProxyBaseUrl = value;
            await PluginState.saveSettings();
          });
      });
  }

  containerEl.createEl('h3', { text: t('outlook.title') });

  const accounts = PluginState.getSettings().microsoftAccounts || [];
  if (accounts.length === 0) {
    containerEl.createEl('p', {
      text: t('outlook.noAccounts'),
      cls: 'setting-item-description'
    });
  }

  accounts.forEach(account => {
    new Setting(containerEl)
      .setName(account.email)
      .setDesc(t('outlook.accountDescription', { id: account.id }))
      .addButton(button => {
        button
          .setButtonText(t('outlook.buttons.disconnect'))
          .setClass('mod-warning')
          .onClick(async () => {
            await authManager.removeAccount(account.id);
            rerender();
          });
      });
  });
}

/**
 * Renders the consolidated Outlook integration setting row with gear button.
 */
export function renderOutlookSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  new Setting(containerEl)
    .setName(t('outlook.title'))
    .setDesc(
      createDescWithDocs(t('outlook.description'), [
        { text: t('outlook.docs.setupGuide'), path: 'user/calendars/outlook' },
        { text: t('outlook.misc.settingsSourcesLink'), path: 'user/settings/sources' },
        { text: 'Troubleshooting', path: 'user/guides/troubleshooting' }
      ])
    )
    .addExtraButton(button => {
      button
        .setIcon('gear')
        .setTooltip(t('outlook.configTooltip'))
        .onClick(() => {
          SettingsModal.open(
            plugin.app,
            {
              title: t('outlook.title') || 'Outlook Accounts',
              docsLinks: [
                {
                  text: t('outlook.docs.setupGuide'),
                  path: 'user/calendars/outlook'
                },
                {
                  text: t('outlook.misc.settingsSourcesLink'),
                  path: 'user/settings/sources'
                },
                { text: 'Troubleshooting', path: 'user/guides/troubleshooting' }
              ]
            },
            (contentEl, rerenderModal) => {
              renderOutlookSettingsContent(contentEl, plugin, () => {
                rerenderModal();
                rerender();
              });
            }
          );
        });
    });
}
