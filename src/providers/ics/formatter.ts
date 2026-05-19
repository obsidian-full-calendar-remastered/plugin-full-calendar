import { OFCEvent } from '../../types';
import ical from 'ical.js';
import { DateTime } from 'luxon';

/**
 * Formats a Luxon DateTime into an iCal DATE-TIME string (YYYYMMDDTHHMMSSZ or local).
 * @param dt The DateTime to format
 * @param isAllDay Whether this is an all-day event
 */
function formatDateTime(dt: DateTime, isAllDay: boolean): ical.Time {
  const options = {
    year: dt.year,
    month: dt.month,
    day: dt.day,
    hour: dt.hour,
    minute: dt.minute,
    second: dt.second,
    isDate: isAllDay,
    timezone: !isAllDay && dt.zoneName === 'UTC' ? 'UTC' : undefined
  };
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return new ical.Time(options as unknown as ConstructorParameters<typeof ical.Time>[0]);
}

/**
 * Helper to add a date/time property to a component, setting the tzid parameter
 * if the event is timed and has an explicit, non-UTC timezone.
 */
function addTimeProperty(
  component: ical.Component,
  name: string,
  time: ical.Time,
  isAllDay: boolean,
  timezone?: string
): ical.Property {
  const prop = component.addPropertyWithValue(name, time);
  if (!isAllDay && timezone && timezone !== 'UTC') {
    prop.setParameter('tzid', timezone);
  }
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

  addTimeProperty(
    vevent,
    'dtstart',
    formatDateTime(startDt, event.allDay),
    event.allDay,
    event.timezone
  );
  addTimeProperty(
    vevent,
    'dtend',
    formatDateTime(endDt, event.allDay),
    event.allDay,
    event.timezone
  );

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
      let exTime: ical.Time;
      if (event.allDay) {
        const exDt = DateTime.fromISO(skipDate);
        exTime = new ical.Time({ year: exDt.year, month: exDt.month, day: exDt.day, isDate: true });
      } else {
        const startTime = (event as unknown as { startTime?: string }).startTime || '00:00';
        const opts = event.timezone ? { zone: event.timezone } : {};
        const exDt = DateTime.fromISO(`${skipDate}T${startTime}`, opts);
        exTime = formatDateTime(exDt, false);
      }
      addTimeProperty(vevent, 'exdate', exTime, event.allDay, event.timezone);
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
 * @param event The new event data for the specific instance.
 * @param originalDate The original start date/time of the instance being modified (ISO string).
 */
export function createOverrideVEvent(event: OFCEvent, originalDate: string): ical.Component {
  // 1. Create the base VEVENT with new data
  const vevent = createVEventComponent(event, true);

  // 2. Add RECURRENCE-ID
  // The originalDate argument should be ISO. We need to parse it to ical.Time.
  // Assuming originalDate came from the event's original start time.

  // We need to know if the original was all-day or not to format RECURRENCE-ID correctly.
  // Usually overrides match the type of the original, but can change.
  // RECURRENCE-ID should match the PATTERN of the master event's DTSTART (Date or DateTime).
  // For now, let's infer from the passed date string or event.allDay.

  // If originalDate is just YYYY-MM-DD, treat as Date.
  const isDate = originalDate.length === 10;
  let recurIdTime: ical.Time;

  if (isDate) {
    const recurIdDt = DateTime.fromISO(originalDate);
    recurIdTime = new ical.Time({
      year: recurIdDt.year,
      month: recurIdDt.month,
      day: recurIdDt.day,
      isDate: true
    });
  } else {
    // Assume DateTime string
    const opts = event.timezone ? { zone: event.timezone } : {};
    const recurIdDt = DateTime.fromISO(originalDate, opts);
    recurIdTime = formatDateTime(recurIdDt, false);
  }

  addTimeProperty(vevent, 'recurrence-id', recurIdTime, isDate, event.timezone);

  // 3. Ensure SEQUENCE is incremented?
  // Usually the server handles sequence or client should increment.
  // We'll leave it for now.

  return vevent;
}
