/**
 * @file WeatherSettings.ts
 * @brief Renders the weather settings section of the plugin settings tab.
 * @license See LICENSE.md
 */

import { Setting } from 'obsidian';
import { PluginState } from '../../core/PluginState';
import { geocodeCity } from './Weather';

export function renderWeatherSettings(containerEl: HTMLElement): void {
  let debounceTimeout: number | null = null;
  const weatherSetting = new Setting(containerEl)
    .setName('Weather city / region')
    .setDesc(
      'Enter your city or region name (e.g. Prague) to get weather forecasts in your calendar views.'
    );

  // Defensively use descEl if it exists, falling back to settingEl to guarantee no runtime crashes
  const statusParent = weatherSetting.descEl || weatherSetting.settingEl;
  const statusEl = statusParent.createDiv({ cls: 'ofc-weather-status' });

  const updateStatusText = () => {
    const settings = PluginState.getSettings();
    if (!settings) return;

    if (
      settings.weatherLatitude !== null &&
      settings.weatherLatitude !== undefined &&
      settings.weatherLongitude !== null &&
      settings.weatherLongitude !== undefined &&
      typeof settings.weatherLatitude === 'number' &&
      typeof settings.weatherLongitude === 'number'
    ) {
      statusEl.setText(
        `Resolved: Lat ${settings.weatherLatitude.toFixed(4)}, Lng ${settings.weatherLongitude.toFixed(4)}`
      );
      statusEl.className = 'ofc-weather-status is-success';
    } else if (settings.weatherCity) {
      statusEl.setText('Could not resolve coordinates.');
      statusEl.className = 'ofc-weather-status is-warning';
    } else {
      statusEl.setText('No location set.');
      statusEl.className = 'ofc-weather-status is-muted';
    }
  };
  updateStatusText();

  weatherSetting.addText(text => {
    text
      .setPlaceholder('E.g. Prague')
      .setValue(PluginState.getSettings()?.weatherCity || '')
      .onChange(val => {
        const settings = PluginState.getSettings();
        if (!settings) return;

        settings.weatherCity = val;
        // Save the city name immediately so it is never lost on tab close/blur
        void PluginState.saveSettings();

        if (debounceTimeout) {
          window.clearTimeout(debounceTimeout);
        }

        if (!val.trim()) {
          settings.weatherLatitude = null;
          settings.weatherLongitude = null;
          updateStatusText();
          void PluginState.saveSettings();
          return;
        }

        statusEl.setText('Resolving location...');
        statusEl.className = 'ofc-weather-status is-accent';

        debounceTimeout = window.setTimeout(() => {
          void (async () => {
            try {
              const coords = await geocodeCity(val);
              const activeSettings = PluginState.getSettings();
              // Check that the user hasn't typed anything else in the meantime
              if (activeSettings && activeSettings.weatherCity === val) {
                if (coords) {
                  activeSettings.weatherLatitude = coords.latitude;
                  activeSettings.weatherLongitude = coords.longitude;
                } else {
                  activeSettings.weatherLatitude = null;
                  activeSettings.weatherLongitude = null;
                }
                updateStatusText();
                await PluginState.saveSettings();
              }
            } catch (e) {
              console.error('Weather geocoding failed', e);
              const activeSettings = PluginState.getSettings();
              if (activeSettings && activeSettings.weatherCity === val) {
                activeSettings.weatherLatitude = null;
                activeSettings.weatherLongitude = null;
                updateStatusText();
                await PluginState.saveSettings();
              }
            }
          })();
        }, 1000);
      });
  });
}
