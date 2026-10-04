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

import { DateTime, FixedOffsetZone, Settings } from 'luxon';
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
  dtstart?: () => Date;
  _rrule?: {
    options?: { tzid?: string | null; until?: Date | null };
    origOptions?: { tzid?: string | null };
  }[];
  _exrule?: {
    options?: { tzid?: string | null; until?: Date | null };
    origOptions?: { tzid?: string | null };
  }[];
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
  // Generated from CLDR common/supplemental/windowsZones.xml (territory "001", the
  // default zone for each Windows ID), with renamed IANA zones written by their current name.
  const windowsToIANA: Record<string, string> = {
    // Dateline / UTC Offsets
    'Dateline Standard Time': 'Etc/GMT+12',
    'UTC-11': 'Etc/GMT+11',
    'UTC-09': 'Etc/GMT+9',
    'UTC-08': 'Etc/GMT+8',
    'UTC-02': 'Etc/GMT+2',
    'UTC': 'Etc/UTC',
    'UTC+12': 'Etc/GMT-12',
    'UTC+13': 'Etc/GMT-13',

    // North America
    'Aleutian Standard Time': 'America/Adak',
    'Hawaiian Standard Time': 'Pacific/Honolulu',
    'Alaskan Standard Time': 'America/Anchorage',
    'Pacific Standard Time': 'America/Los_Angeles',
    'Pacific Standard Time (Mexico)': 'America/Tijuana',
    'US Mountain Standard Time': 'America/Phoenix',
    'Mountain Standard Time': 'America/Denver',
    'Mountain Standard Time (Mexico)': 'America/Mazatlan',
    'Yukon Standard Time': 'America/Whitehorse',
    'Central Standard Time': 'America/Chicago',
    'Central Standard Time (Mexico)': 'America/Mexico_City',
    'Canada Central Standard Time': 'America/Regina',
    'Mexico Standard Time': 'America/Mexico_City',
    'Eastern Standard Time': 'America/New_York',
    'Eastern Standard Time (Mexico)': 'America/Cancun',
    'US Eastern Standard Time': 'America/Indianapolis',
    'Atlantic Standard Time': 'America/Halifax',
    'Newfoundland Standard Time': 'America/St_Johns',

    // Central America & Caribbean
    'Central America Standard Time': 'America/Guatemala',
    'Cuba Standard Time': 'America/Havana',
    'Haiti Standard Time': 'America/Port-au-Prince',
    'Turks And Caicos Standard Time': 'America/Grand_Turk',

    // South America
    'SA Pacific Standard Time': 'America/Bogota',
    'Venezuela Standard Time': 'America/Caracas',
    'SA Western Standard Time': 'America/Caracas',
    'Central Brazilian Standard Time': 'America/Cuiaba',
    'Pacific SA Standard Time': 'America/Santiago',
    'Paraguay Standard Time': 'America/Asuncion',
    'E. South America Standard Time': 'America/Sao_Paulo',
    'SA Eastern Standard Time': 'America/Sao_Paulo',
    'Argentina Standard Time': 'America/Buenos_Aires',
    'Montevideo Standard Time': 'America/Montevideo',
    'Magallanes Standard Time': 'America/Punta_Arenas',
    'Bahia Standard Time': 'America/Bahia',
    'Tocantins Standard Time': 'America/Araguaina',

    // Europe
    'GMT Standard Time': 'Europe/London',
    'Greenwich Standard Time': 'Atlantic/Reykjavik',
    'W. Europe Standard Time': 'Europe/Berlin',
    'Central Europe Standard Time': 'Europe/Budapest',
    'Romance Standard Time': 'Europe/Paris',
    'Central European Standard Time': 'Europe/Warsaw',
    'E. Europe Standard Time': 'Europe/Bucharest',
    'GTB Standard Time': 'Europe/Bucharest',
    'FLE Standard Time': 'Europe/Kyiv',
    'Kaliningrad Standard Time': 'Europe/Kaliningrad',
    'Russian Standard Time': 'Europe/Moscow',
    'Belarus Standard Time': 'Europe/Minsk',
    'Volgograd Standard Time': 'Europe/Volgograd',
    'Astrakhan Standard Time': 'Europe/Astrakhan',
    'Russia Time Zone 3': 'Europe/Samara',
    'Saratov Standard Time': 'Europe/Saratov',
    'Turkey Standard Time': 'Europe/Istanbul',

    // Africa
    'Morocco Standard Time': 'Africa/Casablanca',
    'Sao Tome Standard Time': 'Africa/Sao_Tome',
    'W. Central Africa Standard Time': 'Africa/Lagos',
    'South Africa Standard Time': 'Africa/Johannesburg',
    'Egypt Standard Time': 'Africa/Cairo',
    'E. Africa Standard Time': 'Africa/Nairobi',
    'South Sudan Standard Time': 'Africa/Juba',
    'Sudan Standard Time': 'Africa/Khartoum',
    'Libya Standard Time': 'Africa/Tripoli',
    'Namibia Standard Time': 'Africa/Windhoek',

    // Middle East
    'Jordan Standard Time': 'Asia/Amman',
    'Middle East Standard Time': 'Asia/Beirut',
    'Syria Standard Time': 'Asia/Damascus',
    'West Bank Standard Time': 'Asia/Hebron',
    'Israel Standard Time': 'Asia/Jerusalem',
    'Arabic Standard Time': 'Asia/Baghdad',
    'Arab Standard Time': 'Asia/Riyadh',
    'Iran Standard Time': 'Asia/Tehran',
    'Arabian Standard Time': 'Asia/Dubai',

    // Caucasus & Central Asia
    'Azerbaijan Standard Time': 'Asia/Baku',
    'Georgian Standard Time': 'Asia/Tbilisi',
    'Caucasus Standard Time': 'Asia/Yerevan',
    'Afghanistan Standard Time': 'Asia/Kabul',
    'West Asia Standard Time': 'Asia/Tashkent',
    'Ekaterinburg Standard Time': 'Asia/Yekaterinburg',
    'Pakistan Standard Time': 'Asia/Karachi',
    'Qyzylorda Standard Time': 'Asia/Qyzylorda',
    'Central Asia Standard Time': 'Asia/Almaty',

    // South Asia
    'India Standard Time': 'Asia/Kolkata',
    'Sri Lanka Standard Time': 'Asia/Colombo',
    'Nepal Standard Time': 'Asia/Kathmandu',
    'Bangladesh Standard Time': 'Asia/Dhaka',

    // East & Southeast Asia
    'Myanmar Standard Time': 'Asia/Yangon',
    'SE Asia Standard Time': 'Asia/Bangkok',
    'China Standard Time': 'Asia/Shanghai',
    'Singapore Standard Time': 'Asia/Singapore',
    'Taipei Standard Time': 'Asia/Taipei',
    'Ulaanbaatar Standard Time': 'Asia/Ulaanbaatar',
    'Tokyo Standard Time': 'Asia/Tokyo',
    'North Korea Standard Time': 'Asia/Pyongyang',
    'Korea Standard Time': 'Asia/Seoul',

    // North Asia (Russia)
    'Omsk Standard Time': 'Asia/Omsk',
    'Altai Standard Time': 'Asia/Barnaul',
    'W. Mongolia Standard Time': 'Asia/Hovd',
    'North Asia Standard Time': 'Asia/Krasnoyarsk',
    'N. Central Asia Standard Time': 'Asia/Novosibirsk',
    'Tomsk Standard Time': 'Asia/Tomsk',
    'North Asia East Standard Time': 'Asia/Irkutsk',
    'Transbaikal Standard Time': 'Asia/Chita',
    'Yakutsk Standard Time': 'Asia/Yakutsk',
    'Vladivostok Standard Time': 'Asia/Vladivostok',
    'Russia Time Zone 10': 'Asia/Srednekolymsk',
    'Magadan Standard Time': 'Asia/Magadan',
    'Sakhalin Standard Time': 'Asia/Sakhalin',
    'Russia Time Zone 11': 'Asia/Kamchatka',

    // Australia & Pacific
    'W. Australia Standard Time': 'Australia/Perth',
    'Aus Central W. Standard Time': 'Australia/Eucla',
    'Cen. Australia Standard Time': 'Australia/Adelaide',
    'AUS Central Standard Time': 'Australia/Darwin',
    'E. Australia Standard Time': 'Australia/Brisbane',
    'AUS Eastern Standard Time': 'Australia/Sydney',
    'Tasmania Standard Time': 'Australia/Hobart',
    'Lord Howe Standard Time': 'Australia/Lord_Howe',
    'West Pacific Standard Time': 'Pacific/Port_Moresby',
    'Bougainville Standard Time': 'Pacific/Bougainville',
    'Norfolk Standard Time': 'Pacific/Norfolk',
    'Central Pacific Standard Time': 'Pacific/Guadalcanal',
    'New Zealand Standard Time': 'Pacific/Auckland',
    'Fiji Standard Time': 'Pacific/Fiji',
    'Chatham Islands Standard Time': 'Pacific/Chatham',
    'Tonga Standard Time': 'Pacific/Tongatapu',
    'Samoa Standard Time': 'Pacific/Apia',
    'Line Islands Standard Time': 'Pacific/Kiritimati',
    'Easter Island Standard Time': 'Pacific/Easter',
    'Marquesas Standard Time': 'Pacific/Marquesas',

    // Atlantic & Indian Oceans
    'Azores Standard Time': 'Atlantic/Azores',
    'Cape Verde Standard Time': 'Atlantic/Cape_Verde',
    'Greenland Standard Time': 'America/Godthab',
    'Saint Pierre Standard Time': 'America/Miquelon',
    'Mauritius Standard Time': 'Indian/Mauritius'
  };

  return windowsToIANA[windowsTz] || null;
}

