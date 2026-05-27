/**
 * @file EventFilterSortEngine.ts
 * @brief Unified filtering and sorting engine for all calendar event and task data.
 *
 * @description
 * This engine provides a centralized, highly optimized, and standardized architecture for
 * querying, filtering, and sorting events and tasks. It supports exact compatibility
 * modes to maintain functional parity with preexisting ad-hoc systems across the calendar,
 * task backlogs, codeblocks, time engine, and notifications.
 *
 * @license See LICENSE.md
 */

import { StoredEvent } from './EventStore';
import { EnrichedOFCEvent } from './TimeEngine';
import { DateTime } from 'luxon';
import { PluginState } from './PluginState';

// ==========================================
//              INTERFACES
// ==========================================

export interface QueryableEvent {
  id: string; // Session ID or task ID
  uid?: string; // Persistent ID if exists
  title: string;
  category?: string;
  subCategory?: string;
  description?: string;
  filePath?: string;
  calendarId?: string;
  calendarName?: string;
  startMillis?: number; // Start time epoch (ms)
  endMillis?: number; // End time epoch (ms)
  date?: string; // ISO Date (yyyy-MM-dd)
  endDate?: string; // ISO End Date (yyyy-MM-dd)
  allDay?: boolean;
  completed?: boolean | string;
  isTask?: boolean;
  rawEvent?: unknown; // Original object reference
}

export interface BacklogItemShape {
  id: string;
  title: string;
  completed?: boolean;
  subtitle?: string;
  sourceId?: string;
  providerInfo?: {
    id: string;
    name: string;
  };
}

export type TextSearchMode = 'default' | 'backlog' | 'embedded';

export interface TextSearchOptions {
  query: string;
  mode: TextSearchMode;
}

export interface EventFilterCriteria {
  calendarIds?: string[];
  categories?: string[];
  subCategories?: string[];
  filePathSubstring?: string;
  tags?: string[]; // General metadata tag filtering (case-insensitive substring)
  isTask?: boolean;
  isCompleted?: boolean;
  excludeAllDayTasks?: boolean;
  dateRange?: {
    startMillis?: number;
    endMillis?: number;
  };
  textSearch?: TextSearchOptions;
}

export interface EventSortCriteria {
  field: 'start' | 'end' | 'title' | 'category' | 'priority';
  order?: 'asc' | 'desc';
}

// ==========================================
//           DATE PARSING UTILS
// ==========================================

function parseDateTimeToMillis(dateStr: string, timeStr?: string, timezone?: string): number {
  const dateTimeString = timeStr ? `${dateStr}T${timeStr}` : dateStr;
  if (!timezone) {
    const dt = DateTime.fromISO(dateTimeString);
    return dt.isValid ? dt.toMillis() : new Date(dateTimeString).getTime();
  }

  const zone = timezone === 'Z' || timezone.toLowerCase() === 'utc' ? 'utc' : timezone;
  const zoned = DateTime.fromISO(dateTimeString, { zone });
  if (zoned.isValid) {
    return zoned.toMillis();
  }
  const fallback = DateTime.fromISO(dateTimeString);
  return fallback.isValid ? fallback.toMillis() : new Date(dateTimeString).getTime();
}

// ==========================================
//          ENGINE CLASS DEFINITION
// ==========================================

export class EventFilterSortEngine {
  // ==========================================
  //            ADAPTER CONVERTERS
  // ==========================================

