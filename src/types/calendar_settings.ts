/**
 * @file calendar_settings.ts
 * @brief Defines the schemas and types for calendar source configurations.
 *
 * @description
 * This file uses the `zod` library to define strongly-typed schemas for the
 * various calendar source types (local, dailynote, ical, caldav, google). These
 * schemas are used to parse and validate the calendar configurations stored
 * in `data.json`, ensuring data integrity and providing type safety
 * throughout the plugin.
 *
 * @license See LICENSE.md
 */

import { ZodError, z } from 'zod';
import { OFCEvent } from './schema';
import { getNextColor } from '../ui/components/colors';
import { t } from '../features/i18n/i18n';
import {
  DAILY_NOTE_EVENT_FORMATS,
  DEFAULT_DAILY_NOTE_EVENT_FORMAT
} from '../providers/dailynote/typesDaily';

// New flattened schemas for each calendar type
const calendarOptionsSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('local'), id: z.string(), name: z.string(), directory: z.string() }),
  z.object({
    type: z.literal('dailynote'),
    id: z.string(),
    name: z.string(),
    heading: z.string(),
    format: z.enum(DAILY_NOTE_EVENT_FORMATS).default(DEFAULT_DAILY_NOTE_EVENT_FORMAT)
  }),
  z.object({ type: z.literal('ical'), id: z.string(), name: z.string(), url: z.string().url() }),
  z.object({
    type: z.literal('caldav'),
    id: z.string(),
    name: z.string(),
    url: z.string().url(),
    homeUrl: z.string().url(),
    username: z.string(),
    password: z.string()
  }),
  z.object({
    type: z.literal('google'),
    id: z.string(),
    name: z.string(),
    calendarId: z.string(), // Google's own ID for the calendar
    googleAccountId: z.string().optional()
  }),
  z.object({
    type: z.literal('outlook'),
    id: z.string(),
    name: z.string(),
    calendarId: z.string(),
    microsoftAccountId: z.string().optional()
  }),
  z.object({
    type: z.literal('tasks'),
    id: z.string(),
    name: z.string()
  }),
  z.object({
    type: z.literal('tasknotes'),
    id: z.string(),
    name: z.string(),
    dispatchMode: z.enum(['search', 'create']).optional()
  }),
  z.object({
    type: z.literal('bases'),
    id: z.string(),
    name: z.string(),
    basePath: z.string()
  })
]);

const colorValidator = z.object({ color: z.string() });

export type TestSource = {
  type: 'FOR_TEST_ONLY';
  id: string;
  name?: string; // <-- ADD THIS LINE
  events?: OFCEvent[];
  // Keep test helper flexible but avoid `any`.
  config?: Record<string, unknown>;
};

export type CalendarInfo = (z.infer<typeof calendarOptionsSchema> | TestSource) &
  z.infer<typeof colorValidator>;

export function parseCalendarInfo(obj: unknown): CalendarInfo {
  const options = calendarOptionsSchema.parse(obj);
  const color = colorValidator.parse(obj);

  return { ...options, ...color };
}

export function safeParseCalendarInfo(obj: unknown): CalendarInfo | null {
  try {
    return parseCalendarInfo(obj);
  } catch (e) {
    if (e instanceof ZodError) {
      // Ignore Zod errors during safe parse
    }
    return null;
  }
}

/**
 * Generates a new, unique, human-readable ID for a calendar source.
 * e.g., "local_1", "caldav_3"
 * @param type The type of calendar source.
 * @param existingIds A list of all existing calendar source IDs.
 * @returns A new unique ID string.
 */
export function generateCalendarId(type: CalendarInfo['type'], existingIds: string[]): string {
  const relevantIds = existingIds.filter(id => {
    // Ensure the ID starts with the type followed by underscore (e.g., "local_", "caldav_")
    return id.startsWith(`${type}_`);
  });
  let newIdNumber = 1;
  if (relevantIds.length > 0) {
    const highestNumber = relevantIds
      .map(id => {
        const parts = id.split('_');
        // Strict validation: ID must have exactly 2 parts [type, number]
        if (parts.length === 2) {
          return parseInt(parts[1], 10);
        }
        return NaN;
      })
      .filter(num => !isNaN(num))
      .reduce((max, current) => Math.max(max, current), 0);
    newIdNumber = highestNumber + 1;
  }
  return `${type}_${newIdNumber}`;
}

/**
 * Construct a partial calendar source of the specified type.
 * ACCEPTS TWO ARGUMENTS.
 */
export function makeDefaultPartialCalendarSource(
  type: CalendarInfo['type'] | 'icloud',
  existingColors: string[] = []
): Partial<CalendarInfo> {
  const newColor = getNextColor(existingColors);

  if (type === 'icloud') {
    return {
      type: 'caldav',
      name: t('settings.calendars.defaults.iCloud'),
      color: newColor,
      url: 'https://caldav.icloud.com'
    };
  }

  const typeName = type.charAt(0).toUpperCase() + type.slice(1);
  return {
    type: type,
    name: t('settings.calendars.defaults.new', { type: typeName }),
    color: newColor
  };
}
