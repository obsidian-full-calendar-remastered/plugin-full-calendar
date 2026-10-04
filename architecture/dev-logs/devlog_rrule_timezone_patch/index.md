# Devlog: RRULE Timezone Date-Shift Fix

This page documents a recurring-event timezone bug that shifted events by one day in some system timezone combinations, and how we fixed it in plugin code.

## Summary

A weekly recurring ICS event with `DTSTART;TZID=...` could appear on the wrong date (for example, Saturday instead of Friday) when both the plugin display timezone and system timezone were set to `Asia/Shanghai`.

The event payload itself was correct. The shift happened during recurrence expansion.

## Affected Libraries and Versions

From this plugin version context:

- FullCalendar core: `@fullcalendar/core` `^6.1.18`
- FullCalendar rrule plugin: `@fullcalendar/rrule` `^6.1.18` (installed `6.1.18`)
- rrule.js library: `rrule` `^2.8.1` (installed `2.8.1`)

## Root Cause

In `@fullcalendar/rrule` `6.1.18`, `analyzeRRuleString()` only checks `DTSTART:` with this regex style:

- `\b(DTSTART:)([^\n]*)`

It does not match `DTSTART;TZID=...:`.

Because timezone detection is then treated as unspecified, expansion can go through a path that applies `dateEnv.toDate(...)` before marker creation. For timezone-aware RRULE text, this can produce marker dates with shifted calendar-day semantics.

## Symptom Pattern

- Parsed ICS start/end and RRULE are correct.
- Event cache and EventInput generation are correct.
- First wrong value appears in recurrence expansion output.
- Wrong calendar day is then preserved into rendered events.

## Plugin-Side Fix

File:

- `src/features/timezone/Timezone.ts`

Function:

- `patchRRuleTimezoneExpansion(...)`

What changed:

1. We bypass FullCalendar's wrapped `expand(...)` output for timezone-aware RRULEs.
2. We expand directly from `rruleSet.between(...)` with the same framing leeway (`-1 day` / `+1 day`) used by FullCalendar.
3. We reconstruct source-zone occurrence datetimes using:
- UTC date fields from the raw recurrence date (`getUTCFullYear/getUTCMonth/getUTCDate`)
- stable wall-clock time from `_dtstart` UTC fields (`getUTCHours/getUTCMinutes/getUTCSeconds`)
4. We convert that source datetime to true UTC milliseconds.
5. We pass true UTC into `createMarker(...)`.

This avoids the incorrect `toDate(...)` branch behavior and avoids system-local date leakage.

## Why UTC Getters Matter

Using local getters (`getFullYear/getDate`) on recurrence Date objects can leak system timezone effects and shift weekday/date. Using UTC getters keeps reconstruction stable across environments.

## Regression Coverage

Test file:

- `src/features/timezone/Timezone.test.ts`

Key checks:

- The Asia/Shanghai weekly case remains on Friday.
- Fallback to original behavior still works when `tzid` is missing.

The test is intended to prevent this date-shift bug from silently returning.

## Notes for Future Maintenance

- If upgrading `@fullcalendar/rrule`, re-check whether `DTSTART;TZID=...` detection is fixed upstream.
- Keep this patch until upstream behavior is verified safe for all timezone combinations.
- Re-run timezone recurrence tests whenever FullCalendar or rrule dependencies change.
