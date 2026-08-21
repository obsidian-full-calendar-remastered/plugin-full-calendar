import ical from 'ical.js';
import { OFCEvent } from '../../../types';
import { parseTimezoneAwareString } from '../../../features/timezone/Timezone';
import { PluginState } from '../../../core/PluginState';
import { TasksBacklogDateTarget, TasksDateTarget } from '../../../types/settings';
import { CalendarObjectData, CalDAVTaskInboxItem } from '../types/typesCalDAV';

export function encodeCalDAVTaskId(calendarId: string, uid: string): string {
  return `caldav::${encodeURIComponent(calendarId)}::${encodeURIComponent(uid)}`;
}

export function parseCalDAVTaskId(taskId: string): { calendarId: string; uid: string } | null {
  const parts = taskId.split('::');
  if (parts.length !== 3 || parts[0] !== 'caldav') {
    return null;
  }

  try {
    return {
      calendarId: decodeURIComponent(parts[1]),
      uid: decodeURIComponent(parts[2])
    };
  } catch {
    return null;
  }
}

export function getTextProperty(component: ical.Component, property: string): string {
  return String(component.getFirstPropertyValue(property) || '');
}

export function getTaskUid(todo: ical.Component): string {
  return getTextProperty(todo, 'uid').trim();
}

export function hasValidTaskDate(todo: ical.Component, property: 'dtstart' | 'due'): boolean {
  const prop = todo.getFirstProperty(property);
  if (!prop) return false;

  try {
    const value: ical.Time = prop.getFirstValue();
    return parseTimezoneAwareString(value).isValid;
  } catch {
    return false;
  }
}

export function mapTargetToVTodoProperty(target: TasksDateTarget): 'dtstart' | 'due' {
  switch (target) {
    case 'dueDate':
      return 'due';
    case 'startDate':
    case 'scheduledDate':
    default:
      return 'dtstart';
  }
}

export function isUnscheduledTodo(
  todo: ical.Component,
  backlogDateTarget?: TasksBacklogDateTarget
): boolean {
  let target = backlogDateTarget;
  if (!target) {
    try {
      target = PluginState.getSettings()?.tasksIntegration?.backlogDateTarget;
    } catch {
      target = undefined;
    }
  }
  const effectiveTarget = target ?? 'scheduledDate';
  const targetProp = mapTargetToVTodoProperty(effectiveTarget);
  return !hasValidTaskDate(todo, targetProp);
}

export function isCompletedTodo(todo: ical.Component): boolean {
  const percentComplete = Number(getTextProperty(todo, 'percent-complete'));
  return (
    getTextProperty(todo, 'status').toUpperCase() === 'COMPLETED' ||
    Boolean(todo.getFirstProperty('completed')) ||
    percentComplete === 100
  );
}

export function parseVCalendar(ics: string): ical.Component {
  return new ical.Component(ical.parse(ics));
}

export function createRandomUid(): string {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createUnscheduledTaskIcs(uid: string, title: string): string {
  const vcalendar = new ical.Component(['vcalendar', [], []]);
  vcalendar.addPropertyWithValue('version', '2.0');
  vcalendar.addPropertyWithValue('prodid', '-//Obsidian Full Calendar Plugin//NONSGML v1.0//EN');

  const todo = new ical.Component('vtodo');
  todo.addPropertyWithValue('uid', uid);
  todo.addPropertyWithValue('summary', title);
  todo.addPropertyWithValue('dtstamp', ical.Time.now());
  todo.addPropertyWithValue('status', 'NEEDS-ACTION');
  todo.addPropertyWithValue('percent-complete', 0);
  vcalendar.addSubcomponent(todo);

  return (vcalendar as unknown as { toString(): string }).toString();
}

export function findTodoByUid(vcalendar: ical.Component, uid: string): ical.Component | null {
  const normalizedUid = uid.trim();
  return (
    vcalendar.getAllSubcomponents('vtodo').find(todo => getTaskUid(todo) === normalizedUid) ?? null
  );
}

export function parseUnscheduledTasksFromObject(
  object: CalendarObjectData,
  calendarId: string,
  calendarName: string,
  backlogDateTarget?: TasksBacklogDateTarget
): CalDAVTaskInboxItem[] {
  let vcalendar: ical.Component;
  try {
    vcalendar = parseVCalendar(object.ics);
  } catch {
    return [];
  }

  const tasks: CalDAVTaskInboxItem[] = [];

  for (const todo of vcalendar.getAllSubcomponents('vtodo')) {
    if (!isUnscheduledTodo(todo, backlogDateTarget)) {
      continue;
    }
    if (getTextProperty(todo, 'status').toUpperCase() === 'CANCELLED') {
      continue;
    }

    const uid = getTaskUid(todo);
    if (!uid) {
      continue;
    }

    tasks.push({
      id: uid,
      uid,
      title: getTextProperty(todo, 'summary') || 'Untitled task',
      calendarId,
      calendarName,
      description: getTextProperty(todo, 'description'),
      location: getTextProperty(todo, 'location'),
      url: getTextProperty(todo, 'url'),
      status: getTextProperty(todo, 'status'),
      completed: isCompletedTodo(todo),
      etag: object.etag,
      href: object.href
    });
  }

  return tasks;
}

export function allDayIcalTimeFromDate(date: Date): ical.Time {
  return new ical.Time({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    isDate: true
  });
}

export function timedIcalTimeFromDate(date: Date): ical.Time {
  return new ical.Time({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
    isDate: false
  });
}

export function replaceAllDayTaskDate(
  todo: ical.Component,
  property: 'dtstart' | 'due',
  date: Date
): void {
  todo.removeAllProperties(property);
  const prop = new ical.Property(property);
  prop.setValue(allDayIcalTimeFromDate(date));
  todo.addProperty(prop);
}

export function replaceTimedTaskDate(
  todo: ical.Component,
  property: 'dtstart' | 'due',
  date: Date,
  timezone: string
): void {
  todo.removeAllProperties(property);
  const prop = new ical.Property(property);
  if (timezone && timezone !== 'UTC' && timezone !== 'Z') {
    prop.setParameter('TZID', timezone);
  }
  prop.setValue(timedIcalTimeFromDate(date));
  todo.addProperty(prop);
}

export function taskToLinkedNoteEvent(task: CalDAVTaskInboxItem): OFCEvent {
  return {
    type: 'single',
    uid: task.uid,
    title: task.title,
    date: '',
    endDate: null,
    allDay: true,
    completed: task.completed ? new Date().toISOString() : false,
    description: task.description,
    location: task.location,
    url: task.url
  };
}
