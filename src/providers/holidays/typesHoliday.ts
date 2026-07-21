/**
 * @file typesHoliday.ts
 * @brief Type definitions for the Holiday calendar provider.
 *
 * @description
 * Defines the configuration shape for the HolidayProvider and
 * the HolidayTypeFilter enum that maps user-facing tier selections
 * to the underlying `date-holidays` library type strings.
 *
 * @license See LICENSE.md
 */

import { HolidaysTypes } from 'date-holidays';

/**
 * The five user-facing tiers for holiday type filtering.
 * These are stored in the calendar source config and translated
 * into `date-holidays` type arrays by the provider at runtime.
 */
export type HolidayTypeFilter =
  'public' | 'public_bank' | 'public_bank_observance' | 'all_except_optional' | 'all';

/**
 * Maps a HolidayTypeFilter tier to the array of `date-holidays`
 * HolidayType strings that the provider will accept.
 */
export function getHolidayTypesForFilter(filter: HolidayTypeFilter): HolidaysTypes.HolidayType[] {
  switch (filter) {
    case 'public':
      return ['public'];
    case 'public_bank':
      return ['public', 'bank'];
    case 'public_bank_observance':
      return ['public', 'bank', 'observance'];
    case 'all_except_optional':
      return ['public', 'bank', 'observance', 'school'];
    case 'all':
      return ['public', 'bank', 'observance', 'school', 'optional'];
  }
}

/**
 * The persisted configuration for a single Holiday calendar source.
 * Stored in `data.json` alongside all other calendar sources.
 */
export type HolidayProviderConfig = {
  /** Settings-level unique ID, e.g. "holidays_1" */
  id: string;
  /** Human-readable name shown in the calendar list */
  name: string;
  /** ISO 3166-1 alpha-2 country code, e.g. "US", "DE", "GB" */
  country: string;
  /** ISO 3166-2 state/province code, e.g. "ca" for California */
  state?: string;
  /** More specific region code for city/district level holidays */
  region?: string;
  /** Which holiday tiers to include. Default: "public" */
  holidayTypes: HolidayTypeFilter;
  /**
   * FullCalendar display mode for holiday events.
   * Matches the `display` field on OFCEvent.
   * Default: "block" (rendered as a solid all-day block)
   */
  display?: 'auto' | 'block' | 'list-item' | 'background' | 'inverse-background' | 'none';
};
