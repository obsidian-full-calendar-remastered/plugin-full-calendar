/**
 * @file WeatherSettingsModal.ts
 * @brief Renders the weather settings configuration modal.
 * @license See LICENSE.md
 */

import { Modal, Setting } from 'obsidian';
import { PluginState } from '../../core/PluginState';
import { geocodeCity } from './Weather';
import FullCalendarPlugin from '../../main';
import { t } from '../i18n/i18n';

export class WeatherSettingsModal extends Modal {
  private debounceTimeout: number | null = null;
  private dynamicContainer!: HTMLDivElement;

  constructor(
    private plugin: FullCalendarPlugin,
    private onChange: () => void
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.titleEl.setText(t('settings.weather.modal.title'));

    // 1. Toggle to completely hide the weather in the calendar UI
    new Setting(this.contentEl)
      .setName(t('settings.weather.modal.hideToggle.label'))
      .setDesc(t('settings.weather.modal.hideToggle.description'))
      .addToggle(toggle => {
        toggle.setValue(PluginState.getSettings().weatherHide ?? false).onChange(async value => {
          PluginState.getSettings().weatherHide = value;
          await PluginState.saveSettings();
          this.onChange();
        });
      });

    // 2. Location Input Mode (Dropdown: City or Coords)
    new Setting(this.contentEl)
      .setName(t('settings.weather.modal.inputMode.label'))
      .setDesc(t('settings.weather.modal.inputMode.description'))
      .addDropdown(dropdown => {
        dropdown
          .addOption('city', t('settings.weather.modal.inputMode.city'))
          .addOption('coords', t('settings.weather.modal.inputMode.coords'))
          .setValue(PluginState.getSettings().weatherInputMode || 'city')
          .onChange(async value => {
            // Cancel any pending geocoding to prevent race conditions when switching mode
            if (this.debounceTimeout) {
              window.clearTimeout(this.debounceTimeout);
              this.debounceTimeout = null;
            }
            PluginState.getSettings().weatherInputMode = value as 'city' | 'coords';
            await PluginState.saveSettings();
            this.renderDynamicSettings();
            this.onChange();
          });
      });

    // Append a container for the dynamic city/coords options
    this.dynamicContainer = this.contentEl.createDiv();
    this.renderDynamicSettings();
  }

