import { App, MarkdownPostProcessorContext, TFile, parseYaml, Component } from 'obsidian';
import {
  Calendar,
  EventSourceInput,
  EventClickArg,
  EventApi,
  EventInput
} from '@fullcalendar/core';
import { getDateFromFile } from 'obsidian-daily-notes-interface';
import FullCalendarPlugin from '../../main';
import { PluginState } from '../../core/PluginState';
import { ViewContext } from '../../ui/calendar/ViewContext';
import { ViewEnhancer } from '../../core/ViewEnhancer';
import { ViewEventInteractionHandler } from '../../ui/calendar/ViewEventInteractionHandler';
import { renderCalendar } from '../../ui/settings/sections/calendars/calendar';
import { OFCEvent } from '../../types';
import { VIEW_ZOOM_CONFIG } from '../../ui/calendar/ViewZoomHandler';

interface ViewConfig {
  view?: string;
  height?: string;
  width?: string;
  defaultDate?: string;
  calendars?: string[];
  header?: boolean;
  titleFilter?: string;
  tagFilter?: string;
  pathFilter?: string;
  zoomLevel?: number;
  slotDuration?: string;
  slotLabelInterval?: string;
}

interface CodeBlockConfig extends ViewConfig {
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
  private callback: (() => void) | null = null;
  private observer: IntersectionObserver | null = null;

  constructor(
    plugin: FullCalendarPlugin,
    containerEl: HTMLElement,
    configText: string,
    private ctx: MarkdownPostProcessorContext
  ) {
    super();
    this.plugin = plugin;
    this.app = plugin.app;
    this.containerEl = containerEl;
    this.enhancerInstance = new ViewEnhancer(PluginState.getSettings());
    this.interactionHandler = new ViewEventInteractionHandler(this);

    // Create container
    this.contentEl = containerEl.createDiv({ cls: 'ofc-embedded-calendar-container' });

    try {
      this.config = (parseYaml(configText) || {}) as CodeBlockConfig;
    } catch (e) {
      this.contentEl.createEl('pre', {
        text: `Full Calendar: Failed to parse configuration.\n${e instanceof Error ? e.message : String(e)}`
      });
      this.config = {};
      return;
    }

    // Apply main orientation classes (for layout itself)
    const orientation = this.config.orientation || 'vertical';
    this.containerEl.addClass(`ofc-embed-orientation-${orientation}`);
  }

