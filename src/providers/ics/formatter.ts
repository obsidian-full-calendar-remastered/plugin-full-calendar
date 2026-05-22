import { OFCEvent } from '../../types';
import ical from 'ical.js';
import { DateTime } from 'luxon';
import { isTask } from '../../types/tasks';

/**
 * Formats a Luxon DateTime into an iCal DATE-TIME string (YYYYMMDDTHHMMSSZ or local).
 * @param dt The DateTime to format
 * @param isAllDay Whether this is an all-day event
 */
function formatDateTime(dt: DateTime, isAllDay: boolean, timezone?: string): ical.Time {
  const data: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    isDate: boolean;
    timezone?: string;
  } = {
    year: dt.year,
    month: dt.month,
    day: dt.day,
    hour: isAllDay ? 0 : dt.hour,
    minute: isAllDay ? 0 : dt.minute,
    second: isAllDay ? 0 : dt.second,
    isDate: isAllDay,
  };

  if (!isAllDay && (timezone === 'UTC' || timezone === 'Z')) {
    data.timezone = 'Z';
  }

  return new ical.Time(data);
}

/**
 * Helper to add a date/time property to a component, setting VALUE=DATE for
 * all-day events (handled automatically by ical.Time), or setting the TZID parameter
 * for timed non-UTC events.
 */
function addTimeProperty(
  component: ical.Component,
  name: string,
  dt: DateTime,
  isAllDay: boolean,
  timezone?: string
): ical.Property {
  const prop = new ical.Property(name);
  const time = formatDateTime(dt, isAllDay, timezone);

  if (!isAllDay && timezone) {
    if (timezone !== 'UTC' && timezone !== 'Z') {
      prop.setParameter('TZID', timezone);
    }
  }

  prop.setValue(time);
  component.addProperty(prop);
  return prop;
}

/**
 * Helper to generate the VEVENT component structure.
 */
function createVEventComponent(event: OFCEvent, isOverride = false): ical.Component {
  const vevent = new ical.Component('vevent');

  // UID
  if (event.uid) {
    vevent.addPropertyWithValue('uid', event.uid);
  } else {
    vevent.addPropertyWithValue('uid', window.crypto.randomUUID());
  }

  // Summary (Title)
  vevent.addPropertyWithValue('summary', event.title);

  // DTSTAMP (Required by RFC 5545)
  vevent.addPropertyWithValue('dtstamp', ical.Time.now());

  // START Date/Time extraction based on event type
  let datePart: string;
  if (event.type === 'single') {
    datePart = event.date;
  } else if (event.type === 'rrule') {
    datePart = event.startDate;
  } else {
    // 'recurring' type
    datePart = event.startRecur || DateTime.now().toISODate();
  }

  // DTSTART & DTEND
  let startDt: DateTime;
  let endDt: DateTime;

  if (event.allDay) {
    startDt = DateTime.fromISO(datePart);
    if (event.type === 'single' && event.endDate) {
      endDt = DateTime.fromISO(event.endDate).plus({ days: 1 });
    } else {
      // Default duration 1 day
      endDt = startDt.plus({ days: 1 });
    }
  } else {
    // Not all day
    const startTime = (event as unknown as { startTime?: string }).startTime || '00:00';
    const endTime = (event as unknown as { endTime?: string }).endTime || '00:00';
    const opts = event.timezone ? { zone: event.timezone } : {};

    startDt = DateTime.fromISO(`${datePart}T${startTime}`, opts);

    if (event.type === 'single' && event.endDate) {
      endDt = DateTime.fromISO(`${event.endDate}T${endTime}`, opts);
    } else {
      endDt = DateTime.fromISO(`${datePart}T${endTime}`, opts);
      if (endDt < startDt) {
        endDt = endDt.plus({ days: 1 });
      }
    }
  }

  addTimeProperty(vevent, 'dtstart', startDt, event.allDay, event.timezone);
  addTimeProperty(vevent, 'dtend', endDt, event.allDay, event.timezone);

  // Description
  if (event.description) {
    vevent.addPropertyWithValue('description', event.description);
  }

  // Recurrence (RRULE) - Only for master events, not overrides usually
  if (!isOverride && event.type === 'rrule' && event.rrule) {
    try {
      const ruleStr = event.rrule.replace(/^RRULE:/i, '');
      const recur = (ical.Recur as unknown as { fromString?: (s: string) => unknown }).fromString
        ? (ical.Recur as unknown as { fromString: (s: string) => unknown }).fromString(ruleStr)
        : null;
      if (recur) {
        vevent.addPropertyWithValue('rrule', recur);
      } else {
        const prop = new ical.Property('rrule');
        prop.setValue(ruleStr);
        vevent.addProperty(prop);
      }
    } catch (e) {
      console.error('Failed to add RRULE', e);
    }
  }

  // EXDATE - Only for master events
  if (
    !isOverride &&
    (event.type === 'rrule' || event.type === 'recurring') &&
    event.skipDates &&
    event.skipDates.length > 0
  ) {
    for (const skipDate of event.skipDates) {
      let exDt: DateTime;
      if (event.allDay) {
        exDt = DateTime.fromISO(skipDate);
      } else {
        const startTime = (event as unknown as { startTime?: string }).startTime || '00:00';
        const opts = event.timezone ? { zone: event.timezone } : {};
        exDt = DateTime.fromISO(`${skipDate}T${startTime}`, opts);
      }
      addTimeProperty(vevent, 'exdate', exDt, event.allDay, event.timezone);
    }
  }

  return vevent;
}

