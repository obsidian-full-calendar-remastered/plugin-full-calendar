import { showNotice } from '../../utils/showNotice';
/**
 * @file Timezone.ts
 * @brief Provides core utility functions for timezone conversions.
 *
 * @description
 * This file contains the foundational `convertEvent` function, which is the
 * single source of truth for translating an OFCEvent object from one IANA
 * timezone to another. It uses the `luxon` library to handle the complexities
 * of date and time math, including DST adjustments, ensuring that all time
 * conversions are accurate and consistent.
 *
 * @see FullNoteCalendar.ts
 * @see DailyNoteCalendar.ts
 *
 * @license See LICENSE.md
 */

import { PluginState } from '../../core/PluginState';

import { DateTime } from 'luxon';
import ical from 'ical.js';

import FullCalendarPlugin from '../../main';
import { t } from '../i18n/i18n';

/** Signature for the rrule expand function used by FullCalendar's rrule plugin. */
type RRuleExpandFn = (
  this: unknown,
  errd: RRuleExpandData,
  fr: RRuleFrameRange,
  de: RRuleDateEnvLike
) => Date[];

/**
 * Internal shape of the rruleSet object, exposing the private `_dtstart`
 * property that FullCalendar's rrule plugin uses internally.
 */
interface RRuleSetInternal extends RRuleSetLike {
  _dtstart?: Date;
  between?: (after: Date, before: Date, inc?: boolean) => Date[];
}

// Store the truly-original rrule expand function so we never wrap our own patch.
let _originalRRuleExpand: RRuleExpandFn | null = null;

/**
 * Test helper to reset module-level patch state between test cases.
 */
export function resetRRulePatchStateForTests(): void {
  _originalRRuleExpand = null;
}

// Minimal shape for the rrule plugin we monkeypatch.
export interface RRuleDateEnvLike {
  toDate: (input: Date | string | number) => Date;
  createMarker: (input: Date | string | number) => Date;
}

export interface RRuleFrameRange {
  start: Date | string | number;
  end: Date | string | number;
}

export interface RRuleSetLike {
  tzid: () => string | null | undefined;
}

export interface RRuleExpandData {
  rruleSet: RRuleSetLike;
}

export interface RRulePluginLike {
  recurringTypes: { expand: RRuleExpandFn }[];
}

/**
 * Manages the plugin's timezone settings by comparing the system timezone with stored settings.
 * This function should be called once when the plugin loads.
 *
 * @param plugin The instance of the FullCalendarPlugin.
 */
export async function manageTimezone(_plugin: FullCalendarPlugin): Promise<void> {
  const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const settings = PluginState.getSettings();

  if (!settings.lastSystemTimezone || settings.displayTimezone === null) {
    // Case 1: First run, or settings are in a pre-timezone-feature state.
    // Initialize everything to the current system's timezone.
    settings.lastSystemTimezone = systemTimezone;
    settings.displayTimezone = systemTimezone;
    await PluginState.saveSettings();
  } else if (settings.lastSystemTimezone !== systemTimezone) {
    // Case 2: The system timezone has changed since the last time Obsidian was run.
    // This is a critical change. We must update the user's view.
    settings.displayTimezone = systemTimezone; // Force reset the display timezone.
    settings.lastSystemTimezone = systemTimezone;
    await PluginState.saveSettings();

    showNotice(
      t('notices.timezoneChanged', { timezone: systemTimezone }),
      10000 // 10-second notice
    );
  }
  // Case 3: System timezone is unchanged. We do nothing, respecting the user's
  // potentially custom `displayTimezone` setting from the settings tab.
}

/**
 * Maps Windows timezone identifiers to IANA timezone identifiers.
 * Some ICS files (especially from Outlook/Exchange) use Windows timezone names
 * instead of IANA identifiers, which Luxon requires.
 */
