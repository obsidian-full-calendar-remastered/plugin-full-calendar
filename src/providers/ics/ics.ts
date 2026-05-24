/**
 * @file ics.ts
 * @brief Provides functions for parsing iCalendar (ICS) data into OFCEvents.
 *
 * @description
 * This file serves as the primary data translation layer for the iCalendar
 * format. It uses the `ical.js` library to parse raw ICS text and converts
 * iCalendar components (Vevent) into the plugin's internal `OFCEvent` format.
 * It correctly handles single events, recurring events (RRULE), and
 * recurrence exceptions (EXDATE, RECURRENCE-ID).
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { rrulestr } from 'rrule';

import ical from 'ical.js';
import { OFCEvent, validateEvent } from '../../types';

import { parseTimezoneAwareString } from '../../features/timezone/Timezone';

/**
 * Extracts the time part (HH:mm) from a Luxon DateTime object.
 * We must specify the format string to ensure it's always 24-hour time.
 */
function getLuxonTime(dt: DateTime): string | null {
  return dt.toFormat('HH:mm');
}

// Keep the getLuxonDate function as is:
function getLuxonDate(dt: DateTime): string | null {
  return dt.toISODate();
}

// ====================================================================

function extractEventUrl(iCalEvent: ical.Event): string {
  const urlProp = iCalEvent.component.getFirstProperty('url');
  return urlProp ? String(urlProp.getFirstValue()) : '';
}

function specifiesEnd(iCalEvent: ical.Event) {
  return (
    Boolean(iCalEvent.component.getFirstProperty('dtend')) ||
    Boolean(iCalEvent.component.getFirstProperty('duration'))
  );
}

// MODIFICATION: Remove settings parameter from icsToOFC
function icsToOFC(input: ical.Event): OFCEvent | null {
  const summary = input.summary || '';
  const uid = input.uid;
  const rruleProp = input.component.getFirstProperty('rrule');
  const rruleVal = rruleProp ? String(rruleProp.getFirstValue()) : null;
  const rruleStr = rruleVal ? String(rruleVal) : '';

  // Simplified: just use the title directly
  const eventData = { title: summary };

  const description = String(
    input.component.getFirstProperty('description')?.getFirstValue() || ''
  );
  const location = String(input.component.getFirstProperty('location')?.getFirstValue() || '');
  // Use extractEventUrl helper or input.component.getFirstProperty('url')
  const url = extractEventUrl(input);

  const startDate = parseTimezoneAwareString(input.startDate);

  // Validate start date - if invalid, skip this event
  if (!startDate.isValid) {
    console.warn(
      `Full Calendar ICS Parser: Skipping event "${summary}" due to invalid start date. Reason: ${startDate.invalidReason}`
    );
    return null;
  }

  const endDate = input.endDate ? parseTimezoneAwareString(input.endDate) : startDate;

  // Validate end date - if invalid, use start date
  const validEndDate = endDate.isValid ? endDate : startDate;
  if (!endDate.isValid && input.endDate) {
    console.warn(
      `Full Calendar ICS Parser: Event "${summary}" has invalid end date, using start date instead.`
    );
  }

  const isAllDay = input.startDate.isDate;

  // The Luxon DateTime object now holds the correct zone from the ICS file.
  // Coalesce null to undefined to match the schema.
  const timezone = isAllDay ? undefined : startDate.zoneName || undefined;

  if (input.isRecurring()) {
    const rrule = rrulestr(rruleStr);
    const exdates = input.component
      .getAllProperties('exdate')
      .map(exdateProp => {
        const exdate = ((t: unknown) => t as ical.Time)(exdateProp.getFirstValue());
        const exdateLuxon = parseTimezoneAwareString(exdate);
        if (!exdateLuxon.isValid) {
          console.warn(`Full Calendar ICS Parser: Skipping invalid EXDATE for event "${summary}"`);
          return null;
        }
        return exdateLuxon.toISODate();
      })
      .filter((d): d is string => d !== null);

    const startDateISO = getLuxonDate(startDate);
    const endDateISO = getLuxonDate(validEndDate);

    // Ensure we have valid ISO dates
    if (!startDateISO) {
      console.warn(
        `Full Calendar ICS Parser: Could not convert start date to ISO for event "${summary}"`
      );
      return null;
    }
    const recurringTiming = (() => {
      if (isAllDay) {
        return { allDay: true } as const;
      }
      const startTime = getLuxonTime(startDate);
      const endTime = getLuxonTime(endDate);
      if (!startTime || !endTime) {
        return null;
      }
      return { allDay: false, startTime, endTime } as const;
    })();
    if (!recurringTiming) {
      console.warn(`Full Calendar ICS Parser: Missing start or end time for event "${summary}"`);
      return null;
    }

    return {
      type: 'rrule',
      uid,
      title: eventData.title,
      id: `ics::${uid}::${startDateISO}::recurring`,
      rrule: rrule.toString(),
      skipDates: exdates,
      startDate: startDateISO,
      endDate: endDateISO && startDateISO !== endDateISO ? endDateISO : null,
      timezone,
      ...recurringTiming,
      description,
      url:
        url ||
        (location && typeof location === 'string' && location.startsWith('http')
          ? location
          : undefined)
    };
  }
  const date = getLuxonDate(startDate);

  // Ensure we have a valid date
  if (!date) {
    console.warn(
      `Full Calendar ICS Parser: Could not convert start date to ISO for event "${summary}"`
    );
    return null;
  }

  let finalEndDate: string | null | undefined = null;
  if (specifiesEnd(input)) {
    if (isAllDay) {
      // For all-day events, ICS end date is exclusive. Make it inclusive by subtracting one day.
      const inclusiveEndDate = validEndDate.minus({ days: 1 });
      finalEndDate = getLuxonDate(inclusiveEndDate);
    } else {
      finalEndDate = getLuxonDate(validEndDate);
    }
  }

  const singleTiming = (() => {
    if (isAllDay) {
      return { allDay: true } as const;
    }
    const startTime = getLuxonTime(startDate);
    const endTime = getLuxonTime(endDate);
    if (!startTime || !endTime) {
      return null;
    }
    return { allDay: false, startTime, endTime } as const;
  })();
  if (!singleTiming) {
    console.warn(`Full Calendar ICS Parser: Missing start or end time for event "${summary}"`);
    return null;
  }

  return {
    type: 'single',
    uid,
    title: eventData.title,
    date: date,
    endDate: date !== finalEndDate ? finalEndDate || null : null,
    timezone,
    ...singleTiming,
    description,
    url:
      url ||
      (location && typeof location === 'string' && location.startsWith('http')
        ? location
        : undefined)
  };
}

