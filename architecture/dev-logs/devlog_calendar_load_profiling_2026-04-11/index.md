# Devlog: Calendar Load Profiling Audit

## v0.12.8.3 - Algorithm A & C Validation

### Overview

This update validates the performance impact of implementing Algorithm A (Keyed Identity Diffing) and Algorithm C (Reverse-Index Mapping) to resolve the syncCalendar bottleneck.

### Performance Comparison Table

| Metric (DailyNote Stage-2 Sync) | v0.12.8.2 (Baseline) | v0.12.8.3 (Optimized) | Delta |
| :--- | :--- | :--- | :--- |
| **Total Sync Time** | **~5137ms** | **~1482ms** | **-71.1%** |
| diffPrepMs | ~4942ms | ~1283ms | -74.0% |
| **removeMappingMs** | **~1648ms** | **~0.2ms** | **-99.9%** |
| addMappingMs | ~3292ms | ~1279ms | -61.1% |

### Key Findings

1. **Algorithm C Success**: The transition to a sessionId-based reverse index for removals was a total success. `removeMappingMs` essentially vanished from the profile (1.6s -> 0ms).
2. **Synchronization Gain**: The overhead of diffing is now drastically lower due to Keyed Identity Diffing. However, a significant stall remains in the "addition" path.
3. **Remaining Bottleneck: addMapping Parsing Pressure**: addMappingMs still consumes ~1.3 seconds during large syncs. New instrumentation shows this is because addMapping continues to call getEventHandle(), which triggers expensive file parsing (slow getEventsInFile) even when the identity is deterministically known via the sync key.
4. **UI Thread Impact**: While the main thread stall is shorter, it is still long enough to trigger JXL violations (~164ms RAF handler).

### Next Steps

- **Optimize addMapping**: Modify ProviderRegistry.addMapping to accept or leverage the SyncKey to avoid redundant provider calculations.
- **Batching**: Investigate batching or yielding during the `ewLoop` to prevent the UI thread from freezing for >1s during massive additions.

---

## v0.12.8.2 - Algorithm A & C Validation

- Date: 2026-04-11
- Plugin version context: `0.12.8.2`
- Investigation scope: calendar open latency, staged loading behavior, and large-update responsiveness
- Primary evidence source: runtime trace log from Obsidian developer console
- Status: investigation complete; profiling instrumentation added and validated in follow-up run

## Executive Summary

The strongest bottleneck is not initial stage-1 fetching and not the first blank-to-calendar render.

The largest single cost in the captured trace is `EventCache.syncCalendar()` during the large Daily Note stage-2 update from **716 -> 1413** Daily Note events:

- Daily Note provider full fetch (`268` files, `1413` events): about `321ms`
- EventCache large sync (`previousCount=716`, `incomingCount=1413`): about `4106ms`
- Dominant substep inside EventCache sync (`removeCount=716`, `addCount=1413`): `diffPrepMs` about `3916ms`
- Subsequent UI refresh after that sync (`totalVisibleEvents=1413`): about `351ms`

Important context: a smaller but still material Daily Note stage-1 synchronization also occurs earlier (`0 -> 716` events), with `EventCache.syncCalendar()` at about `1464ms` (`diffPrepMs` about `1347ms`).

By comparison, the initial blank-to-calendar path is materially smaller:

- Total `setViewState()` completion: about `151ms`
- First animation frame after FullCalendar render: about `153ms`
- Initial FullCalendar render: about `69-71ms`
- Local stage-1 fetch: about `3-5ms` (`5` events)

Follow-up (same day) with deeper bottleneck logs enabled by default confirms the dominant internal culprit:

- Stage-1 Daily Note diff prep (`0 -> 716`): about `1680ms`
  - `addMappingMs`: about `1679ms`
- Stage-2 Daily Note diff prep (`716 -> 1413`): about `4942ms`
  - `removeMappingMs`: about `1648ms`
  - `addMappingMs`: about `3292ms`

This isolates the hotspot to provider-registry mapping operations during cache diff prep, not provider fetch and not initial render.

## Key Findings

1. The initial blank page is real, but it is not the dominant performance problem.
2. The biggest bottleneck is cache synchronization and identifier/mapping preparation for large Daily Note payloads (especially the stage-2 `716 -> 1413` merge path).
3. The next most expensive area is post-sync UI rebuild work:
   `ViewEnhancer.getEnhancedData()` plus FullCalendar source replacement.
4. Provider fetch/parsing for Daily Notes is meaningful (`251ms` for range-limited stage-1, `321ms` for full stage-2), but still much smaller than cache sync costs (`1464ms` and `4106ms`).
5. Small remote calendars and local stage-1 work are not performance-critical in this trace.
6. Follow-up deep profiling shows `addMapping(...)` and `removeMapping(...)` account for almost all `diffPrepMs` on large Daily Note syncs.

## Instrumentation Coverage

This investigation added profiling logs to the following runtime areas:

