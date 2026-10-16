import { DateTime } from 'luxon';
import { OFCEvent } from '../../types';

export function getRecurringEventRule(event: Extract<OFCEvent, { type: 'recurring' }>): string {
  const parts: string[] = [];

  if (event.month !== undefined && event.dayOfMonth !== undefined) {
    parts.push('FREQ=YEARLY', `BYMONTH=${event.month}`, `BYMONTHDAY=${event.dayOfMonth}`);
  } else if (event.month !== undefined && event.repeatOn) {
    const weekdays = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const weekday = weekdays[event.repeatOn.weekday] || 'MO';
    const weekPrefix = event.repeatOn.week === -1 ? '-1' : String(event.repeatOn.week);
    parts.push('FREQ=YEARLY', `BYMONTH=${event.month}`, `BYDAY=${weekPrefix}${weekday}`);
  } else if (event.repeatOn) {
    const weekdays = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const weekday = weekdays[event.repeatOn.weekday] || 'MO';
    const weekPrefix = event.repeatOn.week === -1 ? '-1' : String(event.repeatOn.week);
    parts.push('FREQ=MONTHLY', `BYDAY=${weekPrefix}${weekday}`);
  } else if (event.dayOfMonth !== undefined) {
    parts.push('FREQ=MONTHLY', `BYMONTHDAY=${event.dayOfMonth}`);
  } else if (event.daysOfWeek?.length) {
    const weekdays: Record<string, string> = {
      U: 'SU',
      M: 'MO',
      T: 'TU',
      W: 'WE',
      R: 'TH',
      F: 'FR',
      S: 'SA'
    };
    parts.push('FREQ=WEEKLY', `BYDAY=${event.daysOfWeek.map(day => weekdays[day]).join(',')}`);
  } else if (event.fcrDaily) {
    parts.push('FREQ=DAILY');
  } else {
    parts.push('FREQ=DAILY');
  }

  if (event.repeatInterval && event.repeatInterval > 1) {
    parts.push(`INTERVAL=${event.repeatInterval}`);
  }

  if (event.endRecur) {
    const until = DateTime.fromISO(event.endRecur).endOf('day').toUTC();
    if (until.isValid) {
      parts.push(`UNTIL=${until.toFormat("yyyyMMdd'T'HHmmss'Z'")}`);
    }
  }

  return parts.join(';');
}
