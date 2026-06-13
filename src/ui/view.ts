import { showNotice } from '../utils/showNotice';
/**
 * @file view.ts
 * @brief Defines the `CalendarView`, the main component for displaying the calendar.
 *
 * @description
 * This file contains the `CalendarView` class, which extends Obsidian's `ItemView`.
 * It is responsible for creating and managing the DOM element that hosts the
 * calendar, initializing FullCalendar.js, and subscribing to the `EventCache`
 * for updates. It handles all direct user interactions with the calendar and
 * translates them into actions on the `EventCache`.
 *
 * @exports CalendarView
 *
 * @see EventCache.ts
 *
 * @license See LICENSE.md
 */

import { PluginState } from '../core/PluginState';
import { ItemView, WorkspaceLeaf } from 'obsidian';

import type { Calendar } from '@fullcalendar/core';

import './settings/sections/calendars/styles/overrides.css';
import FullCalendarPlugin from '../main';
import { renderOnboarding } from './onboard';
import { PLUGIN_SLUG, CalendarInfo } from '../types';
import { UpdateViewCallback } from '../core/EventCache';
import { t } from '../features/i18n/i18n';

import { ViewEnhancer } from '../core/ViewEnhancer';
import { createDateNavigation, DateNavigation } from '../features/navigation/DateNavigation';
import { openEventContextMenu } from './context/EventContextMenuBuilder';

// Import refactored handlers
import { ViewContext } from './calendar/ViewContext';
import { ViewZoomHandler } from './calendar/ViewZoomHandler';
import { ViewSearchHandler } from './calendar/ViewSearchHandler';
import { ViewTimelineHandler } from './calendar/ViewTimelineHandler';
import { ViewUIHandler } from './calendar/ViewUIHandler';
import { ViewEventInteractionHandler } from './calendar/ViewEventInteractionHandler';
export { getCalendarColors } from './calendar/utils';

export const FULL_CALENDAR_VIEW_TYPE = 'full-calendar-view';
export const FULL_CALENDAR_SIDEBAR_VIEW_TYPE = 'full-calendar-sidebar-view';

function throttle<TArgs extends unknown[], TReturn>(
  func: (...args: TArgs) => TReturn,
  limit: number
): (...args: TArgs) => TReturn {
  let inThrottle = false;
  let lastResult: TReturn | undefined;

  return function (this: ThisParameterType<typeof func>, ...args: TArgs): TReturn {
    if (!inThrottle) {
      inThrottle = true;
      window.setTimeout(() => (inThrottle = false), limit);
      const result = func.apply(this, args);
      lastResult = result;
      return result;
    }
    return lastResult as TReturn;
  };
}

export class CalendarView extends ItemView implements ViewContext {
  plugin: FullCalendarPlugin;
  inSidebar: boolean;
  fullCalendarView: Calendar | null = null;
  callback: UpdateViewCallback | null = null;
  viewEnhancer: ViewEnhancer | null = null;
  private dateNavigation: DateNavigation | null = null;
  private throttledZoom: (event: WheelEvent) => void;

  // Handlers
  private zoomHandler: ViewZoomHandler;
  private searchHandler: ViewSearchHandler;
  private timelineHandler: ViewTimelineHandler;
  private uiHandler: ViewUIHandler;
  private interactionHandler: ViewEventInteractionHandler;

  constructor(leaf: WorkspaceLeaf, plugin: FullCalendarPlugin, inSidebar = false) {
    super(leaf);
    this.plugin = plugin;
    this.inSidebar = inSidebar;

    // Initialize Handlers
    this.zoomHandler = new ViewZoomHandler(this);
    this.searchHandler = new ViewSearchHandler(this);
    this.timelineHandler = new ViewTimelineHandler(this);
    this.uiHandler = new ViewUIHandler(this);
    this.interactionHandler = new ViewEventInteractionHandler(this);

    this.throttledZoom = throttle(
      (event: WheelEvent) => this.zoomHandler.handleWheelZoom(event),
      100
    );
  }

  // Implementation of ViewContext
  public async refreshView(): Promise<void> {
    await this.onOpen();
  }

  getIcon(): string {
    return 'calendar-glyph';
  }

  getViewType() {
    return this.inSidebar ? FULL_CALENDAR_SIDEBAR_VIEW_TYPE : FULL_CALENDAR_VIEW_TYPE;
  }

  getDisplayText() {
    return this.inSidebar ? 'Full Calendar' : 'Calendar';
  }

  private refreshEventSourcesFromCache(): void {
    if (!this.viewEnhancer || !this.fullCalendarView) {
      return;
    }
    const fullCalendarView = this.fullCalendarView;

    this.viewEnhancer.updateSettings(PluginState.getSettings());
    const allCachedSources = PluginState.getCache().getAllEvents();
    const { sources } = this.viewEnhancer.getEnhancedData(allCachedSources);

    fullCalendarView.removeAllEventSources();
    sources.forEach(source => fullCalendarView.addEventSource(source));

    const viewType = fullCalendarView.view?.type;
    if (viewType && viewType.includes('resourceTimeline')) {
      this.timelineHandler.addShadowEventsToView();
    }

    this.searchHandler.clearCaches();
    this.searchHandler.scheduleApplyFilter();
  }

