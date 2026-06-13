/**
 * @file WeatherDetailModal.ts
 * @brief Renders the detailed weather forecast modal, including hourly timelines.
 * @license See LICENSE.md
 */

import { App, Modal } from 'obsidian';
import { WeatherInfo, formatTemp } from './Weather';
import { t } from '../i18n/i18n';
import { renderFooter } from '../../ui/settings/sections/calendars/renderFooter';
import { PluginState } from '../../core/PluginState';

export class WeatherDetailModal extends Modal {
  constructor(
    app: App,
    private dateStr: string,
    private weatherInfo: WeatherInfo
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass('ofc-weather-detail-modal');

    // Get current weather unit setting
    const currentSettings = PluginState.getSettings();
    const unit = currentSettings?.weatherUnit === 'F' ? 'F' : 'C';

    // Date formatting (in local timezone)
    let formattedDate = this.dateStr;
    try {
      // Append T00:00:00 to prevent timezone offsets shifting the date
      const dateObj = new Date(`${this.dateStr}T00:00:00`);
      formattedDate = new Intl.DateTimeFormat(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }).format(dateObj);
    } catch (e) {
      console.error('Failed to format weather date', e);
    }

    // Set modal title
    this.titleEl.setText(t('settings.weather.detailModal.title', { date: formattedDate }));

    // --- 1. Daily Overview Summary Card ---
    const summaryCard = contentEl.createDiv({ cls: 'ofc-weather-detail-summary' });

    const emojiContainer = summaryCard.createDiv({ cls: 'ofc-weather-detail-summary-emoji-wrap' });
    emojiContainer
      .createSpan({ cls: 'ofc-weather-detail-summary-emoji' })
      .setText(this.weatherInfo.emoji);

    const infoContainer = summaryCard.createDiv({ cls: 'ofc-weather-detail-summary-info' });
    infoContainer
      .createDiv({ cls: 'ofc-weather-detail-summary-desc' })
      .setText(this.weatherInfo.desc);
    infoContainer
      .createDiv({ cls: 'ofc-weather-detail-summary-temp' })
      .setText(
        `${formatTemp(this.weatherInfo.maxTemp, unit)} / ${formatTemp(this.weatherInfo.minTemp, unit)}`
      );

    // --- 2. Hourly Forecast Title ---
    contentEl.createEl('h3', {
      text: t('settings.weather.detailModal.hourlyHeader'),
      cls: 'ofc-weather-detail-hourly-title'
    });

    // --- 3. Horizontally Scrollable Hourly Timeline ---
    if (this.weatherInfo.hourly && this.weatherInfo.hourly.length > 0) {
      const timeline = contentEl.createDiv({ cls: 'ofc-weather-detail-hourly-timeline' });

      timeline.addEventListener('wheel', (evt: WheelEvent) => {
        if (evt.deltaY !== 0) {
          timeline.scrollLeft += evt.deltaY;
          evt.preventDefault();
        }
      });

      this.weatherInfo.hourly.forEach(hour => {
        const card = timeline.createDiv({ cls: 'ofc-weather-detail-hourly-card' });

        // Time
        card.createDiv({ cls: 'ofc-weather-detail-hour-time' }).setText(hour.time);

        // Emoji
        card.createDiv({ cls: 'ofc-weather-detail-hour-emoji' }).setText(hour.emoji);

        // Temp & apparent
        card
          .createDiv({ cls: 'ofc-weather-detail-hour-temp' })
          .setText(formatTemp(hour.temp, unit));

        // Format apparent temperature and handle localized unit strings by replacing C with F if necessary
        const apparentTempVal = Math.round(
          unit === 'F' ? (hour.apparentTemp * 9) / 5 + 32 : hour.apparentTemp
        );
        const apparentText = t('settings.weather.detailModal.apparentTemp', {
          temp: apparentTempVal
        }).replace('°C', `°${unit}`);

        card.createDiv({ cls: 'ofc-weather-detail-hour-feels' }).setText(apparentText);

        // Parameters Grid inside card
        const grid = card.createDiv({ cls: 'ofc-weather-detail-hour-grid' });

        // Precipitation Probability
        const precip = grid.createDiv({ cls: 'ofc-weather-detail-hour-grid-item' });
        precip.createSpan({ cls: 'ofc-weather-grid-icon' }).setText('💧');
        precip.createSpan({ cls: 'ofc-weather-grid-val' }).setText(`${hour.precipProb}%`);

        // Humidity
        const humidity = grid.createDiv({ cls: 'ofc-weather-detail-hour-grid-item' });
        humidity.createSpan({ cls: 'ofc-weather-grid-icon' }).setText('💦');
        humidity.createSpan({ cls: 'ofc-weather-grid-val' }).setText(`${hour.humidity}%`);

        // Wind Speed
        const wind = grid.createDiv({ cls: 'ofc-weather-detail-hour-grid-item' });
        wind.createSpan({ cls: 'ofc-weather-grid-icon' }).setText('💨');
        wind
          .createSpan({ cls: 'ofc-weather-grid-val' })
          .setText(`${Math.round(hour.windSpeed)} km/h`);
      });
    } else {
      contentEl.createDiv({
        cls: 'ofc-weather-detail-no-hourly',
        text: t('settings.weather.detailModal.noHourly')
      });
    }

    // --- 4. Settings Footer Integration ---
    renderFooter(contentEl);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