  private renderDynamicSettings(): void {
    this.dynamicContainer.empty();
    const currentMode = PluginState.getSettings().weatherInputMode || 'city';

    if (currentMode === 'coords') {
      // Coords input mode: Latitude and Longitude fields
      new Setting(this.dynamicContainer)
        .setName(t('settings.weather.modal.latitude.label'))
        .setDesc(t('settings.weather.modal.latitude.description'))
        .addText(text => {
          const initialLat = PluginState.getSettings().weatherLatitude;
          text
            .setPlaceholder(t('settings.weather.modal.latitude.placeholder'))
            .setValue(initialLat !== null && initialLat !== undefined ? String(initialLat) : '')
            .onChange(val => {
              // Always obtain the freshest reference from PluginState to avoid stale copies
              const freshSettings = PluginState.getSettings();
              const parsed = parseFloat(val);
              if (!isNaN(parsed)) {
                freshSettings.weatherLatitude = parsed;
              } else if (!val.trim()) {
                freshSettings.weatherLatitude = null;
              }
            });

          // Save and refresh only on blur to avoid database and view I/O lag
          text.inputEl.addEventListener('blur', () => {
            void (async () => {
              await PluginState.saveSettings();
              this.onChange();
            })();
          });
        });

      new Setting(this.dynamicContainer)
        .setName(t('settings.weather.modal.longitude.label'))
        .setDesc(t('settings.weather.modal.longitude.description'))
        .addText(text => {
          const initialLng = PluginState.getSettings().weatherLongitude;
          text
            .setPlaceholder(t('settings.weather.modal.longitude.placeholder'))
            .setValue(initialLng !== null && initialLng !== undefined ? String(initialLng) : '')
            .onChange(val => {
              // Always obtain the freshest reference from PluginState to avoid stale copies
              const freshSettings = PluginState.getSettings();
              const parsed = parseFloat(val);
              if (!isNaN(parsed)) {
                freshSettings.weatherLongitude = parsed;
              } else if (!val.trim()) {
                freshSettings.weatherLongitude = null;
              }
            });

          // Save and refresh only on blur to avoid database and view I/O lag
          text.inputEl.addEventListener('blur', () => {
            void (async () => {
              await PluginState.saveSettings();
              this.onChange();
            })();
          });
        });
    } else {
      // City input mode: Place name field with geocoding resolution status
      const weatherSetting = new Setting(this.dynamicContainer)
        .setName(t('settings.weather.modal.city.label'))
        .setDesc(t('settings.weather.modal.city.description'));

      // Defensively use descEl if it exists, falling back to settingEl to guarantee no runtime crashes
      const statusParent = weatherSetting.descEl || weatherSetting.settingEl;
      const statusEl = statusParent.createDiv({ cls: 'ofc-weather-status' });

      const updateStatusText = () => {
        const activeSettings = PluginState.getSettings();
        if (!activeSettings) return;

        if (
          activeSettings.weatherLatitude !== null &&
          activeSettings.weatherLatitude !== undefined &&
          activeSettings.weatherLongitude !== null &&
          activeSettings.weatherLongitude !== undefined &&
          typeof activeSettings.weatherLatitude === 'number' &&
          typeof activeSettings.weatherLongitude === 'number'
        ) {
          statusEl.setText(
            t('settings.weather.modal.city.status.resolved', {
              latitude: activeSettings.weatherLatitude.toFixed(4),
              longitude: activeSettings.weatherLongitude.toFixed(4)
            })
          );
          statusEl.className = 'ofc-weather-status is-success';
        } else if (activeSettings.weatherCity) {
          statusEl.setText(t('settings.weather.modal.city.status.unresolved'));
          statusEl.className = 'ofc-weather-status is-warning';
        } else {
          statusEl.setText(t('settings.weather.modal.city.status.empty'));
          statusEl.className = 'ofc-weather-status is-muted';
        }
      };
      updateStatusText();

      weatherSetting.addText(text => {
        text
          .setPlaceholder(t('settings.weather.modal.city.placeholder'))
          .setValue(PluginState.getSettings().weatherCity || '')
          .onChange(val => {
            PluginState.getSettings().weatherCity = val;
            void PluginState.saveSettings();

            if (this.debounceTimeout) {
              window.clearTimeout(this.debounceTimeout);
            }

            if (!val.trim()) {
              PluginState.getSettings().weatherLatitude = null;
              PluginState.getSettings().weatherLongitude = null;
              updateStatusText();
              void PluginState.saveSettings();
              this.onChange();
              return;
            }

            statusEl.setText(t('settings.weather.modal.city.status.resolving'));
            statusEl.className = 'ofc-weather-status is-accent';

            this.debounceTimeout = window.setTimeout(() => {
              void (async () => {
                try {
                  const coords = await geocodeCity(val);
                  const activeSettings = PluginState.getSettings();
                  // Check that the user hasn't typed anything else in the meantime and we are still in city mode
                  if (
                    activeSettings &&
                    activeSettings.weatherInputMode === 'city' &&
                    activeSettings.weatherCity === val
                  ) {
                    if (coords) {
                      activeSettings.weatherLatitude = coords.latitude;
                      activeSettings.weatherLongitude = coords.longitude;
                    } else {
                      activeSettings.weatherLatitude = null;
                      activeSettings.weatherLongitude = null;
                    }
                    updateStatusText();
                    await PluginState.saveSettings();
                    this.onChange();
                  }
                } catch (e) {
                  console.error('Weather geocoding failed', e);
                  const activeSettings = PluginState.getSettings();
                  if (
                    activeSettings &&
                    activeSettings.weatherInputMode === 'city' &&
                    activeSettings.weatherCity === val
                  ) {
                    activeSettings.weatherLatitude = null;
                    activeSettings.weatherLongitude = null;
                    updateStatusText();
                    await PluginState.saveSettings();
                    this.onChange();
                  }
                }
              })();
            }, 1000);
          });

        // Trigger immediate geocoding on blur to make sure it resolves before user moves away
        text.inputEl.addEventListener('blur', () => {
          const val = text.getValue();
          if (this.debounceTimeout) {
            window.clearTimeout(this.debounceTimeout);
            this.debounceTimeout = null;
          }

          if (!val.trim()) {
            PluginState.getSettings().weatherLatitude = null;
            PluginState.getSettings().weatherLongitude = null;
            updateStatusText();
            void PluginState.saveSettings();
            this.onChange();
            return;
          }

          void (async () => {
            try {
              const coords = await geocodeCity(val);
              const activeSettings = PluginState.getSettings();
              if (
                activeSettings &&
                activeSettings.weatherInputMode === 'city' &&
                activeSettings.weatherCity === val
              ) {
                if (coords) {
                  activeSettings.weatherLatitude = coords.latitude;
                  activeSettings.weatherLongitude = coords.longitude;
                } else {
                  activeSettings.weatherLatitude = null;
                  activeSettings.weatherLongitude = null;
                }
                updateStatusText();
                await PluginState.saveSettings();
                this.onChange();
              }
            } catch (e) {
              console.error('Weather geocoding failed', e);
            }
          })();
        });
      });
    }
  }

  onClose(): void {
    if (this.debounceTimeout) {
      window.clearTimeout(this.debounceTimeout);
    }
    this.dynamicContainer.empty();
    this.contentEl.empty();
  }
}
