import { EventInput } from '@fullcalendar/core';
import { PluginState } from '../../core/PluginState';
import { FullCalendarSettings } from '../../types/settings';
import { toEventInput } from '../../core/interop';
import { CachedEvent } from '../../core/EventCache';
import { ViewContext } from './ViewContext';

interface ResourceItem {
  id: string;
  title: string;
  parentId?: string;
  eventColor?: string;
  extendedProps?: Record<string, unknown>;
}

export class ViewTimelineHandler {
  public timelineResources: ResourceItem[] | null = null;

  constructor(private ctx: ViewContext) {}

  public buildTimelineResources(): ResourceItem[] {
    const resources: ResourceItem[] = [];
    const viewEnhancer = this.ctx.viewEnhancer;
    const config = viewEnhancer
      ? (viewEnhancer.getCalendarConfig() as FullCalendarSettings)
      : PluginState.getSettings();

    if (!config.enableAdvancedCategorization) {
      return resources;
    }

    const categorySettings = config.categorySettings || [];
    if (!viewEnhancer) {
      return resources;
    }

    const allCachedSources = PluginState.getCache().getAllEvents();
    const allSources = viewEnhancer.getFilteredSources(allCachedSources);
    const workspace = viewEnhancer.getActiveWorkspace();

    const isCategoryVisible = (name: string) => {
      if (!workspace?.categoryFilter) return true;
      const { mode, categories } = workspace.categoryFilter;
      if (mode === 'show-only' && categories.length === 0) return true;
      if (mode === 'show-only') return categories.includes(name);
      return !categories.includes(name);
    };

    const filteredCategorySettings = workspace?.categoryFilter
      ? categorySettings.filter(cat => isCategoryVisible(cat.name))
      : categorySettings;

    filteredCategorySettings.forEach((cat: { name: string; color: string }) => {
      resources.push({
        id: cat.name,
        title: cat.name,
        eventColor: cat.color,
        extendedProps: { isParent: true }
      });
    });

    const categoryMap = new Map<string, Set<string>>();
    for (const source of allSources) {
      for (const cachedEvent of source.events) {
        const { category, subCategory } = cachedEvent.event;
        if (category) {
          if (!isCategoryVisible(category)) continue;
          if (!categoryMap.has(category)) categoryMap.set(category, new Set());
          const sub = subCategory || '__NONE__';
          const subCategories = categoryMap.get(category);
          if (subCategories) {
            subCategories.add(sub);
          }
        }
      }
    }

    for (const [category, subCategories] of categoryMap.entries()) {
      if (!isCategoryVisible(category)) continue;
      if (!resources.find(r => r.id === category)) {
        resources.push({ id: category, title: category, extendedProps: { isParent: true } });
      }
      for (const subCategory of subCategories) {
        resources.push({
          id: `${category}::${subCategory}`,
          title: subCategory === '__NONE__' ? '(none)' : subCategory,
          parentId: category,
          extendedProps: {}
        });
      }
    }
    this.timelineResources = resources;
    return resources;
  }

  public generateShadowEvents(mainEvents: EventInput[], forceTimeline = false): EventInput[] {
    const shadowEvents: EventInput[] = [];
    const config = this.ctx.viewEnhancer
      ? (this.ctx.viewEnhancer.getCalendarConfig() as FullCalendarSettings)
      : PluginState.getSettings();

    if (!config.enableAdvancedCategorization) {
      return shadowEvents;
    }

    const currentView = this.ctx.fullCalendarView?.view?.type;
    if (!forceTimeline && currentView && !currentView.includes('resourceTimeline')) {
      return shadowEvents;
    }

    for (const event of mainEvents) {
      if (typeof event.resourceId === 'string' && event.resourceId.includes('::')) {
        const parentCategory = event.resourceId.split('::')[0];
        const shadowEvent: EventInput = {
          ...event,
          id: `${event.id}-shadow`,
          resourceId: parentCategory,
          extendedProps: {
            ...event.extendedProps,
            isShadow: true,
            originalEventId: event.id
          },
          className: 'fc-event-shadow',
          editable: false,
          durationEditable: false,
          startEditable: false
        };
        shadowEvents.push(shadowEvent);
      }
    }

    return shadowEvents;
  }

  public addShadowEventsToView() {
    const fullCalendarView = this.ctx.fullCalendarView;
    const config = this.ctx.viewEnhancer
      ? (this.ctx.viewEnhancer.getCalendarConfig() as FullCalendarSettings)
      : PluginState.getSettings();

    if (!config.enableAdvancedCategorization || !fullCalendarView) {
      return;
    }

    for (const source of fullCalendarView.getEventSources()) {
      const calendarId = source.id;
      const cachedSource = PluginState.getCache()
        .getAllEvents()
        .find(s => s.id === calendarId);
      if (!cachedSource) continue;

      const { events } = cachedSource;

      const mainEvents = events
        .map((e: CachedEvent) => toEventInput(e.id, e.event, config))
        .filter((e): e is EventInput => !!e);

      const shadowEvents = this.generateShadowEvents(mainEvents, true);

      let i = 0;
      const addNext = () => {
        if (i < shadowEvents.length) {
          window.requestAnimationFrame(() => {
            fullCalendarView?.addEvent(shadowEvents[i], calendarId);
            i++;
            addNext();
          });
        }
      };
      addNext();
    }
  }

  public removeShadowEventsFromView() {
    const fullCalendarView = this.ctx.fullCalendarView;
    if (!fullCalendarView) {
      return;
    }

    const allEvents = fullCalendarView.getEvents();
    allEvents.forEach(event => {
      if (event.extendedProps.isShadow) {
        event.remove();
      }
    });
  }
}
