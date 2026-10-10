/**
 * @file calendarWeather.ts
 * @brief Weather forecast fetching, header/cell weather DOM injection,
 * and daily note link binding for the calendar.
 *
 * @license See LICENSE.md
 */

import { activeDocument, type App } from 'obsidian';
import { PluginState } from '../../../../core/PluginState';
import { PLUGIN_SLUG } from '../../../../types';
import {
  fetchWeatherForecast,
  type WeatherInfo,
  formatTempRange
} from '../../../../features/weather/Weather';
import { WeatherDetailModal } from '../../../../features/weather/WeatherDetailModal';
import {
  getDailyNoteForDate,
  openDailyNoteForDate
} from '../../../../features/daily-notes/openDailyNote';
import type { ExtraRenderProps } from './calendar';

export const formatDateLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const bindDailyNoteLink = (
  el: HTMLElement,
  date: Date,
  selector: string,
  containerEl: HTMLElement
): void => {
  if (!PluginState.getSettings().openDailyNoteOnDateClick) {
    return;
  }
  const dateLabel = el.querySelector<HTMLElement>(selector);
  if (!dateLabel || dateLabel.dataset.ofcDailyNoteBound === 'true') {
    return;
  }

  dateLabel.dataset.ofcDailyNoteBound = 'true';
  dateLabel.setCssProps({ cursor: 'pointer' });
  dateLabel.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    void openDailyNoteForDate(PluginState.getPlugin().app, date);
  });
  dateLabel.addEventListener('mouseover', event => {
    const file = getDailyNoteForDate(date);
    if (!file) {
      return;
    }

    try {
      PluginState.getPlugin().app.workspace.trigger('hover-link', {
        event,
        source: PLUGIN_SLUG,
        hoverParent: containerEl,
        targetEl: dateLabel,
        linktext: file.path,
        sourcePath: file.path
      });
    } catch {
      // Page Preview is optional; a preview failure must not affect date navigation.
    }
  });
};