/**
 * Helper to generate the VTODO component structure.
 */
function createVTodoComponent(event: OFCEvent, isOverride = false): ical.Component {
  const vtodo = new ical.Component('vtodo');

  // UID
  if (event.uid) {
    vtodo.addPropertyWithValue('uid', event.uid);
  } else {
    vtodo.addPropertyWithValue('uid', window.crypto.randomUUID());
  }

  // Summary (Title)
  vtodo.addPropertyWithValue('summary', event.title);

  // DTSTAMP (Required by RFC 5545)
  vtodo.addPropertyWithValue('dtstamp', ical.Time.now());

  // START Date/Time extraction based on event type
  let datePart: string;
  if (event.type === 'single') {
    datePart = event.date;
  } else if (event.type === 'rrule') {
    datePart = event.startDate;
  } else {
    // 'recurring' type
    datePart = event.startRecur || DateTime.now().toISODate();
  }

  // DTSTART & DUE
  let startDt: DateTime;
  let dueDt: DateTime;

  if (event.allDay) {
    startDt = DateTime.fromISO(datePart);
    if (event.type === 'single' && event.endDate) {
      dueDt = DateTime.fromISO(event.endDate);
    } else {
      dueDt = startDt;
    }
  } else {
    // Not all day
    const startTime = (event as unknown as { startTime?: string }).startTime || '00:00';
    const endTime = (event as unknown as { endTime?: string }).endTime || '00:00';
    const opts = event.timezone ? { zone: event.timezone } : {};

    startDt = DateTime.fromISO(`${datePart}T${startTime}`, opts);

    if (event.type === 'single' && event.endDate) {
      dueDt = DateTime.fromISO(`${event.endDate}T${endTime}`, opts);
    } else {
      dueDt = DateTime.fromISO(`${datePart}T${endTime}`, opts);
      if (dueDt < startDt) {
        dueDt = dueDt.plus({ days: 1 });
      }
    }
  }

  addTimeProperty(vtodo, 'dtstart', startDt, event.allDay, event.timezone);
  addTimeProperty(vtodo, 'due', dueDt, event.allDay, event.timezone);

  // Description
  if (event.description) {
    vtodo.addPropertyWithValue('description', event.description);
  }

  // Location/URL mapping:
  if (event.url) {
    vtodo.addPropertyWithValue('url', event.url);
  } else if (
    event.location &&
    typeof event.location === 'string' &&
    event.location.startsWith('http')
  ) {
    vtodo.addPropertyWithValue('url', event.location);
  }
  if (event.location) {
    vtodo.addPropertyWithValue('location', event.location);
  }

  // Completed status
  if (event.type === 'single' && event.completed) {
    vtodo.addPropertyWithValue('status', 'COMPLETED');
    try {
      const completedDt = DateTime.fromISO(event.completed).toUTC();
      if (completedDt.isValid) {
        addTimeProperty(vtodo, 'completed', completedDt, false, 'UTC');
      }
    } catch (e) {
      console.error('Failed to parse completed date', e);
    }
  } else if (event.type === 'single' && event.completed === false) {
    vtodo.addPropertyWithValue('status', 'NEEDS-ACTION');
  } else {
    vtodo.addPropertyWithValue('status', 'NEEDS-ACTION');
  }

  // Recurrence (RRULE) - Only for master events, not overrides usually
  if (!isOverride && event.type === 'rrule' && event.rrule) {
    try {
      const ruleStr = event.rrule.replace(/^RRULE:/i, '');
      const recur = (ical.Recur as unknown as { fromString?: (s: string) => unknown }).fromString
        ? (ical.Recur as unknown as { fromString: (s: string) => unknown }).fromString(ruleStr)
        : null;
      if (recur) {
        vtodo.addPropertyWithValue('rrule', recur);
      } else {
        const prop = new ical.Property('rrule');
        prop.setValue(ruleStr);
        vtodo.addProperty(prop);
      }
    } catch (e) {
      console.error('Failed to add RRULE', e);
    }
  }

  // EXDATE - Only for master events
  if (
    !isOverride &&
    (event.type === 'rrule' || event.type === 'recurring') &&
    event.skipDates &&
    event.skipDates.length > 0
  ) {
    for (const skipDate of event.skipDates) {
      let exDt: DateTime;
      if (event.allDay) {
        exDt = DateTime.fromISO(skipDate);
      } else {
        const startTime = (event as unknown as { startTime?: string }).startTime || '00:00';
        const opts = event.timezone ? { zone: event.timezone } : {};
        exDt = DateTime.fromISO(`${skipDate}T${startTime}`, opts);
      }
      addTimeProperty(vtodo, 'exdate', exDt, event.allDay, event.timezone);
    }
  }

  return vtodo;
}

