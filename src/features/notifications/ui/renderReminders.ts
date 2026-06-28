/**
 * @file renderReminders.ts
 * @brief Renders the reminders settings section of the plugin settings tab.
 * @license See LICENSE.md
 */

import { PluginState } from '../../../core/PluginState';
import { Setting } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { t } from '../../i18n/i18n';
import { createDescWithDocs, createDocsLinksFragment } from '../../../ui/settings/docsLinks';

export function renderRemindersSettings(
  containerEl: HTMLElement,
  _plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  new Setting(containerEl)
    .setName(t('settings.reminders.title'))
    .setHeading()
    .setDesc(
      createDocsLinksFragment([
        { text: 'Reminders and notifications', path: 'user/features/reminders' },
        { text: 'Troubleshooting', path: 'user/guides/troubleshooting' }
      ])
    );

  new Setting(containerEl)
    .setName(t('settings.reminders.enableDefault.label'))
    .setDesc(
      createDescWithDocs(t('settings.reminders.enableDefault.description'), [
        { text: 'Reminders and notifications', path: 'user/features/reminders' }
      ])
    )
    .addToggle(toggle => {
      toggle.setValue(PluginState.getSettings().enableDefaultReminder);
      toggle.onChange(async val => {
        PluginState.getSettings().enableDefaultReminder = val;
        await PluginState.saveSettings();
        rerender();
      });
    });

  if (PluginState.getSettings().enableDefaultReminder) {
    new Setting(containerEl)
      .setName(t('settings.reminders.defaultTime.label'))
      .setDesc(t('settings.reminders.defaultTime.description'))
      .addText(text => {
        text.inputEl.type = 'number';
        text.setValue(String(PluginState.getSettings().defaultReminderMinutes));
        text.onChange(val => {
          const parsed = parseInt(val, 10);
          if (!isNaN(parsed) && parsed >= 0) {
            PluginState.getSettings().defaultReminderMinutes = parsed;
            void PluginState.saveSettings(false);
          }
        });
      });
  }
}
