# ActivityWatch Implementation and Algorithms

## End-to-end pipeline

1. Sync determines the fetch window and boundary context.
2. Bucket events are fetched and normalized to `FlattenedEvent`.
3. `executeFSM()` performs:
   - Phase 0: splinter timeline generation
   - Phase 1: profile hypothesis generation
   - Phase 2: greedy best-fit overlap resolution
4. Final blocks are converted into Full Calendar events.
5. Sync applies one of two mutation paths:
  - Continuity rewrite path (delete matched ActivityWatch-owned events, then write rebuilt blocks)
  - Standard overlap path (ignore/extend/replace/create)

## Compound State Discretization

Legacy normalization relied on an overlapping "fidelity flattening" system which destructively forced a 1-dimensional timeline (e.g. `AFK` > `Window` priority). 

This has been eradicated and replaced with **Parallel Compound Time Slicing**.

### Phase 0: Multi-Dimensional Sweepline

A discrete chronologic boundary collector sweeps across all valid ActivityWatch events natively. The sweepline dynamically slices the timeline into segments whenever *any* bucket's event triggers a start or end boundary.

During interval resolution, the pipeline builds a pure `CompoundEvent` slice which maintains a concurrent `states[]` array of all overlapping parallel buckets without forcefully dropping data payloads.

### Browser Metadata Enforcement

Web bucket payload structures are conditionally filtered *during* the Compound slicing initialization matrix. The active sweep iterates identical boundaries checking if an internet-browser `Window` application string is synchronously active in that slice.

By actively suppressing Web payloads when unrelated desktop apps are focused, it surgically eliminates Web watcher background noise without the data loss previously associated with priority-flattening mutations.

## Rule semantics

Rule precedence for each splinter is strict:

1. Hard break
2. Primary evidence
3. Supporting evidence
4. Mismatch

Behavioral invariants:

- Supporting evidence can sustain warmup/active, but cannot start from idle.
- Activation threshold increases only from primary evidence.
- Session commits end at last evidence timestamp, not trailing mismatches.

## Sync-boundary methodology

### Strategy contract

ActivityWatch has two sync strategies:

1. **Sync from Last Checked**
   - Manual sync fetches from `lastSyncTime` to the current run's end time.
   - Automatic sync uses the same strategy on the configured interval.
   - After a successful non-custom sync, `lastSyncTime` is advanced to the run end time.
   - Both manual and automatic syncs advance `lastSyncTime`.
2. **Custom Date Range**
   - Manual-only debug/backfill strategy.
   - Uses the configured explicit start/end dates or explicit override dates.
   - Never advances `lastSyncTime`.
   - Automatic sync is disabled while this strategy is selected.

These strategy rules are architectural invariants. UI, settings persistence, and backend sync must all preserve them.

### Problem being solved

If sync windows are short and a long-running session is sustained mainly by supporting evidence (for example AFK), a fresh FSM run can lose continuity because supporting evidence cannot activate from idle.

### Boundary warm-start

Auto sync now seeds FSM state from the existing calendar event that overlaps `lastSyncTime`.

Selection policy:

- Candidate must overlap sync boundary (`start <= boundary + buffer` and `end >= boundary - buffer`).
- Candidate must match known ActivityWatch profile signature (profile name + color).
- Candidate title must be non-empty after normalization.

Seed policy:

- Seed only when matched profile has supporting evidence rules.
- Seed state is `active`.
- `sessionStartMs` comes from existing event start.
- `lastEvidenceEndMs` is set to boundary time.
- `targetTimeMs` is clamped to threshold, so profile starts as activated.

Result:

- The next run can continue profile continuity from boundary without replaying long history.

## Lookback policy

Auto sync uses bounded lookback:

- Base lookback: `threshold + softBreak + safety`.
- If boundary seed profile exists, use that profile's base lookback.
- Clamp with floor and cap:
  - minimum 30 minutes
  - maximum 6 hours

This bounds runtime and avoids unbounded growth from very long sessions.

## Continuity update policy in calendar

### Continuity rewrite path (preferred when validated)

The continuity rewrite path runs only when all conditions are true:

1. Sync mode is auto (non-custom) and `lastSyncTime > 0`.
2. The latest event in a bounded boundary window is a known ActivityWatch-owned profile event.
3. Reconstructing AW blocks for that exact prior event range yields a normalized title match.
4. ActivityWatch still has source evidence at the prior event start (1-minute tolerance).

If validated:

1. Sync start is re-anchored to prior event start minus continuity buffer.
2. Final blocks are rebuilt from anchor to sync end.
3. Existing ActivityWatch-owned events in the rebuilt range are resolved to cache session ids.
4. Existing ActivityWatch-owned events are deleted from the configured provider.
5. Rebuilt final blocks are written back into the configured provider.
6. `lastSyncTime` advances to sync end after the non-custom sync finishes.

If validation fails, source evidence is missing, delete capability is unavailable, or an existing event cannot be resolved/deleted, the continuity rewrite must not create replacement blocks. Falling through to duplicate add-only behavior is a bug.

Continuity and overlap checks must use normalized/cache-backed provider events. Raw provider reads are not sufficient because Daily Note and similar providers may store profile ownership in the title or in the cache-normalized event shape instead of inline category fields.

### Standard overlap path (fallback)

For each derived block in chronological order:

1. Ignore if already swallowed by an equivalent existing block.
2. Extend matching block when same profile and normalized title continue.
3. Replace stale overlapping ActivityWatch profile blocks when newly derived profile differs.
4. Create block when no existing block can be reused.

This fallback remains active when continuity rewrite is not validated.

## Performance note

Current splinter implementation evaluates each adjacent boundary interval against all events, which can degrade on large windows. The warm-start plus bounded lookback significantly reduces risk. A future optimization is sweep-line active-set splintering for near `O(N log N)` behavior.

## Key implementation anchors

- `src/features/activitywatch/sync.ts`
- `src/features/activitywatch/fsm.ts`
- `src/features/activitywatch/sync.test.ts`
