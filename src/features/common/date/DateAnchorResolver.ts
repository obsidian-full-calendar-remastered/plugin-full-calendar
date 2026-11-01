/**
 * @file DateAnchorResolver.ts
 * @brief Domain logic for resolving relative date anchors and absolute ISO dates.
 *
 * Adheres to the Single Responsibility Principle (SRP) by isolating date
 * token calculation from UI rendering.
 */

import { DateTime } from 'luxon';

export const DATE_ANCHOR_PRESETS = [
  'today',
  'tomorrow',
  'yesterday',
  'thisWeek',
  'thisMonth'
] as const;

export type DateAnchorPreset = (typeof DATE_ANCHOR_PRESETS)[number];

/**
 * Checks whether a given string is a supported relative date anchor preset.
 */
export function isDateAnchorPreset(value: string): value is DateAnchorPreset {
  return DATE_ANCHOR_PRESETS.includes(value as DateAnchorPreset);
}

/**
 * Resolves a date anchor string (relative token, offset, or ISO date) to an ISO YYYY-MM-DD string.
 *
 * @param anchor The input string (e.g., 'today', 'tomorrow', 'yesterday', 'thisWeek', 'thisMonth', '+1d', '2026-11-01').
 * @param baseDate Reference date, defaults to current moment.
 * @param preserveDefaultToday If true, 'today' returns today's ISO date; if false (default), returns undefined so callers default naturally.
 * @returns An ISO date string ('YYYY-MM-DD') or undefined if unresolvable / default today.
 */
export function resolveDateAnchor(
  anchor?: string | null,
  baseDate: DateTime = DateTime.now(),
  preserveDefaultToday = false
): string | undefined {
  if (!anchor) {
    return undefined;
  }

  const trimmed = anchor.trim().toLowerCase();

  switch (trimmed) {
    case 'today':
      return preserveDefaultToday ? (baseDate.toISODate() ?? undefined) : undefined;
    case 'tomorrow':
      return baseDate.plus({ days: 1 }).toISODate() ?? undefined;
    case 'yesterday':
      return baseDate.minus({ days: 1 }).toISODate() ?? undefined;
    case 'thisweek':
      return baseDate.startOf('week').toISODate() ?? undefined;
    case 'thismonth':
      return baseDate.startOf('month').toISODate() ?? undefined;
  }

  // Handle relative offsets like +1d, -2w, +1m, -1y
  const offsetMatch = trimmed.match(/^([+-]?\d+)\s*([dwmy])$/);
  if (offsetMatch) {
    const amount = parseInt(offsetMatch[1], 10);
    const unit = offsetMatch[2];
    let target = baseDate;
    if (unit === 'd') target = target.plus({ days: amount });
    else if (unit === 'w') target = target.plus({ weeks: amount });
    else if (unit === 'm') target = target.plus({ months: amount });
    else if (unit === 'y') target = target.plus({ years: amount });
    return target.toISODate() ?? undefined;
  }

  // Attempt to parse as ISO date (e.g., YYYY-MM-DD)
  const parsed = DateTime.fromISO(anchor.trim());
  if (parsed.isValid) {
    return parsed.toISODate() ?? undefined;
  }

  return undefined;
}
