# Timezone Architecture

!!! abstract "Timezone contract"
    Timezone logic must preserve event meaning across three zones: source timezone (event authority), display timezone (user view), and system timezone (runtime host). Any drift between these boundaries is a correctness bug.

## Core model

| Zone | Ownership | Usage |
|---|---|---|
| SourceTZ | Provider/event payload | Persisted event meaning and recurrence authority. |
| DisplayTZ | User setting | Calendar rendering and user-facing edits. |
| SystemTZ | Host environment | Runtime baseline and fallback behavior only. |

`EventEnhancer` applies read-path normalization (`enhance`) and write-path reversal (`prepareForStorage`) so core state stays canonical while providers receive source-appropriate payloads.

## RRULE patch architecture

The codebase includes a non-trivial recurrence patch path to compensate for timezone detection weaknesses in upstream FullCalendar RRULE handling.

!!! warning "Patch intent"
    The patch avoids system-timezone leakage and preserves source-zone recurrence semantics by reconstructing recurrence expansion with UTC-safe operations.

For root cause details, fix strategy, and regression coverage, see the dedicated devlog: [RRULE Timezone Date-Shift Fix](../../dev-logs/devlog_rrule_timezone_patch.md).

This behavior exists to prevent day/weekday drift around DST and timezone boundary transitions when `DTSTART;TZID=...` forms are not correctly handled upstream.

## ICS and timezone normalization

Timezone handling includes normalization of IANA, UTC, and common Windows timezone identifiers during ICS ingestion. Parsing and fallback logic are intentionally defensive to avoid malformed payload breakage.

## ICS timezone serialization on write paths

When exporting events back to ICS files or CalDAV servers (e.g. Nextcloud), the plugin maintains explicit timezone context.
Due to underlying `ical.js` serialization constraints (where `ical.Time` properties discard timezone names on serialization unless specified as UTC or explicitly set as parameters), the plugin explicitly sets the `tzid` parameter on target properties (such as `DTSTART`, `DTEND`, `EXDATE`, and `RECURRENCE-ID`) when a named non-UTC timezone is set.

This prevents the events from being written with floating timezones, ensuring CalDAV servers and other calendar clients preserve the correct timezone and do not experience shifts on resync.

## Invariants for contributors

- Never mix local date getters into UTC reconstruction steps for patched recurrence output.
- Keep source-zone authority for recurring interpretation.
- Validate changes against timezone and DST-focused tests before merging.
- Update architecture docs for any timezone-path behavior change.

## Integration anchors

- `src/features/timezone/Timezone.ts`
- `src/core/EventEnhancer.ts`
- `src/core/interop.ts`
- `src/providers/ics/ics.ts`
- `src/providers/caldav/CalDAVProvider.ts`
