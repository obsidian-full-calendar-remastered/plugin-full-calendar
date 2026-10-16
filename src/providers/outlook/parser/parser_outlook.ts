import { DateTime } from 'luxon';
import { OFCEvent } from '../../../types/schema';
import { constructTitle } from '../../../features/category/categoryParser';
import { injectMeetingUrl } from '../../../utils/meetingUrl';
import { resolveEffectiveTimezone } from '../../../features/timezone/Timezone';

export interface OutlookEventLike {
  id?: string;
  subject?: string;
  isAllDay?: boolean;
  type?: 'singleInstance' | 'occurrence' | 'exception' | 'seriesMaster';
  seriesMasterId?: string;
  originalStart?: string;
  recurrence?: {
    pattern?: {
      type?:
        | 'daily'
        | 'weekly'
        | 'absoluteMonthly'
        | 'relativeMonthly'
        | 'absoluteYearly'
        | 'relativeYearly';
      interval?: number;
      daysOfWeek?: string[];
      dayOfMonth?: number;
      index?: 'first' | 'second' | 'third' | 'fourth' | 'last';
      month?: number;
    };
    range?: {
      type?: 'endDate' | 'noEnd' | 'numbered';
      startDate?: string;
      endDate?: string;
      numberOfOccurrences?: number;
      recurrenceTimeZone?: string;
    };
  };
  start?: {
    dateTime?: string;
    timeZone?: string;
  } | null;
  end?: {
    dateTime?: string;
    timeZone?: string;
  } | null;
  isReminderOn?: boolean;
  reminderMinutesBeforeStart?: number;
  location?: {
    displayName?: string;
  } | null;
  body?: {
    content?: string;
    contentType?: 'html' | 'text';
  } | null;
  bodyPreview?: string;
  isOnlineMeeting?: boolean;
  onlineMeetingUrl?: string;
}

const OUTLOOK_DAY_TO_CHAR: Record<string, 'U' | 'M' | 'T' | 'W' | 'R' | 'F' | 'S'> = {
  sunday: 'U',
  monday: 'M',
  tuesday: 'T',
  wednesday: 'W',
  thursday: 'R',
  friday: 'F',
  saturday: 'S'
};

const CHAR_TO_OUTLOOK_DAY: Record<'U' | 'M' | 'T' | 'W' | 'R' | 'F' | 'S', string> = {
  U: 'sunday',
  M: 'monday',
  T: 'tuesday',
  W: 'wednesday',
  R: 'thursday',
  F: 'friday',
  S: 'saturday'
};

const OUTLOOK_INDEX_TO_WEEK: Record<string, -1 | 1 | 2 | 3 | 4> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  last: -1
};

const WEEK_TO_OUTLOOK_INDEX: Record<-1 | 1 | 2 | 3 | 4, string> = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  [-1]: 'last'
};

