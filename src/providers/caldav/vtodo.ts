import ical from 'ical.js';
import { DateTime } from 'luxon';
import { OFCEvent, validateEvent } from '../../types';
import { t } from '../../features/i18n/i18n';
import { parseTimezoneAwareString } from '../../features/timezone/Timezone';

export type VTodoDateValue = {
  value: string;
  allDay: boolean;
  timezone?: string;
};

export type ParsedVTodo = {
  uid: string;
  title: string;
  description: string;
  location: string;
  status: string;
  completed: boolean;
  cancelled: boolean;
  percentComplete?: number;
  priority?: number;
  rrule?: string;
  created?: string;
  lastModified?: string;
  completedAt?: string;
  start?: VTodoDateValue;
  due?: VTodoDateValue;
  event: OFCEvent | null;
};

const PRODID = '-//Full Calendar Remastered//CalDAV VTODO//EN';

function textValue(component: ical.Component, name: string): string {
  return String(component.getFirstPropertyValue(name) || '');
}

function readPercentComplete(component: ical.Component): number | undefined {
  const rawValue = textValue(component, 'percent-complete').trim();
  if (!rawValue) return undefined;

  const value = Number(rawValue);
  return Number.isInteger(value) && value >= 0 && value <= 100 ? value : undefined;
}

function readDateValue(component: ical.Component, name: string): VTodoDateValue | undefined {
  const property = component.getFirstProperty(name);
  if (!property) return undefined;

  try {
    const time = property.getFirstValue();
    if (!(time instanceof ical.Time)) return undefined;
    const dateTime = parseTimezoneAwareString(time);
    if (!dateTime.isValid) return undefined;

    const allDay = Boolean(time.isDate);
    const parameterTimezone = (
      property as unknown as { getParameter(name: string): string | undefined }
    ).getParameter('tzid');
    const timezone =
      allDay === false
        ? String(parameterTimezone || dateTime.zoneName || '').replace(/^floating$/i, '') ||
          undefined
        : undefined;
    const value = allDay
      ? dateTime.toISODate()
      : dateTime.toISO({ suppressMilliseconds: true, includeOffset: true });
    if (!value) return undefined;

    return { value, allDay, ...(timezone ? { timezone } : {}) };
  } catch {
    return undefined;
  }
}

function readTimestamp(component: ical.Component, name: string): string | undefined {
  const property = component.getFirstProperty(name);
  if (!property) return undefined;

  try {
    const value = property.getFirstValue();
    if (!(value instanceof ical.Time)) return undefined;
    const parsed = parseTimezoneAwareString(value);
    return parsed.isValid
      ? parsed.toISO({ suppressMilliseconds: true, includeOffset: true }) || undefined
      : undefined;
  } catch {
    return undefined;
  }
}

function getDatePart(value: VTodoDateValue): string | null {
  return DateTime.fromISO(value.value, {
    setZone: true,
    ...(value.timezone ? { zone: value.timezone } : {})
  }).toISODate();
}

function getTimePart(value: VTodoDateValue): string | null {
  return DateTime.fromISO(value.value, {
    setZone: true,
    ...(value.timezone ? { zone: value.timezone } : {})
  }).toFormat('HH:mm');
}

function buildEvent(task: Omit<ParsedVTodo, 'event'>): OFCEvent | null {
  const placement = task.start || task.due;
  if (!placement) return null;

  const date = getDatePart(placement);
  if (!date) return null;

  const icalTask = {
    status: task.status || undefined,
    start: task.start,
    due: task.due,
    completedAt: task.completedAt,
    percentComplete: task.percentComplete,
    priority: task.priority,
    created: task.created,
    lastModified: task.lastModified
  };
  const timing = placement.allDay
    ? ({ allDay: true } as const)
    : (() => {
        const time = getTimePart(placement);
        return time ? ({ allDay: false, startTime: time, endTime: time } as const) : null;
      })();
  if (!timing) return null;

  const common = {
    uid: task.uid,
    title: task.title,
    description: task.description || undefined,
    location: task.location || undefined,
    timezone: placement.allDay ? undefined : placement.timezone,
    icalTask,
    ...timing
  };

  if (task.rrule) {
    return validateEvent({
      ...common,
      type: 'rrule',
      id: `ics::${task.uid}::${date}::recurring`,
      startDate: date,
      endDate: null,
      rrule: task.rrule,
      skipDates: [],
      isTask: true
    });
  }

  return validateEvent({
    ...common,
    type: 'single',
    date,
    endDate: null,
    completed: task.completed ? task.completedAt || true : false
  });
}

