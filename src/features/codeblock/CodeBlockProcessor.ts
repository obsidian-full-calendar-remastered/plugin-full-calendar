import { App, Component, parseYaml, MarkdownRenderChild, TFile } from 'obsidian';
import { Calendar, EventSourceInput, EventClickArg, EventApi } from '@fullcalendar/core';
import { getDateFromFile } from 'obsidian-daily-notes-interface';
import { DateTime } from 'luxon';
import {
  fetchWeatherForecast,
  formatTemp,
  formatTempRange,
  WeatherInfo
} from '../../features/weather/Weather';
import { WeatherDetailModal } from '../../features/weather/WeatherDetailModal';
import FullCalendarPlugin from '../../main';
import { PluginState } from '../../core/PluginState';
import { ViewContext } from '../../ui/calendar/ViewContext';
import { ViewEnhancer } from '../../core/ViewEnhancer';
import { ViewEventInteractionHandler } from '../../ui/calendar/ViewEventInteractionHandler';
import { renderCalendar } from '../../ui/settings/sections/calendars/calendar';
import { VIEW_ZOOM_CONFIG } from '../../ui/calendar/ViewZoomHandler';
import { ViewTimelineHandler } from '../../ui/calendar/ViewTimelineHandler';
import {
  EmbeddedWidgetStrategy,
  EmbeddedWidgetInstance,
  WidgetContext,
  EmbeddedBlockRegistry
} from './EmbeddedBlockRegistry';

export interface ViewConfig {
  view?: string;
  type?: 'day' | 'week';
  orientation?: 'horizontal' | 'vertical';
  variant?: 'minimal' | 'default';
  height?: string;
  width?: string;
  defaultDate?: string;
  startOffset?: string;
  endOffset?: string;
  calendars?: string[];
  categories?: string[];
  subCategories?: string[];
  completed?: boolean;
  isTask?: boolean;
  excludeAllDayTasks?: boolean;
  textSearch?: string;
  titleFilter?: string;
  tagFilter?: string;
  pathFilter?: string;
  sortBy?: 'start' | 'end' | 'title' | 'category' | 'priority';
  sortOrder?: 'asc' | 'desc';
  inheritFilters?: boolean;
  header?: boolean;
  zoomLevel?: number;
  slotDuration?: string;
  slotLabelInterval?: string;
  styles?: Record<string, string>;
  weather?: boolean;
  stickyHeader?: boolean;
}

export interface CodeBlockConfig extends ViewConfig {
  orientation?: 'horizontal' | 'vertical';
  layout?: {
    orientation?: 'horizontal' | 'vertical';
    views: ViewConfig[];
  };
}

export class EmbeddedCalendar extends Component implements ViewContext {
  plugin: FullCalendarPlugin;
  app: App;
  containerEl: HTMLElement;
  contentEl: HTMLElement;
  inSidebar = false;

  private config: CodeBlockConfig;
  private calendars: Calendar[] = [];
  private activeCalendar: Calendar | null = null;
  private enhancerInstance: ViewEnhancer;
  private interactionHandler: ViewEventInteractionHandler;
  private timelineHandler: ViewTimelineHandler;
  private callback: (() => void) | null = null;

  constructor(
    plugin: FullCalendarPlugin,
    containerEl: HTMLElement,
    config: CodeBlockConfig,
    private widgetCtx: WidgetContext
  ) {
    super();
    this.plugin = plugin;
    this.app = plugin.app;
    this.containerEl = containerEl;
    this.config = config;
    this.enhancerInstance = new ViewEnhancer(PluginState.getSettings());
    this.interactionHandler = new ViewEventInteractionHandler(this);
    this.timelineHandler = new ViewTimelineHandler(this);

    // Create shell wrapper to inherit overrides and prevent style leakage at the root
    const shellEl = containerEl.createDiv({ cls: 'ofc-calendar-shell' });
    // Create container
    this.contentEl = shellEl.createDiv({ cls: 'ofc-embedded-calendar-container' });
  }

  onload(): void {
    void this.initializeCalendars();
  }

