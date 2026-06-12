import { DateTime } from 'luxon';
import { TFile } from 'obsidian';
import { getDateFromFile } from 'obsidian-daily-notes-interface';
import type { EventSourceInput, EventInput } from '@fullcalendar/core';
import { PluginState } from '../../core/PluginState';
import { ViewEnhancer } from '../../core/ViewEnhancer';
import { EventFilterCriteria, EventSortCriteria } from '../../core/EventFilterSortEngine';
import type { ViewConfig } from './CodeBlockProcessor';
import type { InternalAPI } from '../../api/FullCalendarAPI';
import { toEventInput } from '../../core/interop';
import type { CachedEvent } from '../../core/EventCache';

export function parseRelativeOffset(offsetStr: string, baseDate: DateTime): DateTime {
  const match = offsetStr.trim().match(/^([+-]?\d+)\s*([dwmy])$/);
  if (!match) return baseDate;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'd':
      return baseDate.plus({ days: value });
    case 'w':
      return baseDate.plus({ weeks: value });
    case 'm':
      return baseDate.plus({ months: value });
    case 'y':
      return baseDate.plus({ years: value });
    default:
      return baseDate;
  }
}

export function getEventSources(
  config: ViewConfig,
  sourcePath: string,
  internalAPI: InternalAPI
): { sources: EventSourceInput[]; initialDate?: string } {
  const enhancer = new ViewEnhancer(PluginState.getSettings());
  const allCachedSources = PluginState.getCache().getAllEvents();
  const { sources } = enhancer.getEnhancedData(allCachedSources);

  let filteredSources = sources;
  const resolvedCalendarIds: string[] = [];
  if (config.calendars && config.calendars.length > 0) {
    const calendarSources = PluginState.getSettings().calendarSources || [];
    filteredSources = sources.filter(s => {
      const sId = typeof s === 'object' && s !== null && 'id' in s ? (s.id as string) : '';
      const sourceMeta = calendarSources.find(src => src.id === sId);

      const isMatch = config.calendars?.some((target: string) => {
        // 1. Priority: Match by user-defined name
        if (sourceMeta && sourceMeta.name === target) {
          return true;
        }
        // 2. Fallback: Match by exact ID directly
        if (sId === target) {
          return true;
        }
        return false;
      });

      if (isMatch) {
        resolvedCalendarIds.push(sId);
        return true;
      }
      return false;
    });
  }

  // Parse Date Range Offsets & initialDate
  let initialDate: string | undefined = undefined;
  let baseDate = DateTime.now().startOf('day');
  if (config.defaultDate === 'today') {
    initialDate = DateTime.now().toISODate() || '';
    baseDate = DateTime.now().startOf('day');
  } else if (config.defaultDate && config.defaultDate !== 'auto') {
    initialDate = config.defaultDate;
    const parsed = DateTime.fromISO(config.defaultDate);
    if (parsed.isValid) baseDate = parsed.startOf('day');
  } else {
    const file = PluginState.getPlugin().app.vault.getAbstractFileByPath(sourcePath);
    if (file instanceof TFile) {
      const dailyNoteDate = getDateFromFile(file, 'day');
      if (dailyNoteDate) {
        initialDate = dailyNoteDate.format('YYYY-MM-DD');
        const parsed = DateTime.fromISO(initialDate);
        if (parsed.isValid) baseDate = parsed.startOf('day');
      }
    }
  }

  let startMillis: number | undefined;
  let endMillis: number | undefined;
  if (config.startOffset) {
    startMillis = parseRelativeOffset(config.startOffset, baseDate).toMillis();
  }
  if (config.endOffset) {
    endMillis = parseRelativeOffset(config.endOffset, baseDate).endOf('day').toMillis();
  }

  // Build central criteria
  const criteria: EventFilterCriteria = {
    calendarIds: config.calendars && config.calendars.length > 0 ? resolvedCalendarIds : undefined,
    categories: config.categories,
    subCategories: config.subCategories,
    isCompleted: config.completed,
    isTask: config.isTask,
    excludeAllDayTasks: config.excludeAllDayTasks,
    ...(config.pathFilter && { filePathSubstring: config.pathFilter }),
    ...(config.tagFilter && { tags: [config.tagFilter] }),
    ...((startMillis !== undefined || endMillis !== undefined) && {
      dateRange: { startMillis, endMillis }
    }),
    ...(config.textSearch && {
      textSearch: { query: config.textSearch, mode: 'default' }
    })
  };

  // Build sort criteria
  const sorts: EventSortCriteria[] = [];
  if (config.sortBy) {
    sorts.push({
      field: config.sortBy,
      order: config.sortOrder || 'asc'
    });
  }

  let queried = internalAPI.getEvents(criteria, sorts);

  // Apply custom titleFilter substring check if defined
  const titleFilter = config.titleFilter;
  if (titleFilter) {
    queried = queried.filter(q => q.title.toLowerCase().includes(titleFilter.toLowerCase()));
  }

  const settings = PluginState.getSettings();
  // Map back to EventInput elements per source
  filteredSources = filteredSources.map(s => {
    if (typeof s === 'object' && s !== null && 'events' in s && Array.isArray(s.events)) {
      const sId = typeof s === 'object' && s !== null && 'id' in s ? (s.id as string) : '';
      const sourceEvents = queried
        .filter(q => q.calendarId === sId)
        .map(q => {
          const cached = q.rawEvent as CachedEvent | undefined;
          if (cached) {
            const id = cached.id || q.id;
            const ofcEvent = cached.event;
            return toEventInput(id, ofcEvent, settings);
          }
          return null;
        })
        .filter((e): e is EventInput => e !== null);

      return {
        ...s,
        events: sourceEvents
      };
    }
    return s;
  });

  // Add shadow events for subcategories if this is a timeline view so they show up on the parent category rows too.
  const isTimelineView =
    config.view?.includes('resourceTimeline') || config.view?.includes('Timeline') || false;
  if (isTimelineView && PluginState.getSettings().enableAdvancedCategorization) {
    filteredSources = filteredSources.map(s => {
      if (typeof s === 'object' && s !== null && 'events' in s && Array.isArray(s.events)) {
        const shadowEvents: EventInput[] = [];
        for (const event of s.events) {
          if (typeof event.resourceId === 'string' && event.resourceId.includes('::')) {
            const parentCategory = event.resourceId.split('::')[0];
            shadowEvents.push({
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
            });
          }
        }
        return {
          ...s,
          events: [...s.events, ...shadowEvents]
        };
      }
      return s;
    });
  }

  return { sources: filteredSources, initialDate };
}
