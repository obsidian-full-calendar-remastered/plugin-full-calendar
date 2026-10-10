import { DateTime } from 'luxon';
import { OFCEvent, EventLocation } from '../../types';
import { RecurringInstanceState } from '../Provider';
import { t } from '../../features/i18n/i18n';
import { TaskNotesTask } from './typesTaskNotes';

export function normalizePersistentId(path: string): string {
  return path.replace(/\\/g, '/');
}

export function getTaskVersion(task: TaskNotesTask | null | undefined): number | null {
  const raw = task?.dateModified;
  if (!raw) return null;

  const parsed = DateTime.fromISO(raw);
  if (!parsed.isValid) return null;

  return parsed.toMillis();
}

export function getScheduledParts(value: unknown): { date: string; time: string | null } {
  if (!value) {
    return { date: '', time: null };
  }

  const toPrimitiveString = (input: unknown): string | null => {
    if (input === null || input === undefined) return null;
    if (typeof input === 'string') return input;
    if (typeof input === 'number' || typeof input === 'boolean' || typeof input === 'bigint') {
      return String(input);
    }
    if (input instanceof Date && !Number.isNaN(input.valueOf())) {
      return input.toISOString();
    }
    return null;
  };

  const toStringOrEmpty = (input: unknown): string => {
    if (input === null || input === undefined) return '';
    return toPrimitiveString(input) ?? '';
  };

  const toStringOrNull = (input: unknown): string | null => {
    if (input === null || input === undefined || input === '') return null;
    return toPrimitiveString(input);
  };

  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      const arrayValue = value as unknown[];
      const rawDate = arrayValue.length > 0 ? arrayValue[0] : undefined;
      const rawTime = arrayValue.length > 1 ? arrayValue[1] : undefined;
      return { date: toStringOrEmpty(rawDate), time: toStringOrNull(rawTime) };
    }
    const record = value as Record<string, unknown>;
    return {
      date: toStringOrEmpty(record.date),
      time: toStringOrNull(record.time)
    };
  }

  let strValue: string;
  if (typeof value === 'string') {
    strValue = value;
  } else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    strValue = String(value);
  } else {
    return { date: '', time: null };
  }
  let datePart = strValue;
  let timePart = null;

  if (strValue.includes('T')) {
    [datePart, timePart] = strValue.split('T');
  } else if (strValue.includes(' ')) {
    const parts = strValue.split(' ');
    datePart = parts[0];
    timePart = parts[1];
  }

  const isoStr = timePart ? `${datePart}T${timePart}` : datePart;
  const parsed = DateTime.fromISO(isoStr);

  if (parsed.isValid) {
    return {
      date: parsed.toFormat('yyyy-MM-dd'),
      time: timePart ? parsed.toFormat('HH:mm') : null
    };
  }

  return { date: datePart, time: timePart ? timePart.slice(0, 5) : null };
}

export function normalizeTime(value: string | null | undefined): string | null {
  if (!value) return null;

  const formats = ['HH:mm', 'H:mm', 'h:mm a'];
  for (const format of formats) {
    const parsed = DateTime.fromFormat(value, format);
    if (parsed.isValid) {
      return parsed.toFormat('HH:mm');
    }
  }

  return null;
}

export function computeEndTime(date: string, startTime: string, minutes: number): string | null {
  const start = DateTime.fromISO(`${date}T${startTime}`);
  if (!start.isValid) return null;

  return start.plus({ minutes }).toFormat('HH:mm');
}

export function computeMinutes(startTime: string, endTime: string): number | null {
  const start = DateTime.fromFormat(startTime, 'HH:mm');
  const end = DateTime.fromFormat(endTime, 'HH:mm');
  if (!start.isValid || !end.isValid) return null;

  let diff = end.diff(start, 'minutes').minutes;
  if (diff <= 0) {
    diff += 24 * 60;
  }
  return Math.round(diff);
}

export function scheduledDateFromValue(value: string): string {
  return value.split('T')[0] || value;
}

export function parseTaskRecurrence(
  task: TaskNotesTask
): { rrule: string; dtstart?: string } | null {
  if (!task.recurrence || typeof task.recurrence !== 'string') {
    return null;
  }

  const normalized = task.recurrence.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return null;
  }

  const lines = normalized
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const dtstartLine = lines.find(line => line.startsWith('DTSTART'));
  const rruleLineFromLines = lines.find(line => line.startsWith('RRULE:'));

  if (rruleLineFromLines) {
    return {
      rrule: rruleLineFromLines,
      dtstart: dtstartLine
    };
  }

  if (normalized.startsWith('DTSTART:') && normalized.includes(';FREQ=')) {
    const firstSemicolon = normalized.indexOf(';');
    if (firstSemicolon > 0) {
      const dtstart = normalized.slice(0, firstSemicolon);
      const rulePart = normalized.slice(firstSemicolon + 1).trim();
      if (rulePart.includes('FREQ=')) {
        const rrule = rulePart.startsWith('RRULE:') ? rulePart : `RRULE:${rulePart}`;
        return { rrule, dtstart };
      }
    }
  }

  const rulePart = normalized.startsWith('RRULE:') ? normalized : `RRULE:${normalized}`;
  if (!rulePart.includes('FREQ=')) {
    return null;
  }

  return {
    rrule: rulePart,
    dtstart: dtstartLine
  };
}