  onunload(): void {
    this.calendars.forEach(cal => cal.destroy());
    this.calendars = [];
    this.activeCalendar = null;
    if (this.callback) {
      this.callback = null;
    }
  }

  get fullCalendarView(): Calendar | null {
    return this.activeCalendar || this.calendars[0] || null;
  }

  get viewEnhancer(): ViewEnhancer | null {
    this.enhancerInstance.updateSettings(PluginState.getSettings());
    return this.enhancerInstance;
  }

  public updateSize(): void {
    this.calendars.forEach(cal => cal.updateSize());
  }

  private async initializeCalendars(): Promise<void> {
    if (!PluginState.getCache()) {
      return;
    }
    if (!PluginState.getCache().initialized) {
      await PluginState.getCache().populate();
    }

    this.contentEl.empty();
    this.calendars = [];

    if (this.config.height) {
      this.contentEl.setCssProps({
        height: this.config.height === 'fit' ? 'auto' : this.config.height
      });
    }

    if (this.config.view === 'weather') {
      await this.renderWeatherView(this.contentEl, this.config);
    } else {
      await this.renderSingleCalendar(this.contentEl, this.config);
    }

    // Keep reactive to cache updates
    this.callback = () => {
      if (this.config.view === 'weather') {
        void this.initializeCalendars();
      } else {
        this.calendars.forEach(calendar => {
          const { sources: updatedSources } = this.getSourcesAndConfig(this.config);
          window.requestAnimationFrame(() => {
            calendar.removeAllEventSources();
            updatedSources.forEach(source => calendar.addEventSource(source));
          });
        });
      }
    };
    this.widgetCtx.onUpdate(this.callback);
  }

