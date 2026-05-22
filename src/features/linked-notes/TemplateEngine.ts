import { OFCEvent } from '../../types';
import { DateTime } from 'luxon';

export class TemplateEngine {
  static get DEFAULT_TEMPLATE(): string {
    return `# {{title}}

**Date**: {{date}}
**Time**: {{timeString}}
**Location**: {{location}}
**Calendar**: {{calendarName}}

## Description
{{description}}

## Notes
- `;
  }

  static render(
    template: string,
    event: OFCEvent,
    calendarName = '',
    instanceDate?: string
  ): string {
    const formatDate = (dateStr: string | null | undefined) => {
      if (!dateStr) return '';
      return DateTime.fromISO(dateStr).toLocaleString(DateTime.DATE_HUGE);
    };

    const formatTime = (timeStr: string | null | undefined) => {
      if (!timeStr) return '';
      return DateTime.fromFormat(timeStr, 'HH:mm').toLocaleString(DateTime.TIME_SIMPLE);
    };

    const dateVal =
      instanceDate ||
      (event.type === 'single'
        ? event.date
        : event.type === 'recurring' && event.startRecur
          ? event.startRecur
          : event.type === 'rrule'
            ? event.startDate
            : '');

    const dateString = formatDate(dateVal);

    const timeString = event.allDay
      ? 'All Day'
      : `${event.startTime ? formatTime(event.startTime) : ''} - ${event.endTime ? formatTime(event.endTime) : ''}`;

    const replacements: Record<string, string> = {
      title: event.title || '',
      description: event.description || '',
      date: dateString,
      timeString: timeString,
      location: event.location || '',
      calendarName: calendarName,
      url: event.url || ''
    };

    let rendered = template;
    for (const [key, value] of Object.entries(replacements)) {
      const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
      rendered = rendered.replace(pattern, value);
    }
    return rendered;
  }
}
