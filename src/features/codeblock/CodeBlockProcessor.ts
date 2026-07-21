import { App, Component, parseYaml, MarkdownRenderChild } from 'obsidian';
import { Calendar, EventSourceInput, EventClickArg, EventApi } from '@fullcalendar/core';
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

import './codeblock.css';

export interface ViewConfig {
  view?: string;
  type?: string;
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeEmbeddedConfigValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value.trim().length === 0 ? undefined : value;
  }

  if (Array.isArray(value)) {
    const sanitizedItems = value
      .map(item => sanitizeEmbeddedConfigValue(item))
      .filter((item): item is NonNullable<typeof item> => item !== undefined);
    return sanitizedItems.length > 0 ? sanitizedItems : undefined;
  }

  if (isPlainRecord(value)) {
    const sanitizedObject: Record<string, unknown> = {};
    for (const [key, innerValue] of Object.entries(value)) {
      const sanitizedValue = sanitizeEmbeddedConfigValue(innerValue);
      if (sanitizedValue !== undefined) {
        sanitizedObject[key] = sanitizedValue;
      }
    }
    return Object.keys(sanitizedObject).length > 0 ? sanitizedObject : undefined;
  }

  return value;
}

export function sanitizeEmbeddedConfig(config: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitizeEmbeddedConfigValue(config);
  return isPlainRecord(sanitized) ? sanitized : {};
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
  private resizeObservers: ResizeObserver[] = [];

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
    this.resizeObservers.forEach(obs => obs.disconnect());
    this.resizeObservers = [];
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

    // Register the update callback BEFORE the async render so that any cache
    // updates (e.g. remote Google/CalDAV events arriving mid-await) are not
    // silently dropped.  We track whether an update fired during the render
    // window and apply it once the calendar instance exists.
    let pendingUpdate = false;
    this.callback = () => {
      if (this.calendars.length === 0) {
        // Calendar not yet mounted — remember that a refresh is needed.
        pendingUpdate = true;
        return;
      }
      this.calendars.forEach(calendar => {
        const { sources: updatedSources } = this.getSourcesAndConfig(this.config);
        window.requestAnimationFrame(() => {
          calendar.removeAllEventSources();
          updatedSources.forEach(source => calendar.addEventSource(source));
        });
      });
    };
    this.widgetCtx.onUpdate(this.callback);

    await this.renderSingleCalendar(this.contentEl, this.config);

    // If a cache update arrived while we were awaiting renderSingleCalendar
    // (or the populate() above), apply it now that the calendar is mounted.
    if (pendingUpdate && this.callback) {
      this.callback();
    }
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
    this.resizeObservers.push(resizeObserver);
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

export function resolveStrategy(config: Record<string, unknown>): string {
  // 1. Check if an explicit widget or type is requested
  const typeVal = config.type || config.widget;
  if (typeof typeVal === 'string') {
    const t = typeVal.toLowerCase();
    if (t === 'calendar') return 'calendar';
    if (t === 'weather') return 'weather';
    if (t === 'analysis' || t === 'chart') return 'analysis';
    if (t === 'backlog' || t === 'task-backlog') return 'backlog';
  }

  // 2. Check for legacy weather config parameter `view: weather`
  if (config.view === 'weather') {
    return 'weather';
  }

  return 'calendar';
}

export async function getOrLoadStrategy(
  strategyName: string,
  plugin: FullCalendarPlugin
): Promise<EmbeddedWidgetStrategy | null> {
  const strategy = EmbeddedBlockRegistry.get(strategyName);
  if (strategy) {
    return strategy;
  }

  if (strategyName === 'analysis') {
    try {
      const { registerChronoAnalysisStrategy } =
        await import('../../chrono_analyser/AnalysisWidgetStrategy');
      registerChronoAnalysisStrategy(plugin);
      return EmbeddedBlockRegistry.get('analysis') || null;
    } catch (e) {
      console.error('Failed to lazy load AnalysisWidgetStrategy:', e);
      return null;
    }
  }

  if (strategyName === 'weather') {
    try {
      const { registerWeatherStrategy } = await import('./WeatherWidgetStrategy');
      registerWeatherStrategy(plugin);
      return EmbeddedBlockRegistry.get('weather') || null;
    } catch (e) {
      console.error('Failed to lazy load WeatherWidgetStrategy:', e);
      return null;
    }
  }

  if (strategyName === 'backlog') {
    try {
      const { registerBacklogStrategy } = await import('./BacklogWidgetStrategy');
      registerBacklogStrategy(plugin);
      return EmbeddedBlockRegistry.get('backlog') || null;
    } catch (e) {
      console.error('Failed to lazy load BacklogWidgetStrategy:', e);
      return null;
    }
  }

  return null;
}

export function registerCodeBlockProcessor(plugin: FullCalendarPlugin) {
  // Register unified calendar strategy
  EmbeddedBlockRegistry.register('calendar', new CalendarWidgetStrategy(plugin));

  plugin.registerMarkdownCodeBlockProcessor('fc-calendar', async (source, el, ctx) => {
    const container = el.createDiv({
      cls: 'ofc-embedded-widget-container ofc-embed-fc-calendar'
    });

    let parsedConfig: Record<string, unknown> = {};
    try {
      const parsed: unknown = parseYaml(source);
      parsedConfig = sanitizeEmbeddedConfig(isPlainRecord(parsed) ? parsed : {});
    } catch (e) {
      container.createEl('pre', {
        text: `Full Calendar: Failed to parse configuration.\n${e instanceof Error ? e.message : String(e)}`
      });
      return;
    }

    const layout = parsedConfig.layout as
      { orientation?: 'horizontal' | 'vertical'; views?: Record<string, unknown>[] } | undefined;
    const hasLayout = layout && layout.views && layout.views.length > 0;

    const instances: EmbeddedWidgetInstance[] = [];
    const updateCallbacks: (() => void)[] = [];

    const mountWidget = async () => {
      const renderItem = async (targetEl: HTMLElement, itemConfig: Record<string, unknown>) => {
        const normalizedItemConfig = sanitizeEmbeddedConfig(itemConfig);

        if (!normalizedItemConfig || typeof normalizedItemConfig !== 'object') {
          const itemConfigType = Array.isArray(itemConfig) ? 'array' : typeof itemConfig;
          targetEl.empty();
          targetEl.createEl('pre', {
            text: `Full Calendar: Invalid item configuration (expected object, got ${itemConfigType})`
          });
          return;
        }

        if (
          normalizedItemConfig.styles &&
          typeof normalizedItemConfig.styles === 'object' &&
          !Array.isArray(normalizedItemConfig.styles)
        ) {
          for (const [key, val] of Object.entries(normalizedItemConfig.styles)) {
            const cssKey = key.startsWith('--')
              ? key
              : key.replace(/([A-Z])/g, '-$1').toLowerCase();
            targetEl.style.setProperty(cssKey, String(val));
          }
        }

        const itemWidth = normalizedItemConfig.width;
        if (typeof itemWidth === 'string' || typeof itemWidth === 'number') {
          targetEl.setCssProps({
            width: String(itemWidth),
            flex: `0 0 ${itemWidth}`
          });
        }
        const itemHeight = normalizedItemConfig.height;
        if (
          (typeof itemHeight === 'string' || typeof itemHeight === 'number') &&
          itemHeight !== 'fit'
        ) {
          targetEl.setCssProps({
            height: String(itemHeight)
          });
        }

        const strategyName = resolveStrategy(normalizedItemConfig);
        const strategy = await getOrLoadStrategy(strategyName, plugin);
        if (!strategy) {
          targetEl.empty();
          targetEl.createEl('pre', { text: `Unknown widget type: ${strategyName}` });
          return;
        }

        const inst = await strategy.render(targetEl, normalizedItemConfig, {
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
            const viewWidth = viewConfig?.width;
            if (
              layoutOrientation === 'horizontal' &&
              viewWidth !== undefined &&
              (typeof viewWidth === 'string' || typeof viewWidth === 'number')
            ) {
              viewEl.setCssProps({
                '--view-item-width': String(viewWidth),
                '--view-item-flex': `0 0 ${viewWidth}`
              });
            } else {
              viewEl.setCssProps({
                '--view-item-flex': '1'
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
                header: parsedConfig.header,
                searchQuery: parsedConfig.searchQuery,
                showSearch: parsedConfig.showSearch,
                showFooter: parsedConfig.showFooter,
                showDateSelector: parsedConfig.showDateSelector
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
            container.setCssProps({ width: configObj.width });
          }
          if (configObj.height && configObj.height !== 'fit') {
            container.setCssProps({ height: configObj.height });
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

    // Set up ResizeObserver on the container to update all widget instances
    const containerResizeObserver = new ResizeObserver(() => {
      instances.forEach(inst => inst.updateSize());
    });
    containerResizeObserver.observe(container);

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
      if (containerResizeObserver) {
        containerResizeObserver.disconnect();
      }
      updateCallbacks.forEach(cb => {
        PluginState.getCache().off('update', cb);
      });
      instances.forEach(inst => inst.destroy());
      instances.length = 0;
    };
    ctx.addChild(renderChild);
  });
}