  private async renderWeatherView(el: HTMLElement, config: ViewConfig): Promise<void> {
    el.removeClass('ofc-embedded-calendar-container');
    el.addClass('ofc-embedded-weather-container');

    const orientation = config.orientation || 'horizontal';
    el.removeClass('is-horizontal');
    el.removeClass('is-vertical');
    el.addClass(`is-${orientation}`);

    if (config.styles && typeof config.styles === 'object' && !Array.isArray(config.styles)) {
      for (const [key, val] of Object.entries(config.styles)) {
        const cssKey = key.startsWith('--') ? key : key.replace(/([A-Z])/g, '-$1').toLowerCase();
        el.style.setProperty(cssKey, String(val));
      }
    }

    const pluginSettings = PluginState.getSettings();
    if (pluginSettings.weatherLatitude === null || pluginSettings.weatherLongitude === null) {
      const warnEl = el.createDiv({ cls: 'ofc-weather-unconfigured' });
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

    const type = config.type || 'day';

    // Resolve target date string
    let targetDateStr: string | null = null;
    const dateConfig = config.defaultDate || 'auto';
    if (dateConfig === 'today') {
      targetDateStr = new Date().toISOString().split('T')[0];
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
        targetDateStr = new Date().toISOString().split('T')[0];
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
        el.createDiv({ cls: 'ofc-weather-error' }).setText(
          `Failed to load weather forecast for ${targetDateStr}.`
        );
        return;
      }
      this.renderDayWeather(el, targetDateStr, forecast[targetDateStr], unit, config);
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
        el.createDiv({ cls: 'ofc-weather-error' }).setText(`Failed to load weekly forecast.`);
        return;
      }
      this.renderWeekWeather(el, startOfWeek, forecast, unit, config);
    }
  }

  private renderDayWeather(
    container: HTMLElement,
    targetDateStr: string,
    dayForecast: WeatherInfo,
    unit: 'C' | 'F',
    config: ViewConfig
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
    config: ViewConfig
  ) {
    container.empty();
    const orientation = config.orientation || 'horizontal';
    const isMinimal = config.variant === 'minimal';
    const wrapper = container.createDiv({
      cls: `ofc-weather-widget-week is-${orientation}${isMinimal ? ' is-minimal' : ''}`
    });
    const weekContainer = wrapper.createDiv({ cls: 'ofc-weather-week-container' });

    const todayStr = new Date().toISOString().split('T')[0];

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

  private async renderSingleCalendar(el: HTMLElement, config: ViewConfig): Promise<void> {
    if (config.styles && typeof config.styles === 'object' && !Array.isArray(config.styles)) {
      for (const [key, val] of Object.entries(config.styles)) {
        const cssKey = key.startsWith('--') ? key : key.replace(/([A-Z])/g, '-$1').toLowerCase();
        el.style.setProperty(cssKey, String(val));
      }
    }

    const { sources, initialDate } = this.getSourcesAndConfig(config);

    let slotDuration = config.slotDuration;
    let slotLabelInterval = config.slotLabelInterval;

    if (config.zoomLevel !== undefined) {
      const viewType = config.view || 'dayGridMonth';
      let bestMatchKey: string | null = null;
      for (const key in VIEW_ZOOM_CONFIG) {
        if (viewType.startsWith(key)) {
          if (!bestMatchKey || key.length > bestMatchKey.length) {
            bestMatchKey = key;
          }
        }
      }
      if (bestMatchKey) {
        const levels = VIEW_ZOOM_CONFIG[bestMatchKey].levels;
        const idx = Math.max(0, Math.min(levels.length - 1, config.zoomLevel));
        const levelConfig = levels[idx];
        if (levelConfig) {
          if (!slotDuration) slotDuration = levelConfig.slotDuration;
          if (!slotLabelInterval) slotLabelInterval = levelConfig.slotLabelInterval;
        }
      }
    }

    const isTimelineView =
      config.view?.includes('resourceTimeline') || config.view?.includes('Timeline') || false;
    const resources = isTimelineView ? this.timelineHandler.buildTimelineResources() : undefined;

    // Render using renderCalendar factory
    const cal = await renderCalendar(el, sources, {
      timeZone:
        PluginState.getSettings().displayTimezone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      initialView: {
        desktop: config.view || 'dayGridMonth',
        mobile: config.view || 'timeGrid3Days'
      },
      height: config.height === 'fit' ? 'auto' : undefined,
      firstDay: PluginState.getSettings().firstDay,
      timeFormat24h: PluginState.getSettings().timeFormat24h,
      highlightCurrentOrNextEvent: PluginState.getSettings().highlightCurrentOrNextEvent,
      dayMaxEvents: true,
      headerToolbar: config.header === false ? false : undefined,
      footerToolbar: config.header === false ? false : undefined,
      timeGridDayHeaderFormat: PluginState.getSettings().timeGridDayHeaderFormat,
      weatherHide: config.weather === false,
      ...(slotDuration !== undefined && { slotDuration }),
      ...(slotLabelInterval !== undefined && { slotLabelInterval }),
      ...(isTimelineView && { enableAdvancedCategorization: true }),
      ...(resources !== undefined && { resources }),
      eventClick: (info: EventClickArg) => {
        this.activeCalendar = cal;
        void this.interactionHandler.handleEventClick(info);
      },
      select: async (start: Date, end: Date, allDay: boolean, viewType: string) => {
        this.activeCalendar = cal;
        await this.interactionHandler.handleSelect(start, end, allDay, viewType);
      },
      modifyEvent: async (
        newEvent: EventApi,
        oldEvent: EventApi,
        newResource: string | undefined
      ) => {
        this.activeCalendar = cal;
        return await this.interactionHandler.handleModifyEvent(newEvent, oldEvent, newResource);
      },
      toggleTask: async (eventApi: EventApi, isDone: boolean) => {
        return await this.interactionHandler.handleToggleTask(eventApi, isDone);
      },
      getRecurringInstanceState: async (eventApi: EventApi) => {
        return await this.interactionHandler.getRecurringTaskInstanceState(eventApi);
      }
    });

    if (initialDate) {
      cal.gotoDate(initialDate);
    }

    this.calendars.push(cal);

    const resizeObserver = new ResizeObserver(() => {
      cal.updateSize();
    });
    resizeObserver.observe(el);
  }

  private getSourcesAndConfig(config: ViewConfig): {
    sources: EventSourceInput[];
    initialDate?: string;
  } {
    return PluginState.getInternalAPI().getEventSources(config, this.widgetCtx.sourcePath);
  }

  public async refreshView(): Promise<void> {
    this.calendars.forEach(calendar => {
      const { sources } = this.getSourcesAndConfig(this.config);
      calendar.removeAllEventSources();
      sources.forEach(source => calendar.addEventSource(source));
    });
  }
}

