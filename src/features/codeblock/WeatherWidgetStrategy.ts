import { Component, TFile, App } from 'obsidian';
import { DateTime } from 'luxon';
import { getDateFromFile } from 'obsidian-daily-notes-interface';
import {
  EmbeddedWidgetStrategy,
  EmbeddedWidgetInstance,
  WidgetContext,
  EmbeddedBlockRegistry
} from './EmbeddedBlockRegistry';
import {
  fetchWeatherForecast,
  formatTemp,
  formatTempRange,
  WeatherInfo
} from '../../features/weather/Weather';
import { WeatherDetailModal } from '../../features/weather/WeatherDetailModal';
import { PluginState } from '../../core/PluginState';
import FullCalendarPlugin from '../../main';

export interface WeatherConfig {
  type?: 'day' | 'week';
  orientation?: 'horizontal' | 'vertical';
  variant?: 'minimal' | 'default';
  defaultDate?: string;
  styles?: Record<string, string>;
  stickyHeader?: boolean;
}

export class EmbeddedWeather extends Component {
  private plugin: FullCalendarPlugin;
  private app: App;
  private containerEl: HTMLElement;
  private config: WeatherConfig;
  private widgetCtx: WidgetContext;
  private callback: (() => void) | null = null;

  constructor(
    plugin: FullCalendarPlugin,
    containerEl: HTMLElement,
    config: WeatherConfig,
    widgetCtx: WidgetContext
  ) {
    super();
    this.plugin = plugin;
    this.app = plugin.app;
    this.containerEl = containerEl;
    this.config = config;
    this.widgetCtx = widgetCtx;
  }

  onload(): void {
    void this.initializeWeather();
  }

  onunload(): void {
    this.containerEl.empty();
    this.callback = null;
  }

  private async initializeWeather(): Promise<void> {
    this.containerEl.empty();
    this.containerEl.removeClass('ofc-embedded-calendar-container');
    this.containerEl.addClass('ofc-embedded-weather-container');

    const orientation = this.config.orientation || 'horizontal';
    this.containerEl.removeClass('is-horizontal');
    this.containerEl.removeClass('is-vertical');
    this.containerEl.addClass(`is-${orientation}`);

    if (
      this.config.styles &&
      typeof this.config.styles === 'object' &&
      !Array.isArray(this.config.styles)
    ) {
      for (const [key, val] of Object.entries(this.config.styles)) {
        const cssKey = key.startsWith('--') ? key : key.replace(/([A-Z])/g, '-$1').toLowerCase();
        this.containerEl.style.setProperty(cssKey, String(val));
      }
    }

    const pluginSettings = PluginState.getSettings();
    if (pluginSettings.weatherLatitude === null || pluginSettings.weatherLongitude === null) {
      const warnEl = this.containerEl.createDiv({ cls: 'ofc-weather-unconfigured' });
      warnEl.setText('Weather is not configured. Click here to configure weather location.');
      warnEl.setCssProps({ cursor: 'pointer' });
      warnEl.addEventListener('click', () => {
        interface AppWithSetting {
          setting?: {
            open: () => void;
            openTabById: (id: string) => void;
          };
        }
        const activeApp = this.app as App & AppWithSetting;
        if (activeApp && activeApp.setting) {
          activeApp.setting.open();
          activeApp.setting.openTabById('full-calendar-remastered');
        }
      });
      return;
    }

    const latitude = pluginSettings.weatherLatitude;
    const longitude = pluginSettings.weatherLongitude;
    const unit = pluginSettings.weatherUnit === 'F' ? 'F' : 'C';

    const type = this.config.type || 'day';

    // Resolve target date string
    let targetDateStr: string | null = null;
    const dateConfig = this.config.defaultDate || 'auto';
    if (dateConfig === 'today') {
      targetDateStr = DateTime.now().toISODate();
    } else if (dateConfig && dateConfig !== 'auto') {
      targetDateStr = dateConfig;
    } else {
      const file = this.app.vault.getAbstractFileByPath(this.widgetCtx.sourcePath);
      if (file instanceof TFile) {
        const dailyNoteDate = getDateFromFile(file, 'day');
        if (dailyNoteDate) {
          targetDateStr = dailyNoteDate.format('YYYY-MM-DD');
        }
      }
      if (!targetDateStr) {
        targetDateStr = DateTime.now().toISODate();
      }
    }

    if (type === 'day') {
      const forecast = await fetchWeatherForecast(
        latitude,
        longitude,
        targetDateStr,
        targetDateStr
      );
      if (!forecast || !forecast[targetDateStr]) {
        this.containerEl
          .createDiv({ cls: 'ofc-weather-error' })
          .setText(`Failed to load weather forecast for ${targetDateStr}.`);
        return;
      }
      this.renderDayWeather(
        this.containerEl,
        targetDateStr,
        forecast[targetDateStr],
        unit,
        this.config
      );
    } else {
      const firstDay = pluginSettings.firstDay;
      let dt = DateTime.fromISO(targetDateStr);
      if (!dt.isValid) {
        dt = DateTime.now();
      }
      const targetWeekday = firstDay === 0 ? 7 : firstDay;
      let diff = dt.weekday - targetWeekday;
      if (diff < 0) {
        diff += 7;
      }
      const startOfWeek = dt.minus({ days: diff });
      const endOfWeek = startOfWeek.plus({ days: 6 });

      const startStr = startOfWeek.toISODate() || '';
      const endStr = endOfWeek.toISODate() || '';

      const forecast = await fetchWeatherForecast(latitude, longitude, startStr, endStr);
      if (!forecast) {
        this.containerEl
          .createDiv({ cls: 'ofc-weather-error' })
          .setText(`Failed to load weekly forecast.`);
        return;
      }
      this.renderWeekWeather(this.containerEl, startOfWeek, forecast, unit, this.config);
    }

    // Keep reactive to updates
    if (!this.callback) {
      this.callback = () => {
        void this.initializeWeather();
      };
      this.widgetCtx.onUpdate(this.callback);
    }
  }