function todoToOFC(todo: ical.Component): OFCEvent | null {
  const summary = String(todo.getFirstPropertyValue('summary') || '');
  const uid = String(todo.getFirstPropertyValue('uid') || '');

  const dtstartProp = todo.getFirstProperty('dtstart');
  const dtstart: ical.Time | null = dtstartProp ? dtstartProp.getFirstValue() : null;

  const dueProp = todo.getFirstProperty('due');
  const due: ical.Time | null = dueProp ? dueProp.getFirstValue() : null;

  const dtstartDate = dtstart ? parseTimezoneAwareString(dtstart) : null;
  const dueDate = due ? parseTimezoneAwareString(due) : null;
  const hasValidDtstart = !!dtstartDate?.isValid;
  const hasValidDue = !!dueDate?.isValid;

  // VTODO CREATED/DTSTAMP describe metadata, not scheduling. Without DTSTART or
  // DUE, the task has no calendar placement and should not render as an event.
  const baseTime: ical.Time | null = hasValidDtstart ? dtstart : hasValidDue ? due : null;
  const startDate: DateTime | null = hasValidDtstart ? dtstartDate : hasValidDue ? dueDate : null;

  if (!baseTime || !startDate) {
    return null;
  }

  const isAllDay = baseTime ? baseTime.isDate : true;
  const timezone = isAllDay ? undefined : startDate.zoneName || undefined;

  const description = String(todo.getFirstPropertyValue('description') || '');
  const location = String(todo.getFirstPropertyValue('location') || '');
  const url = String(todo.getFirstPropertyValue('url') || '');

  // Handle completed status
  const status = todo.getFirstPropertyValue('status');
  const completedProp = todo.getFirstProperty('completed');
  let completedValue: string | false = false;

  if (completedProp) {
    const completedTime: ical.Time = completedProp.getFirstValue();
    const completedLuxon = parseTimezoneAwareString(completedTime);
    if (completedLuxon.isValid) {
      completedValue = completedLuxon.toISO() || completedLuxon.toISODate() || '';
    } else {
      completedValue = (completedTime as unknown as { toString(): string }).toString();
    }
  } else if (status === 'COMPLETED') {
    completedValue = DateTime.now().toISO() || '';
  }

  // Check if recurring
  const rruleProp = todo.getFirstProperty('rrule');
  const rruleVal = rruleProp ? String(rruleProp.getFirstValue()) : null;
  const rruleStr = rruleVal ? String(rruleVal) : '';

  if (rruleStr) {
    const rrule = rrulestr(rruleStr);
    const exdates = todo
      .getAllProperties('exdate')
      .map(exdateProp => {
        const exdate: ical.Time = exdateProp.getFirstValue();
        const exdateLuxon = parseTimezoneAwareString(exdate);
        if (!exdateLuxon.isValid) {
          console.warn(`Full Calendar ICS Parser: Skipping invalid EXDATE for task "${summary}"`);
          return null;
        }
        return exdateLuxon.toISODate();
      })
      .filter((d): d is string => d !== null);

    const startDateISO = getLuxonDate(startDate);
    let endDateISO: string | null = null;
    if (due) {
      const dueLuxon = parseTimezoneAwareString(due);
      if (dueLuxon.isValid) {
        endDateISO = getLuxonDate(dueLuxon);
      }
    }

    if (!startDateISO) {
      console.warn(
        `Full Calendar ICS Parser: Could not convert start date to ISO for task "${summary}"`
      );
      return null;
    }

    const recurringTiming = (() => {
      if (!startDate) {
        return null;
      }
      if (isAllDay) {
        return { allDay: true } as const;
      }
      const startTime = getLuxonTime(startDate);
      let endTime = startTime;
      if (due) {
        const dueLuxon = parseTimezoneAwareString(due);
        if (dueLuxon.isValid) {
          endTime = getLuxonTime(dueLuxon);
        }
      }
      if (!startTime || !endTime) {
        return null;
      }
      return { allDay: false, startTime, endTime } as const;
    })();

    if (!recurringTiming) {
      console.warn(`Full Calendar ICS Parser: Missing start or end time for task "${summary}"`);
      return null;
    }

    return {
      type: 'rrule',
      uid,
      title: summary,
      id: `ics::${uid}::${startDateISO}::recurring`,
      rrule: rrule.toString(),
      skipDates: exdates,
      startDate: startDateISO,
      endDate: endDateISO && startDateISO !== endDateISO ? endDateISO : null,
      timezone,
      ...recurringTiming,
      isTask: true,
      description,
      url:
        url ||
        (location && typeof location === 'string' && location.startsWith('http')
          ? location
          : undefined)
    };
  }

  // Single task
  const date = getLuxonDate(startDate);
  if (!date) {
    console.warn(
      `Full Calendar ICS Parser: Could not convert start date to ISO for task "${summary}"`
    );
    return null;
  }

  let finalEndDate: string | null = null;
  if (due) {
    const dueLuxon = parseTimezoneAwareString(due);
    if (dueLuxon.isValid) {
      finalEndDate = getLuxonDate(dueLuxon);
    }
  }

  const singleTiming = (() => {
    if (!startDate) {
      return null;
    }
    if (isAllDay) {
      return { allDay: true } as const;
    }
    const startTime = getLuxonTime(startDate);
    let endTime = startTime;
    if (due) {
      const dueLuxon = parseTimezoneAwareString(due);
      if (dueLuxon.isValid) {
        endTime = getLuxonTime(dueLuxon);
      }
    }
    if (!startTime || !endTime) {
      return null;
    }
    return { allDay: false, startTime, endTime } as const;
  })();

  if (!singleTiming) {
    console.warn(`Full Calendar ICS Parser: Missing start or end time for task "${summary}"`);
    return null;
  }

  return {
    type: 'single',
    uid,
    title: summary,
    date: date,
    endDate: date !== finalEndDate ? finalEndDate || null : null,
    timezone,
    ...singleTiming,
    completed: completedValue,
    description,
    url:
      url ||
      (location && typeof location === 'string' && location.startsWith('http')
        ? location
        : undefined)
  };
}