- `src/main.ts`
- `src/ui/view.ts`
- `src/ui/settings/sections/calendars/calendar.ts`
- `src/core/EventCache.ts`
- `src/core/ViewEnhancer.ts`
- `src/providers/ProviderRegistry.ts`
- `src/providers/dailynote/DailyNoteProvider.ts`

The logs capture:

- view activation and `setViewState()` timing
- `onOpen()` progression
- `loadSettings()` timing
- stage-1 and stage-2 provider timings
- Daily Note range filtering and per-file parse timing
- cache enhancement, compare, diff preparation, store writes, and flush timing
- `ViewEnhancer.getEnhancedData()` timing
- FullCalendar module load, calendar construction, and `cal.render()` timing
- post-update source removal/addition and next-frame timing

Follow-up instrumentation also captures:

- `syncCalendar` diff-prep internal breakdown (`oldLoopMs`, `newLoopMs`, `removeMappingMs`, `addMappingMs`, `generateIdMs`)
- partial-update UI source work split (`sourceLookupMs`, `sourceAddMs`, found/missing counts)

## Profiling Results

### 0. Follow-Up Deep-Profiling Run (After Instrumentation)

This section summarizes the newer trace captured after enabling detailed bottleneck logs by default.

Initial-open path in this run is slower than the baseline, but still not the dominant issue:

- `setViewState()` completion: about `266ms`
- first frame after FullCalendar render: about `270ms`

Daily Note provider work in this run:

- stage-1 provider (`101` files, `716` events): `totalMs` about `390ms`
- stage-2 provider (`268` files, `1413` events): `totalMs` about `438ms`

Daily Note cache sync in this run:

- stage-1 sync (`0 -> 716`): `totalMs` about `1811ms`, `diffPrepMs` about `1680ms`
- stage-2 sync (`716 -> 1413`): `totalMs` about `5137ms`, `diffPrepMs` about `4942ms`

Diff-prep substep attribution (new evidence):

- stage-1 (`0 -> 716`):
  - `newLoopMs`: `1680.2ms`
  - `addMappingMs`: `1679.3ms`
  - `generateIdMs`: `0.3ms`
- stage-2 (`716 -> 1413`):
  - `oldLoopMs`: `1648.5ms`
  - `removeMappingMs`: `1648.2ms`
  - `newLoopMs`: `3293.8ms`
  - `addMappingMs`: `3291.8ms`
  - `generateIdMs`: `0.2ms`

Interpretation:

- `addMapping(...)` and `removeMapping(...)` dominate `diffPrepMs` almost entirely.
- `generateId()` is negligible.
- provider fetch remains materially smaller than cache sync.

UI refresh after large stage-2 sync in this run:

- `ViewEnhancer.getEnhancedData()`: about `187.6ms`
- source removal: about `4.8ms`
- source addition: about `159ms`
- total view update work: about `355.4ms`
- next frame after update: about `361.8ms`
- detailed UI split:
  - `sourceLookupMs`: about `0ms`
  - `sourceAddMs`: about `159ms`

Interpretation:

- UI remains a secondary bottleneck.
- For this path, source lookup is negligible; source add and enhancement dominate UI update cost.

### 1. Initial Open Path

Observed opening sequence:

- `activateView()` started trace
- `onOpen()` entered at about `13ms`
- `loadSettings()` finished at about `22ms`
- `cache.populate()` finished at about `71ms`
- shell DOM created at about `72ms`
- `renderCalendar()` called at about `73ms`
- FullCalendar `cal.render()` completed at about `69.4ms` inside render step
- `setViewState()` finished at about `151ms`
- first post-render animation frame landed at about `153ms`

Interpretation:

- The initial blank-to-not-blank path is not dominated by provider I/O.
- The biggest visible cost during initial open is FullCalendar's first render.

### 2. Stage-1 Provider Costs

Local stage-1:

- `local_1` fetch: `3.3ms` (`5` events)
- local stage-1 complete: `5.1ms`

Remote stage-1 small calendars:

- `ical_1`: `1` event in about `122ms`
- `ical_2`: `4` events in about `129ms`
- `ical_3`: `1` event in about `131ms`
- `dailynote_3` stage-1 (range-limited): `716` events in about `252ms` provider time

Interpretation:

- Small remote providers are not causing the multi-second stall seen later.
- Local stage-1 fetch is fast and not a bottleneck.
- Daily Note stage-1 provider work is moderate, but the dominant stage-1 cost is the subsequent EventCache sync.

### 3. Daily Note Provider Costs

Range-limited stage-1 setup:

- Daily Note range filter: `268` files down to `101` files in `2.6ms`

Stage-1 (range-limited) Daily Note fetch:

- `filesProcessed`: `101`
- `totalEvents`: `716`
- `fetchMs`: `241.3ms`
- `totalMs`: `251.4ms`

Full stage-2 Daily Note fetch:

- `filesProcessed`: `268`
- `totalEvents`: `1413`
- `fetchMs`: `318.7ms`
- `totalMs`: `321ms`