  private renderDayWeather(
    container: HTMLElement,
    targetDateStr: string,
    dayForecast: WeatherInfo,
    unit: 'C' | 'F',
    config: WeatherConfig
  ) {
    container.empty();

    const orientation = config.orientation || 'horizontal';
    const isMinimal = config.variant === 'minimal';
    const wrapper = container.createDiv({
      cls: `ofc-weather-widget-day is-${orientation}${isMinimal ? ' is-minimal' : ''}`
    });

    if (!isMinimal) {
      const isSticky = config.stickyHeader !== false;
      const cardEl = wrapper.createDiv({
        cls: `ofc-weather-day-card is-clickable${isSticky ? ' is-sticky' : ''}`
      });
      cardEl.addEventListener('click', () => {
        new WeatherDetailModal(this.app, targetDateStr, dayForecast).open();
      });

      // Add detailed hover tooltip to the summary card
      const cardTooltip = `Condition: ${dayForecast.desc}\nTemperature Range: ${formatTempRange(dayForecast.minTemp, dayForecast.maxTemp, unit)}\nMin Temp: ${formatTemp(dayForecast.minTemp, unit)}\nMax Temp: ${formatTemp(dayForecast.maxTemp, unit)}`;
      cardEl.setAttribute('title', cardTooltip);

      const summaryEl = cardEl.createDiv({ cls: 'ofc-weather-day-summary' });
      const locationName = PluginState.getSettings().weatherCity || 'Local Weather';
      summaryEl.createDiv({ cls: 'ofc-weather-location' }).setText(locationName);

      const dateObj = new Date(`${targetDateStr}T00:00:00`);
      const dateFormatted = dateObj.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      });
      summaryEl.createDiv({ cls: 'ofc-weather-date' }).setText(dateFormatted);

      const mainInfoEl = cardEl.createDiv({ cls: 'ofc-weather-main-info' });
      mainInfoEl.createSpan({ cls: 'ofc-weather-emoji-large' }).setText(dayForecast.emoji);

