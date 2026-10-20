/**
 * @file renderFcrReminder.ts
 * @brief Renders the FCR Reminder settings section and modal content.
 * @license See LICENSE.md
 */

import { PluginState } from '../../../core/PluginState';
import { Setting } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { t } from '../../../features/i18n/i18n';
import { createDescWithDocs } from '../../../ui/settings/docsLinks';
import { SettingsModal } from '../../../ui/modals/SettingsModal';

/**
 * Renders the internal FCR Reminder settings controls (used inside the common SettingsModal).
 */
export function renderFcrReminderSettingsContent(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  const manager = plugin.fcrReminderManager;
  if (!manager) {
    containerEl.createEl('p', {
      text: 'Fcr reminder companion manager is not initialized.',
      cls: 'setting-item-description'
    });
    return;
  }

  const companionSettings = manager.getCompanionSettings();

  // 1. Enable/Disable Toggle
  new Setting(containerEl)
    .setName(t('settings.fcrReminder.enable.label'))
    .setDesc(t('settings.fcrReminder.enable.description'))
    .addToggle(toggle => {
      toggle.setValue(companionSettings.enabled);
      toggle.onChange(async val => {
        PluginState.getSettings().fcrReminderCompanion.enabled = val;
        await PluginState.saveSettings();
        rerender();
      });
    });

  // 2. Companion Settings UI when enabled
  if (companionSettings.enabled) {
    // 2.1. API Server URL
    new Setting(containerEl)
      .setName(t('settings.fcrReminder.apiUrl.label'))
      .setDesc(t('settings.fcrReminder.apiUrl.description'))
      .addText(text => {
        text.inputEl.type = 'text';
        text.setPlaceholder(t('settings.fcrReminder.apiUrl.placeholder'));
        text.setValue(companionSettings.apiUrl || t('settings.fcrReminder.apiUrl.placeholder'));
        text.onChange(val => {
          PluginState.getSettings().fcrReminderCompanion.apiUrl = val.trim();
          void PluginState.saveSettings(false);
        });
      });

    // 2.2. Offline Warning Banner element
    const bannerEl = containerEl.createDiv('full-calendar-companion-offline-banner');
    bannerEl.setCssProps({
      backgroundColor: 'rgba(224, 86, 86, 0.08)',
      border: '1px solid var(--background-modifier-error)',
      color: 'var(--text-normal)',
      padding: '12px 16px',
      borderRadius: '6px',
      marginTop: '12px',
      marginBottom: '12px',
      fontSize: '13px',
      lineHeight: '1.4',
      display: 'none'
    });

    const titleSpan = bannerEl.createEl('strong', {
      text: t('settings.fcrReminder.offlineBanner.title')
    });
    titleSpan.setCssProps({
      display: 'block',
      marginBottom: '4px'
    });

    bannerEl.createSpan({
      text: t('settings.fcrReminder.offlineBanner.message')
    });

    // 2.3. Asynchronous Status Verification Check
    void (async () => {
      const isOnline = await manager.checkDaemonStatus();
      if (!isOnline) {
        bannerEl.setCssProps({ display: 'block' });
      } else {
        bannerEl.setCssProps({ display: 'none' });
      }
    })();
  }
}

/**
 * Renders the consolidated FCR Reminder integration setting row with gear button.
 */
export function renderFcrReminderSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  const manager = plugin.fcrReminderManager;
  const companionSettings = manager
    ? manager.getCompanionSettings()
    : PluginState.getSettings().fcrReminderCompanion;

  new Setting(containerEl)
    .setName(t('settings.fcrReminder.title'))
    .setDesc(
      createDescWithDocs(t('settings.fcrReminder.description'), [
        { text: t('settings.fcrReminder.learnMore'), path: 'user/features/fcr-reminder' },
        { text: 'Troubleshooting', path: 'user/guides/troubleshooting' }
      ])
    )
    .addToggle(toggle => {
      toggle.setValue(companionSettings.enabled);
      toggle.onChange(async val => {
        PluginState.getSettings().fcrReminderCompanion.enabled = val;
        await PluginState.saveSettings();
        rerender();
      });
    })
    .addExtraButton(button => {
      button
        .setIcon('gear')
        .setTooltip(t('settings.fcrReminder.configButton'))
        .onClick(() => {
          SettingsModal.open(
            plugin.app,
            {
              title: t('settings.fcrReminder.title') || 'FCR Reminder Companion',
              headerDesc: t('settings.fcrReminder.description'),
              docsLinks: [
                {
                  text: t('settings.fcrReminder.learnMore'),
                  path: 'user/features/fcr-reminder'
                },
                { text: 'Troubleshooting', path: 'user/guides/troubleshooting' }
              ]
            },
            (contentEl, rerenderModal) => {
              renderFcrReminderSettingsContent(contentEl, plugin, () => {
                rerenderModal();
                rerender();
              });
            }
          );
        });
    });
}
