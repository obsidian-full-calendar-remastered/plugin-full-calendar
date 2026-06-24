/**
 * @file renderBreakTimerSettings.ts
 * @brief Renders the Break Timer configuration section in settings.
 * @license See LICENSE.md
 */

import { PluginState } from '../../../core/PluginState';
import { Setting } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { t } from '../../i18n/i18n';

export function renderBreakTimerSettings(
  containerEl: HTMLElement,
  _plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  new Setting(containerEl).setName(t('settings.breakTimer.title')).setHeading();

  new Setting(containerEl)
    .setName(t('settings.breakTimer.enable.label'))
    .setDesc(t('settings.breakTimer.enable.description'))
    .addToggle(toggle => {
      toggle.setValue(PluginState.getSettings().breakTimer.enabled);
      toggle.onChange(async val => {
        PluginState.getSettings().breakTimer.enabled = val;
        await PluginState.saveSettings();
        rerender();
      });
    });

  if (PluginState.getSettings().breakTimer.enabled) {
    new Setting(containerEl)
      .setName(t('settings.breakTimer.interval.label'))
      .setDesc(t('settings.breakTimer.interval.description'))
      .addText(text => {
        text.inputEl.type = 'number';
        text.setValue(String(PluginState.getSettings().breakTimer.intervalMins));
        text.onChange(async val => {
          const parsed = parseInt(val, 10);
          if (!isNaN(parsed) && parsed > 0) {
            PluginState.getSettings().breakTimer.intervalMins = parsed;
            await PluginState.saveSettings();
          }
        });
      });

    new Setting(containerEl)
      .setName(t('settings.breakTimer.idleThreshold.label'))
      .setDesc(t('settings.breakTimer.idleThreshold.description'))
      .addText(text => {
        text.inputEl.type = 'number';
        text.setValue(String(PluginState.getSettings().breakTimer.idleThresholdMins));
        text.onChange(async val => {
          const parsed = parseInt(val, 10);
          if (!isNaN(parsed) && parsed >= 0) {
            PluginState.getSettings().breakTimer.idleThresholdMins = parsed;
            await PluginState.saveSettings();
          }
        });
      });

    new Setting(containerEl)
      .setName(t('settings.breakTimer.duration.label'))
      .setDesc(t('settings.breakTimer.duration.description'))
      .addText(text => {
        text.inputEl.type = 'number';
        text.setValue(String(PluginState.getSettings().breakTimer.breakDurationSecs));
        text.onChange(async val => {
          const parsed = parseInt(val, 10);
          if (!isNaN(parsed) && parsed > 0) {
            PluginState.getSettings().breakTimer.breakDurationSecs = parsed;
            await PluginState.saveSettings();
          }
        });
      });
  }
}