/**
 * Pre-processes ICS text to normalize date formats.
 * Converts YYYYMMDD and YYYYMMDDTHHMMSSZ formats to ensure proper parsing.
 */
function preprocessICSText(text: string): string {
  let correctedText = text;

  // Handle DTSTART:YYYYMMDD (date only, missing VALUE=DATE)
  correctedText = correctedText.replace(/DTSTART:(\d{8})(\r?\n|$)/gm, 'DTSTART;VALUE=DATE:$1$2');

  // Handle DTEND:YYYYMMDD (date only, missing VALUE=DATE)
  correctedText = correctedText.replace(/DTEND:(\d{8})(\r?\n|$)/gm, 'DTEND;VALUE=DATE:$1$2');

  // Handle EXDATE:YYYYMMDD (date only, missing VALUE=DATE)
  correctedText = correctedText.replace(/EXDATE[^:]*:(\d{8})(\r?\n|$)/gm, (match, date) => {
    // Preserve any parameters before the colon
    const prefix = match.substring(0, match.indexOf(':'));
    return `${prefix};VALUE=DATE:${date}${match.endsWith('\r\n') ? '\r\n' : match.endsWith('\n') ? '\n' : ''}`;
  });

  // Handle RECURRENCE-ID:YYYYMMDD (date only, missing VALUE=DATE)
  correctedText = correctedText.replace(/RECURRENCE-ID[^:]*:(\d{8})(\r?\n|$)/gm, (match, date) => {
    const prefix = match.substring(0, match.indexOf(':'));
    return `${prefix};VALUE=DATE:${date}${match.endsWith('\r\n') ? '\r\n' : match.endsWith('\n') ? '\n' : ''}`;
  });

  // Note: YYYYMMDDTHHMMSSZ format should be handled correctly by ical.js,
  // but we ensure it's properly formatted if needed

  return correctedText;
}