  onload(): void {
    // Set up lazy rendering using IntersectionObserver
    this.observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void this.initializeCalendars();
            this.observer?.disconnect();
            this.observer = null;
          }
        }
      },
      { rootMargin: '100px' }
    );
    this.observer.observe(this.containerEl);
  }

  onunload(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.calendars.forEach(cal => cal.destroy());
    this.calendars = [];
    this.activeCalendar = null;
    if (this.callback) {
      PluginState.getCache().off('update', this.callback);
      this.callback = null;
    }
  }

  get fullCalendarView(): Calendar | null {
    return this.activeCalendar || this.calendars[0] || null;
  }

  get viewEnhancer(): ViewEnhancer | null {
    return this.enhancerInstance;
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

    // Remove any existing layout orientation classes
    this.contentEl.removeClass('ofc-layout-horizontal');
    this.contentEl.removeClass('ofc-layout-vertical');

    const layout = this.config.layout;
    if (layout && layout.views && layout.views.length > 0) {
      // Multiple calendars grid/flex layout
      const layoutOrientation = layout.orientation || 'horizontal';
      this.contentEl.addClass(`ofc-layout-${layoutOrientation}`);

      for (const viewConfig of layout.views) {
        const viewEl = this.contentEl.createDiv({ cls: 'ofc-layout-view-item' });

        // Custom width / flex layout control in horizontal layout
        if (layoutOrientation === 'horizontal' && viewConfig.width) {
          viewEl.setCssProps({
            width: viewConfig.width,
            flex: `0 0 ${viewConfig.width}`
          });
        } else {
          viewEl.setCssProps({
            flex: '1'
          });
        }

        if (viewConfig.height) {
          viewEl.setCssProps({
            height: viewConfig.height === 'fit' ? 'auto' : viewConfig.height
          });
        } else if (this.config.height) {
          viewEl.setCssProps({
            height: this.config.height === 'fit' ? 'auto' : this.config.height
          });
        }
        await this.renderSingleCalendar(viewEl, viewConfig);
      }
    } else {
      // Single calendar
      if (this.config.height) {
        this.contentEl.setCssProps({
          height: this.config.height === 'fit' ? 'auto' : this.config.height
        });
      }
      await this.renderSingleCalendar(this.contentEl, this.config);
    }

    // Keep all calendars reactive to cache updates
    this.callback = () => {
      this.calendars.forEach((calendar, idx) => {
        const viewConfig = layout?.views[idx] || this.config;
        const { sources: updatedSources } = this.getSourcesAndConfig(viewConfig);
        window.requestAnimationFrame(() => {
          calendar.removeAllEventSources();
          updatedSources.forEach(source => calendar.addEventSource(source));
        });
      });
    };
    PluginState.getCache().on('update', this.callback);
  }

  private async renderSingleCalendar(el: HTMLElement, config: ViewConfig): Promise<void> {
    let initialDate: string | undefined = undefined;
    if (config.defaultDate === 'auto') {
      const file = this.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
      if (file instanceof TFile) {
        const dailyNoteDate = getDateFromFile(file, 'day');
        if (dailyNoteDate) {
          initialDate = dailyNoteDate.format('YYYY-MM-DD');
        }
      }
    } else if (config.defaultDate === 'today') {
      initialDate = new Date().toISOString().split('T')[0];
    } else if (config.defaultDate) {
      initialDate = config.defaultDate;
    }

    const { sources } = this.getSourcesAndConfig(config);

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
      ...(slotDuration !== undefined && { slotDuration }),
      ...(slotLabelInterval !== undefined && { slotLabelInterval }),
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

  private getSourcesAndConfig(config: ViewConfig): { sources: EventSourceInput[] } {
    this.enhancerInstance.updateSettings(PluginState.getSettings());
    const allCachedSources = PluginState.getCache().getAllEvents();
    const { sources } = this.enhancerInstance.getEnhancedData(allCachedSources);

    let filteredSources = sources;
    if (config.calendars && config.calendars.length > 0) {
      filteredSources = sources.filter(s => {
        const sId = typeof s === 'object' && s !== null && 'id' in s ? (s.id as string) : '';
        return config.calendars?.includes(sId);
      });
    }

    // Apply advanced content/metadata filters on event arrays
    filteredSources = filteredSources.map(s => {
      if (typeof s === 'object' && s !== null && 'events' in s && Array.isArray(s.events)) {
        const filteredEvents = s.events.filter((item: EventInput) => {
          const eItem = item as unknown as { event: OFCEvent; id: string };
          const ofcEvent = eItem.event;
          if (!ofcEvent) return true;

          // 1. Filter by Title (case-insensitive substring)
          if (config.titleFilter) {
            const title = (ofcEvent.title || '').toLowerCase();
            if (!title.includes(config.titleFilter.toLowerCase())) {
              return false;
            }
          }

          // 2. Filter by File Path (case-insensitive substring)
          if (config.pathFilter) {
            const details = PluginState.getCache().store.getEventDetails(eItem.id);
            const filePath = (details?.location?.path || '').toLowerCase();
            if (!filePath.includes(config.pathFilter.toLowerCase())) {
              return false;
            }
          }

          // 3. Filter by Tag (case-insensitive title, description or category/subcategory search)
          if (config.tagFilter) {
            const tag = config.tagFilter.toLowerCase();
            const desc = (ofcEvent.description || '').toLowerCase();
            const category = (ofcEvent.category || '').toLowerCase();
            const subCategory = (ofcEvent.subCategory || '').toLowerCase();
            const title = (ofcEvent.title || '').toLowerCase();
            const match =
              title.includes(tag) ||
              desc.includes(tag) ||
              category.includes(tag) ||
              subCategory.includes(tag);
            if (!match) {
              return false;
            }
          }

          return true;
        });

        return {
          ...s,
          events: filteredEvents
        };
      }
      return s;
    });

    return { sources: filteredSources };
  }

  public async refreshView(): Promise<void> {
    this.calendars.forEach((calendar, idx) => {
      const viewConfig = this.config.layout?.views[idx] || this.config;
      const { sources } = this.getSourcesAndConfig(viewConfig);
      calendar.removeAllEventSources();
      sources.forEach(source => calendar.addEventSource(source));
    });
  }
}

export function registerCodeBlockProcessor(plugin: FullCalendarPlugin) {
  plugin.registerMarkdownCodeBlockProcessor('fc-calendar', (source, el, ctx) => {
    const calendar = new EmbeddedCalendar(plugin, el, source, ctx);
    ctx.addChild(calendar);
  });
}
