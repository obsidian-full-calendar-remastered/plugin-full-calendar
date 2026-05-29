/**
 * @file WeatherSettings.ts
 * @brief Renders the weather settings section of the plugin settings tab.
 * @license See LICENSE.md
 */

import { Setting } from 'obsidian';
import { PluginState } from '../../core/PluginState';
import FullCalendarPlugin from '../../main';
import { WeatherSettingsModal } from './WeatherSettingsModal';

import { t } from '../i18n/i18n';

export function renderWeatherSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  const weatherSetting = new Setting(containerEl)
    .setName(t('settings.weather.label'))
    .setDesc(t('settings.weather.description'))
    .addExtraButton(button => {
      button
        .setIcon('gear')
        .setTooltip(t('settings.weather.configTooltip'))
        .onClick(() => {
          new WeatherSettingsModal(plugin, () => {
            updateStatusText();
            rerender();
          }).open();
        });
    });

  // Defensively use descEl if it exists, falling back to settingEl to guarantee no runtime crashes
  const statusParent = weatherSetting.descEl || weatherSetting.settingEl;
  const statusEl = statusParent.createDiv({ cls: 'ofc-weather-status' });

  const updateStatusText = () => {
    const currentSettings = PluginState.getSettings();
    if (!currentSettings) return;

    if (currentSettings.weatherHide) {
      statusEl.setText(t('settings.weather.status.hidden'));
      statusEl.className = 'ofc-weather-status is-muted';
    } else if (
      currentSettings.weatherLatitude !== null &&
      currentSettings.weatherLatitude !== undefined &&
      currentSettings.weatherLongitude !== null &&
      currentSettings.weatherLongitude !== undefined &&
      typeof currentSettings.weatherLatitude === 'number' &&
      typeof currentSettings.weatherLongitude === 'number'
    ) {
      const modeText =
        currentSettings.weatherInputMode === 'coords'
          ? t('settings.weather.modal.inputMode.coords')
          : currentSettings.weatherCity || t('settings.weather.status.cityFallback');
      statusEl.setText(
        t('settings.weather.status.enabled', {
          mode: modeText,
          latitude: currentSettings.weatherLatitude.toFixed(4),
          longitude: currentSettings.weatherLongitude.toFixed(4)
        })
      );
      statusEl.className = 'ofc-weather-status is-success';
    } else {
      statusEl.setText(t('settings.weather.status.noLocation'));
      statusEl.className = 'ofc-weather-status is-warning';
    }
  };
  updateStatusText();
}
