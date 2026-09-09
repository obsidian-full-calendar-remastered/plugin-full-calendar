# ActivityWatch Architecture

!!! abstract "Scope"
    This section is the implementation source of truth for ActivityWatch ingestion, FSM derivation, continuity correction, and sync-boundary behavior.

## Module map

| Layer | Responsibility | Primary files |
|---|---|---|
| API access | Fetch bucket metadata and event slices from ActivityWatch server | `src/features/activitywatch/api.ts`, `src/features/activitywatch/sync.ts` |
| Timeline derivation | Slice overlapping watcher streams into parallel compound timeline states | `src/features/activitywatch/sync-derive.ts`, `src/features/activitywatch/fsm.ts` |
| Intent inference | Per-profile FSM hypothesis generation and conflict allocation | `src/features/activitywatch/fsm.ts` |
| Calendar mutation | Sync-from-last-checked continuity rewrite or standard overlap mutation | `src/features/activitywatch/sync.ts`, `src/features/activitywatch/sync-continuity.ts`, `src/features/activitywatch/sync-utils.ts` |
| UI/settings | Profile/rule editing and sync controls | `src/features/activitywatch/ui/ActivityWatchConfigComponent.tsx`, `src/features/activitywatch/ui/ActivityWatchSettingsModal.tsx` |

## Core contracts

- Strategy contract: `Sync from Last Checked` is the only strategy that advances `lastSyncTime`; both manual and automatic runs advance it after a successful non-custom sync.
- Debug-range contract: `Custom Date Range` is manual-only debug/backfill behavior. It never advances `lastSyncTime` and automatic sync is disabled while it is selected.
- Input contract: ActivityWatch bucket events are normalized to bucket events and sliced into `CompoundEvent` intervals.
- Session contract: FSM emits profile candidates, then best-fit allocator emits final blocks.
- Output contract: Final blocks are materialized as timed single `OFCEvent` entries in the configured target calendar.
- Calendar-read contract: ActivityWatch overlap and continuity logic must operate on normalized/cache-backed events, not raw provider reads, because providers such as Daily Note store profile/category ownership in titles or cache metadata rather than inline fields.

## Reading order

1. [Implementation and Algorithms](implementation.md)
2. [User behavior controls](../../user/calendars/activitywatch.md)
3. [System event ownership](../system/eventcache.md)
