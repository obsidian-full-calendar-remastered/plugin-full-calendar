/**
 * @file TimeEngine.ts
 * @brief Centralized engine for all time-based state calculations.
 *
 * @description
 * This class runs a single `setInterval` loop to determine the plugin's
 * "state-in-time." It calculates which event is current and which are upcoming
 * by maintaining an optimized, short-term cache of concrete event occurrences.
 * It is designed to be the single source of truth for time-state, providing
 * that state to subscribers (like NotificationManager) via the EventCache.
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { RRule, rrulestr } from 'rrule';
import { OFCEvent, EventLocation } from '../types';
import EventCache from './EventCache';

// ============== INTERFACES ==============

export interface EnrichedOFCEvent {
  id: string; // Session ID
  event: OFCEvent;
  location: EventLocation | null;
  start: DateTime;
  end: DateTime;
}

export interface TimeState {
  current: EnrichedOFCEvent | null;
  upcoming: EnrichedOFCEvent[];
  recentlyFinished: EnrichedOFCEvent[];
}

// ============== CONSTANTS ==============

const CHECK_INTERVAL_MS = 60 * 1000; // Check every minute
const OCCURRENCE_CACHE_LOOKAHEAD = { days: 7 }; // Pre-calculate occurrences for the next 7 days.
const MAX_OCCURRENCES = 100; // Max number of occurrences to cache to prevent performance issues.

const parseEventDateTime = (date: string, time?: string, timezone?: string): DateTime => {
  const dateTimeString = time ? `${date}T${time}` : date;
  if (!timezone) {
    return DateTime.fromISO(dateTimeString);
  }

  const zone = timezone === 'Z' || timezone.toLowerCase() === 'utc' ? 'utc' : timezone;
  const zoned = DateTime.fromISO(dateTimeString, { zone });
  return zoned.isValid ? zoned : DateTime.fromISO(dateTimeString);
};

const parseRecurringStart = (event: Extract<OFCEvent, { type: 'rrule' }>): DateTime => {
  if (event.startDate.includes('T')) {
    return parseEventDateTime(event.startDate, undefined, event.timezone);
  }

  return parseEventDateTime(
    event.startDate,
    event.allDay ? undefined : event.startTime,
    event.allDay ? undefined : event.timezone
  );
};

// ============== CLASS DEFINITION ==============

export class TimeEngine {
  private cache: EventCache;
  private intervalId: number | null = null;
  private occurrenceCache: EnrichedOFCEvent[] = [];
  private isBuildingCache = false;
  private rebuildTimeout: number | null = null;

  constructor(cache: EventCache) {
    this.cache = cache;
  }

  start(): Promise<void> {
    if (this.intervalId !== null) {
      this.stop();
    }

    return (async () => {
      // 1. Await the initial, critical build of the occurrence cache.
      await this.rebuildOccurrenceCache();

      // 2. Immediate tick so subscribers receive initial state without waiting a minute.
      this.tick();

      // 3. Begin regular ticking.
      this.intervalId = window.setInterval(() => this.tick(), CHECK_INTERVAL_MS);
    })();
  }

  stop() {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.rebuildTimeout) {
      window.clearTimeout(this.rebuildTimeout);
      this.rebuildTimeout = null;
    }
    this.occurrenceCache = [];
  }

  /**
   * Schedules a debounced rebuild of the occurrence cache.
   * This should be called by the EventCache whenever its data changes.
   */
  public scheduleCacheRebuild() {
    if (this.rebuildTimeout) {
      window.clearTimeout(this.rebuildTimeout);
    }
    this.rebuildTimeout = window.setTimeout(() => {
      void this.rebuildOccurrenceCache();
    }, 500); // 500ms debounce to batch rapid changes.
  }

  private tick() {
    const now = DateTime.now();

    // Prune past events from the cache that are no longer relevant.
    const firstRelevantIndex = this.occurrenceCache.findIndex(occ => occ.end > now);
    if (firstRelevantIndex > 0) {
      this.occurrenceCache.splice(0, firstRelevantIndex);
    }

    // If the cache is running low, trigger a background rebuild.
    if (this.occurrenceCache.length < MAX_OCCURRENCES / 2) {
      this.scheduleCacheRebuild();
    }

    const state = this.calculateCurrentState(now);

    this.cache.broadcastTimeTick(state);
  }

  private calculateCurrentState(now: DateTime): TimeState {
    let current: EnrichedOFCEvent | null = null;
    const upcoming: EnrichedOFCEvent[] = [];

    for (const occurrence of this.occurrenceCache) {
      if (occurrence.start <= now && now < occurrence.end) {
        current = occurrence;
      } else if (occurrence.start > now) {
        upcoming.push(occurrence);
      }
    }
    // NOTE: recentlyFinished is not implemented in Stage 1.
    return { current, upcoming, recentlyFinished: [] };
  }

  public getOccurrenceCache(): EnrichedOFCEvent[] {
    return this.occurrenceCache;
  }

  private rebuildOccurrenceCache(): Promise<void> {
    if (this.isBuildingCache) return Promise.resolve();
    this.isBuildingCache = true;

    try {
      const allStoredEvents = this.cache.store.getAllEvents();
      const newOccurrences: EnrichedOFCEvent[] = [];
      const now = DateTime.now();
      const lookaheadEnd = now.plus(OCCURRENCE_CACHE_LOOKAHEAD);

      for (const storedEvent of allStoredEvents) {
        const { id, event, location: pathLocation } = storedEvent; // RENAMED
        // TRANSFORM to EventLocation shape expected by subscribers
        const location: EventLocation | null = pathLocation
          ? {
              file: { path: pathLocation.path },
              lineNumber: pathLocation.lineNumber
            }
          : null;

        if (event.type === 'single') {
          if (event.allDay) {
            const start = parseEventDateTime(event.date).startOf('day');
            const end = parseEventDateTime(event.endDate || event.date).endOf('day');
            if (end >= now) {
              newOccurrences.push({ id, event, location, start, end });
            }
          } else {
            const start = parseEventDateTime(event.date, event.startTime, event.timezone);
            if (!start.isValid) continue;
            const end = event.endTime
              ? parseEventDateTime(event.endDate || event.date, event.endTime, event.timezone)
              : start.plus({ hours: 1 });
            if (end >= now) {
              newOccurrences.push({ id, event, location, start, end });
            }
          }
        } else if (event.type === 'recurring' || event.type === 'rrule') {
          let rule: RRule;
          try {
            let dtstart: Date;
            if (event.type === 'rrule') {
              const dt = parseRecurringStart(event);
              dtstart = dt.isValid ? dt.toJSDate() : new Date(event.startDate);
            } else {
              dtstart = parseEventDateTime(
                event.startRecur || '1970-01-01',
                event.allDay ? undefined : event.startTime,
                event.allDay ? undefined : event.timezone
              ).toJSDate();
            }

            let ruleOptions: Partial<import('rrule').Options> = { dtstart };
            if (event.type === 'recurring') {
              const weekdays = {
                U: RRule.SU,
                M: RRule.MO,
                T: RRule.TU,
                W: RRule.WE,
                R: RRule.TH,
                F: RRule.FR,
                S: RRule.SA
              };
              if (event.daysOfWeek) {
                ruleOptions.freq = RRule.WEEKLY;
                ruleOptions.byweekday = event.daysOfWeek.map(c => weekdays[c]);
              } else if (event.dayOfMonth) {
                ruleOptions.freq = RRule.MONTHLY;
                ruleOptions.bymonthday = event.dayOfMonth;
                if (event.month) {
                  ruleOptions.freq = RRule.YEARLY;
                  ruleOptions.bymonth = event.month;
                }
              }
              if (event.endRecur) {
                ruleOptions.until = parseEventDateTime(event.endRecur).endOf('day').toJSDate();
              }
            } else {
              const parsed = rrulestr(event.rrule);
              ruleOptions = { ...parsed.origOptions, dtstart };
            }
            rule = new RRule(ruleOptions);

            const occurrences = rule.between(now.toJSDate(), lookaheadEnd.toJSDate());
            for (const occDate of occurrences) {
              const start = DateTime.fromJSDate(occDate);
              const dateStr = start.toISODate();
              if (dateStr && event.skipDates.includes(dateStr)) continue;

              let end: DateTime;
              if (!event.allDay && event.startTime && event.endTime) {
                const startTime = DateTime.fromFormat(event.startTime, 'HH:mm');
                const endTime = DateTime.fromFormat(event.endTime, 'HH:mm');
                if (startTime.isValid && endTime.isValid) {
                  const duration = endTime.diff(startTime);
                  end = start.plus(duration);
                } else {
                  end = start.plus({ hours: 1 });
                }
              } else {
                end = start.endOf('day');
              }
              newOccurrences.push({ id, event, location, start, end });
            }
          } catch (e) {
            console.error(`[TimeEngine] Error parsing rrule for "${event.title}"`, e);
            continue;
          }
        }
      }

      newOccurrences.sort((a, b) => a.start.toMillis() - b.start.toMillis());
      this.occurrenceCache = newOccurrences.slice(0, MAX_OCCURRENCES);
    } finally {
      this.isBuildingCache = false;
    }

    return Promise.resolve();
  }
}