export function parseVTodoCalendar(ics: string): ParsedVTodo[] {
  if (!ics.trim() || !/BEGIN:VCALENDAR/i.test(ics)) {
    throw new Error(t('settings.calendars.caldavTasks.errors.malformedMissingCalendar'));
  }

  let calendar: ical.Component;
  try {
    calendar = new ical.Component(ical.parse(ics));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(t('settings.calendars.caldavTasks.errors.malformedData', { message }), {
      cause: error
    });
  }

  const tasks: (ParsedVTodo | null)[] = calendar.getAllSubcomponents('vtodo').map(todo => {
    const uid = textValue(todo, 'uid').trim();
    if (!uid) return null;

    const status = textValue(todo, 'status').trim().toUpperCase();
    const completedAt = readTimestamp(todo, 'completed');
    const percentComplete = readPercentComplete(todo);
    const priorityValue = Number(textValue(todo, 'priority'));
    const priority =
      Number.isInteger(priorityValue) && priorityValue >= 0 && priorityValue <= 9
        ? priorityValue
        : undefined;
    const rrule = textValue(todo, 'rrule').trim() || undefined;
    const taskWithoutEvent = {
      uid,
      title: textValue(todo, 'summary') || t('settings.calendars.caldavTasks.untitledTask'),
      description: textValue(todo, 'description'),
      location: textValue(todo, 'location'),
      status,
      completed: status === 'COMPLETED' || Boolean(completedAt) || percentComplete === 100,
      cancelled: status === 'CANCELLED',
      percentComplete,
      priority,
      rrule,
      created: readTimestamp(todo, 'created'),
      lastModified: readTimestamp(todo, 'last-modified'),
      completedAt,
      start: readDateValue(todo, 'dtstart'),
      due: readDateValue(todo, 'due')
    } satisfies Omit<ParsedVTodo, 'event'>;

    return { ...taskWithoutEvent, event: buildEvent(taskWithoutEvent) };
  });
  return tasks.filter((task): task is ParsedVTodo => task !== null);
}

function eventPlacement(event: OFCEvent): VTodoDateValue | null {
  const date =
    event.type === 'single' ? event.date : event.type === 'rrule' ? event.startDate : null;
  if (!date) return null;
  if (event.allDay) return { value: date, allDay: true };

  const startTime = 'startTime' in event ? event.startTime : null;
  if (!startTime) return null;
  const parsed = DateTime.fromISO(`${date}T${startTime}`, {
    ...(event.timezone ? { zone: event.timezone } : {})
  });
  const value = parsed.toISO({ suppressMilliseconds: true, includeOffset: true });
  return value
    ? { value, allDay: false, ...(event.timezone ? { timezone: event.timezone } : {}) }
    : null;
}

function toIcalTime(value: VTodoDateValue): ical.Time {
  const parsed = DateTime.fromISO(value.value, {
    setZone: true,
    ...(value.timezone ? { zone: value.timezone } : {})
  });
  const utc = value.timezone === 'UTC' || value.timezone === 'Z';
  const normalized = utc ? parsed.toUTC() : parsed;
  return new ical.Time({
    year: normalized.year,
    month: normalized.month,
    day: normalized.day,
    hour: value.allDay ? 0 : normalized.hour,
    minute: value.allDay ? 0 : normalized.minute,
    second: value.allDay ? 0 : normalized.second,
    isDate: value.allDay,
    ...(!value.allDay && utc ? { timezone: 'Z' } : {})
  });
}

function replaceDateProperty(
  component: ical.Component,
  name: 'dtstart' | 'due',
  value: VTodoDateValue | undefined
): void {
  component.removeAllProperties(name);
  if (!value) return;

  const property = new ical.Property(name);
  if (!value.allDay && value.timezone && value.timezone !== 'UTC' && value.timezone !== 'Z') {
    property.setParameter('TZID', value.timezone);
  }
  property.setValue(toIcalTime(value));
  component.addProperty(property);
}

function replaceTextProperty(component: ical.Component, name: string, value?: string): void {
  component.removeAllProperties(name);
  if (value) component.addPropertyWithValue(name, value);
}

function addRecurrence(component: ical.Component, rule?: string): void {
  if (!rule) return;
  try {
    const recur = (ical.Recur as unknown as { fromString(value: string): unknown }).fromString(
      rule.replace(/^RRULE:/i, '')
    ) as string;
    component.addPropertyWithValue('rrule', recur);
  } catch {
    const property = new ical.Property('rrule');
    property.setValue(rule.replace(/^RRULE:/i, ''));
    component.addProperty(property);
  }
}

function completionTimestamp(event: OFCEvent): ical.Time {
  const completed = event.type === 'single' ? event.completed : false;
  const parsed =
    typeof completed === 'string' ? DateTime.fromISO(completed, { setZone: true }) : DateTime.utc();
  return ical.Time.fromJSDate((parsed.isValid ? parsed : DateTime.utc()).toJSDate(), true);
}