/**
 * Sanitizes a timezone string by trimming whitespace, stripping enclosing quotes,
 * and returning null if empty.
 */
function sanitizeTimezoneString(zone?: string | null): string | null {
  if (!zone || typeof zone !== 'string') {
    return null;
  }
  const clean = zone
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim();
  if (clean.length === 0 || clean.toLowerCase() === 'floating') {
    return null;
  }
  return clean;
}

/**
 * Normalizes a timezone identifier to an IANA timezone identifier.
 * Handles UTC ('Z'), Windows timezone identifiers, and IANA identifiers.
 */
export function normalizeTimezone(zone: string | undefined | null): string {
  const cleanZone = sanitizeTimezoneString(zone);
  if (!cleanZone) {
    return 'utc';
  }

  // Handle UTC
  if (cleanZone === 'Z' || cleanZone.toLowerCase() === 'utc') {
    return 'utc';
  }

  // Check if it's already a valid IANA timezone
  try {
    const testDt = DateTime.now().setZone(cleanZone);
    if (testDt.isValid) {
      return cleanZone;
    }
  } catch {
    // Not a valid IANA timezone, continue to Windows mapping
  }

  // Try to map Windows timezone to IANA
  const mapped = mapWindowsTimezoneToIANA(cleanZone);
  if (mapped) {
    return mapped;
  }

  // Return original if no mapping found (will be handled by caller)
  return cleanZone;
}

