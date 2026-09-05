import { showNotice } from '../../utils/showNotice';
/**
 * @file WorkspaceManager.ts
 * @brief Centralizes workspace-related logic for the Full Calendar view.
 *
 * @description
 * This class acts as a middleware between the EventCache and the CalendarView.
 * It is responsible for taking the raw data from the cache and applying all
 * active workspace settings (view configurations, source filters, category filters)
 * to produce the final, ready-to-render data for the calendar.
 *
 * This decouples the complex business logic of workspaces from the view layer,
 * simplifying the CalendarView into a pure renderer.
 *
 * @license See LICENSE.md
 */

import { FullCalendarSettings, WorkspaceSettings } from '../../types/settings';
import { EventInput, EventSourceInput } from '@fullcalendar/core';
import { OFCEventSource, CachedEvent } from '../../core/EventCache';
import { toEventInput } from '../../core/interop';
import { TFile, parseYaml } from 'obsidian';
import { evaluateBaseFilter, BaseFile } from './bases/BasesFilterEvaluator';
import { PluginState } from '../../core/PluginState';
import { getCalendarColors } from '../../ui/calendar/utils';

export class WorkspaceManager {
  private settings: FullCalendarSettings;
  private cachedBasesData: (BaseFile & { settings?: Partial<WorkspaceSettings> }) | null = null;
  private cachedBasesQueryPath: string | null = null;

  constructor(settings: FullCalendarSettings) {
    this.settings = settings;
  }

  /**
   * Asynchronously loads and parses the active workspace's Bases query file,
   * caching the parsed filter tree in memory.
   */
  public async loadBasesFilter(): Promise<void> {
    const workspace = this.getActiveWorkspace();
    const queryPath = workspace?.basisQueryPath;

    if (!queryPath) {
      this.cachedBasesData = null;
      this.cachedBasesQueryPath = null;
      return;
    }

    if (queryPath === this.cachedBasesQueryPath) {
      return; // Already loaded/cached
    }

    try {
      const app = PluginState.getPlugin().app;
      const file = app.vault.getAbstractFileByPath(queryPath);
      if (file instanceof TFile) {
        const content = await app.vault.read(file);
        const baseData = parseYaml(content) as BaseFile & { settings?: Partial<WorkspaceSettings> };
        this.cachedBasesData = baseData || null;
        this.cachedBasesQueryPath = queryPath;
      } else {
        this.cachedBasesData = null;
        this.cachedBasesQueryPath = null;
      }
    } catch (e) {
      console.error('Failed to load active workspace Bases filter:', e);
      this.cachedBasesData = null;
      this.cachedBasesQueryPath = null;
    }
  }

  /**
   * Updates the manager's internal copy of the plugin settings.
   * This should be called whenever the settings are saved.
   * @param newSettings The latest plugin settings.
   */
  public updateSettings(newSettings: FullCalendarSettings): void {
    this.settings = newSettings;
  }

  // ====================================================================
  //                         CONFIGURATION METHODS
  // ====================================================================

  /**
   * Gets the active workspace object from settings.
   * @returns The active WorkspaceSettings object, or null if none is active.
   */
  public getActiveWorkspace(): WorkspaceSettings | null {
    if (!this.settings.activeWorkspace) return null;
    return this.settings.workspaces.find(w => w.id === this.settings.activeWorkspace) || null;
  }