/**
 * Converts an OFCEvent to an ICS string.
 */
export function eventToIcs(event: OFCEvent): string {
  const component = new ical.Component('vcalendar');

  component.addPropertyWithValue('version', '2.0');
  component.addPropertyWithValue('prodid', '-//Obsidian Full Calendar Plugin//NONSGML v1.0//EN');

  const sub = isTask(event) ? createVTodoComponent(event) : createVEventComponent(event);
  component.addSubcomponent(sub);

  return (component as unknown as { toString(): string }).toString();
}

/**
 * Creates a VEVENT or VTODO component for an instance override.
 * @param event The new event data for the specific instance.
 * @param originalDate The original start date/time of the instance being modified.
 */
export function createOverrideVEvent(event: OFCEvent, originalDate: string): ical.Component {
  // 1. Create the base VEVENT or VTODO with new data
  const sub = isTask(event)
    ? createVTodoComponent(event, true)
    : createVEventComponent(event, true);

  // 2. Add RECURRENCE-ID
  const isDate = originalDate.length === 10;
  let recurIdDt: DateTime;

  if (isDate) {
    recurIdDt = DateTime.fromISO(originalDate);
  } else {
    // Assume DateTime string
    const opts = event.timezone ? { zone: event.timezone } : {};
    recurIdDt = DateTime.fromISO(originalDate, opts);
  }

  addTimeProperty(sub, 'recurrence-id', recurIdDt, isDate, event.timezone);

  return sub;
}