/**
 * Resolves and sanitizes the source timezone for an event, falling back in order
 * to an optional fallback timezone, display timezone, or UTC.
 * Strips quotes, normalizes Windows/IANA names, verifies Luxon validity, and preserves uppercase RFC 5545 UTC formatting.
 *
 * @param eventTimezone Timezone identifier declared on the event (if any).
 * @param fallbackZone Fallback timezone identifier if eventTimezone is absent or invalid.
 */
export function resolveSourceZone(
  eventTimezone?: string | null,
  fallbackZone?: string | null
): string {
  const cleanEvent = sanitizeTimezoneString(eventTimezone);
  if (cleanEvent) {
    if (cleanEvent === 'Z' || cleanEvent.toUpperCase() === 'UTC') {
      return 'UTC';
    }
    const norm = normalizeTimezone(cleanEvent);
    try {
      if (DateTime.now().setZone(norm).isValid) {
        return norm;
      }
    } catch {
      // Invalid event timezone, fall through to fallbackZone
    }
  }

  const cleanFallback = sanitizeTimezoneString(fallbackZone);
  if (cleanFallback) {
    if (cleanFallback === 'Z' || cleanFallback.toUpperCase() === 'UTC') {
      return 'UTC';
    }
    const norm = normalizeTimezone(cleanFallback);
    try {
      if (DateTime.now().setZone(norm).isValid) {
        return norm;
      }
    } catch {
      // Invalid fallback timezone, fall through to UTC
    }
  }

  return 'UTC';
}

/**
 * Resolves the effective timezone for an event or display context.
 * Falls back in order: eventTimezone -> settings.displayTimezone -> system timezone -> UTC.
 * Guaranteed to return a valid IANA timezone, 'UTC', or 'local'.
 */
