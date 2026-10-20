import { Setting } from 'obsidian';
import { PluginState } from '../../../core/PluginState';
import { t } from '../../i18n/i18n';
import { createDescWithDocs } from '../../../ui/settings/docsLinks';

/**
 * Renders the toggle setting for storing credentials in plaintext (legacy/sync compatibility).
 */
export function renderCredentialsSettings(containerEl: HTMLElement, onChange: () => void): void {
  new Setting(containerEl)
    .setName(t('settings.credentials.legacyToggle.name'))
    .setDesc(
      createDescWithDocs(t('settings.credentials.legacyToggle.desc'), [
        { text: 'Secure credential storage', path: 'user/settings/api' },
        { text: 'Troubleshooting', path: 'user/guides/troubleshooting' }
      ])
    )
    .addToggle(toggle => {
      toggle
        .setValue(PluginState.getSettings().useLegacyPlaintextCredentials)
        .onChange(async value => {
          PluginState.getSettings().useLegacyPlaintextCredentials = value;
          await PluginState.saveSettings();
          onChange();
        });
    });
}
