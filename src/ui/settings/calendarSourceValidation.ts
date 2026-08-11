import type { CalendarInfo } from '../../types/calendar_settings';

export function canAddCalendarOfType(type: CalendarInfo['type'], sources: CalendarInfo[]): boolean {
  return type !== 'dailynote' || !sources.some(source => source.type === 'dailynote');
}
