/**
 * @file renderGoogle.ts
 * @brief Renders the Google Account management section and modal content.
 * @license See LICENSE.md
 */

import { Setting } from 'obsidian';
import { PluginState } from '../../../core/PluginState';
import FullCalendarPlugin from '../../../main';
import { GoogleAuthManager } from '../auth/GoogleAuthManager';
import { t } from '../../../features/i18n/i18n';
import { createDescWithDocs } from '../../../ui/settings/docsLinks';
import { SettingsModal } from '../../../ui/modals/SettingsModal';

/**
 * Renders the internal Google settings controls (used inside the common SettingsModal).
 */
export function renderGoogleSettingsContent(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  const authManager = new GoogleAuthManager(plugin);

  // Copy-paste Auth toggle
  new Setting(containerEl)
    .setName(t('google.copyPasteAuth.enable.label'))
    .setDesc(t('google.copyPasteAuth.enable.description'))
    .addToggle(toggle => {
      toggle.setValue(PluginState.getSettings().googleUseCopyPasteAuth).onChange(async value => {
        PluginState.getSettings().googleUseCopyPasteAuth = value;
        await PluginState.saveSettings();
        rerender();
      });
    });

  // Custom credentials toggle
  new Setting(containerEl)
    .setName(t('google.customCredentials.enable.label'))
    .setDesc(
      createDescWithDocs(t('google.customCredentials.enable.description'), [
        { text: 'Google calendar setup', path: 'user/calendars/gcal' }
      ])
    )
    .addToggle(toggle => {
      toggle.setValue(PluginState.getSettings().useCustomGoogleClient).onChange(async value => {
        PluginState.getSettings().useCustomGoogleClient = value;
        await PluginState.saveSettings();
        rerender();
      });
    });

  // Custom credentials inputs (only shown when toggle is enabled)
  if (PluginState.getSettings().useCustomGoogleClient) {
    new Setting(containerEl)
      .setName(t('google.customCredentials.clientId.label'))
      .setDesc(t('google.customCredentials.clientId.description'))
      .addText(text => {
        text.setValue(PluginState.getSettings().googleClientId).onChange(async value => {
          PluginState.getSettings().googleClientId = value;
          await PluginState.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t('google.customCredentials.clientSecret.label'))
      .setDesc(t('google.customCredentials.clientSecret.description'))
      .addText(text => {
        text.inputEl.type = 'password';
        text.setValue(PluginState.getSettings().googleClientSecret).onChange(async value => {
          PluginState.getSettings().googleClientSecret = value;
          await PluginState.saveSettings();
        });
      });
  }

  containerEl.createEl('h3', { text: t('google.title') });

  const accounts = PluginState.getSettings().googleAccounts || [];

  if (accounts.length === 0) {
    containerEl.createEl('p', {
      text: t('google.noAccounts'),
      cls: 'setting-item-description'
    });
  }

  accounts.forEach(account => {
    new Setting(containerEl)
      .setName(account.email)
      .setDesc(t('google.accountDescription', { id: account.id }))
      .addButton(button => {
        button
          .setButtonText(t('google.buttons.disconnect'))
          .setClass('mod-warning')
          .onClick(async () => {
            await authManager.removeAccount(account.id);
            rerender();
          });
      });
  });
}

/**
 * Renders the consolidated Google integration setting row with gear button.
 */
export function renderGoogleSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  new Setting(containerEl)
    .setName(t('google.title'))
    .setDesc(
      createDescWithDocs(t('google.description'), [
        { text: 'Google calendar setup', path: 'user/calendars/gcal' },
        { text: 'Calendar sources settings', path: 'user/settings/sources' },
        { text: 'Troubleshooting', path: 'user/guides/troubleshooting' }
      ])
    )
    .addExtraButton(button => {
      button
        .setIcon('gear')
        .setTooltip(t('google.configTooltip'))
        .onClick(() => {
          SettingsModal.open(
            plugin.app,
            {
              title: t('google.title') || 'Google Accounts',
              docsLinks: [
                { text: 'Google calendar setup', path: 'user/calendars/gcal' },
                { text: 'Calendar sources settings', path: 'user/settings/sources' },
                { text: 'Troubleshooting', path: 'user/guides/troubleshooting' }
              ]
            },
            (contentEl, rerenderModal) => {
              renderGoogleSettingsContent(contentEl, plugin, () => {
                rerenderModal();
                rerender();
              });
            }
          );
        });
    });
}