export function extractDateAndTimeFromDtstart(
  dtstartLine?: string
): { date: string; time: string | null } | null {
  if (!dtstartLine) {
    return null;
  }

  const valuePart = dtstartLine.split(':')[1];
  if (!valuePart) {
    return null;
  }

  const normalized = valuePart.replace(/Z$/, '');
  if (!/^\d{8}(T\d{6})?$/.test(normalized)) {
    return null;
  }

  const dateRaw = normalized.slice(0, 8);
  const date = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;

  if (normalized.length === 8) {
    return { date, time: null };
  }

  const timeRaw = normalized.slice(9, 15);
  const time = `${timeRaw.slice(0, 2)}:${timeRaw.slice(2, 4)}`;
  return { date, time };
}

export function getTaskRecurringParentId(task: TaskNotesTask): string | undefined {
  if (typeof task.recurringEventId === 'string' && task.recurringEventId.trim().length > 0) {
    return task.recurringEventId;
  }

  const fromCustom = task.customProperties?.recurringEventId;
  if (typeof fromCustom === 'string' && fromCustom.trim().length > 0) {
    return fromCustom;
  }

  return undefined;
}

export function getRecurringStateForDate(
  task: TaskNotesTask,
  instanceDate: string
): RecurringInstanceState {
  const completed = Array.isArray(task.complete_instances)
    ? task.complete_instances.includes(instanceDate)
    : false;
  const skipped = Array.isArray(task.skipped_instances)
    ? task.skipped_instances.includes(instanceDate)
    : false;
  return { completed, skipped };
}

export function buildRecurringEvent(task: TaskNotesTask): OFCEvent | null {
  const parsedRecurrence = parseTaskRecurrence(task);
  if (!parsedRecurrence) {
    return null;
  }

  const scheduledParts = getScheduledParts(task.scheduled);
  const dtstartParts = extractDateAndTimeFromDtstart(parsedRecurrence.dtstart);

  const startDate = scheduledParts.date || dtstartParts?.date || '';
  if (!startDate) {
    return null;
  }

  const startTime = normalizeTime(scheduledParts.time ?? dtstartParts?.time ?? null);

  const uniqueSkipDates = Array.from(
    new Set((task.skipped_instances ?? []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))
  );

  if (!startTime) {
    return {
      type: 'rrule',
      title: task.title,
      allDay: true,
      startDate,
      endDate: null,
      rrule: parsedRecurrence.rrule,
      skipDates: uniqueSkipDates,
      isTask: true,
      uid: normalizePersistentId(task.path),
      recurringEventId: getTaskRecurringParentId(task)
    };
  }

  const endTime =
    typeof task.timeEstimate === 'number' && task.timeEstimate > 0
      ? (computeEndTime(startDate, startTime, task.timeEstimate) ?? startTime)
      : startTime;

  return {
    type: 'rrule',
    title: task.title,
    allDay: false,
    startDate,
    endDate: null,
    startTime,
    endTime,
    rrule: parsedRecurrence.rrule,
    skipDates: uniqueSkipDates,
    isTask: true,
    uid: normalizePersistentId(task.path),
    recurringEventId: getTaskRecurringParentId(task)
  };
}

export function taskToEvent(
  task: TaskNotesTask,
  isCompleted: boolean
): [OFCEvent, EventLocation | null] | null {
  if (task.recurrence) {
    const recurringEvent = buildRecurringEvent(task);
    if (recurringEvent) {
      return [recurringEvent, { file: { path: task.path }, lineNumber: undefined }];
    }
  }

  if (!task.scheduled) {
    return null;
  }

  const { date, time } = getScheduledParts(task.scheduled);
  const hasTimedSlot = !!time;
  const completedDate = task.completedDate || DateTime.now().toFormat('yyyy-MM-dd');

  const event: OFCEvent = hasTimedSlot
    ? (() => {
        const safeTime = time ?? '00:00';
        const endTime =
          typeof task.timeEstimate === 'number' && task.timeEstimate > 0
            ? (computeEndTime(date, safeTime, task.timeEstimate) ?? safeTime)
            : safeTime;
        return {
          type: 'single',
          title: task.title,
          allDay: false,
          date,
          endDate: null,
          startTime: safeTime,
          endTime,
          completed: isCompleted ? completedDate : false,
          uid: normalizePersistentId(task.path),
          recurringEventId: getTaskRecurringParentId(task)
        };
      })()
    : {
        type: 'single',
        title: task.title,
        allDay: true,
        date,
        endDate: null,
        completed: isCompleted ? completedDate : false,
        uid: normalizePersistentId(task.path),
        recurringEventId: getTaskRecurringParentId(task)
      };

  return [event, { file: { path: task.path }, lineNumber: undefined }];
}

export function toTaskNotesNLPQuery(event: OFCEvent): string {
  if (event.type !== 'single' || !event.date) {
    throw new Error(t('notices.tasknotes.handoffSingleOnly'));
  }

  const title = event.title?.trim();
  if (!title) {
    throw new Error(t('notices.tasknotes.handoffTitleRequired'));
  }

  if (event.allDay) {
    return `${title} scheduled ${event.date}`;
  }

  const normalizedStart = normalizeTime(event.startTime ?? null);
  if (!normalizedStart) {
    throw new Error(t('notices.tasknotes.handoffStartTimeRequired'));
  }

  const normalizedEnd = normalizeTime(event.endTime ?? null);
  let durationToken = '';
  if (normalizedEnd) {
    const minutes = computeMinutes(normalizedStart, normalizedEnd);
    if (minutes && minutes > 0) {
      durationToken = ` ${minutes}m`;
    }
  }

  return `${title} scheduled ${event.date} ${normalizedStart}${durationToken}`;
}
