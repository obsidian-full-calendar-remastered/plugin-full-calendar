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

import { DateTime, Settings } from 'luxon';
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
  // Generated from CLDR common/supplemental/windowsZones.xml (territory "001", the
  // default zone for each Windows ID), with renamed IANA zones written by their current name.
  const windowsToIANA: Record<string, string> = {
    'Dateline Standard Time': 'Etc/GMT+12',
    'UTC-11': 'Etc/GMT+11',
    'Aleutian Standard Time': 'America/Adak',
    'Hawaiian Standard Time': 'Pacific/Honolulu',
    'Marquesas Standard Time': 'Pacific/Marquesas',
    'Alaskan Standard Time': 'America/Anchorage',
    'UTC-09': 'Etc/GMT+9',
    'Pacific Standard Time (Mexico)': 'America/Tijuana',
    'UTC-08': 'Etc/GMT+8',
    'Pacific Standard Time': 'America/Los_Angeles',
    'US Mountain Standard Time': 'America/Phoenix',
    'Mountain Standard Time (Mexico)': 'America/Mazatlan',
    'Mountain Standard Time': 'America/Denver',
    'Yukon Standard Time': 'America/Whitehorse',
    'Central America Standard Time': 'America/Guatemala',
    'Central Standard Time': 'America/Chicago',
    'Easter Island Standard Time': 'Pacific/Easter',
    'Central Standard Time (Mexico)': 'America/Mexico_City',
    'Canada Central Standard Time': 'America/Regina',
    'SA Pacific Standard Time': 'America/Bogota',
    'Eastern Standard Time (Mexico)': 'America/Cancun',
    'Eastern Standard Time': 'America/New_York',
    'Haiti Standard Time': 'America/Port-au-Prince',
    'Cuba Standard Time': 'America/Havana',
    'US Eastern Standard Time': 'America/Indiana/Indianapolis',
    'Turks And Caicos Standard Time': 'America/Grand_Turk',
    'Paraguay Standard Time': 'America/Asuncion',
    'Atlantic Standard Time': 'America/Halifax',
    'Venezuela Standard Time': 'America/Caracas',
    'Central Brazilian Standard Time': 'America/Cuiaba',
    'SA Western Standard Time': 'America/La_Paz',
    'Pacific SA Standard Time': 'America/Santiago',
    'Newfoundland Standard Time': 'America/St_Johns',
    'Tocantins Standard Time': 'America/Araguaina',
    'E. South America Standard Time': 'America/Sao_Paulo',
    'SA Eastern Standard Time': 'America/Cayenne',
    'Argentina Standard Time': 'America/Argentina/Buenos_Aires',
    'Greenland Standard Time': 'America/Nuuk',
    'Montevideo Standard Time': 'America/Montevideo',
    'Magallanes Standard Time': 'America/Punta_Arenas',
    'Saint Pierre Standard Time': 'America/Miquelon',
    'Bahia Standard Time': 'America/Bahia',
    'UTC-02': 'Etc/GMT+2',
    'Azores Standard Time': 'Atlantic/Azores',
    'Cape Verde Standard Time': 'Atlantic/Cape_Verde',
    UTC: 'Etc/UTC',
    'GMT Standard Time': 'Europe/London',
    'Greenwich Standard Time': 'Atlantic/Reykjavik',
    'Sao Tome Standard Time': 'Africa/Sao_Tome',
    'Morocco Standard Time': 'Africa/Casablanca',
    'W. Europe Standard Time': 'Europe/Berlin',
    'Central Europe Standard Time': 'Europe/Budapest',
    'Romance Standard Time': 'Europe/Paris',
    'Central European Standard Time': 'Europe/Warsaw',
    'W. Central Africa Standard Time': 'Africa/Lagos',
    'Jordan Standard Time': 'Asia/Amman',
    'GTB Standard Time': 'Europe/Bucharest',
    'Middle East Standard Time': 'Asia/Beirut',
    'Egypt Standard Time': 'Africa/Cairo',
    'E. Europe Standard Time': 'Europe/Chisinau',
    'Syria Standard Time': 'Asia/Damascus',
    'West Bank Standard Time': 'Asia/Hebron',
    'South Africa Standard Time': 'Africa/Johannesburg',
    'FLE Standard Time': 'Europe/Kyiv',
    'Israel Standard Time': 'Asia/Jerusalem',
    'South Sudan Standard Time': 'Africa/Juba',
    'Kaliningrad Standard Time': 'Europe/Kaliningrad',
    'Sudan Standard Time': 'Africa/Khartoum',
    'Libya Standard Time': 'Africa/Tripoli',
    'Namibia Standard Time': 'Africa/Windhoek',
    'Arabic Standard Time': 'Asia/Baghdad',
    'Turkey Standard Time': 'Europe/Istanbul',
    'Arab Standard Time': 'Asia/Riyadh',
    'Belarus Standard Time': 'Europe/Minsk',
    'Russian Standard Time': 'Europe/Moscow',
    'E. Africa Standard Time': 'Africa/Nairobi',
    'Iran Standard Time': 'Asia/Tehran',
    'Arabian Standard Time': 'Asia/Dubai',
    'Astrakhan Standard Time': 'Europe/Astrakhan',
    'Azerbaijan Standard Time': 'Asia/Baku',
    'Russia Time Zone 3': 'Europe/Samara',
    'Mauritius Standard Time': 'Indian/Mauritius',
    'Saratov Standard Time': 'Europe/Saratov',
    'Georgian Standard Time': 'Asia/Tbilisi',
    'Volgograd Standard Time': 'Europe/Volgograd',
    'Caucasus Standard Time': 'Asia/Yerevan',
    'Afghanistan Standard Time': 'Asia/Kabul',
    'West Asia Standard Time': 'Asia/Tashkent',
    'Ekaterinburg Standard Time': 'Asia/Yekaterinburg',
    'Pakistan Standard Time': 'Asia/Karachi',
    'Qyzylorda Standard Time': 'Asia/Qyzylorda',
    'India Standard Time': 'Asia/Kolkata',
    'Sri Lanka Standard Time': 'Asia/Colombo',
    'Nepal Standard Time': 'Asia/Kathmandu',
    'Central Asia Standard Time': 'Asia/Bishkek',
    'Bangladesh Standard Time': 'Asia/Dhaka',
    'Omsk Standard Time': 'Asia/Omsk',
    'Myanmar Standard Time': 'Asia/Yangon',
    'SE Asia Standard Time': 'Asia/Bangkok',
    'Altai Standard Time': 'Asia/Barnaul',
    'W. Mongolia Standard Time': 'Asia/Hovd',
    'North Asia Standard Time': 'Asia/Krasnoyarsk',
    'N. Central Asia Standard Time': 'Asia/Novosibirsk',
    'Tomsk Standard Time': 'Asia/Tomsk',
    'China Standard Time': 'Asia/Shanghai',
    'North Asia East Standard Time': 'Asia/Irkutsk',
    'Singapore Standard Time': 'Asia/Singapore',
    'W. Australia Standard Time': 'Australia/Perth',
    'Taipei Standard Time': 'Asia/Taipei',
    'Ulaanbaatar Standard Time': 'Asia/Ulaanbaatar',
    'Aus Central W. Standard Time': 'Australia/Eucla',
    'Transbaikal Standard Time': 'Asia/Chita',
    'Tokyo Standard Time': 'Asia/Tokyo',
    'North Korea Standard Time': 'Asia/Pyongyang',
    'Korea Standard Time': 'Asia/Seoul',
    'Yakutsk Standard Time': 'Asia/Yakutsk',
    'Cen. Australia Standard Time': 'Australia/Adelaide',
    'AUS Central Standard Time': 'Australia/Darwin',
    'E. Australia Standard Time': 'Australia/Brisbane',
    'AUS Eastern Standard Time': 'Australia/Sydney',
    'West Pacific Standard Time': 'Pacific/Port_Moresby',
    'Tasmania Standard Time': 'Australia/Hobart',
    'Vladivostok Standard Time': 'Asia/Vladivostok',
    'Lord Howe Standard Time': 'Australia/Lord_Howe',
    'Bougainville Standard Time': 'Pacific/Bougainville',
    'Russia Time Zone 10': 'Asia/Srednekolymsk',
    'Magadan Standard Time': 'Asia/Magadan',
    'Norfolk Standard Time': 'Pacific/Norfolk',
    'Sakhalin Standard Time': 'Asia/Sakhalin',
    'Central Pacific Standard Time': 'Pacific/Guadalcanal',
    'Russia Time Zone 11': 'Asia/Kamchatka',
    'New Zealand Standard Time': 'Pacific/Auckland',
    'UTC+12': 'Etc/GMT-12',
    'Fiji Standard Time': 'Pacific/Fiji',
    'Chatham Islands Standard Time': 'Pacific/Chatham',
    'UTC+13': 'Etc/GMT-13',
    'Tonga Standard Time': 'Pacific/Tongatapu',
    'Samoa Standard Time': 'Pacific/Apia',
    'Line Islands Standard Time': 'Pacific/Kiritimati',
    // Legacy Windows ID that CLDR no longer lists
    'Mexico Standard Time': 'America/Mexico_City'
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
 * Resolves the effective timezone for an event or display context.
 * Falls back in order: eventTimezone -> settings.displayTimezone -> system timezone.
 */
export function resolveEffectiveTimezone(eventTimezone?: string | null): string {
  if (eventTimezone && eventTimezone.trim() !== '') {
    return normalizeTimezone(eventTimezone);
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

  return displayTimezone || defaultZoneName || Intl.DateTimeFormat().resolvedOptions().timeZone;
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
  if (allDay) {
    return (
      (startStr ? DateTime.fromISO(startStr).toISODate() : null) ||
      DateTime.fromJSDate(start, { zone: 'utc' }).toISODate() ||
      undefined
    );
  }
  const effectiveZone = resolveEffectiveTimezone(timezone);
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