  /**
   * Applies active workspace settings to the base calendar configuration.
   * @returns A partial settings object with workspace overrides applied.
   */
  public getCalendarConfig(): Partial<FullCalendarSettings> {
    const workspace = this.getActiveWorkspace();
    if (!workspace) return this.settings;

    const workspaceSettings = { ...this.settings };

    // Resolve combined config, prioritizing overrides inside the .base file settings block
    const activeConfig = { ...workspace };
    if (this.cachedBasesData?.settings) {
      Object.assign(activeConfig, this.cachedBasesData.settings);
    }

    // Apply view overrides
    if (activeConfig.defaultView?.desktop || activeConfig.defaultView?.mobile) {
      workspaceSettings.initialView = {
        desktop: activeConfig.defaultView.desktop || this.settings.initialView?.desktop,
        mobile: activeConfig.defaultView.mobile || this.settings.initialView?.mobile
      };
    }

    // Apply business hours override
    if (activeConfig.businessHours !== undefined) {
      workspaceSettings.businessHours = activeConfig.businessHours;
    }

    // Apply granular view configuration overrides
    if (activeConfig.slotMinTime !== undefined) {
      workspaceSettings.slotMinTime = activeConfig.slotMinTime;
    }

    if (activeConfig.slotMaxTime !== undefined) {
      workspaceSettings.slotMaxTime = activeConfig.slotMaxTime;
    }

    if (activeConfig.allDaySlot !== undefined) {
      workspaceSettings.allDaySlot = activeConfig.allDaySlot;
    }

    if (activeConfig.timeGridDayHeaderFormat !== undefined) {
      workspaceSettings.timeGridDayHeaderFormat = activeConfig.timeGridDayHeaderFormat;
    }

    if (activeConfig.weekends !== undefined) {
      workspaceSettings.weekends = activeConfig.weekends;
    }

    if (activeConfig.hiddenDays !== undefined) {
      workspaceSettings.hiddenDays = activeConfig.hiddenDays;
    }

    if (activeConfig.dayMaxEvents !== undefined) {
      workspaceSettings.dayMaxEvents = activeConfig.dayMaxEvents;
    }

    // Apply general & appearance overrides
    if (activeConfig.firstDay !== undefined) {
      workspaceSettings.firstDay = activeConfig.firstDay;
    }
    if (activeConfig.timeFormat24h !== undefined) {
      workspaceSettings.timeFormat24h = activeConfig.timeFormat24h;
    }
    if (activeConfig.clickToCreateEventFromMonthView !== undefined) {
      workspaceSettings.clickToCreateEventFromMonthView =
        activeConfig.clickToCreateEventFromMonthView;
    }
    if (activeConfig.displayTimezone !== undefined) {
      workspaceSettings.displayTimezone = activeConfig.displayTimezone;
    }
    if (activeConfig.enableAdvancedCategorization !== undefined) {
      workspaceSettings.enableAdvancedCategorization = activeConfig.enableAdvancedCategorization;
    }
    if (activeConfig.enableBackgroundEvents !== undefined) {
      workspaceSettings.enableBackgroundEvents = activeConfig.enableBackgroundEvents;
    }
    if (activeConfig.showEventInStatusBar !== undefined) {
      workspaceSettings.showEventInStatusBar = activeConfig.showEventInStatusBar;
    }
    if (activeConfig.highlightCurrentOrNextEvent !== undefined) {
      workspaceSettings.highlightCurrentOrNextEvent = activeConfig.highlightCurrentOrNextEvent;
    }
    if (activeConfig.categorySettings !== undefined) {
      workspaceSettings.categorySettings = activeConfig.categorySettings;
    }
    if (activeConfig.slotDuration !== undefined) {
      workspaceSettings.slotDuration = activeConfig.slotDuration;
    }
    if (activeConfig.slotLabelInterval !== undefined) {
      workspaceSettings.slotLabelInterval = activeConfig.slotLabelInterval;
    }
    if (activeConfig.headerToolbar !== undefined) {
      workspaceSettings.headerToolbar = activeConfig.headerToolbar;
    }
    if (activeConfig.footerToolbar !== undefined) {
      workspaceSettings.footerToolbar = activeConfig.footerToolbar;
    }
    if (activeConfig.height !== undefined) {
      workspaceSettings.height = activeConfig.height;
    }
    if (activeConfig.weatherHide !== undefined) {
      workspaceSettings.weatherHide = activeConfig.weatherHide;
    }

    return workspaceSettings;
  }

  // ====================================================================
  //                      DATA TRANSFORMATION METHODS
  // ====================================================================

