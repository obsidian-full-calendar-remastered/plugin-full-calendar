/**
 * @file interop.ts
 * @brief Provides data conversion functions between OFCEvent and FullCalendar's EventInput.
 *
 * @description
 * This module acts as a data-translation layer between the plugin's internal `OFCEvent` format and FullCalendar's `EventInput` format.
 * It ensures correct INTEROPerability for displaying events and handling user interactions such as dragging and resizing.
 * The conversion logic supports single, recurring, and rrule-based events, including timezone-aware processing and category coloring.
 *
 * @packageDocumentation
 * @module interop
 *
 * @exports toEventInput
 * @exports fromEventApi
 * @exports dateEndpointsToFrontmatter
 *
 * @license See LICENSE.md
 */

import { rrulestr } from 'rrule';
import { DateTime, Duration } from 'luxon';

import { OFCEvent } from '../types';
import { getCalendarColors } from '../ui/view';
import { FullCalendarSettings } from '../types/settings';

import { EventApi, EventInput } from '@fullcalendar/core';

/**
 * Functions for converting between the types used by the FullCalendar view plugin and
 * types used internally by Obsidian Full Calendar.
 *
 */
const parseTime = (time: string): Duration | null => {
  let parsed = DateTime.fromFormat(time, 'h:mm a');
  if (parsed.invalidReason) {
    parsed = DateTime.fromFormat(time, 'HH:mm');
  }
  if (parsed.invalidReason) {
    parsed = DateTime.fromFormat(time, 'H:mm');
  }
  if (parsed.invalidReason) {
    parsed = DateTime.fromFormat(time, 'HH:mm:ss');
  }
  if (parsed.invalidReason) {
    parsed = DateTime.fromFormat(time, 'H:mm:ss');
  }

  if (parsed.invalidReason) {
    console.error(`FC: Error parsing time string '${time}': ${parsed.invalidReason}'`);
    return null;
  }

  const isoTime = parsed.toISOTime({
    includeOffset: false,
    includePrefix: false
  });

  if (!isoTime) {
    console.error(`FC: Could not convert parsed time to ISO for '${time}'`);
    return null;
  }

  return Duration.fromISOTime(isoTime);
};

const add = (date: DateTime, time: Duration): DateTime => {
  const hours = time.hours;
  const minutes = time.minutes;
  return date.set({ hour: hours, minute: minutes });
};

const getTime = (date: Date, displayZone: string): string => {
  const isoTime = DateTime.fromJSDate(date).setZone(displayZone).toISOTime({
    suppressMilliseconds: true,
    includeOffset: false,
    suppressSeconds: true
  });
  if (!isoTime) {
    console.error('FC: Invalid time conversion from date:', date);
    return '';
  }
  return isoTime;
};

const getDate = (date: Date, displayZone: string): string =>
  DateTime.fromJSDate(date).setZone(displayZone).toISODate() ?? '';

const combineDateTimeStrings = (date: string, time: string): string | null => {
  const parsedDate = DateTime.fromISO(date);
  if (parsedDate.invalidReason) {
    console.error(`FC: Error parsing time string '${date}': ${parsedDate.invalidReason}`);
    return null;
  }

  const parsedTime = parseTime(time);
  if (!parsedTime) {
    return null;
  }

  return add(parsedDate, parsedTime).toISO({
    includeOffset: false,
    suppressMilliseconds: true
  });
};

const DAYS = 'UMTWRFS';

export function dateEndpointsToFrontmatter(
  start: Date,
  end: Date,
  allDay: boolean,
  displayZone: string
): Partial<OFCEvent> {
  const date = getDate(start, displayZone);
  const endDate = getDate(end, displayZone);
  return {
    type: 'single',
    date,
    endDate: date !== endDate ? endDate : undefined,
    allDay,
    ...(allDay
      ? {}
      : {
          startTime: getTime(start, displayZone),
          endTime: getTime(end, displayZone)
        })
  };
}