      const tempRangeEl = mainInfoEl.createDiv({ cls: 'ofc-weather-temp-range' });
      tempRangeEl
        .createSpan({ cls: 'ofc-weather-temp-val' })
        .setText(formatTempRange(dayForecast.minTemp, dayForecast.maxTemp, unit));
    }

    if (dayForecast.hourly && dayForecast.hourly.length > 0) {
      const hourlyContainer = wrapper.createDiv({ cls: 'ofc-weather-hourly-container' });

      // Find current hour to focus
      const currentHour = new Date().getHours();
      const currentHourStr = `${String(currentHour).padStart(2, '0')}:00`;

      dayForecast.hourly.forEach(hour => {
        const hourRow = hourlyContainer.createDiv({ cls: 'ofc-weather-hourly-item' });

        // Add current hour class
        const isCurrent = hour.time === currentHourStr;
        if (isCurrent) {
          hourRow.addClass('is-current');
        }

        // Add detailed hover tooltip
        const tooltip = `Condition: ${hour.desc}\nTemperature: ${formatTemp(hour.temp, unit)}\nApparent Temp: ${formatTemp(hour.apparentTemp, unit)}\nPrecipitation: ${hour.precipProb}%\nHumidity: ${hour.humidity}%\nWind Speed: ${hour.windSpeed} km/h`;
        hourRow.setAttribute('title', tooltip);

        hourRow.createDiv({ cls: 'ofc-weather-hour-time' }).setText(hour.time);
        hourRow.createDiv({ cls: 'ofc-weather-hour-emoji' }).setText(hour.emoji);
        hourRow.createDiv({ cls: 'ofc-weather-hour-temp' }).setText(formatTemp(hour.temp, unit));

        if (!isMinimal) {
          const precipEl = hourRow.createDiv({ cls: 'ofc-weather-hour-precip' });
          if (hour.precipProb > 0) {
            precipEl.setText(`💧 ${hour.precipProb}%`);
          } else {
            precipEl.setText('');
          }
        }
      });

      // Auto-scroll to current hour
      window.requestAnimationFrame(() => {
        const currentEl = hourlyContainer.querySelector('.is-current');
        if (currentEl) {
          currentEl.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
        }
      });
    }
  }

  private renderWeekWeather(
    container: HTMLElement,
    startOfWeek: DateTime,
    forecast: Record<string, WeatherInfo>,
    unit: 'C' | 'F',
    config: WeatherConfig
  ) {
    container.empty();
    const orientation = config.orientation || 'horizontal';
    const isMinimal = config.variant === 'minimal';
    const wrapper = container.createDiv({
      cls: `ofc-weather-widget-week is-${orientation}${isMinimal ? ' is-minimal' : ''}`
    });
    const weekContainer = wrapper.createDiv({ cls: 'ofc-weather-week-container' });

    const todayStr = DateTime.now().toISODate() || '';

    for (let i = 0; i < 7; i++) {
      const currentDay = startOfWeek.plus({ days: i });
      const dateStr = currentDay.toISODate() || '';
      const dayData = forecast[dateStr];

      const dayRow = weekContainer.createDiv({ cls: 'ofc-weather-week-item' });

      const isToday = dateStr === todayStr;
      if (isToday) {
        dayRow.addClass('is-current');
      }

      if (dayData) {
        dayRow.addClass('is-clickable');
        dayRow.addEventListener('click', () => {
          new WeatherDetailModal(this.app, dateStr, dayData).open();
        });

        // Add detailed hover tooltip
        const tooltip = `Date: ${dateStr}\nCondition: ${dayData.desc}\nTemperature Range: ${formatTempRange(dayData.minTemp, dayData.maxTemp, unit)}\nMin Temp: ${formatTemp(dayData.minTemp, unit)}\nMax Temp: ${formatTemp(dayData.maxTemp, unit)}`;
        dayRow.setAttribute('title', tooltip);
      }

      const dayName = currentDay.toLocaleString({ weekday: 'short' });
      const dayDate = currentDay.toLocaleString({ day: 'numeric', month: 'numeric' });
      const dayLabelEl = dayRow.createDiv({ cls: 'ofc-weather-week-day-label' });
      dayLabelEl.createDiv({ cls: 'ofc-weather-week-day-name' }).setText(dayName);
      dayLabelEl.createDiv({ cls: 'ofc-weather-week-day-date' }).setText(dayDate);

      if (dayData) {
        dayRow.createDiv({ cls: 'ofc-weather-week-emoji' }).setText(dayData.emoji);
        dayRow
          .createDiv({ cls: 'ofc-weather-week-temp' })
          .setText(formatTempRange(dayData.minTemp, dayData.maxTemp, unit));
      } else {
        dayRow.createDiv({ cls: 'ofc-weather-week-emoji' }).setText('❓');
        dayRow.createDiv({ cls: 'ofc-weather-week-temp' }).setText('N/a');
      }
    }

    // Auto-scroll to current day
    window.requestAnimationFrame(() => {
      const currentEl = weekContainer.querySelector('.is-current');
      if (currentEl) {
        currentEl.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
      }
    });
  }
}

export class WeatherWidgetStrategy implements EmbeddedWidgetStrategy {
  constructor(private plugin: FullCalendarPlugin) {}

  async render(
    el: HTMLElement,
    config: Record<string, unknown>,
    ctx: WidgetContext
  ): Promise<EmbeddedWidgetInstance> {
    const weatherWidget = new EmbeddedWeather(this.plugin, el, config, ctx);
    weatherWidget.load();

    return {
      updateSize() {
        // Simple sizing is CSS-driven
      },
      async refresh() {
        // Handled reactively by weather initialization
      },
      destroy() {
        weatherWidget.unload();
      }
    };
  }
}

export function registerWeatherStrategy(plugin: FullCalendarPlugin): void {
  if (!EmbeddedBlockRegistry.has('weather')) {
    EmbeddedBlockRegistry.register('weather', new WeatherWidgetStrategy(plugin));
  }
}