export class CalendarWidgetStrategy implements EmbeddedWidgetStrategy {
  constructor(private plugin: FullCalendarPlugin) {}

  async render(
    el: HTMLElement,
    config: Record<string, unknown>,
    ctx: WidgetContext
  ): Promise<EmbeddedWidgetInstance> {
    const calendarWidget = new EmbeddedCalendar(this.plugin, el, config, ctx);

    calendarWidget.load();

    return {
      updateSize() {
        calendarWidget.updateSize();
      },
      async refresh() {
        await calendarWidget.refreshView();
      },
      destroy() {
        calendarWidget.unload();
      }
    };
  }
}

export function registerCodeBlockProcessor(plugin: FullCalendarPlugin) {
  // Re-instantiate calendar strategy with full plugin context
  EmbeddedBlockRegistry.register('fc-calendar', new CalendarWidgetStrategy(plugin));

  const registerProcessor = (blockType: string) => {
    plugin.registerMarkdownCodeBlockProcessor(blockType, async (source, el, ctx) => {
      const container = el.createDiv({
        cls: `ofc-embedded-widget-container ofc-embed-${blockType}`
      });

      let parsedConfig: Record<string, unknown> = {};
      try {
        parsedConfig = (parseYaml(source) || {}) as Record<string, unknown>;
      } catch (e) {
        container.createEl('pre', {
          text: `Full Calendar: Failed to parse configuration.\n${e instanceof Error ? e.message : String(e)}`
        });
        return;
      }

      const layout = parsedConfig.layout as
        | { orientation?: 'horizontal' | 'vertical'; views?: Record<string, unknown>[] }
        | undefined;
      const hasLayout = layout && layout.views && layout.views.length > 0;

      const instances: EmbeddedWidgetInstance[] = [];
      const updateCallbacks: (() => void)[] = [];

      const mountWidget = async () => {
        let strategy = EmbeddedBlockRegistry.get(blockType);

        // On-demand lazy load strategy if needed
        if (!strategy && blockType === 'fc-analysis') {
          try {
            const { registerChronoAnalysisStrategy } =
              await import('../../chrono_analyser/AnalysisWidgetStrategy');
            registerChronoAnalysisStrategy(plugin);
            strategy = EmbeddedBlockRegistry.get(blockType);
          } catch (e) {
            container.empty();
            container.createEl('pre', {
              text: `Failed to load Chrono Analyzer: ${e instanceof Error ? e.message : String(e)}`
            });
            return;
          }
        }

        const activeStrategy = strategy;
        if (!activeStrategy) {
          container.empty();
          container.createEl('pre', { text: `Unknown block type strategy: ${blockType}` });
          return;
        }

        const renderItem = async (targetEl: HTMLElement, itemConfig: Record<string, unknown>) => {
          if (
            itemConfig.styles &&
            typeof itemConfig.styles === 'object' &&
            !Array.isArray(itemConfig.styles)
          ) {
            for (const [key, val] of Object.entries(itemConfig.styles)) {
              const cssKey = key.startsWith('--')
                ? key
                : key.replace(/([A-Z])/g, '-$1').toLowerCase();
              targetEl.style.setProperty(cssKey, String(val));
            }
          }

          const itemWidth = itemConfig.width;
          if (typeof itemWidth === 'string' || typeof itemWidth === 'number') {
            targetEl.style.width = String(itemWidth);
          }
          const itemHeight = itemConfig.height;
          if (
            (typeof itemHeight === 'string' || typeof itemHeight === 'number') &&
            itemHeight !== 'fit'
          ) {
            targetEl.style.height = String(itemHeight);
          }

          const inst = await activeStrategy.render(targetEl, itemConfig, {
            sourcePath: ctx.sourcePath,
            onUpdate: callback => {
              updateCallbacks.push(callback);
              PluginState.getCache().on('update', callback);
            }
          });
          instances.push(inst);
        };

        try {
          if (hasLayout && layout && layout.views) {
            const layoutOrientation = layout.orientation || 'horizontal';
            container.addClass(`ofc-layout-${layoutOrientation}`);

            for (const viewConfig of layout.views) {
              const viewEl = container.createDiv({ cls: 'ofc-layout-view-item' });

              // Custom width / flex layout control in horizontal layout
              const viewWidth = viewConfig.width;
              if (
                layoutOrientation === 'horizontal' &&
                (typeof viewWidth === 'string' || typeof viewWidth === 'number')
              ) {
                viewEl.setCssProps({
                  width: String(viewWidth),
                  flex: `0 0 ${viewWidth}`
                });
              } else {
                viewEl.setCssProps({
                  flex: '1'
                });
              }

              const viewHeight = viewConfig.height;
              if (typeof viewHeight === 'string' || typeof viewHeight === 'number') {
                viewEl.setCssProps({
                  height: viewHeight === 'fit' ? 'auto' : String(viewHeight)
                });
              } else {
                const globalHeight = parsedConfig.height;
                if (typeof globalHeight === 'string' || typeof globalHeight === 'number') {
                  viewEl.setCssProps({
                    height: globalHeight === 'fit' ? 'auto' : String(globalHeight)
                  });
                }
              }

              const shouldInherit =
                viewConfig.inheritFilters !== false && parsedConfig.inheritFilters !== false;
              const mergedViewConfig = {
                ...(shouldInherit && {
                  calendars: parsedConfig.calendars,
                  categories: parsedConfig.categories,
                  subCategories: parsedConfig.subCategories,
                  completed: parsedConfig.completed,
                  isTask: parsedConfig.isTask,
                  excludeAllDayTasks: parsedConfig.excludeAllDayTasks,
                  textSearch: parsedConfig.textSearch,
                  titleFilter: parsedConfig.titleFilter,
                  tagFilter: parsedConfig.tagFilter,
                  pathFilter: parsedConfig.pathFilter,
                  sortBy: parsedConfig.sortBy,
                  sortOrder: parsedConfig.sortOrder,
                  startOffset: parsedConfig.startOffset,
                  endOffset: parsedConfig.endOffset,
                  weather: parsedConfig.weather,
                  defaultDate: parsedConfig.defaultDate,
                  zoomLevel: parsedConfig.zoomLevel,
                  slotDuration: parsedConfig.slotDuration,
                  slotLabelInterval: parsedConfig.slotLabelInterval,
                  header: parsedConfig.header
                }),
                ...viewConfig
              };
              await renderItem(viewEl, mergedViewConfig);
            }
          } else {
            const configObj = parsedConfig as {
              styles?: Record<string, string>;
              width?: string;
              height?: string;
            };
            if (
              configObj.styles &&
              typeof configObj.styles === 'object' &&
              !Array.isArray(configObj.styles)
            ) {
              for (const [key, val] of Object.entries(configObj.styles)) {
                const cssKey = key.startsWith('--')
                  ? key
                  : key.replace(/([A-Z])/g, '-$1').toLowerCase();
                container.style.setProperty(cssKey, String(val));
              }
            }

            if (configObj.width) {
              container.style.width = configObj.width;
            }
            if (configObj.height && configObj.height !== 'fit') {
              container.style.height = configObj.height;
            }

            await renderItem(container, parsedConfig);
          }
        } catch (e) {
          container.empty();
          container.createEl('pre', {
            text: `Rendering failed: ${e instanceof Error ? e.message : String(e)}`
          });
        }
      };

      // Set up lazy rendering using IntersectionObserver
      let observer: IntersectionObserver | null = new IntersectionObserver(
        entries => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              void mountWidget();
              observer?.disconnect();
              observer = null;
            }
          }
        },
        { rootMargin: '100px' }
      );
      observer.observe(container);

      const renderChild = new MarkdownRenderChild(container);
      renderChild.onunload = () => {
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        updateCallbacks.forEach(cb => {
          PluginState.getCache().off('update', cb);
        });
        instances.forEach(inst => inst.destroy());
        instances.length = 0;
      };
      ctx.addChild(renderChild);
    });
  };

  registerProcessor('fc-calendar');
  registerProcessor('fc-analysis');
}
