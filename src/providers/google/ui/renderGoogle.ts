/**
 * @file renderGoogle.ts
 * @brief Renders the Google Account management section of the settings tab.
 * @license See LICENSE.md
 */

import { PluginState } from '../../../core/PluginState';
import { Setting } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { GoogleAuthManager } from '../auth/GoogleAuthManager';
import { t } from '../../../features/i18n/i18n';
import { createDescWithDocs, createDocsLinksFragment } from '../../../ui/settings/docsLinks';

export function renderGoogleSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  const authManager = new GoogleAuthManager(plugin);

  new Setting(containerEl)
    .setName(t('google.title'))
    .setHeading()
    .setDesc(
      createDocsLinksFragment([
        { text: 'Google calendar setup', path: 'user/calendars/gcal' },
        { text: 'Calendar sources settings', path: 'user/settings/sources' },
        { text: 'Troubleshooting', path: 'user/guides/troubleshooting' }
      ])
    );

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

  const accounts = PluginState.getSettings().googleAccounts || [];

  if (accounts.length === 0) {
    containerEl.createEl('p', {
      text: t('google.noAccounts')
    });
  }

  accounts.forEach(account => {
    new Setting(containerEl)
      .setName(account.email)
      .setDesc(t('google.accountDescription', { id: account.id }))
      .addButton(button => {
        button
          .setButtonText(t('google.buttons.disconnect'))
          .setWarning()
          .onClick(async () => {
            await authManager.removeAccount(account.id);
            rerender();
          });
      });
  });
}
