/**
 * @file renderExportSettings.ts
 * @brief Renders configuration settings for the ICS Export feature.
 * @license See LICENSE.md
 */

import { Setting } from 'obsidian';
import { PluginState } from '../../../core/PluginState';
import FullCalendarPlugin from '../../../main';
import { t } from '../../i18n/i18n';

export function renderExportSettings(
  containerEl: HTMLElement,
  _plugin: FullCalendarPlugin,
  _rerender: () => void
): void {
  containerEl.createEl('h3', { text: t('settings.export.header') || 'ICS Export' });

  new Setting(containerEl)
    .setName(t('settings.export.path') || 'Default Export Path')
    .setDesc(
      t('settings.export.pathDesc') ||
        'Vault folder where the exported .ics files will be saved by default (e.g., calendars/exports).'
    )
    .addText(text => {
      text
        .setValue(PluginState.getSettings().icsExportPath || '')
        .setPlaceholder('E.g., calendars/exports')
        .onChange(async value => {
          PluginState.getSettings().icsExportPath = value.trim();
          await PluginState.saveSettings();
        });
    });
}
