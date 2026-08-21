/**
 * @file index.ts
 * @brief A central export point for all public types used across the plugin.
 *
 * @description
 * This file acts as a public-facing barrel file for the `types` directory.
 * It consolidates and re-exports the most important types, such as `OFCEvent`,
 * `CalendarInfo`, and `EventLocation`, providing a single, clean import
 * point for other parts of the application.
 *
 * @license See LICENSE.md
 */

import { CalendarInfo } from './calendar_settings';

export type { OFCEvent } from './schema';
export { validateEvent } from './schema';
export type { CalendarInfo } from './calendar_settings';

export const PLUGIN_SLUG = 'full-calendar-plugin';

export class FCError {
  message: string;
  constructor(message: string) {
    this.message = message;
  }
}

export type EventLocation = {
  file: { path: string };
  lineNumber: number | undefined;
};

export type Authentication = {
  type: 'basic';
  username: string;
  password: string;
};

export type CalDAVSource = Extract<CalendarInfo, { type: 'caldav' }>;
export type CalDAVTaskSource = Extract<CalendarInfo, { type: 'caldavtasks' }>;
