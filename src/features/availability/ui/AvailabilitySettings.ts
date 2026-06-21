/**
 * @file AvailabilitySettings.ts
 * @brief Renders configuration settings for the Availability Sharing feature in the plugin settings panel.
 * @license See LICENSE.md
 */

import { Modal, Setting } from 'obsidian';
import { PluginState } from '../../../core/PluginState';
import { CredentialStore } from '../../credentials/CredentialStore';
import FullCalendarPlugin from '../../../main';
import { t } from '../../i18n/i18n';
import { openExternalUrl } from '../../../utils/openExternalUrl';
import { createDescWithDocs } from '../../../ui/settings/docsLinks';

export class AvailabilitySettingsModal extends Modal {
  private plugin: FullCalendarPlugin;
  private onChange: () => void;

  constructor(plugin: FullCalendarPlugin, onChange: () => void) {
    super(plugin.app);
    this.plugin = plugin;
    this.onChange = onChange;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    // Modal Title
    this.titleEl.setText(t('availability.settings.header'));

    // GitHub Personal Access Token
    const tokenSetting = new Setting(contentEl)
      .setName(t('availability.settings.githubPat'))
      .setDesc(
        createDescWithDocs(t('availability.settings.githubPatDesc'), [
          { text: t('availability.settings.links.security'), path: 'user/settings/api' }
        ])
      )
      .addText(text => {
        text.inputEl.type = 'password';
        text.setValue(CredentialStore.getGitHubToken() || '').onChange(async value => {
          CredentialStore.setGitHubToken(value ? value.trim() : null);
          await PluginState.saveSettings();
        });
      });

    // Setup/Onboarding Helper Link
    const descEl = tokenSetting.descEl;
    const linkDiv = descEl.createDiv();
    linkDiv.setCssProps({ marginTop: '6px' });
    const tokenLink = linkDiv.createEl('a', {
      text: t('availability.settings.githubPatLink')
    });
    tokenLink.setAttribute('href', '#');
    tokenLink.addEventListener('click', e => {
      e.preventDefault();
      openExternalUrl(
        'https://github.com/settings/tokens/new?scopes=gist&description=Obsidian%20Full%20Calendar%20Availability%20Sharing'
      );
    });

    // Data Privacy & Cleanup Info Section
    const privacySetting = new Setting(contentEl)
      .setName(t('availability.settings.privacyCleanupTitle'))
      .setDesc(t('availability.settings.privacyCleanupDesc'));

    const privacyDescEl = privacySetting.descEl;
    const privacyLinksDiv = privacyDescEl.createDiv();
    privacyLinksDiv.setCssProps({ marginTop: '6px' });

    privacyLinksDiv.createEl('span', {
      text: `${t('availability.settings.cleanupTokenHelp')} `
    });

    const gistDashboardLink = privacyLinksDiv.createEl('a', {
      text: t('availability.settings.cleanupGistLink')
    });
    gistDashboardLink.setAttribute('href', '#');
    gistDashboardLink.addEventListener('click', e => {
      e.preventDefault();
      openExternalUrl('https://gist.github.com/');
    });

    // Default Export Path
    new Setting(contentEl)
      .setName(t('availability.settings.exportPath'))
      .setDesc(
        createDescWithDocs(t('availability.settings.exportPathDesc'), [
          { text: t('availability.settings.links.guide'), path: 'user/features/availability' }
        ])
      )
      .addText(text => {
        text
          .setValue(PluginState.getSettings().availabilityExportPath || '')
          .setPlaceholder('E.g., calendars/availability')
          .onChange(async value => {
            PluginState.getSettings().availabilityExportPath = value.trim();
            await PluginState.saveSettings();
          });
      });

    // Default Daily Start Hour
    new Setting(contentEl)
      .setName(t('availability.settings.startTime'))
      .setDesc(
        createDescWithDocs(t('availability.settings.startTimeDesc'), [
          { text: t('availability.settings.links.guide'), path: 'user/features/availability' }
        ])
      )
      .addText(text => {
        text.inputEl.type = 'time';
        text
          .setValue(PluginState.getSettings().availabilityDefaultTimeRange?.startTime || '09:00')
          .onChange(async value => {
            if (!PluginState.getSettings().availabilityDefaultTimeRange) {
              PluginState.getSettings().availabilityDefaultTimeRange = {
                startTime: '09:00',
                endTime: '17:00'
              };
            }
            PluginState.getSettings().availabilityDefaultTimeRange.startTime = value;
            await PluginState.saveSettings();
          });
      });

    // Default Daily End Hour
    new Setting(contentEl)
      .setName(t('availability.settings.endTime'))
      .setDesc(
        createDescWithDocs(t('availability.settings.endTimeDesc'), [
          { text: t('availability.settings.links.guide'), path: 'user/features/availability' }
        ])
      )
      .addText(text => {
        text.inputEl.type = 'time';
        text
          .setValue(PluginState.getSettings().availabilityDefaultTimeRange?.endTime || '17:00')
          .onChange(async value => {
            if (!PluginState.getSettings().availabilityDefaultTimeRange) {
              PluginState.getSettings().availabilityDefaultTimeRange = {
                startTime: '09:00',
                endTime: '17:00'
              };
            }
            PluginState.getSettings().availabilityDefaultTimeRange.endTime = value;
            await PluginState.saveSettings();
          });
      });
  }

  onClose(): void {
    super.onClose();
    this.onChange();
  }
}

export function renderAvailabilitySettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  new Setting(containerEl)
    .setName(t('availability.settings.header'))
    .setDesc(
      createDescWithDocs(t('availability.settings.headerDesc'), [
        { text: t('availability.settings.links.guide'), path: 'user/features/availability' },
        { text: t('availability.settings.links.security'), path: 'user/settings/api' },
        { text: t('availability.settings.links.privacy'), path: 'user/legal/privacy-policy' }
      ])
    )
    .addExtraButton(button => {
      button
        .setIcon('gear')
        .setTooltip(t('availability.settings.githubPatLink')) // Reuses existing translation key for tooltip or placeholder
        .onClick(() => {
          new AvailabilitySettingsModal(plugin, rerender).open();
        });
    });
}
