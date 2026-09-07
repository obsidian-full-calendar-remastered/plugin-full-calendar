/**
 * @file AvailabilityService.ts
 * @brief Logic for querying calendar events via API, filtering, and calculating availability.
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { PluginState } from '../../core/PluginState';
import { QueryableEvent } from '../../core/EventFilterSortEngine';

export interface AvailabilityOptions {
  startDate: string; // 'yyyy-MM-dd'
  endDate: string; // 'yyyy-MM-dd'
  startTime: string; // 'HH:mm'
  endTime: string; // 'HH:mm'
  excludeWeekends: boolean;
  calendarIds: string[];
  anonymize: boolean;
}

export interface AvailabilitySlot {
  start: string; // ISO 8601 string with offset
  end: string; // ISO 8601 string with offset
  status: 'free' | 'busy';
  title?: string;
}

export interface AvailabilityResult {
  timezone: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  slots: AvailabilitySlot[];
}

function parseTime(
  timeStr: string | undefined,
  defaultHour: number,
  defaultMin: number
): [number, number] {
  if (!timeStr || typeof timeStr !== 'string') return [defaultHour, defaultMin];
  const parts = timeStr.split(':');
  const hour = parseInt(parts[0], 10);
  const min = parseInt(parts[1], 10);
  return [
    isNaN(hour) || hour < 0 || hour > 23 ? defaultHour : hour,
    isNaN(min) || min < 0 || min > 59 ? defaultMin : min
  ];
}

export class AvailabilityService {
  /**
   * Queries events and computes free/busy slots based on the provided options.
   */
  static async computeAvailability(options: AvailabilityOptions): Promise<AvailabilityResult> {
    const settings = PluginState.getSettings();
    let tz =
      settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
    if (tz === 'system') {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
    }

    const startDt = DateTime.fromISO(options.startDate, { zone: tz }).startOf('day');
    const endDt = DateTime.fromISO(options.endDate, { zone: tz }).endOf('day');

    if (!startDt.isValid || !endDt.isValid) {
      throw new Error('Invalid start or end date format.');
    }

    if (startDt > endDt) {
      throw new Error('Start date must be before or equal to end date.');
    }

    const [startHour, startMin] = parseTime(options.startTime, 9, 0);
    const [endHour, endMin] = parseTime(options.endTime, 17, 0);

    if (startHour > endHour || (startHour === endHour && startMin >= endMin)) {
      throw new Error('Daily start time must be before end time.');
    }

    // Query events from internal API
    const criteria = {
      dateRange: {
        startMillis: startDt.toMillis(),
        endMillis: endDt.toMillis()
      },
      calendarIds: options.calendarIds.length > 0 ? options.calendarIds : undefined
    };

    const queryEvents = PluginState.getInternalAPI().getEvents(criteria);

    // Filter out all-day events
    const timedEvents = queryEvents.filter((evt: QueryableEvent) => {
      return !evt.allDay && evt.startMillis !== undefined && evt.endMillis !== undefined;
    });

    const slots: AvailabilitySlot[] = [];

    // Loop through each day in the date range
    let currentDay = startDt.startOf('day');
    const targetEndDay = endDt.startOf('day');

    while (currentDay <= targetEndDay) {
      // Exclude weekends if option is checked (Luxon weekday: 6 = Saturday, 7 = Sunday)
      if (options.excludeWeekends && (currentDay.weekday === 6 || currentDay.weekday === 7)) {
        currentDay = currentDay.plus({ days: 1 });
        continue;
      }

      const dayStart = currentDay.set({
        hour: startHour,
        minute: startMin,
        second: 0,
        millisecond: 0
      });
      const dayEnd = currentDay.set({
        hour: endHour,
        minute: endMin,
        second: 0,
        millisecond: 0
      });

      // Find events overlapping this day's window
      const dailyBusyBlocks: { start: DateTime; end: DateTime; title: string }[] = [];

      for (const evt of timedEvents) {
        const startMillis = evt.startMillis;
        const endMillis = evt.endMillis;
        if (startMillis === undefined || endMillis === undefined) {
          continue;
        }
        const evtStart = DateTime.fromMillis(startMillis, { zone: tz });
        const evtEnd = DateTime.fromMillis(endMillis, { zone: tz });

        if (evtStart < dayEnd && evtEnd > dayStart) {
          // Overlaps the day window, clip it
          const clipStart = evtStart < dayStart ? dayStart : evtStart;
          const clipEnd = evtEnd > dayEnd ? dayEnd : evtEnd;

          if (clipStart < clipEnd) {
            dailyBusyBlocks.push({
              start: clipStart,
              end: clipEnd,
              title: options.anonymize ? 'Busy' : evt.title || 'Busy'
            });
          }
        }
      }

      // Merge overlapping/adjacent busy blocks
      dailyBusyBlocks.sort((a, b) => a.start.toMillis() - b.start.toMillis());

      const mergedBusy: { start: DateTime; end: DateTime; title: string }[] = [];
      for (const block of dailyBusyBlocks) {
        if (mergedBusy.length === 0) {
          mergedBusy.push(block);
        } else {
          const last = mergedBusy[mergedBusy.length - 1];
          if (block.start <= last.end) {
            // Overlaps or touches, merge
            if (block.end > last.end) {
              last.end = block.end;
            }
            if (
              !options.anonymize &&
              block.title &&
              block.title !== 'Busy' &&
              last.title.indexOf(block.title) === -1
            ) {
              last.title = `${last.title} / ${block.title}`;
            }
          } else {
            mergedBusy.push(block);
          }
        }
      }

      // Generate Free and Busy slots for the day
      let currentMarker: DateTime = dayStart;

      for (const busy of mergedBusy) {
        if (currentMarker < busy.start) {
          slots.push({
            start: currentMarker.toISO() || '',
            end: busy.start.toISO() || '',
            status: 'free',
            title: 'Available'
          });
        }
        slots.push({
          start: busy.start.toISO() || '',
          end: busy.end.toISO() || '',
          status: 'busy',
          title: busy.title
        });
        currentMarker = busy.end > currentMarker ? busy.end : currentMarker;
      }

      if (currentMarker < dayEnd) {
        slots.push({
          start: currentMarker.toISO() || '',
          end: dayEnd.toISO() || '',
          status: 'free',
          title: 'Available'
        });
      }

      currentDay = currentDay.plus({ days: 1 });
    }

    return {
      timezone: tz,
      startDate: options.startDate,
      endDate: options.endDate,
      generatedAt: DateTime.now().toISO() || '',
      slots
    };
  }

  /**
   * Generates a beautifully-formatted Markdown document from the availability result.
   */
  static generateMarkdown(result: AvailabilityResult, anonymize: boolean): string {
    const formattedDate = DateTime.fromISO(result.generatedAt).toLocaleString(DateTime.DATE_HUGE);
    let md = `# Shared Availability\n\n`;
    md += `> [!NOTE]\n`;
    md += `> **Timezone**: \`${result.timezone}\`\n`;
    md += `> **Generated On**: ${formattedDate}\n`;
    md += `> **Type**: ${anonymize ? 'Fully Anonymized (Busy status only)' : 'Semi-Anonymized (Show Event Titles)'}\n\n`;
    md += `---\n\n`;

    // Group slots by date string
    const slotsByDay: Record<string, AvailabilitySlot[]> = {};
    for (const slot of result.slots) {
      const dateStr = DateTime.fromISO(slot.start).toISODate() || '';
      if (!slotsByDay[dateStr]) {
        slotsByDay[dateStr] = [];
      }
      slotsByDay[dateStr].push(slot);
    }

    const sortedDates = Object.keys(slotsByDay).sort();

    if (sortedDates.length === 0) {
      md += `*No availability slots found in the selected date range.*\n`;
      return md;
    }

    for (const dateStr of sortedDates) {
      const dt = DateTime.fromISO(dateStr, { zone: result.timezone });
      const dayHeader = dt.toLocaleString(DateTime.DATE_HUGE);
      md += `### 📅 ${dayHeader}\n\n`;

      const daySlots = slotsByDay[dateStr];
      const freeSlots = daySlots.filter(s => s.status === 'free');
      const busySlots = daySlots.filter(s => s.status === 'busy');

      md += `#### Available Slots\n`;
      if (freeSlots.length === 0) {
        md += `*No free slots available on this day.*\n\n`;
      } else {
        for (const slot of freeSlots) {
          const startStr = DateTime.fromISO(slot.start).toLocaleString(DateTime.TIME_SIMPLE);
          const endStr = DateTime.fromISO(slot.end).toLocaleString(DateTime.TIME_SIMPLE);
          md += `- ✨ **${startStr} - ${endStr}**\n`;
        }
        md += `\n`;
      }

      md += `#### Busy / Unavailable Slots\n`;
      if (busySlots.length === 0) {
        md += `*No busy slots recorded.*\n\n`;
      } else {
        for (const slot of busySlots) {
          const startStr = DateTime.fromISO(slot.start).toLocaleString(DateTime.TIME_SIMPLE);
          const endStr = DateTime.fromISO(slot.end).toLocaleString(DateTime.TIME_SIMPLE);
          md += `- 🟥 **${startStr} - ${endStr}** (${slot.title || 'Busy'})\n`;
        }
        md += `\n`;
      }

      md += `\n`;
    }

    return md;
  }
}