function mapWindowsTimezoneToIANA(windowsTz: string): string | null {
  const windowsToIANA: Record<string, string> = {
    // Western Europe
    'W. Europe Standard Time': 'Europe/Berlin',
    'Central Europe Standard Time': 'Europe/Budapest',
    'E. Europe Standard Time': 'Europe/Bucharest',
    'GTB Standard Time': 'Europe/Bucharest',
    'Russian Standard Time': 'Europe/Moscow',
    'GMT Standard Time': 'Europe/London',
    'Greenwich Standard Time': 'Europe/London',
    // Americas
    'Eastern Standard Time': 'America/New_York',
    'Central Standard Time': 'America/Chicago',
    'Mountain Standard Time': 'America/Denver',
    'Pacific Standard Time': 'America/Los_Angeles',
    'Alaskan Standard Time': 'America/Anchorage',
    'Hawaiian Standard Time': 'Pacific/Honolulu',
    'Atlantic Standard Time': 'America/Halifax',
    'Central America Standard Time': 'America/Guatemala',
    'Mexico Standard Time': 'America/Mexico_City',
    'SA Pacific Standard Time': 'America/Bogota',
    'SA Western Standard Time': 'America/Caracas',
    'SA Eastern Standard Time': 'America/Sao_Paulo',
    'Pacific SA Standard Time': 'America/Santiago',
    // Asia
    'Tokyo Standard Time': 'Asia/Tokyo',
    'Korea Standard Time': 'Asia/Seoul',
    'China Standard Time': 'Asia/Shanghai',
    'India Standard Time': 'Asia/Kolkata',
    'Singapore Standard Time': 'Asia/Singapore',
    'W. Australia Standard Time': 'Australia/Perth',
    'AUS Eastern Standard Time': 'Australia/Sydney',
    'New Zealand Standard Time': 'Pacific/Auckland',
    // Middle East
    'Arab Standard Time': 'Asia/Riyadh',
    'Israel Standard Time': 'Asia/Jerusalem',
    'Turkey Standard Time': 'Europe/Istanbul',
    // Africa
    'South Africa Standard Time': 'Africa/Johannesburg',
    'Egypt Standard Time': 'Africa/Cairo'
  };

  return windowsToIANA[windowsTz] || null;
}

/**
 * Normalizes a timezone identifier to an IANA timezone identifier.
 * Handles UTC ('Z'), Windows timezone identifiers, and IANA identifiers.
 */
export function normalizeTimezone(zone: string | undefined | null): string {
  // Handle undefined, null, or empty strings
  if (!zone || zone.trim() === '') {
    return 'utc';
  }

  // Handle UTC
  if (zone === 'Z' || zone.toLowerCase() === 'utc') {
    return 'utc';
  }

  // Check if it's already a valid IANA timezone
  try {
    const testDt = DateTime.now().setZone(zone);
    if (testDt.isValid) {
      return zone;
    }
  } catch {
    // Not a valid IANA timezone, continue to Windows mapping
  }

  // Try to map Windows timezone to IANA
  const mapped = mapWindowsTimezoneToIANA(zone);
  if (mapped) {
    return mapped;
  }

  // Return original if no mapping found (will be handled by caller)
  return zone;
}

/**
 * Converts an iCal date string (YYYYMMDD or YYYYMMDDTHHMMSSZ) to ISO extended format.
 * This ensures FullCalendar receives dates in the format it expects.
 */
export function convertICalDateToISO(dateStr: string, _isDateOnly: boolean = false): string | null {
  // Handle YYYYMMDD format (date only)
  if (dateStr.length === 8 && /^\d{8}$/.test(dateStr)) {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return `${year}-${month}-${day}`;
  }

  // Handle YYYYMMDDTHHMMSSZ format (date-time with UTC)
  if (dateStr.length === 16 && dateStr.endsWith('Z') && /^\d{8}T\d{6}Z$/.test(dateStr)) {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    const hour = dateStr.substring(9, 11);
    const minute = dateStr.substring(11, 13);
    const second = dateStr.substring(13, 15);
    return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  }

  // Handle YYYYMMDDTHHMMSS format (date-time without timezone)
  if (dateStr.length === 15 && /^\d{8}T\d{6}$/.test(dateStr)) {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    const hour = dateStr.substring(9, 11);
    const minute = dateStr.substring(11, 13);
    const second = dateStr.substring(13, 15);
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  }

  return null;
}