Per-file trace pattern:

- many files show total times roughly `120ms` to `310ms`
- most of that time is reported under `parseMs`
- metadata wait is much smaller, generally about `4ms` to `9ms`

Interpretation:

- Daily Note parsing is non-trivial and clearly worth attention.
- However, both stage-1 and stage-2 provider fetches remain far smaller than the cache synchronization costs that follow.

### 4. EventCache Costs

Small calendars:

- `local_1` stage-1 sync: about `1ms`
- `ical_1` sync: about `1.5ms`
- `ical_2` sync: about `0.5ms`
- `ical_3` sync: about `0.4ms`

Daily Note stage-1 sync:

- `incomingCount`: `716`
- `previousCount`: `0`
- `enhanceMs`: `2.7ms`
- `diffPrepMs`: `1347ms`
- `storeMs`: `0.6ms`
- `flushMs`: `113.5ms`
- `totalMs`: `1464ms`

Large Daily Note stage-2 sync:

- `incomingCount`: `1413`
- `previousCount`: `716`
- `enhanceMs`: `5.1ms`
- `diffPrepMs`: `3915.6ms`
- `storeMs`: `1ms`
- `flushMs`: `183.8ms`
- `totalMs`: `4105.8ms`

Interpretation:

- The dominant bottleneck in the full trace is `diffPrepMs`.
- Event enhancement itself is cheap.
- Store writes are cheap.
- The expensive work is in preparing removals/additions and related identifier/mapping work before store commit.
- This pattern holds at both Daily Note stages, but the stage-2 (`716 -> 1413`) merge path is substantially worse.

### 5. View and Render Costs After Large Sync

For the large Daily Note update:

- view received update at about `6012ms`
- `ViewEnhancer.getEnhancedData()`: `183ms`
- source removal: `4.8ms`
- source addition: `159ms`
- total view update render work: `350.7ms`
- next animation frame after update: `359.2ms`

Interpretation:

- Post-sync rendering is expensive, but still much smaller than the cache sync bottleneck.
- The two main costs here are:
  - `ViewEnhancer.getEnhancedData()`
  - FullCalendar source re-addition

Additional runtime signal:

- browser violation logged: `'requestAnimationFrame' handler took 164ms`
- browser violation logged: `'wheel' input event was delayed for 2488 ms due to main thread being busy`

## Bottleneck Ranking

Based on the latest deep-profiled trace, the main bottlenecks rank as follows:

1. `EventCache.syncCalendar()` stage-2 `diffPrepMs` (`716 -> 1413`): about `4942ms`
2. `addMapping(...)` inside stage-2 diff prep: about `3292ms`
3. `removeMapping(...)` inside stage-2 diff prep: about `1648ms`
4. Full `EventCache.syncCalendar()` stage-2 total: about `5137ms`
5. Full `EventCache.syncCalendar()` stage-1 total: about `1811ms`
6. `EventCache.syncCalendar()` stage-1 `diffPrepMs`: about `1680ms`
7. View refresh after large stage-2 sync: about `355ms`
8. Daily Note provider full fetch and parse (stage-2): about `438ms`
9. Daily Note provider range-limited fetch and parse (stage-1): about `390ms`

## Current Conclusion

The biggest bottleneck is the cache synchronization layer, specifically provider-registry mapping operations (`addMapping(...)` and `removeMapping(...)`) inside `EventCache.syncCalendar()` diff preparation for large Daily Note payload merges.

The current evidence does not support the idea that "fetching a couple of events" is the main problem. In this trace, the high-cost path is large-volume cache prep and subsequent view rebuild work after the Daily Note provider returns a much bigger payload.

More specifically:

- provider fetch for `1413` Daily Note events is about `438ms` in the latest run
- cache sync for the same update is about `5137ms`
- the dominant share of that sync is `diffPrepMs` at about `4942ms`
- inside that `diffPrepMs`, `addMappingMs` (`~3292ms`) + `removeMappingMs` (`~1648ms`) explain essentially all of the cost

## Suggested Next Profiling Pass

`diffPrepMs` has now been split and the dominant substeps are known. The next profiling pass should go one level deeper inside provider-registry mapping:

- `getGlobalIdentifier(...)` internals
- provider `getEventHandle(...)` internals
- map/set operations and key construction in mapping structures
- object allocation and string-generation pressure along mapping paths

It would also be useful to refine UI profiling for the large update path:

- `addEventSource(...)` cost per source (confirmed meaningful)
- event mount count and `eventDidMount` pressure

`sources.find(...)` cost is currently negligible in this path, but should still be monitored for higher source-count configurations.

## Decision Record

- Profiling instrumentation was added during this investigation to isolate diff-prep and UI substep costs.
- No optimization was applied yet; this document records measurement evidence only.
- The purpose of this dev log is to preserve evidence before implementation work begins.
- This document has been reconciled against the raw trace to ensure timing and event-count accuracy for both Daily Note stage-1 and stage-2 paths.

