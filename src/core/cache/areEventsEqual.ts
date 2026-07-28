/**
 * @file areEventsEqual.ts
 * @brief Zero-allocation structural equality comparison for OFCEvent objects.
 *
 * Provides a high-speed, zero-allocation scalar property comparison function
 * for change detection during cache sync, replacing costly JSON.stringify calls
 * and avoiding 32-bit hash collision risks.
 */

import { OFCEvent } from '../../types';

function arraysEqual(a?: string[], b?: string[]): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Checks whether two OFCEvent objects are structurally identical.
 * Returns true if all relevant fields match, false otherwise.
 */
export function areEventsEqual(a: OFCEvent, b: OFCEvent): boolean {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }

  // 1. Common properties from CommonSchema & TimeSchema
  if (a.title !== b.title) {
    return false;
  }
  if (a.category !== b.category || a.subCategory !== b.subCategory) {
    return false;
  }
  if (a.description !== b.description || a.location !== b.location) {
    return false;
  }
  if (a.timezone !== b.timezone) {
    return false;
  }

  if (a.allDay !== b.allDay) {
    return false;
  }
  if (!a.allDay && !b.allDay) {
    if (a.startTime !== b.startTime || a.endTime !== b.endTime) {
      return false;
    }
  }

  // 2. Discriminator & type-specific properties
  if (a.type !== b.type) {
    return false;
  }

  if (a.type === 'single' && b.type === 'single') {
    if (a.date !== b.date || a.endDate !== b.endDate) {
      return false;
    }
    if (a.completed !== b.completed) {
      return false;
    }
    return true;
  }

  if (a.type === 'rrule' && b.type === 'rrule') {
    if (a.startDate !== b.startDate || a.endDate !== b.endDate) {
      return false;
    }
    if (a.rrule !== b.rrule) {
      return false;
    }
    if (a.isTask !== b.isTask) {
      return false;
    }
    if (!arraysEqual(a.skipDates, b.skipDates)) {
      return false;
    }
    return true;
  }

  if (a.type === 'recurring' && b.type === 'recurring') {
    if (a.endDate !== b.endDate) {
      return false;
    }
    if (a.startRecur !== b.startRecur || a.endRecur !== b.endRecur) {
      return false;
    }
    if (a.fcrDaily !== b.fcrDaily) {
      return false;
    }
    if (a.repeatInterval !== b.repeatInterval) {
      return false;
    }
    if (a.dayOfMonth !== b.dayOfMonth || a.month !== b.month) {
      return false;
    }
    if (a.isTask !== b.isTask) {
      return false;
    }
    if (!arraysEqual(a.daysOfWeek, b.daysOfWeek)) {
      return false;
    }
    if (!arraysEqual(a.skipDates, b.skipDates)) {
      return false;
    }
    if (a.repeatOn || b.repeatOn) {
      if (!a.repeatOn || !b.repeatOn) {
        return false;
      }
      if (a.repeatOn.week !== b.repeatOn.week || a.repeatOn.weekday !== b.repeatOn.weekday) {
        return false;
      }
    }
    return true;
  }

  return true;
}