export function resolveEffectiveTimezone(eventTimezone?: string | null): string {
  const clean = sanitizeTimezoneString(eventTimezone);
  if (clean) {
    if (clean === 'Z' || clean.toUpperCase() === 'UTC') {
      return 'UTC';
    }
    const norm = normalizeTimezone(clean);
    try {
      if (DateTime.now().setZone(norm).isValid) {
        return norm;
      }
    } catch {
      // Invalid event timezone, fallback below
    }
  }

  let displayTimezone: string | null | undefined;
  try {
    displayTimezone = PluginState.getSettings().displayTimezone;
  } catch {
    // Settings not yet initialized or in unit test environment
  }
  const defaultZoneName =
    Settings.defaultZone &&
    typeof Settings.defaultZone.name === 'string' &&
    Settings.defaultZone.name !== 'system' &&
    Settings.defaultZone.name !== 'local' &&
    Settings.defaultZone.name !== 'unspecified'
      ? Settings.defaultZone.name
      : undefined;

  const candidate = sanitizeTimezoneString(
    displayTimezone || defaultZoneName || Intl.DateTimeFormat().resolvedOptions().timeZone
  );

  if (candidate) {
    if (candidate === 'Z' || candidate.toUpperCase() === 'UTC') {
      return 'UTC';
    }
    const normCandidate = normalizeTimezone(candidate);
    try {
      if (DateTime.now().setZone(normCandidate).isValid) {
        return normCandidate;
      }
    } catch {
      // Fall through to UTC
    }
  }

  return 'UTC';
}

/**
 * Extracts a YYYY-MM-DD ISO date string representing the local occurrence date of an event.
 * Respects all-day events (UTC) and effective timezone offsets for timed events.
 */