// MODIFICATION: Remove settings parameter from getEventsFromICS
export function getEventsFromICS(text: string): OFCEvent[] {
  if (!text.trim()) {
    throw new Error('ICS content is empty.');
  }

  // Parsing robustness: strictly require VCALENDAR to avoid opaque parser failures.
  if (!text.includes('BEGIN:VCALENDAR')) {
    throw new Error('ICS content is missing BEGIN:VCALENDAR header.');
  }

  // Pre-process the text to normalize date formats
  // This ensures VALUE=DATE:YYYYMMDD and YYYYMMDDTHHMMSSZ formats are properly handled
  const correctedText = preprocessICSText(text);

  let jCalData: ReturnType<typeof ical.parse>;
  try {
    jCalData = ical.parse(correctedText); // Use the corrected text
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ICS content: ${message}`);
  }
  const component = new ical.Component(jCalData);
  const vevents = component.getAllSubcomponents('vevent');

  const events: ical.Event[] = vevents
    .map(vevent => new ical.Event(vevent))
    .filter(evt => {
      try {
        // Ensure start and end dates are valid before processing.
        evt.startDate.toJSDate();
        evt.endDate.toJSDate();
        return true;
      } catch {
        try {
          evt.startDate?.toJSDate();
        } catch {
          // start date failed parsing
        }
        // skipping events with invalid time
        return false;
      }
    });

  const baseEvents = Object.fromEntries(
    events
      .filter(e => e.recurrenceId === null)
      .map(e => [e.uid, icsToOFC(e)])
      .filter(([_uid, event]) => event !== null) as [string, OFCEvent][]
  );

  const recurrenceExceptions = events
    .filter(e => e.recurrenceId !== null)
    .map((e): [string, OFCEvent | null] => [e.uid, icsToOFC(e)])
    .filter(([_uid, event]) => event !== null) as [string, OFCEvent][];

  for (const [uid, event] of recurrenceExceptions) {
    const baseEvent = baseEvents[uid];
    if (!baseEvent) {
      continue;
    }

    if (baseEvent.type !== 'rrule' || event.type !== 'single') {
      console.warn('Recurrence exception was recurring or base event was not recurring', {
        baseEvent,
        recurrenceException: event
      });
      continue;
    }
    if (event.date) {
      baseEvent.skipDates.push(event.date);
    }
  }

  const allEvents = Object.values(baseEvents).concat(recurrenceExceptions.map(e => e[1]));

  const vtodos = component.getAllSubcomponents('vtodo');

  const baseTodos = Object.fromEntries(
    vtodos
      .filter(todo => !todo.getFirstProperty('recurrence-id'))
      .map(todo => {
        try {
          const parsed = todoToOFC(todo);
          return parsed ? [parsed.uid || '', parsed] : null;
        } catch {
          return null;
        }
      })
      .filter((pair): pair is [string, OFCEvent] => pair !== null)
  );

  const recurrenceExceptionsTodos = vtodos
    .filter(todo => !!todo.getFirstProperty('recurrence-id'))
    .map(todo => {
      try {
        return todoToOFC(todo);
      } catch {
        return null;
      }
    })
    .filter((e): e is OFCEvent => e !== null);

  for (const todoExc of recurrenceExceptionsTodos) {
    const uid = todoExc.uid || '';
    const baseTodo = baseTodos[uid];
    if (!baseTodo) {
      continue;
    }
    if (baseTodo.type !== 'rrule' || todoExc.type !== 'single') {
      continue;
    }
    if (todoExc.date) {
      baseTodo.skipDates.push(todoExc.date);
    }
  }

  const allTodos = Object.values(baseTodos).concat(recurrenceExceptionsTodos);

  const allEventsAndTodos = allEvents.concat(allTodos);

  return allEventsAndTodos.map(validateEvent).flatMap(e => (e ? [e] : []));
}