  /**
   * Called when the view is opened or re-focused.
   */
  onOpen(): Promise<void> {
    return (async () => {
      if (!PluginState.getCache()) {
        showNotice(t('ui.view.errors.cacheNotLoaded'));
        return;
      }
      if (!PluginState.getCache().initialized) {
        await PluginState.getCache().populate();
      }

      this.viewEnhancer = new ViewEnhancer(PluginState.getSettings());
      await this.viewEnhancer.loadBasesFilter();

      const container = this.contentEl;
      container.empty();
      const calendarShellEl = container.createDiv({ cls: 'ofc-calendar-shell' });
      const calendarEl = calendarShellEl.createDiv();

      this.registerDomEvent(
        calendarEl,
        'wheel',
        (event: WheelEvent) => {
          this.throttledZoom(event);
        },
        { passive: false }
      );

      if (
        PluginState.getSettings().calendarSources.filter(
          (s: CalendarInfo) => s.type !== 'FOR_TEST_ONLY'
        ).length === 0
      ) {
        renderOnboarding(this.plugin, calendarEl);
        return;
      }

      const allSources = PluginState.getCache().getAllEvents();
      const { sources, config: calendarConfig } = this.viewEnhancer.getEnhancedData(allSources);

      if (this.fullCalendarView) {
        this.fullCalendarView.destroy();
        this.fullCalendarView = null;
      }
      this.searchHandler.clearCaches();

      // LAZY LOAD THE CALENDAR RENDERER
      const { renderCalendar } = await import('./settings/sections/calendars/calendar');
      let currentViewType = '';

      const handleViewChange = () => {
        const newViewType = this.fullCalendarView?.view?.type || '';
        const wasTimeline = currentViewType.includes('resourceTimeline');
        const isTimeline = newViewType.includes('resourceTimeline');

        if (wasTimeline !== isTimeline) {
          if (isTimeline) {
            if (!this.timelineHandler.timelineResources) {
              const resources = this.timelineHandler.buildTimelineResources();
              this.fullCalendarView?.setOption('resources', resources);
              this.fullCalendarView?.setOption('resourcesInitiallyExpanded', false);
            }
            this.timelineHandler.addShadowEventsToView();
          } else {
            this.timelineHandler.removeShadowEventsFromView();
          }
        }

        this.zoomHandler.applyZoomForView(newViewType);
        currentViewType = newViewType;
      };

      this.fullCalendarView = await renderCalendar(calendarEl, sources, {
        timeZone:
          PluginState.getSettings().displayTimezone ||
          Intl.DateTimeFormat().resolvedOptions().timeZone,
        forceNarrow: this.inSidebar,
        enableAdvancedCategorization: PluginState.getSettings().enableAdvancedCategorization,
        onViewChange: handleViewChange,
        initialView: calendarConfig.initialView,
        businessHours: (() => {
          const businessHours =
            calendarConfig.businessHours || PluginState.getSettings().businessHours;
          return businessHours.enabled
            ? {
                daysOfWeek: businessHours.daysOfWeek,
                startTime: businessHours.startTime,
                endTime: businessHours.endTime
              }
            : false;
        })(),
        firstDay: calendarConfig.firstDay,
        timeFormat24h: calendarConfig.timeFormat24h,
        slotMinTime: calendarConfig.slotMinTime,
        slotMaxTime: calendarConfig.slotMaxTime,
        allDaySlot: calendarConfig.allDaySlot,
        timeGridDayHeaderFormat: calendarConfig.timeGridDayHeaderFormat,
        weekends: calendarConfig.weekends,
        hiddenDays: calendarConfig.hiddenDays,
        dayMaxEvents: calendarConfig.dayMaxEvents,
        highlightCurrentOrNextEvent: PluginState.getSettings().highlightCurrentOrNextEvent,
        initialSearchQuery: this.searchHandler.eventSearchQuery,
        onSearchQueryChange: (query: string) => {
          this.searchHandler.eventSearchQuery = query;
          this.searchHandler.scheduleApplyFilter();
        },
        onEventsSet: () => {
          this.searchHandler.clearCaches();
          this.searchHandler.scheduleApplyFilter();
        },
        customButtons: {
          workspace: {
            text: this.uiHandler.getWorkspaceSwitcherText(),
            click: (ev?: MouseEvent) => {
              if (ev) this.uiHandler.showWorkspaceSwitcher(ev);
            }
          },
          analysis: {
            text: t('ui.view.buttons.analysis'),
            click: () => this.uiHandler.activateChronoAnalyser()
          }
        },
        eventClick: info => {
          void this.interactionHandler.handleEventClick(info);
        },
        select: (start, end, allDay, viewType) =>
          this.interactionHandler.handleSelect(start, end, allDay, viewType),
        modifyEvent: (newEvent, oldEvent, newResource) =>
          this.interactionHandler.handleModifyEvent(newEvent, oldEvent, newResource),
        eventMouseEnter: info => {
          try {
            const location = PluginState.getCache().store.getEventDetails(info.event.id)?.location;
            if (location) {
              this.app.workspace.trigger('hover-link', {
                event: info.jsEvent,
                source: PLUGIN_SLUG,
                hoverParent: calendarEl,
                targetEl: info.jsEvent.target,
                linktext: location.path,
                sourcePath: location.path
              });
            }
          } catch {
            // Swallow hover-link errors
          }
        },
        openContextMenuForEvent: async (e, mouseEvent) => {
          await openEventContextMenu(this.plugin, e, mouseEvent);
        },
        toggleTask: (eventApi, isDone) =>
          this.interactionHandler.handleToggleTask(eventApi, isDone),
        getRecurringInstanceState: eventApi =>
          this.interactionHandler.getRecurringTaskInstanceState(eventApi),
        dateRightClick: (date: Date, mouseEvent: MouseEvent) => {
          if (!this.dateNavigation && this.fullCalendarView) {
            this.dateNavigation = createDateNavigation(this.fullCalendarView, calendarEl);
          }
          this.dateNavigation?.showDateContextMenu(mouseEvent, date);
        },
        viewRightClick: (mouseEvent: MouseEvent, calendar: Calendar) => {
          if (!this.dateNavigation && this.fullCalendarView) {
            this.dateNavigation = createDateNavigation(this.fullCalendarView, calendarEl);
          }
          this.dateNavigation?.showViewContextMenu(mouseEvent, calendar);
        },
        eventDragStop: (eventApi, mouseEvent) => {
          void this.interactionHandler.handleEventDragStop(eventApi, mouseEvent);
        },
        drop: (taskId, date, allDay) => this.interactionHandler.handleDrop(taskId, date, allDay)
      });

      // Initialize shadow events if starting in timeline view
      currentViewType = this.fullCalendarView?.view?.type || '';
      if (currentViewType.includes('resourceTimeline')) {
        if (!this.timelineHandler.timelineResources) {
          const resources = this.timelineHandler.buildTimelineResources();
          this.fullCalendarView?.setOption('resources', resources);
          this.fullCalendarView?.setOption('resourcesInitiallyExpanded', false);
        }
        this.timelineHandler.addShadowEventsToView();
      }

      this.searchHandler.scheduleApplyFilter();

      PluginState.getInternalAPI().registerView(this);

      if (this.fullCalendarView && !this.dateNavigation) {
        this.dateNavigation = createDateNavigation(this.fullCalendarView, calendarEl);
      }

      this.registerDomEvent(this.containerEl, 'mouseenter', () => {
        PluginState.getProviderRegistry().revalidateRemoteCalendars();
      });

      if (this.callback) {
        PluginState.getCache().off('update', this.callback);
        this.callback = null;
      }

      this.callback = PluginState.getCache().on('update', info => {
        if (!this.viewEnhancer || !this.fullCalendarView) {
          return;
        }

        if (info.type === 'resync') {
          void this.onOpen();
          return;
        }

        this.viewEnhancer.updateSettings(PluginState.getSettings());
        const allCachedSources = PluginState.getCache().getAllEvents();
        const { sources } = this.viewEnhancer.getEnhancedData(allCachedSources);

        if (this.fullCalendarView) {
          window.requestAnimationFrame(() => {
            if (this.fullCalendarView) {
              const fullCalendarView = this.fullCalendarView;
              if (
                info.type === 'events' &&
                info.affectedCalendars &&
                info.affectedCalendars.length > 0
              ) {
                info.affectedCalendars.forEach(calendarId => {
                  const oldSource = fullCalendarView.getEventSourceById(calendarId);
                  if (oldSource) {
                    oldSource.remove();
                  }
                  const newSource = sources.find(
                    s => typeof s === 'object' && s !== null && 'id' in s && s.id === calendarId
                  );
                  if (newSource) {
                    fullCalendarView.addEventSource(newSource);
                  }
                });
              } else {
                fullCalendarView.removeAllEventSources();
                sources.forEach(source => fullCalendarView.addEventSource(source));
              }

              this.searchHandler.clearCaches();
              this.searchHandler.scheduleApplyFilter();
            }
          });
        }

        const viewType = this.fullCalendarView.view?.type;
        if (viewType && viewType.includes('resourceTimeline')) {
          this.timelineHandler.addShadowEventsToView();
        }
      });

      this.refreshEventSourcesFromCache();
    })();
  }

  onResize(): void {
    if (this.fullCalendarView) {
      const fullCalendarView = this.fullCalendarView;
      window.requestAnimationFrame(() => {
        fullCalendarView.render();
      });
    }
  }

  onunload(): void {
    PluginState.getInternalAPI().unregisterView(this);
    this.searchHandler.onunload();
    if (this.fullCalendarView) {
      this.fullCalendarView.destroy();
      this.fullCalendarView = null;
    }
    if (this.dateNavigation) {
      this.dateNavigation.destroy();
      this.dateNavigation = null;
    }
    if (this.callback) {
      PluginState.getCache().off('update', this.callback);
      this.callback = null;
    }
  }
}