/**
 * Converts an OFCEvent from the cache into an EventInput object that FullCalendar can render.
 * This function handles all event types (single, recurring, rrule) and correctly
 * formats dates, times, and recurrence rules.
 *
 * @param id The unique ID of the event.
 * @param event The OFCEvent object from the cache. Its dates/times are recorded
 *                    in its original source timezone.
 * @param settings The plugin settings, used for category coloring.
 * @returns An `EventInput` object, or `null` if the event data is invalid.
 */

export function toEventInput(
  id: string,
  event: OFCEvent,
  settings: FullCalendarSettings
): EventInput | null {
  const baseEvent: EventInput = {
    id,
    title: event.title,
    allDay: event.allDay,
    extendedProps: {
      ...event,
      uid: event.uid,
      recurringEventId: event.recurringEventId,
      category: event.category,
      subCategory: event.subCategory,
      location: event.location,
      description: event.description,
      url: event.url,
      isShadow: false // Flag to identify the real event
    },
    // Support for background events and other display types
    ...(event.display && { display: event.display })
  };

  // Assign category-level coloring
  if (settings.enableAdvancedCategorization && event.category) {
    const categorySetting = (settings.categorySettings || []).find(
      (c: { name: string; color: string }) => c.name === event.category
    );
    if (categorySetting) {
      const { color, textColor } = getCalendarColors(categorySetting.color);
      baseEvent.color = color;
      baseEvent.textColor = textColor;
    }

    // NEW: Assign resource ID for timeline view
    const subCategoryName = event.subCategory || '__NONE__';
    baseEvent.resourceId = `${event.category}::${subCategoryName}`;
  }

  // --- Main Event Logic (largely the same, but populates baseEvent) ---
  if (event.type === 'recurring') {
    // ====================================================================
    // Time-zone–aware conversion (fixed version)
    // ====================================================================

    // 1  Pick the zone
    const sourceZone = event.timezone || settings.displayTimezone || DateTime.local().zoneName;

    // Use a recent default start date to avoid massive recurrence expansions when startRecur is absent.
    const startRecurDate =
      event.startRecur ||
      DateTime.local().startOf('year').toISODate() ||
      DateTime.local().toISODate() ||
      '2025-01-01';
    let dtstart: DateTime;

    // 2  Build the local start-of-series DateTime
    if (event.allDay) {
      dtstart = DateTime.fromISO(startRecurDate, { zone: sourceZone }).startOf('day'); // 00:00 in sourceZone
    } else {
      const startTimeDt = parseTime(event.startTime);
      if (!startTimeDt) return null;

      dtstart = DateTime.fromISO(startRecurDate, { zone: sourceZone }).set({
        hour: startTimeDt.hours,
        minute: startTimeDt.minutes,
        second: 0,
        millisecond: 0
      });
    }

    // 3  RRULE string (plus UNTIL if endRecur exists)
    // START REPLACEMENT
    let rruleString: string;
    const weekdays = { U: 'SU', M: 'MO', T: 'TU', W: 'WE', R: 'TH', F: 'FR', S: 'SA' };
    const rruleWeekdays = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

    if (event.fcrDaily) {
      rruleString = 'FREQ=DAILY';
    } else if (event.daysOfWeek?.length) {
      const byday = event.daysOfWeek.map((c: keyof typeof weekdays) => weekdays[c]);
      rruleString = `FREQ=WEEKLY;BYDAY=${byday.join(',')}`;
    } else if (event.repeatOn) {
      const byday = rruleWeekdays[event.repeatOn.weekday];
      const bysetpos = event.repeatOn.week;
      // Note: rrule.js seems to use BYSETPOS for this, which is correct.
      rruleString = `FREQ=MONTHLY;BYDAY=${byday};BYSETPOS=${bysetpos}`;
    } else if (event.month && event.dayOfMonth) {
      rruleString = `FREQ=YEARLY;BYMONTH=${event.month};BYMONTHDAY=${event.dayOfMonth}`;
    } else if (event.dayOfMonth) {
      rruleString = `FREQ=MONTHLY;BYMONTHDAY=${event.dayOfMonth}`;
    } else {
      console.error('FullCalendar: invalid recurring event data.', event);
      return null;
    }

    if (event.repeatInterval && event.repeatInterval > 1) {
      rruleString += `;INTERVAL=${event.repeatInterval}`;
    }
    // END REPLACEMENT

    if (event.endRecur) {
      const endLocal = DateTime.fromISO(event.endRecur, { zone: sourceZone }).endOf('day');

      // Only add UNTIL if it occurs on/after the first generated instance
      const firstOccurDate = rrulestr(`RRULE:${rruleString}`, {
        dtstart: dtstart.toJSDate()
      }).after(dtstart.toJSDate(), true);

      if (firstOccurDate) {
        const firstOccur = DateTime.fromJSDate(firstOccurDate, { zone: sourceZone });
        if (endLocal >= firstOccur.startOf('day')) {
          const until = endLocal.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
          rruleString += `;UNTIL=${until}`;
        }
      }
    }

    // 4  DTSTART – always include TZID to avoid floating-date bugs
    const dtstartString = `DTSTART;TZID=${sourceZone}:${dtstart.toFormat("yyyyMMdd'T'HHmmss")}`;

    // 5  EXDATEs – also anchored to the same zone
    const exdateStrings = (event.skipDates || [])
      .map((skipDate: string) => {
        if (event.allDay) {
          const exDt = DateTime.fromISO(skipDate, { zone: sourceZone }).startOf('day');
          return `EXDATE;TZID=${sourceZone}:${exDt.toFormat("yyyyMMdd'T'HHmmss")}`;
        }
        const startTimeDt = parseTime(event.startTime);
        if (!startTimeDt) return null;

        const exDt = DateTime.fromISO(skipDate, { zone: sourceZone }).set({
          hour: startTimeDt.hours,
          minute: startTimeDt.minutes,
          second: 0,
          millisecond: 0
        });
        return `EXDATE;TZID=${sourceZone}:${exDt.toFormat("yyyyMMdd'T'HHmmss")}`;
      })
      .filter(Boolean) as string[];

    // 6  Assemble the full iCalendar text
    baseEvent.rrule = [dtstartString, `RRULE:${rruleString}`, ...exdateStrings].join('\n');

    // 7  Duration for timed events
    if (!event.allDay && event.startTime && event.endTime) {
      const startTime = parseTime(event.startTime);
      const endTime = parseTime(event.endTime);
      if (startTime && endTime) {
        // Use Luxon to handle date math correctly, accounting for potential day crossing
        const startDateTime = combineDateTimeStrings(
          event.startRecur || '2025-01-01',
          event.startTime
        );
        const endDateTime = combineDateTimeStrings(
          event.endDate || event.startRecur || '2025-01-01',
          event.endTime
        );
        if (!startDateTime || !endDateTime) {
          return null;
        }
        const startDt = DateTime.fromISO(startDateTime);
        let endDt = DateTime.fromISO(endDateTime);

        // If end time is logically before start time, it means it's on the next day
        if (endDt < startDt) {
          endDt = endDt.plus({ days: 1 });
        }

        const duration = endDt.diff(startDt);
        if (duration.as('milliseconds') > 0) {
          baseEvent.duration = duration.toFormat('hh:mm');
        }
      }
    }

    // 8  Misc. extended props
    baseEvent.extendedProps = {
      ...baseEvent.extendedProps,
      isTask: !!event.isTask,
      ...(event.allDay ? {} : { sourceTimezone: sourceZone }),
      fcrDaily: event.fcrDaily,
      repeatInterval: event.repeatInterval,
      repeatOn: event.repeatOn
    };

    // Tell FullCalendar it’s all-day when relevant
    baseEvent.allDay = !!event.allDay;
  } else if (event.type === 'rrule') {
    const fm = event as unknown as {
      startDate: string;
      startTime: string;
      skipDates?: string[];
    };

    // Determine source and display timezones
    const sourceZone = event.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Parse the event time in its source timezone first
    const dtstartStr = event.allDay ? null : combineDateTimeStrings(fm.startDate, fm.startTime);
    if (!event.allDay && !dtstartStr) {
      return null;
    }

    const dtInSource = event.allDay
      ? DateTime.fromISO(fm.startDate, { zone: sourceZone })
      : dtstartStr
        ? DateTime.fromISO(dtstartStr, { zone: sourceZone })
        : DateTime.invalid('Missing DTSTART for timed event');

    // Validate that the source date is valid
    if (!dtInSource.isValid) {
      console.error(
        `Invalid start date for rrule event "${event.title}": ${dtInSource.invalidReason}`,
        { startDate: fm.startDate, startTime: fm.startTime, sourceZone }
      );
      return null;
    }

    // Exdates are built as EXDATE strings with TZID, directly embedded into the rrule
    const exdateStrings = (fm.skipDates || [])
      .filter((d: string) => d && d.trim() !== '') // Filter out empty/invalid dates
      .map((d: string) => {
        if (event.allDay) {
          const exDate = DateTime.fromISO(d, { zone: sourceZone }).startOf('day');
          if (!exDate.isValid) {
            console.warn(`Invalid skip date "${d}" for all-day event: ${exDate.invalidReason}`);
            return null;
          }
          return `EXDATE;TZID=${sourceZone}:${exDate.toFormat("yyyyMMdd'T'HHmmss")}`;
        }

        if (!fm.startTime) {
          console.warn(`Missing startTime for timed event skip date "${d}"`);
          return null;
        }

        const exInSource = DateTime.fromISO(`${d}T${fm.startTime}`, { zone: sourceZone });
        if (!exInSource.isValid) {
          console.warn(
            `Invalid skip date "${d}" with start time "${fm.startTime}" in timezone "${sourceZone}": ${exInSource.invalidReason}`
          );
          return null;
        }

        return `EXDATE;TZID=${sourceZone}:${exInSource.toFormat("yyyyMMdd'T'HHmmss")}`;
      })
      .filter(Boolean) as string[];

    // Construct the rrule string with SOURCE timezone
    // FullCalendar's luxon plugin will expand occurrences in SourceTZ and shift to DisplayTZ natively
    const dtstartString = `DTSTART;TZID=${sourceZone}:${dtInSource.toFormat("yyyyMMdd'T'HHmmss")}`;
    const rruleString = event.rrule;

    baseEvent.rrule = [dtstartString, rruleString, ...exdateStrings].join('\n');

    baseEvent.extendedProps = {
      ...baseEvent.extendedProps,
      isTask: !!event.isTask,
      ...(event.allDay ? {} : { sourceTimezone: sourceZone })
    };
    try {
      // NOTE: Even though rrule is provided, FullCalendar requires explicit timezone
      // and base start fields on the EventInput itself for some edge cases.
      baseEvent.timeZone = sourceZone;
    } catch (e) {
      console.warn('FC explicit timeZone EventInput assignment failed', e);
    }

    if (!event.allDay) {
      // Calculate duration using the source timezone times (duration is timezone-independent)
      const startTime = parseTime(event.startTime);
      if (startTime && event.endTime) {
        const endTime = parseTime(event.endTime);
        if (endTime) {
          // Parse in source timezone to get correct duration
          const startDateTime = combineDateTimeStrings(event.startDate, event.startTime);
          const endDateTime = combineDateTimeStrings(
            event.endDate || event.startDate,
            event.endTime
          );
          if (!startDateTime || !endDateTime) {
            return null;
          }
          const startDt = DateTime.fromISO(startDateTime, { zone: sourceZone });
          let endDt = DateTime.fromISO(endDateTime, { zone: sourceZone });

          if (endDt < startDt) {
            endDt = endDt.plus({ days: 1 });
          }

          const duration = endDt.diff(startDt);
          if (duration.as('milliseconds') > 0) {
            baseEvent.duration = duration.toISOTime({
              includePrefix: false,
              suppressMilliseconds: true,
              suppressSeconds: true
            });
          }
        }
      }
    }
  } else if (event.type === 'single') {
    const sourceZone = event.timezone || settings.displayTimezone || DateTime.local().zoneName;

    if (!event.allDay) {
      const startLocalStr = combineDateTimeStrings(event.date, event.startTime);
      if (!startLocalStr) {
        return null;
      }

      const startDt = DateTime.fromISO(startLocalStr, { zone: sourceZone });
      baseEvent.start = startDt.toISO() ?? undefined; // Full absolute ISO timestamp

      let end: string | null | undefined = undefined;
      if (event.endTime) {
        const endLocalStr = combineDateTimeStrings(event.endDate || event.date, event.endTime);
        if (!endLocalStr) {
          return null;
        }

        let endDt = DateTime.fromISO(endLocalStr, { zone: sourceZone });
        if (endDt < startDt) {
          endDt = endDt.plus({ days: 1 });
        }
        end = endDt.toISO() ?? undefined;
      }

      baseEvent.end = end;
      baseEvent.extendedProps = {
        ...baseEvent.extendedProps,
        isTask: event.completed !== undefined && event.completed !== null,
        taskCompleted: event.completed,
        sourceTimezone: sourceZone
      };
    } else {
      let adjustedEndDate: string | undefined;

      if (event.endDate) {
        // OFCEvent has an inclusive endDate. FullCalendar needs an exclusive one.
        // Add one day to any multi-day all-day event's end date (using UTC to prevent local TZ shifts).
        adjustedEndDate =
          DateTime.fromISO(event.endDate, { zone: 'utc' }).plus({ days: 1 }).toISODate() ??
          undefined;
      }

      baseEvent.start = event.date;
      baseEvent.end = adjustedEndDate;
      baseEvent.extendedProps = {
        ...baseEvent.extendedProps,
        isTask: event.completed !== undefined && event.completed !== null,
        taskCompleted: event.completed
      };
    }
  }

  // REMOVED SHADOW EVENT LOGIC
  return baseEvent;
}

