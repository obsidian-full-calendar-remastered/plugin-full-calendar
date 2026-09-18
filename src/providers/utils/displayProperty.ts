/**
 * @file displayProperty.ts
 * @brief Shared helpers for round-tripping the FullCalendar `display` mode through
 * remote calendar providers.
 *
 * @description
 * Neither iCalendar nor the Google Calendar API models FullCalendar's `display` mode
 * (background events and friends). Providers therefore persist it in their respective
 * extension slots: an `X-` property for iCalendar, private extended properties for
 * Google. This module keeps the property name and value validation in one place so the
 * providers agree on the wire format.
 *
 * @license See LICENSE.md
 */

import { OFCEvent } from '../../types/schema';

type DisplayValue = NonNullable<OFCEvent['display']>;

/** Property name used to persist the display mode in iCalendar components. */
export const ICAL_DISPLAY_PROPERTY = 'x-ofc-display';

/** Key used to persist the display mode in Google's private extended properties. */
export const GOOGLE_DISPLAY_PROPERTY = 'ofcDisplay';

const DISPLAY_VALUES: readonly DisplayValue[] = [
  'auto',
  'block',
  'list-item',
  'background',
  'inverse-background',
  'none'
];

/**
 * Narrows an arbitrary stored string to a valid display mode.
 *
 * Remote calendars are shared, and their extension slots can hold anything, so values
 * are validated rather than trusted before they re-enter the event model.
 */
export const isDisplayValue = (value: unknown): value is DisplayValue =>
  typeof value === 'string' && (DISPLAY_VALUES as readonly string[]).includes(value);
