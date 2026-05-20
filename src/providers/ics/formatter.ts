import { OFCEvent } from '../../types';
import ical from 'ical.js';
import { DateTime } from 'luxon';

/**
 * Formats a Luxon DateTime into an iCal Time value.
 *
 * Important:
 * - All-day events are DATE values.
 * - UTC events are represented with a trailing Z.
 * - Non-UTC timed events need TZID on the iCalendar property itself,
 *   which is handled by addDateTimeProperty().
 */
function formatDateTime(dt: DateTime, isAllDay: boolean): ical.Time {
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

  if (!isAllDay && dt.zoneName === 'UTC') {
    data.timezone = 'Z';
  }

  return new ical.Time(data);
}

/**
 * Adds a DATE / DATE-TIME property to an iCalendar component.
 *
 * This explicitly sets TZID for non-UTC timed events, preventing CalDAV
 * servers from treating the value as floating time.
 */
function addDateTimeProperty(
  component: ical.Component,
  name: string,
  dt: DateTime,
  isAllDay: boolean
) {
  const prop = new ical.Property(name);
  const time = formatDateTime(dt, isAllDay);

  if (isAllDay) {
    prop.setParameter('VALUE', 'DATE');
  } else if (dt.zoneName === 'UTC') {
    // UTC is represented by the trailing Z on the value.
  } else if (dt.zoneName) {
    prop.setParameter('TZID', dt.zoneName);
  }

  prop.setValue(time);
  component.addProperty(prop);
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

  addDateTimeProperty(vevent, 'dtstart', startDt, event.allDay);
  addDateTimeProperty(vevent, 'dtend', endDt, event.allDay);

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
      if (event.allDay) {
        const dt = DateTime.fromISO(skipDate);
        addDateTimeProperty(vevent, 'exdate', dt, true);
      } else {
        const startTime = (event as unknown as { startTime?: string }).startTime || '00:00';
        const opts = event.timezone ? { zone: event.timezone } : {};
        const dt = DateTime.fromISO(`${skipDate}T${startTime}`, opts);

        addDateTimeProperty(vevent, 'exdate', dt, false);
      }
    }
  }

  return vevent;
}

/**
 * Converts an OFCEvent to an ICS string.
 */
export function eventToIcs(event: OFCEvent): string {
  const component = new ical.Component('vcalendar');

  component.addPropertyWithValue('version', '2.0');
  component.addPropertyWithValue('prodid', '-//Obsidian Full Calendar Plugin//NONSGML v1.0//EN');

  const vevent = createVEventComponent(event);
  component.addSubcomponent(vevent);

  return (component as unknown as { toString(): string }).toString();
}

/**
 * Creates a VEVENT component for an instance override.
 *
 * @param event The new event data for the specific instance.
 * @param originalDate The original start date/time of the instance being modified.
 */
export function createOverrideVEvent(event: OFCEvent, originalDate: string): ical.Component {
  const vevent = createVEventComponent(event, true);

  // If originalDate is just YYYY-MM-DD, treat it as DATE.
  const isDate = originalDate.length === 10;

  if (isDate) {
    const dt = DateTime.fromISO(originalDate);
    addDateTimeProperty(vevent, 'recurrence-id', dt, true);
  } else {
    const opts = event.timezone ? { zone: event.timezone } : {};
    const dt = DateTime.fromISO(originalDate, opts);

    addDateTimeProperty(vevent, 'recurrence-id', dt, false);
  }

  return vevent;
}