  /**
   * Filters a list of all calendar sources based on the active workspace's
   * `visibleCalendars` setting.
   * @param sources An array of all OFCEventSource objects from the cache.
   * @returns A filtered array of OFCEventSource objects.
   */
  public filterCalendarSources(sources: OFCEventSource[]): OFCEventSource[] {
    const workspace = this.getActiveWorkspace();
    if (!workspace) return sources;

    const selected = (workspace.visibleCalendars ?? []).map(String);
    if (selected.length === 0) return sources;

    const selectedSet = new Set(selected);
    const filtered = sources.filter(source => selectedSet.has(String(source.id)));

    if (filtered.length === 0 && selected.length > 0) {
      showNotice(
        'The active workspace is filtering for calendars that are not available. Check workspace settings.',
        5000 // 5-second notice
      );
      // Do NOT fall back. An empty filter result means an empty calendar.
    }
    return filtered;
  }

  /**
   * Filters a list of events based on the active workspace's category filter.
   * @param events An array of EventInput objects for a single calendar source.
   * @param workspaceSettings The resolved settings overrides for the active workspace.
   * @returns A filtered array of EventInput objects.
   */
  private filterEventsByCategory(
    events: EventInput[],
    workspaceSettings: FullCalendarSettings
  ): EventInput[] {
    if (!workspaceSettings.enableAdvancedCategorization) {
      return events;
    }

    const workspace = this.getActiveWorkspace();
    if (!workspace?.categoryFilter) return events;

    const { mode, categories } = workspace.categoryFilter;
    if (mode === 'show-only' && categories.length === 0) {
      return events;
    }

    const knownCategories = new Set(workspaceSettings.categorySettings?.map(c => c.name) ?? []);

    return events.filter(event => {
      const props = event.extendedProps as
        { category?: string; originalEvent?: { category?: string } } | undefined;
      const fromExtended = props?.category || props?.originalEvent?.category;
      let category: string | undefined = fromExtended;

      if (!category && typeof event.resourceId === 'string') {
        const rid = event.resourceId;
        if (rid.includes('::') || knownCategories.has(rid)) {
          category = rid;
        }
      }

      if (!category) {
        return mode === 'hide';
      }

      const mainCategory = category.includes('::') ? category.split('::')[0] : category;

      if (mode === 'show-only') {
        return categories.includes(mainCategory);
      }
      return !categories.includes(mainCategory);
    });
  }

  /**
   * The main data transformation pipeline. Takes all sources from the cache
   * and returns a final, filtered list of EventSourceInput arrays for rendering.
   * @param allSources The complete, unfiltered list of sources from EventCache.
   * @returns An array of EventSourceInput objects ready for FullCalendar.
   */
  public getFilteredEventSources(allSources: OFCEventSource[]): EventSourceInput[] {
    const filteredSources = this.filterCalendarSources(allSources);
    const workspaceSettings = this.getCalendarConfig() as FullCalendarSettings;

    const sources = filteredSources.map(({ events, editable, color, id }): EventSourceInput => {
      // Apply Bases query filter on events first if active and loaded
      const basesFilter = this.cachedBasesData?.filters;
      let filteredCachedEvents = events;
      if (basesFilter) {
        const app = PluginState.getPlugin().app;
        filteredCachedEvents = events.filter(e => {
          const eventDetails = PluginState.getCache().store.getEventDetails(e.id);
          const path = eventDetails?.location?.path;
          if (!path) return true; // Keep events without file paths by default

          const calendarId = eventDetails?.calendarId;
          const calendarName = calendarId
            ? workspaceSettings.calendarSources.find(s => s.id === calendarId)?.name
            : undefined;

          const file = app.vault.getAbstractFileByPath(path);
          if (file instanceof TFile) {
            return evaluateBaseFilter(basesFilter, file, app.metadataCache, {
              calendarId,
              calendarName,
              category: e.event.category,
              subCategory: e.event.subCategory
            });
          }
          return true;
        });
      }

      const mainEvents = filteredCachedEvents
        .map((e: CachedEvent) => toEventInput(e.id, e.event, workspaceSettings))
        .filter((e): e is EventInput => !!e);

      const filteredEvents = this.filterEventsByCategory(mainEvents, workspaceSettings);

      return {
        id,
        events: filteredEvents,
        editable,
        ...getCalendarColors(color)
      };
    });
    return sources;
  }
}