/**
 * Converts an ical.js Time object into a Luxon DateTime object.
 * This version directly uses fromObject to get an exact, offset-free
 * interpretation from the source iCal attributes and anchors it directly to the designated zone.
 */
export function parseTimezoneAwareString(t: ical.Time): DateTime {
  // FAST PATH: Handle date-only (floating) values directly to avoid timezone conversion shifts.
  // We explicitly create the DateTime in UTC to preserve the exact date regardless of local system time.
  if (t.isDate) {
    return DateTime.fromObject(
      {
        year: t.year,
        month: t.month,
        day: t.day
      },
      { zone: 'utc' }
    );
  }

  // The timezone property on ical.Time is what we need.
  // It can be 'Z' for UTC, a Windows identifier like 'W. Europe Standard Time',
  // an IANA identifier like 'Asia/Kolkata', or undefined/null.
  const rawZone =
    t.timezone === 'Z'
      ? 'utc'
      : t.timezone ||
        (t.zone && t.zone.tzid && t.zone.tzid !== 'floating' ? t.zone.tzid : undefined);
  const zone = normalizeTimezone(rawZone);

  let zonedDt = DateTime.fromObject(
    {
      year: t.year,
      month: t.month,
      day: t.day,
      hour: t.hour,
      minute: t.minute,
      second: t.second || 0
    },
    { zone }
  );

  // Check if setting the zone resulted in an invalid DateTime.
  if (!zonedDt.isValid) {
    // Attempt UTC fallback
    zonedDt = DateTime.fromObject(
      {
        year: t.year,
        month: t.month,
        day: t.day,
        hour: t.hour,
        minute: t.minute,
        second: t.second || 0
      },
      { zone: 'utc' }
    );

    if (!zonedDt.isValid) {
      // If even UTC fails, try parsing the raw value
      const rawValue = (t as unknown as { toString(): string }).toString();
      if (rawValue) {
        const isoDate = convertICalDateToISO(rawValue, t.isDate);
        if (isoDate) {
          const parsed = DateTime.fromISO(isoDate, { zone: 'utc' });
          if (parsed.isValid) {
            return parsed;
          }
        }
      }
      return DateTime.invalid('Invalid date after timezone conversion and fallback');
    }
  }

  return zonedDt;
}

/**
 * Patches the FullCalendar RRULE expand logic to fix timezone handling for
 * recurring events with DTSTART;TZID= (which FullCalendar's analyzeRRuleString
 * regex fails to detect, causing incorrect timezone processing).
 *
 * ## Why this patch is needed
 *
 * FullCalendar's rrule plugin uses `analyzeRRuleString()` to detect whether
 * a DTSTART includes a TZID. Its regex `/\b(DTSTART:)([^\n]*)/` only matches
 * `DTSTART:` (colon), but NOT `DTSTART;TZID=...:` (semicolon). This causes
 * `isTimeZoneSpecified = false`, which triggers an incorrect code path where
 * `dateEnv.toDate()` is applied to already-rezoned dates, corrupting the result.
 *
 * ## How rrule.js encodes times
 *
 * rrule.js stores DTSTART as a UTC Date where `getUTCHours()` equals the literal
 * hour string (e.g. "11:00" → `getUTCHours()=11`). Its `rezonedDate()` then
 * shifts recurrence dates by the difference between the event timezone and the
 * browser timezone, producing dates whose epoch does NOT equal true UTC.
 *
 * ## What this patch does
 *
 * 1. Extracts the stable wall-clock time from `_dtstart.getUTCHours/Minutes/Seconds`
 * 2. Extracts the calendar date from each recurrence's browser-local fields
 * 3. Constructs the correct Luxon DateTime in the event's source timezone (tzid)
 * 4. Converts to true UTC epoch via `sourceDt.toMillis()`
 * 5. Passes the true UTC epoch to `calendarDateEnv.createMarker()` which
 *    produces a proper FullCalendar marker (UTC fields = display-tz wall-clock)
 *
 * By delegating the source→display timezone conversion to FullCalendar's own
 * `createMarker()`, this avoids double-conversion and works correctly for all
 * display timezone combinations (DST and non-DST alike).
 */