export function fromOutlookEvent(event: OutlookEventLike): OFCEvent | null {
  if (!event.id || !event.subject || !event.start || !event.end) {
    return null;
  }

  let location = event.location?.displayName || '';
  let description = event.bodyPreview || event.body?.content || '';
  if (event.onlineMeetingUrl) {
    const injected = injectMeetingUrl(event.onlineMeetingUrl, location, description);
    location = injected.location;
    description = injected.description;
  }

  const locationVal = location || undefined;
  const descriptionVal = description || undefined;

  const recurringEventId = event.seriesMasterId ?? undefined;

  if (event.isAllDay) {
    const allDayStart = event.start.dateTime ? DateTime.fromISO(event.start.dateTime) : null;
    const allDayEnd = event.end.dateTime ? DateTime.fromISO(event.end.dateTime) : null;
    if (!allDayStart || !allDayEnd || !allDayStart.isValid || !allDayEnd.isValid) {
      return null;
    }
    const inclusiveEnd = allDayEnd.minus({ days: 1 }).toISODate();
    return {
      type: 'single',
      uid: event.id,
      recurringEventId,
      title: event.subject,
      allDay: true,
      date: allDayStart.toISODate() || '',
      endDate: inclusiveEnd || null,
      location: locationVal,
      description: descriptionVal,
      ...(event.isReminderOn && typeof event.reminderMinutesBeforeStart === 'number'
        ? {
            alarms: [
              { minutesBefore: event.reminderMinutesBeforeStart, action: 'DISPLAY' as const }
            ]
          }
        : {})
    };
  }

  const rawTimezone = event.start.timeZone;
  const sourceZone = resolveEffectiveTimezone(rawTimezone);
  const start = event.start.dateTime
    ? DateTime.fromISO(event.start.dateTime, { zone: sourceZone })
    : null;
  const end = event.end.dateTime
    ? DateTime.fromISO(event.end.dateTime, { zone: sourceZone })
    : null;

  if (!start || !end || !start.isValid || !end.isValid) {
    return null;
  }

  // If Outlook returned UTC (default Graph API behavior or event stored in UTC),
  // convert to effective display timezone so local time is stored in cache
  // and displayed in event dialogs.
  const displayZone = resolveEffectiveTimezone();
  const targetZone = sourceZone === 'UTC' && displayZone !== 'UTC' ? displayZone : sourceZone;
  const zonedStart = start.setZone(targetZone);
  const zonedEnd = end.setZone(targetZone);

  if (event.type === 'seriesMaster' && event.recurrence?.pattern) {
    const pattern = event.recurrence.pattern;
    const range = event.recurrence.range;

    const recurringBase: Record<string, unknown> = {
      type: 'recurring',
      uid: event.id,
      title: event.subject,
      allDay: false,
      repeatInterval: pattern.interval,
      startRecur: range?.startDate || zonedStart.toISODate() || undefined,
      endRecur: range?.type === 'endDate' ? range?.endDate : undefined,
      isTask: false,
      skipDates: [],
      location: locationVal,
      description: descriptionVal,
      startTime: zonedStart.toFormat('HH:mm'),
      endTime: zonedEnd.toFormat('HH:mm'),
      timezone: targetZone
    };
    if (event.isReminderOn && typeof event.reminderMinutesBeforeStart === 'number') {
      recurringBase.alarms = [
        { minutesBefore: event.reminderMinutesBeforeStart, action: 'DISPLAY' }
      ];
    }

    switch (pattern.type) {
      case 'weekly': {
        const days = (pattern.daysOfWeek || [])
          .map(day => OUTLOOK_DAY_TO_CHAR[day.toLowerCase()])
          .filter((day): day is 'U' | 'M' | 'T' | 'W' | 'R' | 'F' | 'S' => !!day);
        if (days.length > 0) {
          recurringBase.daysOfWeek = days;
        }
        break;
      }
      case 'absoluteMonthly':
        recurringBase.dayOfMonth = pattern.dayOfMonth;
        break;
      case 'relativeMonthly': {
        const week = pattern.index ? OUTLOOK_INDEX_TO_WEEK[pattern.index] : undefined;
        const day = (pattern.daysOfWeek || [])[0]?.toLowerCase();
        const weekdayChar = day ? OUTLOOK_DAY_TO_CHAR[day] : undefined;
        if (week && weekdayChar) {
          recurringBase.repeatOn = {
            week,
            weekday: ['U', 'M', 'T', 'W', 'R', 'F', 'S'].indexOf(weekdayChar)
          };
        }
        break;
      }
      case 'absoluteYearly':
        recurringBase.dayOfMonth = pattern.dayOfMonth;
        recurringBase.month = pattern.month;
        break;
      case 'relativeYearly': {
        const week = pattern.index ? OUTLOOK_INDEX_TO_WEEK[pattern.index] : undefined;
        const day = (pattern.daysOfWeek || [])[0]?.toLowerCase();
        const weekdayChar = day ? OUTLOOK_DAY_TO_CHAR[day] : undefined;
        if (week && weekdayChar) {
          recurringBase.repeatOn = {
            week,
            weekday: ['U', 'M', 'T', 'W', 'R', 'F', 'S'].indexOf(weekdayChar)
          };
        }
        recurringBase.month = pattern.month;
        break;
      }
      case 'daily':
      default:
        recurringBase.daysOfWeek = ['U', 'M', 'T', 'W', 'R', 'F', 'S'];
        break;
    }

    return recurringBase as OFCEvent;
  }

  return {
    type: 'single',
    uid: event.id,
    recurringEventId,
    title: event.subject,
    allDay: false,
    date: zonedStart.toISODate() || '',
    startTime: zonedStart.toFormat('HH:mm'),
    endDate: zonedEnd.toISODate() !== zonedStart.toISODate() ? zonedEnd.toISODate() : null,
    endTime: zonedEnd.toFormat('HH:mm'),
    timezone: targetZone,
    location: locationVal,
    description: descriptionVal,
    ...(event.isReminderOn && typeof event.reminderMinutesBeforeStart === 'number'
      ? {
          alarms: [{ minutesBefore: event.reminderMinutesBeforeStart, action: 'DISPLAY' as const }]
        }
      : {})
  };
}