/**
 * Converts an `EventApi` object from FullCalendar back into an `OFCEvent`.
 * This is typically used after a user interaction, like dragging or resizing an event,
 * to get the new event data in a format that can be saved back to the cache and disk.
 *
 * @param event The `EventApi` object from FullCalendar.
 * @param settings The plugin settings.
 * @returns An `OFCEvent` object.
 */
export function fromEventApi(
  event: EventApi,
  settings: FullCalendarSettings,
  newResource?: string
): OFCEvent {
  const extendedProps = (event.extendedProps || {}) as Record<string, unknown>;

  let category: string | undefined = extendedProps.category as string | undefined;
  let subCategory: string | undefined = extendedProps.subCategory as string | undefined;

  // Check for resource ID safely - resource property may be added by FullCalendar resource plugin
  const resourceId =
    newResource ||
    (() => {
      const eventWithResource = event as EventApi & { resource?: { id: string } };
      return eventWithResource.resource?.id;
    })();

  if (resourceId) {
    const parts = resourceId.split('::');
    if (parts.length === 2) {
      // This is a sub-category resource, e.g., "Work::Project"
      category = parts[0];
      subCategory = parts[1] === '__NONE__' ? undefined : parts[1];
    } else {
      // This is a top-level category resource, e.g., "Work"
      category = resourceId;
      subCategory = undefined; // Dropped on a parent, so it has no sub-category.
    }
  }

  const sourceZone =
    (!event.allDay && (extendedProps.sourceTimezone as string)) ||
    settings.displayTimezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const isRecurring: boolean =
    extendedProps.daysOfWeek !== undefined ||
    extendedProps.fcrDaily === true ||
    extendedProps.repeatInterval !== undefined ||
    extendedProps.repeatOn !== undefined ||
    extendedProps.month !== undefined ||
    extendedProps.dayOfMonth !== undefined ||
    (extendedProps.type === 'recurring' && !extendedProps.rrule);
  const startDate = event.allDay
    ? (event.startStr ? DateTime.fromISO(event.startStr).toISODate() : null) ||
      DateTime.fromJSDate(event.start as Date).toISODate() ||
      ''
    : getDate(event.start as Date, sourceZone);
  // Correctly calculate endDate for multi-day events.
  // FullCalendar's end date is exclusive, so we might need to subtract a day.
  const endDate = event.allDay
    ? (() => {
        const exclusiveEnd = event.endStr
          ? DateTime.fromISO(event.endStr)
          : event.end
            ? DateTime.fromJSDate(event.end)
            : null;
        if (!exclusiveEnd) return startDate;

        const inclusiveEnd = exclusiveEnd.minus({ days: 1 }).toISODate();
        return inclusiveEnd ?? startDate;
      })()
    : event.end
      ? getDate(new Date(event.end.getTime() - 1), sourceZone)
      : startDate;

  const taskCompleted = extendedProps.taskCompleted as string | boolean | null | undefined;
  const timedStart = event.start as Date;
  const timedEnd = event.end ?? new Date(timedStart.getTime() + 60 * 60 * 1000);

  const {
    isShadow: _isShadow,
    sourceTimezone: _sourceTimezone,
    taskCompleted: _taskCompleted,
    cleanTitle: _cleanTitle,
    isTask: _isTask,
    startTime: _oldStartTime,
    endTime: _oldEndTime,
    date: _oldDate,
    endDate: _oldEndDate,
    allDay: _oldAllDay,
    type: _oldType,
    timezone: _oldTimezone,
    title: _oldTitle,
    category: _oldCategory,
    subCategory: _oldSubCategory,
    ...restProps
  } = extendedProps;

  const baseResult = {
    ...restProps,
    title: (extendedProps.cleanTitle as string | undefined) || event.title,
    category,
    subCategory,
    location: extendedProps.location as string | undefined,
    description: extendedProps.description as string | undefined,
    url: extendedProps.url as string | undefined,
    uid: extendedProps.uid as string | undefined,
    recurringEventId: extendedProps.recurringEventId as string | undefined,
    ...(event.allDay ? {} : { timezone: sourceZone }),
    ...(event.allDay
      ? { allDay: true as const }
      : {
          allDay: false as const,
          startTime: getTime(timedStart, sourceZone),
          endTime: getTime(timedEnd, sourceZone)
        })
  };

  if (isRecurring) {
    return {
      ...baseResult,
      type: 'recurring' as const,
      endDate: null,
      ...(extendedProps.fcrDaily ? { fcrDaily: true } : {}),
      ...(extendedProps.repeatInterval
        ? { repeatInterval: extendedProps.repeatInterval as number }
        : {}),
      ...(extendedProps.repeatOn
        ? { repeatOn: extendedProps.repeatOn as { week: number; weekday: number } }
        : {}),
      ...(extendedProps.daysOfWeek
        ? {
            daysOfWeek: (
              extendedProps.daysOfWeek as (number | 'U' | 'M' | 'T' | 'W' | 'R' | 'F' | 'S')[]
            ).map(i => (typeof i === 'number' ? DAYS[i] : i)) as (
              'U' | 'M' | 'T' | 'W' | 'R' | 'F' | 'S'
            )[]
          }
        : {}),
      startRecur: extendedProps.startRecur
        ? typeof extendedProps.startRecur === 'string'
          ? extendedProps.startRecur
          : getDate(extendedProps.startRecur as Date, sourceZone)
        : undefined,
      endRecur: extendedProps.endRecur
        ? typeof extendedProps.endRecur === 'string'
          ? extendedProps.endRecur
          : getDate(extendedProps.endRecur as Date, sourceZone)
        : undefined,
      skipDates: (extendedProps.skipDates as string[]) || [],
      isTask: extendedProps.isTask as boolean | undefined
    };
  }

  return {
    ...baseResult,
    type: 'single' as const,
    date: startDate,
    ...(startDate !== endDate ? { endDate } : { endDate: null }),
    completed: extendedProps.isTask ? (taskCompleted ?? false) : taskCompleted
  };
}
