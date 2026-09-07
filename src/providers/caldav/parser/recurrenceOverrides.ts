import ical from 'ical.js';
import { DateTime } from 'luxon';
import { OFCEvent } from '../../../types';
import { createOverrideVEvent } from '../../ics/formatter';
import { parseTimezoneAwareString } from '../../../features/timezone/Timezone';
import { getTextProperty } from './taskParser';

export function getComponentUid(component: ical.Component): string {
  return getTextProperty(component, 'uid').trim();
}

export function normalizeRecurrenceIdString(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const dt = DateTime.fromISO(trimmed, { setZone: true });
  if (!dt.isValid) return trimmed;
  return dt.toISO({ suppressMilliseconds: true });
}

export function getComponentRecurrenceId(component: ical.Component): string | null {
  const prop = component.getFirstProperty('recurrence-id');
  if (!prop) return null;

  const value = prop.getFirstValue();
  if (!(value instanceof ical.Time)) {
    return normalizeRecurrenceIdString(String(value));
  }

  const dt = parseTimezoneAwareString(value);
  if (value.isDate) {
    return dt.toISODate();
  }
  return dt.toISO({ suppressMilliseconds: true });
}

export function findVEventOverride(
  vcalendar: ical.Component,
  uid: string,
  recurrenceId: string
): ical.Component | null {
  const normalizedRecurrenceId = normalizeRecurrenceIdString(recurrenceId);
  if (!normalizedRecurrenceId) return null;

  return (
    vcalendar
      .getAllSubcomponents('vevent')
      .find(
        vevent =>
          getComponentUid(vevent) === uid &&
          getComponentRecurrenceId(vevent) === normalizedRecurrenceId
      ) ?? null
  );
}

export function removeSubcomponent(vcalendar: ical.Component, subcomponent: ical.Component): void {
  (
    vcalendar as unknown as { removeSubcomponent(component: ical.Component): void }
  ).removeSubcomponent(subcomponent);
}

export function buildOverrideEventData(
  masterEvent: OFCEvent,
  instanceDate: string,
  newEventData: OFCEvent
): { overrideEventData: OFCEvent; originalInstanceStart: string; overrideVEvent: ical.Component } {
  const originalInstanceStart =
    masterEvent.allDay || !('startTime' in masterEvent)
      ? instanceDate
      : `${instanceDate}T${masterEvent.startTime}`;
  const overrideEventData: OFCEvent = {
    ...newEventData,
    uid: masterEvent.uid,
    timezone: newEventData.timezone || masterEvent.timezone,
    recurrenceId: originalInstanceStart,
    notify: newEventData.notify !== undefined ? newEventData.notify : masterEvent.notify,
    alarms: newEventData.alarms !== undefined ? newEventData.alarms : masterEvent.alarms
  };
  const overrideVEvent = createOverrideVEvent(overrideEventData, originalInstanceStart);
  return { overrideEventData, originalInstanceStart, overrideVEvent };
}

export function updateRecurrenceOverrideInVCalendar(
  vcalendar: ical.Component,
  oldEvent: OFCEvent,
  newEvent: OFCEvent
): void {
  if (!oldEvent.uid || !oldEvent.recurrenceId) {
    throw new Error('Cannot update CalDAV recurrence override without UID and RECURRENCE-ID.');
  }

  const existingOverride = findVEventOverride(vcalendar, oldEvent.uid, oldEvent.recurrenceId);
  if (!existingOverride) {
    throw new Error('Could not find CalDAV recurrence override to update.');
  }

  removeSubcomponent(vcalendar, existingOverride);
  const overrideEventData: OFCEvent = {
    ...newEvent,
    uid: oldEvent.uid,
    recurrenceId: oldEvent.recurrenceId,
    timezone: newEvent.timezone || oldEvent.timezone
  };
  vcalendar.addSubcomponent(createOverrideVEvent(overrideEventData, oldEvent.recurrenceId));
}

export function deleteRecurrenceOverrideInVCalendar(
  vcalendar: ical.Component,
  uid: string,
  recurrenceId: string
): void {
  const existingOverride = findVEventOverride(vcalendar, uid, recurrenceId);
  if (!existingOverride) {
    throw new Error('Could not find CalDAV recurrence override to delete.');
  }

  removeSubcomponent(vcalendar, existingOverride);
}