  public static fromStoredEvent(
    stored: StoredEvent,
    getCalendarName?: (calId: string) => string
  ): QueryableEvent {
    const { event, location, calendarId, id } = stored;

    let isTask = false;
    let startMillis: number | undefined;
    let endMillis: number | undefined;
    let date: string | undefined;
    let endDate: string | undefined;
    let completed: boolean | string | undefined;

    if (event.type === 'single') {
      date = event.date;
      endDate = event.endDate || undefined;
      completed =
        event.completed !== null && event.completed !== false ? event.completed : undefined;
      isTask = event.completed !== undefined;

      if (event.allDay) {
        startMillis = parseDateTimeToMillis(event.date);
        endMillis = parseDateTimeToMillis(event.endDate || event.date);
      } else {
        startMillis = parseDateTimeToMillis(event.date, event.startTime, event.timezone);
        endMillis = event.endTime
          ? parseDateTimeToMillis(event.endDate || event.date, event.endTime, event.timezone)
          : startMillis + 60 * 60 * 1000;
      }
    } else if (event.type === 'recurring' || event.type === 'rrule') {
      isTask = Boolean(event.isTask);
      if (event.type === 'rrule') {
        date = event.startDate;
        endDate = event.endDate || undefined;
      }
    }

    return {
      id,
      uid: event.uid,
      title: event.title || '',
      category: event.category,
      subCategory: event.subCategory,
      description: event.description,
      filePath: location?.path,
      calendarId,
      calendarName: getCalendarName ? getCalendarName(calendarId) : undefined,
      startMillis,
      endMillis,
      date,
      endDate,
      allDay: event.allDay,
      completed,
      isTask,
      rawEvent: stored
    };
  }

  public static fromEnrichedEvent(
    enriched: EnrichedOFCEvent,
    getCalendarName?: (calId: string) => string
  ): QueryableEvent {
    const { event, location, start, end, id } = enriched;

    let isTask = false;
    let date: string | undefined;
    let endDate: string | undefined;
    let completed: boolean | string | undefined;

    if (event.type === 'single') {
      date = event.date;
      endDate = event.endDate || undefined;
      completed =
        event.completed !== null && event.completed !== false ? event.completed : undefined;
      isTask = event.completed !== undefined;
    } else if (event.type === 'recurring' || event.type === 'rrule') {
      isTask = Boolean(event.isTask);
      if (event.type === 'rrule') {
        date = event.startDate;
        endDate = event.endDate || undefined;
      }
    }

    let calendarId: string | undefined;
    try {
      const cache = PluginState.getCache();
      if (cache && cache.store) {
        calendarId = cache.store.getEventDetails(id)?.calendarId;
      }
    } catch {
      // EventCache is not initialized (e.g. in TimeEngine unit tests)
    }

    if (!calendarId && 'calendarId' in event) {
      calendarId = (event as Record<string, unknown>).calendarId as string | undefined;
    }

    return {
      id,
      uid: event.uid,
      title: event.title || '',
      category: event.category,
      subCategory: event.subCategory,
      description: event.description,
      filePath: location?.file?.path,
      calendarId,
      calendarName: getCalendarName && calendarId ? getCalendarName(calendarId) : undefined,
      startMillis: start.toMillis(),
      endMillis: end.toMillis(),
      date,
      endDate,
      allDay: event.allDay,
      completed,
      isTask,
      rawEvent: enriched
    };
  }

  public static fromBacklogItem(
    item: BacklogItemShape,
    providerName?: string,
    providerId?: string
  ): QueryableEvent {
    const title = item.title || '';
    const subtitle = item.subtitle || '';
    const completed = item.completed ?? false;
    const filePath = subtitle.split(':')[0] || '';

    return {
      id: item.id,
      title,
      description: '',
      filePath,
      calendarId: providerId ?? item.sourceId ?? item.providerInfo?.id,
      calendarName: providerName ?? item.providerInfo?.name,
      completed,
      isTask: true,
      rawEvent: item
    };
  }

  // ==========================================
  //            MATCHING ALGORITHMS
  // ==========================================

  public static isFuzzySubsequence(needle: string, haystack: string): boolean {
    if (!needle) return true;
    let i = 0;
    let j = 0;
    while (i < needle.length && j < haystack.length) {
      if (needle[i] === haystack[j]) {
        i++;
      }
      j++;
    }
    return i === needle.length;
  }

  public static isEditDistanceAtMostOne(a: string, b: string): boolean {
    if (a === b) return true;
    const aLen = a.length;
    const bLen = b.length;
    const lengthDiff = Math.abs(aLen - bLen);
    if (lengthDiff > 1) return false;

    if (aLen === bLen) {
      let mismatches = 0;
      for (let i = 0; i < aLen; i++) {
        if (a[i] !== b[i]) {
          mismatches += 1;
          if (mismatches > 1) return false;
        }
      }
      return true;
    }

    const longer = aLen > bLen ? a : b;
    const shorter = aLen > bLen ? b : a;
    let longIndex = 0;
    let shortIndex = 0;
    let edits = 0;

    while (longIndex < longer.length && shortIndex < shorter.length) {
      if (longer[longIndex] === shorter[shortIndex]) {
        longIndex += 1;
        shortIndex += 1;
        continue;
      }
      edits += 1;
      if (edits > 1) return false;
      longIndex += 1;
    }
    return true;
  }