export function patchRRuleTimezoneExpansion(
  rrulePlugin: RRulePluginLike,
  settingsTimeZone: string | undefined | null
) {
  // Save the truly original expand function ONCE
  if (!_originalRRuleExpand) {
    _originalRRuleExpand = rrulePlugin.recurringTypes[0].expand;
  }
  // Non-null assertion safe: assigned above if was null
  const trueOriginalExpand = _originalRRuleExpand;

  rrulePlugin.recurringTypes[0].expand = function (
    errd: RRuleExpandData,
    fr: RRuleFrameRange,
    de: RRuleDateEnvLike
  ) {
    const tzid = errd.rruleSet.tzid();

    if (tzid && settingsTimeZone) {
      const rruleObj = errd.rruleSet as RRuleSetInternal;

      // Critical: bypass FullCalendar's faulty dateEnv.toDate path by expanding directly
      // from rruleSet. We mimic FullCalendar's +/-1 day framing leeway.
      const frameStart = new Date(fr.start);
      const frameEnd = new Date(fr.end);
      const leewayMs = 24 * 60 * 60 * 1000;
      const rangeStart = new Date(frameStart.getTime() - leewayMs);
      const rangeEnd = new Date(frameEnd.getTime() + leewayMs);

      const rawExpandedDates =
        typeof rruleObj.between === 'function' ? rruleObj.between(rangeStart, rangeEnd) : null;

      if (!rawExpandedDates) {
        // Defensive fallback for unexpected rruleSet shapes.
        return trueOriginalExpand.call(this, errd, fr, de);
      }

      return rawExpandedDates.map((d: Date) => {
        // --- Extract stable time components ---
        // _dtstart.getUTCHours() reliably gives the literal hour from the DTSTART string.
        // Use UTC getters for recurrence dates because rrule.js encodes wall-clock values
        // in UTC fields. Local getters can leak system timezone and shift the calendar day.
        const baseHour = rruleObj._dtstart ? rruleObj._dtstart.getUTCHours() : d.getUTCHours();
        const baseMinute = rruleObj._dtstart
          ? rruleObj._dtstart.getUTCMinutes()
          : d.getUTCMinutes();
        const baseSecond = rruleObj._dtstart
          ? rruleObj._dtstart.getUTCSeconds()
          : d.getUTCSeconds();

        // --- Reconstruct correct wall-clock time in the event's SOURCE timezone ---
        // Luxon handles DST automatically: e.g. "11:00 Europe/Bucharest" yields
        // UTC+3 in summer (EEST) and UTC+2 in winter (EET).
        const sourceDt = DateTime.fromObject(
          {
            year: d.getUTCFullYear(),
            month: d.getUTCMonth() + 1, // luxon months are 1-12
            day: d.getUTCDate(),
            hour: baseHour,
            minute: baseMinute,
            second: baseSecond
          },
          { zone: tzid }
        );

        // --- Produce a correct FullCalendar marker ---
        // expand() must return MARKERS: Date objects where UTC fields encode
        // wall-clock time in the display timezone. We pass the true UTC epoch
        // to FullCalendar's own createMarker(), which uses the luxon3 plugin
        // to convert UTC → display-tz wall-clock and store it in UTC fields.
        // This is the same path that non-recurring events take, ensuring
        // correctness for all display timezone combinations.
        const trueUtcMs = sourceDt.toMillis();
        const marker = de.createMarker(new Date(trueUtcMs));

        return marker;
      });
    }

    // Fallback for floating time events without a strict TZID string
    return trueOriginalExpand.call(this, errd, fr, de);
  };
}