export function getEventInstanceDate(
  start: Date | string | null | undefined,
  allDay: boolean = false,
  timezone?: string | null,
  startStr?: string | null
): string | undefined {
  if (!start) return undefined;
  if (typeof start === 'string') {
    return DateTime.fromISO(start).toISODate() || undefined;
  }
  const effectiveZone = resolveEffectiveTimezone(timezone);
  if (allDay) {
    if (startStr) {
      const fromStr = DateTime.fromISO(startStr).toISODate();
      if (fromStr) return fromStr;
    }
    return (
      DateTime.fromJSDate(start).setZone(effectiveZone).toISODate() ||
      DateTime.fromJSDate(start, { zone: 'utc' }).toISODate() ||
      undefined
    );
  }
  return DateTime.fromJSDate(start).setZone(effectiveZone).toISODate() || undefined;
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
    // Attempt fallback using VTIMEZONE offset if available from ical.Time
    let offsetSeconds: number | undefined;
    const candidateTime = t as unknown as { utcOffset?: () => number };
    try {
      if (typeof candidateTime.utcOffset === 'function') {
        const val = candidateTime.utcOffset();
        if (typeof val === 'number' && !Number.isNaN(val)) {
          offsetSeconds = val;
        }
      }
    } catch {
      // Ignore calculation error
    }

    if (offsetSeconds !== undefined && t.zone && t.zone.tzid && t.zone.tzid !== 'floating') {
      const offsetMinutes = Math.round(offsetSeconds / 60);
      const fixedZone = FixedOffsetZone.instance(offsetMinutes);
      zonedDt = DateTime.fromObject(
        {
          year: t.year,
          month: t.month,
          day: t.day,
          hour: t.hour,
          minute: t.minute,
          second: t.second || 0
        },
        { zone: fixedZone }
      );
      if (zonedDt.isValid) {
        console.warn(
          `Full Calendar Timezone: Unrecognized timezone identifier "${rawZone}". Falling back to VTIMEZONE offset (${zonedDt.zoneName}).`
        );
      }
    }

    // If still invalid or no VTIMEZONE offset was available, fallback to UTC
    if (!zonedDt.isValid) {
      if (rawZone && rawZone !== 'utc') {
        console.warn(
          `Full Calendar Timezone: Unrecognized timezone identifier "${rawZone}" with no valid offset. Falling back to UTC.`
        );
      }
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
    }

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
 * 2. Extracts the calendar date from each recurrence's UTC fields
 * ## What this patch does
 *
 * 1. Temporarily clears `tzid` during `between()` so rrule.js operates in pure floating UTC
 *    mode, completely bypassing its flawed `rezonedDate()` calculation and eliminating
 *    OS/Electron system timezone leakage and cross-midnight date shifts.
 * 2. Aligns any UTC UNTIL boundaries to source timezone wall-clock time so occurrences in
 *    positive UTC offsets are not prematurely clipped.
 * 3. Extracts uncorrupted occurrence dates and hours directly from each generated Date
 *    (fully preserving multi-hour `BYHOUR` rules).
 * 4. Reconstructs the exact Luxon DateTime in the event's source timezone (`tzid`).
 * 5. Translates into the target display timezone using Luxon.
 * 6. Constructs the FullCalendar DateMarker directly in UTC fields
 *    (`new Date(Date.UTC(displayDt.year, displayDt.month - 1, displayDt.day, displayDt.hour, displayDt.minute, displayDt.second, displayDt.millisecond))`),
 *    bypassing FullCalendar's internal DateEnv/createMarker() to eliminate
 *    OS/Electron system timezone leakage.
 */
export function patchRRuleTimezoneExpansion(
  rrulePlugin: RRulePluginLike,
  settingsTimeZone?: string | null
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
    const rsetLike = errd.rruleSet as
      (RRuleSetInternal & { options?: { tzid?: string | null } }) | undefined;
    const hasTzidMethod = typeof rsetLike?.tzid === 'function';
    const rawTzid = hasTzidMethod ? rsetLike?.tzid() : rsetLike?.options?.tzid;
    const tzid =
      rawTzid && typeof rawTzid === 'string' && rawTzid.trim() !== ''
        ? resolveSourceZone(rawTzid)
        : null;

    if (tzid) {
      const activeZone =
        typeof (de as { timeZone?: string })?.timeZone === 'string' &&
        (de as { timeZone?: string }).timeZone !== 'local' &&
        (de as { timeZone?: string }).timeZone !== ''
          ? (de as { timeZone?: string }).timeZone
          : settingsTimeZone;
      const targetDisplayZone = resolveEffectiveTimezone(activeZone);
      const rruleObj = errd.rruleSet as RRuleSetInternal;

      // Critical: bypass FullCalendar's faulty dateEnv.toDate path by expanding directly
      // from rruleSet. We extend leeway to 48 hours to safely span all global timezones (+/- 26h max).
      const frameStart = new Date(fr.start);
      const frameEnd = new Date(fr.end);
      const leewayMs = 48 * 60 * 60 * 1000;
      const rangeStart = new Date(frameStart.getTime() - leewayMs);
      const rangeEnd = new Date(frameEnd.getTime() + leewayMs);

      // Temporarily clear tzid from the rrule set and its child rules during between().
      // When tzid is set, rrule.js runs rezonedDate() which corrupts recurrence dates by
      // subtracting (tzid - system_offset). Clearing tzid ensures rrule.js operates in pure
      // floating UTC, generating uncorrupted wall-clock dates and preserving all BYHOUR entries.
      const originalSetTzid = hasTzidMethod ? rsetLike?.tzid() : rsetLike?.options?.tzid;
      const rrules = Array.isArray(rsetLike?._rrule)
        ? rsetLike._rrule
        : rsetLike?.options
          ? [
              rsetLike as unknown as {
                options?: { tzid?: string | null; until?: Date | null };
                origOptions?: { tzid?: string | null };
              }
            ]
          : [];
      const exrules = Array.isArray(rsetLike?._exrule) ? rsetLike._exrule : [];
      const originalRuleTzids = rrules.map(r => r?.options?.tzid);
      const originalExruleTzids = exrules.map(r => r?.options?.tzid);
      const originalUntils = rrules.map(r => r?.options?.until);
      const originalExruleUntils = exrules.map(r => r?.options?.until);

      let rawExpandedDates: Date[] | null;
      try {
        if (hasTzidMethod) {
          try {
            (rsetLike as unknown as { tzid: (v: string | null) => void }).tzid(null);
          } catch {
            // Getter-only in custom test stubs
          }
        }
        if (rsetLike?.options) {
          rsetLike.options.tzid = null;
        }
        rrules.forEach((r, idx) => {
          if (r?.options) {
            r.options.tzid = null;
            const origUntil = originalUntils[idx];
            if (r.options.until && origUntil) {
              // RFC 5545 specifies UNTIL in UTC for zoned recurrences. Align UTC until
              // to source timezone wall-clock components so rrule.js doesn't drop occurrences
              // in positive timezone offsets.
              const dtLocal = DateTime.fromJSDate(origUntil, { zone: 'utc' }).setZone(tzid);
              if (dtLocal.isValid) {
                r.options.until = new Date(
                  Date.UTC(
                    dtLocal.year,
                    dtLocal.month - 1,
                    dtLocal.day,
                    dtLocal.hour,
                    dtLocal.minute,
                    dtLocal.second,
                    dtLocal.millisecond
                  )
                );
              }
            }
          }
          if (r?.origOptions) {
            r.origOptions.tzid = null;
          }
        });
        exrules.forEach((r, idx) => {
          if (r?.options) {
            r.options.tzid = null;
            const origUntil = originalExruleUntils[idx];
            if (r.options.until && origUntil) {
              const dtLocal = DateTime.fromJSDate(origUntil, { zone: 'utc' }).setZone(tzid);
              if (dtLocal.isValid) {
                r.options.until = new Date(
                  Date.UTC(
                    dtLocal.year,
                    dtLocal.month - 1,
                    dtLocal.day,
                    dtLocal.hour,
                    dtLocal.minute,
                    dtLocal.second,
                    dtLocal.millisecond
                  )
                );
              }
            }
          }
          if (r?.origOptions) {
            r.origOptions.tzid = null;
          }
        });

        // Flush any internal rrule caching to ensure recalculation with cleared tzid
        if ((rruleObj as unknown as { _cache?: unknown })._cache) {
          (rruleObj as unknown as { _cache?: unknown })._cache = null;
        }
        rrules.forEach(r => {
          if ((r as unknown as { _cache?: unknown })?._cache) {
            (r as unknown as { _cache?: unknown })._cache = null;
          }
        });

        rawExpandedDates =
          typeof rruleObj.between === 'function' ? rruleObj.between(rangeStart, rangeEnd) : null;
      } finally {
        if (hasTzidMethod) {
          try {
            (rsetLike as unknown as { tzid: (v: string | null | undefined) => void }).tzid(
              originalSetTzid
            );
          } catch {
            // Getter-only in custom test stubs
          }
        }
        if (rsetLike?.options) {
          rsetLike.options.tzid = originalSetTzid;
        }
        rrules.forEach((r, idx) => {
          if (r?.options) {
            r.options.tzid = originalRuleTzids[idx];
            r.options.until = originalUntils[idx];
          }
          if (r?.origOptions) {
            r.origOptions.tzid = originalRuleTzids[idx];
          }
        });
        exrules.forEach((r, idx) => {
          if (r?.options) {
            r.options.tzid = originalExruleTzids[idx];
            r.options.until = originalExruleUntils[idx];
          }
          if (r?.origOptions) {
            r.origOptions.tzid = originalExruleTzids[idx];
          }
        });
      }

      if (!rawExpandedDates) {
        // Defensive fallback for unexpected rruleSet shapes.
        return trueOriginalExpand.call(this, errd, fr, de);
      }

      return rawExpandedDates.map((d: Date) => {
        // --- Reconstruct correct wall-clock time in the event's SOURCE timezone ---
        // d contains uncorrupted wall-clock values in its UTC fields.
        // Luxon handles DST automatically: e.g. "11:00 Europe/Bucharest" yields
        // UTC+3 in summer (EEST) and UTC+2 in winter (EET).
        const sourceDt = DateTime.fromObject(
          {
            year: d.getUTCFullYear(),
            month: d.getUTCMonth() + 1, // luxon months are 1-12
            day: d.getUTCDate(),
            hour: d.getUTCHours(),
            minute: d.getUTCMinutes(),
            second: d.getUTCSeconds(),
            millisecond: d.getUTCMilliseconds()
          },
          { zone: tzid }
        );

        if (!sourceDt.isValid) {
          return de.createMarker(d);
        }

        // --- Rezone to display timezone and produce FullCalendar DateMarker ---
        // In FullCalendar's internal DateMarker representation, UTC fields store
        // the wall-clock time in the active display timezone.
        // Luxon deterministically computes target display wall-clock time.
        const displayDt = sourceDt.setZone(targetDisplayZone);
        if (!displayDt.isValid) {
          return de.createMarker(new Date(sourceDt.toMillis()));
        }

        return new Date(
          Date.UTC(
            displayDt.year,
            displayDt.month - 1,
            displayDt.day,
            displayDt.hour,
            displayDt.minute,
            displayDt.second,
            displayDt.millisecond
          )
        );
      });
    }

    // Fallback for floating time events without a strict TZID string
    return trueOriginalExpand.call(this, errd, fr, de);
  };
}