  // ==========================================
  //           FILTERING LOGIC
  // ==========================================

  public static matchEvent(event: QueryableEvent, criteria: EventFilterCriteria): boolean {
    // 1. Calendar Filter
    if (criteria.calendarIds && criteria.calendarIds.length > 0) {
      if (!event.calendarId || !criteria.calendarIds.includes(event.calendarId)) {
        return false;
      }
    }

    // 2. Category Filter
    if (criteria.categories && criteria.categories.length > 0) {
      if (!event.category) return false;
      const lowerCategory = event.category.toLowerCase();
      const hasMatch = criteria.categories.some(cat => lowerCategory.includes(cat.toLowerCase()));
      if (!hasMatch) return false;
    }

    // 3. SubCategory Filter
    if (criteria.subCategories && criteria.subCategories.length > 0) {
      if (!event.subCategory) return false;
      const lowerSub = event.subCategory.toLowerCase();
      const hasMatch = criteria.subCategories.some(sub => lowerSub.includes(sub.toLowerCase()));
      if (!hasMatch) return false;
    }

    // 4. File Path Filter
    if (criteria.filePathSubstring) {
      if (
        !event.filePath ||
        !event.filePath.toLowerCase().includes(criteria.filePathSubstring.toLowerCase())
      ) {
        return false;
      }
    }

    // 5. Completion State Filter
    if (criteria.isCompleted !== undefined) {
      const completedVal = Boolean(event.completed);
      if (completedVal !== criteria.isCompleted) {
        return false;
      }
    }

    // 6. Task vs Event Type Filter
    if (criteria.isTask !== undefined) {
      const isTaskVal = Boolean(event.isTask);
      if (isTaskVal !== criteria.isTask) {
        return false;
      }
    }

    // 7. TimeEngine Exclusions: Exclude all-day tasks from time-state updates
    if (criteria.excludeAllDayTasks) {
      const isTaskVal = Boolean(event.isTask);
      if (event.allDay && isTaskVal) {
        return false;
      }
    }

    // 8. Time/Date Range Filter
    if (criteria.dateRange) {
      const { startMillis, endMillis } = criteria.dateRange;
      if (
        startMillis !== undefined &&
        event.endMillis !== undefined &&
        event.endMillis < startMillis
      ) {
        return false;
      }
      if (
        endMillis !== undefined &&
        event.startMillis !== undefined &&
        event.startMillis > endMillis
      ) {
        return false;
      }
    }

    // 9. General Tags Filter (YAML tagFilter substring style)
    if (criteria.tags && criteria.tags.length > 0) {
      const title = (event.title || '').toLowerCase();
      const category = (event.category || '').toLowerCase();
      const subCategory = (event.subCategory || '').toLowerCase();
      const description = (event.description || '').toLowerCase();

      for (const tag of criteria.tags) {
        const lowerTag = tag.toLowerCase();
        const matchesTag =
          title.includes(lowerTag) ||
          description.includes(lowerTag) ||
          category.includes(lowerTag) ||
          subCategory.includes(lowerTag);
        if (!matchesTag) {
          return false;
        }
      }
    }

    // 10. Text Search Queries (Supports default edit-distance and backlog subsequence matching)
    if (criteria.textSearch) {
      const { query, mode } = criteria.textSearch;
      const trimmed = query.trim().toLowerCase();
      if (trimmed) {
        const tokens = trimmed.split(/\s+/).filter(Boolean);

        if (mode === 'backlog') {
          // TaskBacklogView exact style:
          // Haystack components: title, subtitle (filePath:line), providerName, baseName
          const title = (event.title || '').toLowerCase();
          const backlogItem = event.rawEvent as BacklogItemShape | undefined;
          const subtitle = (backlogItem?.subtitle || '').toLowerCase();
          const providerName = (event.calendarName || '').toLowerCase();

          const haystacks = [title, subtitle, providerName];
          const baseName = subtitle.split(/[/\\]/).pop()?.split(':')[0]?.trim() || '';
          if (baseName && baseName !== subtitle) {
            haystacks.push(baseName);
          }

          return tokens.every(token =>
            haystacks.some(
              haystack => haystack.includes(token) || this.isFuzzySubsequence(token, haystack)
            )
          );
        }

        if (mode === 'embedded') {
          // CodeBlock tagFilter exact style:
          const tag = trimmed;
          const desc = (event.description || '').toLowerCase();
          const category = (event.category || '').toLowerCase();
          const subCategory = (event.subCategory || '').toLowerCase();
          const title = (event.title || '').toLowerCase();
          return (
            title.includes(tag) ||
            desc.includes(tag) ||
            category.includes(tag) ||
            subCategory.includes(tag)
          );
        }

        // Calendar ViewSearchHandler exact style:
        // Haystack: title + category + subCategory + description + filePath
        const title = (event.title || '').toLowerCase();
        const category = (event.category || '').toLowerCase();
        const subCategory = (event.subCategory || '').toLowerCase();
        const description = (event.description || '').toLowerCase();
        const location = (event.filePath || '').toLowerCase();

        const haystack =
          `${title} ${category} ${subCategory} ${description} ${location}`.toLowerCase();
        const words = haystack.match(/[a-z0-9]+/g) || [];

        return tokens.every(token => {
          if (!token) return true;
          if (haystack.includes(token)) return true;
          if (token.length < 4) return false;

          for (const word of words) {
            if (word.length < 3) continue;
            if (this.isEditDistanceAtMostOne(token, word)) return true;
          }
          return false;
        });
      }
    }

    return true;
  }