export function toOutlookEvent(event: OFCEvent): object {
  const payload: Record<string, unknown> = {
    subject: constructTitle(event.category, event.subCategory, event.title)
  };

  if (event.location) {
    payload.location = {
      displayName: event.location
    };
  }

  if (event.description) {
    payload.body = {
      contentType: 'text',
      content: event.description
    };
  }

  if (event.alarms && event.alarms.length > 0) {
    payload.isReminderOn = true;
    payload.reminderMinutesBeforeStart = event.alarms[0].minutesBefore;
  } else {
    payload.isReminderOn = false;
  }

  if (event.allDay) {
    if (event.type !== 'single' && event.type !== 'recurring') {
      throw new Error('All-day Outlook events are supported for single or recurring event types.');
    }

    const allDayStartDate = event.type === 'single' ? event.date : event.startRecur;
    if (!allDayStartDate) {
      throw new Error('All-day Outlook event is missing a valid start date.');
    }

    const endDate = DateTime.fromISO(
      (event.type === 'single' ? event.endDate : event.endRecur) || allDayStartDate
    )
      .plus({ days: 1 })
      .toISODate();
    payload.isAllDay = true;
    payload.start = {
      dateTime: `${allDayStartDate}T00:00:00`,
      timeZone: 'UTC'
    };
    payload.end = {
      dateTime: `${endDate}T00:00:00`,
      timeZone: 'UTC'
    };

    if (event.type === 'recurring') {
      payload.recurrence = buildOutlookRecurrence(event);
    }

    return payload;
  }

  const timezone = resolveEffectiveTimezone(event.timezone);
  let startDate: string | undefined;
  let endDate: string | undefined;

  if (event.type === 'single') {
    startDate = event.date;
    endDate = event.endDate || event.date;
  } else if (event.type === 'rrule') {
    startDate = event.startDate;
    endDate = event.startDate;
  } else if (event.type === 'recurring') {
    startDate = event.startRecur;
    endDate = event.startRecur;
  }

  if (!startDate || !event.startTime || !event.endTime) {
    throw new Error('Timed Outlook event is missing required date/time fields.');
  }

  payload.isAllDay = false;
  payload.start = {
    dateTime: `${startDate}T${event.startTime}:00`,
    timeZone: timezone
  };
  payload.end = {
    dateTime: `${endDate || startDate}T${event.endTime}:00`,
    timeZone: timezone
  };

  if (event.type === 'recurring') {
    payload.recurrence = buildOutlookRecurrence(event);
  }

  return payload;
}

function buildOutlookRecurrence(event: Extract<OFCEvent, { type: 'recurring' }>): object {
  const interval = event.repeatInterval || 1;
  const startDate = event.startRecur;
  if (!startDate) {
    throw new Error('Recurring Outlook event requires startRecur.');
  }

  let pattern: Record<string, unknown>;

  if (event.month && event.repeatOn) {
    const weekday = ['U', 'M', 'T', 'W', 'R', 'F', 'S'][event.repeatOn.weekday] as
      'U' | 'M' | 'T' | 'W' | 'R' | 'F' | 'S';
    pattern = {
      type: 'relativeYearly',
      interval,
      month: event.month,
      index: WEEK_TO_OUTLOOK_INDEX[event.repeatOn.week as -1 | 1 | 2 | 3 | 4],
      daysOfWeek: [CHAR_TO_OUTLOOK_DAY[weekday]]
    };
  } else if (event.month && event.dayOfMonth) {
    pattern = {
      type: 'absoluteYearly',
      interval,
      month: event.month,
      dayOfMonth: event.dayOfMonth
    };
  } else if (event.repeatOn) {
    const weekday = ['U', 'M', 'T', 'W', 'R', 'F', 'S'][event.repeatOn.weekday] as
      'U' | 'M' | 'T' | 'W' | 'R' | 'F' | 'S';
    pattern = {
      type: 'relativeMonthly',
      interval,
      index: WEEK_TO_OUTLOOK_INDEX[event.repeatOn.week as -1 | 1 | 2 | 3 | 4],
      daysOfWeek: [CHAR_TO_OUTLOOK_DAY[weekday]]
    };
  } else if (event.dayOfMonth) {
    pattern = {
      type: 'absoluteMonthly',
      interval,
      dayOfMonth: event.dayOfMonth
    };
  } else if (event.daysOfWeek && event.daysOfWeek.length > 0) {
    pattern = {
      type: 'weekly',
      interval,
      daysOfWeek: event.daysOfWeek.map(day => CHAR_TO_OUTLOOK_DAY[day]),
      firstDayOfWeek: 'sunday'
    };
  } else {
    pattern = {
      type: 'daily',
      interval
    };
  }

  const range: Record<string, unknown> = {
    type: event.endRecur ? 'endDate' : 'noEnd',
    startDate
  };

  if (event.endRecur) {
    range.endDate = event.endRecur;
  }

  return {
    pattern,
    range
  };
}
