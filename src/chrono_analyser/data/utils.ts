/**
 * @file Contains pure, stateless utility functions for common calculations and data transformations.
 * These helpers are used for date manipulation, duration calculation, and other reusable logic.
 */

import { RRule, rrulestr } from 'rrule';
import { OFCEvent } from '../../types';
import { TimeRecord } from './types';

export function getISODate(date: Date | null): string | null {
  if (!date || isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
}

export function getWeekStartDate(date: Date): Date | null {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday, 1 = Monday
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday as start
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
}

export function getMonthStartDate(date: Date): Date | null {
  if (!date || isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function getHourFromTimeStr(
  timeStr: string | number | Date | null | undefined
): number | null {
  if (timeStr === null) return null;
  if (typeof timeStr === 'number') {
    const hour = Math.floor(timeStr);
    return hour >= 0 && hour <= 23 ? hour : null;
  }
  const sTimeStr = String(timeStr);
  const timeMatch = sTimeStr.match(/^(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1], 10);
    return hour >= 0 && hour <= 23 ? hour : null;
  }
  try {
    const d = new Date(sTimeStr);
    if (!isNaN(d.getTime())) {
      const hour = d.getUTCHours();
      return hour >= 0 && hour <= 23 ? hour : null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function getDayOfWeekNumber(dayChar: string): number | undefined {
  const mapping: { [key: string]: number } = { U: 0, M: 1, T: 2, W: 3, R: 4, F: 5, S: 6 };
  return mapping[String(dayChar).trim().toUpperCase()];
}

export function calculateDuration(
  startTime: string | number | Date | null | undefined,
  endTime: string | number | Date | null | undefined,
  days: number | undefined = 1
): number {
  const parseTime = (
    timeStr: string | number | Date | null | undefined
  ): { hours: number; minutes: number } | null => {
    if (timeStr === null) return null;
    if (typeof timeStr === 'number') {
      if (isNaN(timeStr) || !isFinite(timeStr)) return null;
      return {
        hours: Math.floor(timeStr),
        minutes: Math.round((timeStr - Math.floor(timeStr)) * 60)
      };
    }
    const sTimeStr = String(timeStr);
    const timeMatch = sTimeStr.match(/^(\d{1,2}):(\d{2})/);
    if (timeMatch) return { hours: parseInt(timeMatch[1]), minutes: parseInt(timeMatch[2]) };
    try {
      const d = new Date(sTimeStr);
      if (!isNaN(d.getTime())) return { hours: d.getUTCHours(), minutes: d.getUTCMinutes() };
    } catch {
      /* ignore */
    }
    return null;
  };

  try {
    const start = parseTime(startTime);
    const end = parseTime(endTime);
    if (!start || !end) return 0;
    const startMinutes = start.hours * 60 + start.minutes;
    let endMinutes = end.hours * 60 + end.minutes;
    if (endMinutes < startMinutes) endMinutes += 24 * 60; // Handles overnight
    const durationForOneDay = (endMinutes - startMinutes) / 60;
    const numDays = Number(days) || 0;
    return durationForOneDay * Math.max(0, numDays);
  } catch {
    return 0;
  }
}

export function getRecurringInstances(
  record: TimeRecord,
  filterStartDate: Date | null,
  filterEndDate: Date | null
): Date[] {
  if (record.metadata.type !== 'recurring') return [];
  const event = record.metadata;

  try {
    const dtstart = event.startRecur ? new Date(event.startRecur) : new Date('1970-01-01');
    if (isNaN(dtstart.getTime())) return [];

    const weekdays = {
      U: RRule.SU,
      M: RRule.MO,
      T: RRule.TU,
      W: RRule.WE,
      R: RRule.TH,
      F: RRule.FR,
      S: RRule.SA
    };

    const ruleOptions: Partial<import('rrule').Options> = { dtstart };

    if (event.fcrDaily) {
      ruleOptions.freq = RRule.DAILY;
    } else if (event.daysOfWeek && event.daysOfWeek.length > 0) {
      ruleOptions.freq = RRule.WEEKLY;
      ruleOptions.byweekday = event.daysOfWeek.map(c => weekdays[c]);
    } else if (event.repeatOn) {
      ruleOptions.freq = RRule.MONTHLY;
      const weekdaysList = [RRule.SU, RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA];
      const rruleWeekday = weekdaysList[event.repeatOn.weekday];
      ruleOptions.byweekday = [rruleWeekday.nth(event.repeatOn.week)];
    } else if (event.dayOfMonth) {
      ruleOptions.freq = RRule.MONTHLY;
      ruleOptions.bymonthday = event.dayOfMonth;
      if (event.month) {
        ruleOptions.freq = RRule.YEARLY;
        ruleOptions.bymonth = event.month;
      }
    } else {
      return [];
    }

    if (event.repeatInterval && event.repeatInterval > 1) {
      ruleOptions.interval = event.repeatInterval;
    }

    if (event.endRecur) {
      const endRecurDate = new Date(event.endRecur);
      if (!isNaN(endRecurDate.getTime())) {
        const until = new Date(
          Date.UTC(
            endRecurDate.getFullYear(),
            endRecurDate.getMonth(),
            endRecurDate.getDate(),
            23,
            59,
            59
          )
        );
        ruleOptions.until = until;
      }
    }

    const rule = new RRule(ruleOptions);

    const rangeStart = filterStartDate || new Date('1900-01-01');
    const rangeEnd = filterEndDate || new Date('2100-12-31');

    const instances = rule.between(rangeStart, rangeEnd, true);

    const skipDatesSet = new Set(event.skipDates || []);

    return instances.filter(date => {
      const dateStr = getISODate(date);
      return dateStr && !skipDatesSet.has(dateStr);
    });
  } catch (error) {
    console.warn('Failed to expand recurring instances:', event, error);
    return [];
  }
}

export function calculateRecurringInstancesInDateRange(
  metadata: OFCEvent,
  filterStartDate: Date | null,
  filterEndDate: Date | null
): number {
  if (metadata.type !== 'recurring') return 0;
  const dummyRecord: TimeRecord = {
    metadata,
    project: '',
    duration: 0,
    date: new Date(),
    _id: '',
    path: '',
    hierarchy: '',
    subproject: '',
    subprojectFull: '',
    file: ''
  };
  return getRecurringInstances(dummyRecord, filterStartDate, filterEndDate).length;
}

/**
 * Returns an array of dates for each occurrence of an rrule event within a range.
 * Filters out any dates that exist in the event's skipDates array.
 */
export function getRruleInstances(
  record: TimeRecord,
  filterStartDate: Date | null,
  filterEndDate: Date | null
): Date[] {
  if (record.metadata.type !== 'rrule') return [];

  const { rrule: rruleString, startDate, skipDates = [] } = record.metadata;
  if (!rruleString || !startDate) return [];

  try {
    // Parse the start date
    const dtstart = new Date(startDate);
    if (isNaN(dtstart.getTime())) return [];

    // Create rrule object
    const rule = rrulestr(rruleString, { dtstart });

    // Set up date range for expansion
    const rangeStart = filterStartDate || new Date('1900-01-01');
    const rangeEnd = filterEndDate || new Date('2100-12-31');

    // Get all instances in the range
    const instances = rule.between(rangeStart, rangeEnd, true);

    // Filter out skipDates
    const skipDatesSet = new Set(skipDates);

    return instances.filter(date => {
      const dateStr = getISODate(date);
      return dateStr && !skipDatesSet.has(dateStr);
    });
  } catch (error) {
    console.warn('Failed to expand rrule:', rruleString, error);
    return [];
  }
}

/**
 * Calculates how many times an rrule event occurs within a given date range.
 * Excludes any dates that exist in the event's skipDates array.
 */
export function calculateRruleInstancesInDateRange(
  metadata: OFCEvent,
  filterStartDate: Date | null,
  filterEndDate: Date | null
): number {
  if (metadata.type !== 'rrule') return 0;

  const { rrule: rruleString, startDate, skipDates = [] } = metadata;
  if (!rruleString || !startDate) return 0;

  try {
    // Parse the start date
    const dtstart = new Date(startDate);
    if (isNaN(dtstart.getTime())) return 0;

    // Create rrule object
    const rule = rrulestr(rruleString, { dtstart });

    // Set up date range for expansion
    const rangeStart = filterStartDate || new Date('1900-01-01');
    const rangeEnd = filterEndDate || new Date('2100-12-31');

    // Get all instances in the range
    const instances = rule.between(rangeStart, rangeEnd, true);

    // Filter out skipDates and count
    const skipDatesSet = new Set(skipDates);

    return instances.filter(date => {
      const dateStr = getISODate(date);
      return dateStr && !skipDatesSet.has(dateStr);
    }).length;
  } catch (error) {
    console.warn('Failed to count rrule instances:', rruleString, error);
    return 0;
  }
}