export function createWeatherDecorator(
  containerEl: HTMLElement,
  settings?: ExtraRenderProps
): {
  handleDayHeaderDidMount: (arg: { date: Date; el: HTMLElement; view: { type: string } }) => void;
  handleDayCellDidMount: (arg: { date: Date; el: HTMLElement }) => void;
  handleViewChangeAndFetchWeather: (view: { activeStart: Date; activeEnd: Date }) => Promise<void>;
} {
  let pendingHeaders: { dateStr: string; el: HTMLElement }[] = [];
  let pendingCells: { dateStr: string; el: HTMLElement }[] = [];
  let activeForecast: Record<string, WeatherInfo> | null = null;

  const injectHeaderWeather = (el: HTMLElement, dateStr: string, data: WeatherInfo) => {
    if (el.querySelector('.ofc-weather-panel')) {
      return;
    }

    const currentSettings = PluginState.getSettings();
    const unit = currentSettings?.weatherUnit === 'F' ? 'F' : 'C';

    const innerEl = el.querySelector('.fc-scrollgrid-sync-inner') || el;
    const panelEl = innerEl.createDiv({ cls: 'ofc-weather-panel' });

    const emojiTempEl = panelEl.createDiv({ cls: 'ofc-weather-emoji-temp' });
    emojiTempEl.createSpan({ cls: 'ofc-weather-emoji' }).setText(data.emoji);
    emojiTempEl
      .createSpan({ cls: 'ofc-weather-temp' })
      .setText(formatTempRange(data.minTemp, data.maxTemp, unit));

    panelEl.createDiv({ cls: 'ofc-weather-desc' }).setText(data.desc);

    panelEl.setCssProps({ cursor: 'pointer' });
    panelEl.addEventListener('click', e => {
      e.stopPropagation();
      const doc = el?.ownerDocument || activeDocument;
      interface PopoutWindow {
        app: App;
      }
      const activeApp =
        (doc?.defaultView as unknown as PopoutWindow | null)?.app ||
        (window as unknown as PopoutWindow).app;
      if (activeApp) {
        new WeatherDetailModal(activeApp, dateStr, data).open();
      }
    });
  };

  const injectUnconfiguredHeaderWeather = (el: HTMLElement, isFirst: boolean) => {
    if (el.querySelector('.ofc-weather-panel')) {
      return;
    }

    const innerEl = el.querySelector('.fc-scrollgrid-sync-inner') || el;
    const panelEl = innerEl.createDiv({ cls: 'ofc-weather-panel is-unconfigured' });

    const emojiTempEl = panelEl.createDiv({ cls: 'ofc-weather-emoji-temp' });
    emojiTempEl.createSpan({ cls: 'ofc-weather-emoji' }).setText('🌤️❓');

    if (isFirst) {
      emojiTempEl.createSpan({ cls: 'ofc-weather-temp' }).setText('Configure');
      panelEl.createDiv({ cls: 'ofc-weather-desc' }).setText('Set weather location');
    } else {
      emojiTempEl.createSpan({ cls: 'ofc-weather-temp' }).setText('Setup');
      panelEl.createDiv({ cls: 'ofc-weather-desc' }).setText('Click to configure');
    }

    panelEl.setCssProps({ cursor: 'pointer' });
    panelEl.addEventListener('click', e => {
      e.stopPropagation();
      const doc = el?.ownerDocument || activeDocument;
      interface ObsidianAppWindow {
        app: App & { setting?: { open: () => void; openTabById: (id: string) => void } };
      }
      const activeApp =
        (doc?.defaultView as unknown as ObsidianAppWindow | null)?.app ||
        (window as unknown as ObsidianAppWindow).app;
      if (activeApp && activeApp.setting) {
        activeApp.setting.open();
        activeApp.setting.openTabById('full-calendar-remastered');
      }
    });
  };

  const injectCellWeather = (el: HTMLElement, dateStr: string, data: WeatherInfo) => {
    const topEl = el.querySelector('.fc-daygrid-day-top');
    if (!topEl) return;

    if (topEl.querySelector('.ofc-weather-month-emoji')) {
      return;
    }

    const emojiEl = topEl.createSpan({ cls: 'ofc-weather-month-emoji' });
    emojiEl.setText(data.emoji);

    emojiEl.setCssProps({ cursor: 'pointer' });

    emojiEl.addEventListener('click', e => {
      e.stopPropagation();
      const doc = el?.ownerDocument || activeDocument;
      interface PopoutWindow {
        app: App;
      }
      const activeApp =
        (doc?.defaultView as unknown as PopoutWindow | null)?.app ||
        (window as unknown as PopoutWindow).app;
      if (activeApp) {
        new WeatherDetailModal(activeApp, dateStr, data).open();
      }
    });

    emojiEl.addEventListener('mousedown', e => {
      e.stopPropagation();
    });
    emojiEl.addEventListener('pointerdown', e => {
      e.stopPropagation();
    });
  };

  const handleViewChangeAndFetchWeather = async (view: { activeStart: Date; activeEnd: Date }) => {
    const pluginSettings = PluginState.getSettings();
    if (settings?.weatherHide || pluginSettings.weatherHide) {
      pendingHeaders = [];
      pendingCells = [];
      return;
    }

    if (pluginSettings.weatherLatitude === null || pluginSettings.weatherLongitude === null) {
      pendingHeaders = [];
      pendingCells = [];
      return;
    }

    const latitude = pluginSettings.weatherLatitude ?? 50.088;
    const longitude = pluginSettings.weatherLongitude ?? 14.4208;

    if (!view) return;

    const start = view.activeStart;
    const end = new Date(view.activeEnd.getTime() - 24 * 60 * 60 * 1000);

    const today = new Date();
    const minStart = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
    const maxEnd = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

    const actualStart = start < minStart ? minStart : start;
    const actualEnd = end > maxEnd ? maxEnd : end;

    if (actualStart > actualEnd) {
      return;
    }

    const startStr = formatDateLocal(actualStart);
    const endStr = formatDateLocal(actualEnd);

    const forecast = await fetchWeatherForecast(latitude, longitude, startStr, endStr);

    if (forecast) {
      activeForecast = forecast;

      pendingHeaders.forEach(({ dateStr, el }) => {
        if (forecast[dateStr]) {
          injectHeaderWeather(el, dateStr, forecast[dateStr]);
        }
      });
      pendingHeaders = [];

      pendingCells.forEach(({ dateStr, el }) => {
        if (forecast[dateStr]) {
          injectCellWeather(el, dateStr, forecast[dateStr]);
        }
      });
      pendingCells = [];
    }
  };

  const handleDayHeaderDidMount = (arg: {
    date: Date;
    el: HTMLElement;
    view: { type: string };
  }) => {
    if (arg.view.type.startsWith('timeGrid')) {
      bindDailyNoteLink(arg.el, arg.date, '.fc-col-header-cell-cushion', containerEl);
    } else if (arg.view.type.startsWith('list')) {
      bindDailyNoteLink(arg.el, arg.date, '.fc-list-day-text', containerEl);
      bindDailyNoteLink(arg.el, arg.date, '.fc-list-day-side-text', containerEl);
    }
    const pluginSettings = PluginState.getSettings();
    if (settings?.weatherHide || pluginSettings.weatherHide) {
      return;
    }
    const isUnconfigured =
      pluginSettings.weatherLatitude === null || pluginSettings.weatherLongitude === null;
    if (isUnconfigured) {
      const isFirst = pendingHeaders.length === 0;
      pendingHeaders.push({ dateStr: formatDateLocal(arg.date), el: arg.el });
      injectUnconfiguredHeaderWeather(arg.el, isFirst);
      return;
    }
    const dateStr = formatDateLocal(arg.date);
    if (activeForecast && activeForecast[dateStr]) {
      injectHeaderWeather(arg.el, dateStr, activeForecast[dateStr]);
    } else {
      pendingHeaders.push({ dateStr, el: arg.el });
    }
  };

  const handleDayCellDidMount = (arg: { date: Date; el: HTMLElement }) => {
    bindDailyNoteLink(arg.el, arg.date, '.fc-daygrid-day-number', containerEl);
    const pluginSettings = PluginState.getSettings();
    if (
      settings?.weatherHide ||
      pluginSettings.weatherHide ||
      pluginSettings.weatherLatitude === null ||
      pluginSettings.weatherLongitude === null
    ) {
      return;
    }
    const dateStr = formatDateLocal(arg.date);
    if (activeForecast && activeForecast[dateStr]) {
      injectCellWeather(arg.el, dateStr, activeForecast[dateStr]);
    } else {
      pendingCells.push({ dateStr, el: arg.el });
    }
  };

  return {
    handleDayHeaderDidMount,
    handleDayCellDidMount,
    handleViewChangeAndFetchWeather
  };
}