function applyCompletion(component: ical.Component, event: OFCEvent): void {
  const completed = event.type === 'single' ? Boolean(event.completed) : false;
  const currentStatus = textValue(component, 'status').toUpperCase();
  const currentPercentComplete = readPercentComplete(component);
  const wasCompleted =
    currentStatus === 'COMPLETED' ||
    Boolean(component.getFirstProperty('completed')) ||
    currentPercentComplete === 100;
  const preferredStatus = event.icalTask?.status?.toUpperCase();
  const activeStatus =
    currentStatus === 'IN-PROCESS' || preferredStatus === 'IN-PROCESS'
      ? 'IN-PROCESS'
      : 'NEEDS-ACTION';
  component.updatePropertyWithValue('status', completed ? 'COMPLETED' : activeStatus);
  component.removeAllProperties('completed');
  if (completed) {
    component.addPropertyWithValue('completed', completionTimestamp(event));
    component.updatePropertyWithValue('percent-complete', 100);
  } else if (wasCompleted || currentPercentComplete === undefined) {
    component.updatePropertyWithValue('percent-complete', 0);
  }
}

function durationBetween(start: VTodoDateValue, due: VTodoDateValue): number | null {
  const startDate = DateTime.fromISO(start.value, { setZone: true });
  const dueDate = DateTime.fromISO(due.value, { setZone: true });
  return startDate.isValid && dueDate.isValid ? dueDate.toMillis() - startDate.toMillis() : null;
}

function addDuration(value: VTodoDateValue, milliseconds: number, allDay: boolean): VTodoDateValue {
  const parsed = DateTime.fromISO(value.value, {
    setZone: true,
    ...(value.timezone ? { zone: value.timezone } : {})
  }).plus({ milliseconds });
  const nextValue = allDay
    ? parsed.toISODate()
    : parsed.toISO({ suppressMilliseconds: true, includeOffset: true });
  return {
    value: nextValue || value.value,
    allDay,
    ...(!allDay && value.timezone ? { timezone: value.timezone } : {})
  };
}

function placementChanged(oldEvent: OFCEvent, newEvent: OFCEvent): boolean {
  return JSON.stringify(eventPlacement(oldEvent)) !== JSON.stringify(eventPlacement(newEvent));
}

function updateTaskDates(todo: ical.Component, oldEvent: OFCEvent, newEvent: OFCEvent): void {
  if (!placementChanged(oldEvent, newEvent)) return;
  const nextPlacement = eventPlacement(newEvent);
  if (!nextPlacement) return;

  const currentStart = readDateValue(todo, 'dtstart');
  const currentDue = readDateValue(todo, 'due');
  if (currentStart) {
    replaceDateProperty(todo, 'dtstart', nextPlacement);
    if (currentDue) {
      const duration = durationBetween(currentStart, currentDue);
      replaceDateProperty(
        todo,
        'due',
        duration === null
          ? currentDue
          : addDuration(nextPlacement, duration, nextPlacement.allDay && currentDue.allDay)
      );
    }
    return;
  }

  replaceDateProperty(todo, 'due', nextPlacement);
}

export function createVTodoCalendar(event: OFCEvent, uid: string): string {
  const calendar = new ical.Component(['vcalendar', [], []]);
  calendar.addPropertyWithValue('version', '2.0');
  calendar.addPropertyWithValue('prodid', PRODID);

  const todo = new ical.Component('vtodo');
  todo.addPropertyWithValue('uid', uid);
  todo.addPropertyWithValue('dtstamp', ical.Time.now());
  todo.addPropertyWithValue('created', ical.Time.now());
  todo.addPropertyWithValue('last-modified', ical.Time.now());
  todo.addPropertyWithValue(
    'summary',
    event.title || t('settings.calendars.caldavTasks.untitledTask')
  );
  if (event.description) todo.addPropertyWithValue('description', event.description);
  if (event.location) todo.addPropertyWithValue('location', event.location);

  const placement = eventPlacement(event);
  const taskMetadata = event.icalTask;
  replaceDateProperty(todo, 'dtstart', taskMetadata?.start);
  replaceDateProperty(
    todo,
    'due',
    taskMetadata?.due || (!taskMetadata?.start ? placement || undefined : undefined)
  );
  if (taskMetadata?.priority !== undefined) {
    todo.addPropertyWithValue('priority', taskMetadata.priority);
  }
  if (event.type === 'rrule') addRecurrence(todo, event.rrule);
  applyCompletion(todo, event);
  calendar.addSubcomponent(todo);

  return (calendar as unknown as { toString(): string }).toString();
}

export function updateVTodoCalendar(
  ics: string,
  uid: string,
  oldEvent: OFCEvent,
  newEvent: OFCEvent
): string {
  const calendar = new ical.Component(ical.parse(ics));
  const todo = calendar
    .getAllSubcomponents('vtodo')
    .find(component => textValue(component, 'uid').trim() === uid);
  if (!todo) {
    throw new Error(t('settings.calendars.caldavTasks.errors.vtodoNotFound', { uid }));
  }

  replaceTextProperty(
    todo,
    'summary',
    newEvent.title || t('settings.calendars.caldavTasks.untitledTask')
  );
  replaceTextProperty(todo, 'description', newEvent.description);
  replaceTextProperty(todo, 'location', newEvent.location);
  updateTaskDates(todo, oldEvent, newEvent);
  applyCompletion(todo, newEvent);
  todo.updatePropertyWithValue('last-modified', ical.Time.now());

  return (calendar as unknown as { toString(): string }).toString();
}