  public static filterEvents<T extends QueryableEvent>(
    events: T[],
    criteria: EventFilterCriteria
  ): T[] {
    return events.filter(e => this.matchEvent(e, criteria));
  }

  // ==========================================
  //            SORTING LOGIC
  // ==========================================

  public static compareEvents(
    a: QueryableEvent,
    b: QueryableEvent,
    criterion: EventSortCriteria
  ): number {
    const { field, order = 'asc' } = criterion;
    const factor = order === 'asc' ? 1 : -1;

    if (field === 'start') {
      const aStart = a.startMillis ?? 0;
      const bStart = b.startMillis ?? 0;
      return (aStart - bStart) * factor;
    }

    if (field === 'end') {
      const aEnd = a.endMillis ?? 0;
      const bEnd = b.endMillis ?? 0;
      return (aEnd - bEnd) * factor;
    }

    if (field === 'title') {
      return (a.title || '').localeCompare(b.title || '') * factor;
    }

    if (field === 'category') {
      return (a.category || '').localeCompare(b.category || '') * factor;
    }

    if (field === 'priority') {
      // TimeEngine specific priority rule:
      // 1. Differing allDay statuses (non-all-day comes first/higher priority)
      if (a.allDay !== b.allDay) {
        return (a.allDay ? 1 : -1) * factor;
      }
      // 2. Differing end times
      const aEnd = a.endMillis ?? 0;
      const bEnd = b.endMillis ?? 0;
      if (aEnd !== bEnd) {
        return (aEnd - bEnd) * factor;
      }
      // 3. Differing start times
      const aStart = a.startMillis ?? 0;
      const bStart = b.startMillis ?? 0;
      return (aStart - bStart) * factor;
    }

    return 0;
  }

  public static sortEvents<T extends QueryableEvent>(events: T[], sorts: EventSortCriteria[]): T[] {
    if (!sorts || sorts.length === 0) {
      return events;
    }

    return [...events].sort((a, b) => {
      for (const sort of sorts) {
        const res = this.compareEvents(a, b, sort);
        if (res !== 0) return res;
      }
      return 0;
    });
  }

  // ==========================================
  //          UNIFIED FILTER-SORT PIPELINE
  // ==========================================

  public static query<T extends QueryableEvent>(
    events: T[],
    criteria: EventFilterCriteria,
    sorts?: EventSortCriteria[]
  ): T[] {
    const filtered = this.filterEvents(events, criteria);
    if (sorts && sorts.length > 0) {
      return this.sortEvents(filtered, sorts);
    }
    return filtered;
  }
}
