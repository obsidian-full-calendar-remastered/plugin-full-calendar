# Performance & Staged Loading

!!! abstract "Philosophy"
    Full Calendar is designed to be **instant-on**, even for vaults with thousands of events spread across years of history. We achieve this through a staged loading strategy, non-blocking main-thread yields, zero-allocation structural change detection, reactive vault-backed parse caching, and efficient lookahead indexing.

## Staged Loading Sequence & Provider Priority Tiers

When the plugin initializes (or when a full resync is triggered), the `ProviderRegistry` executes a non-blocking, multi-tier staged fetch based on each provider's `loadPriority` and `isRemote` classification:

### Load Priority Classification Rules

| Tier | Priority Range | Execution Characteristics | Providers |
| :--- | :---: | :--- | :--- |
| **Stage 0 (Local Sync)** | `loadPriority < 100` | Fetched immediately and synchronously during startup. UI populates without waiting for network I/O. | `FullNoteProvider` (10)<br>`DailyNoteProvider` (20)<br>`TasksPluginProvider` (30)<br>`TaskNotesProvider` (40) |
| **Stage 1 & 2 (Remote Async)** | `loadPriority >= 100` | Fetched asynchronously in background waves using range filtering and yielding. | `CalDAVProvider` (110)<br>`GoogleProvider` (120)<br>`GoogleTasksProvider` (125)<br>`ICSProvider` (140)<br>`OutlookProvider` (150) |

### Stage Breakdown

#### Stage 1 (Local): The Critical Window
- **Range**: Current Date ± 3 months (`stage1Range`).
- **Goal**: Immediate UI population from local vault notes (Time to Interactive < 250ms).
- **Behavior**: Local providers (`loadPriority < 100`) load range-filtered events. Once complete, `onAllComplete()` fires so the calendar UI becomes interactive immediately.

#### Stage 2 (Local): Background Vault Notes
- **Range**: All time (Full Vault History).
- **Goal**: Searchability and long-term local event completeness.
- **Behavior**: Processes full local provider datasets in the background. Batched file loading (`BATCH_SIZE = 20`) with `yieldToMainThread()` ensures zero main-thread UI stutters.

#### Stage 1 (Remote): Critical Window Remote Sync
- **Range**: Current Date ± 3 months.
- **Goal**: Fetch visible remote events without blocking UI interactions.
- **Behavior**: Fetches active range events for remote providers (CalDAV, Google, Google Tasks, ICS, Outlook).

#### Stage 2 (Remote): Background Remote Sync & Optimization
- **Range**: All time (Full Remote History).
- **Goal**: Complete remote calendar sync.
- **Behavior**: Fetches remaining remote historical data. For read-only remote providers (like ICS feeds) where Stage 1 already retrieved the full payload, Stage 2 skips redundant network re-downloads and re-parsing.

---

## Reactive In-Memory Daily Note Parse Cache (`DailyNoteParseCache`)

To eliminate disk I/O and line-parsing bottlenecks when scanning daily notes:
- **`mtime` + `size` Validation**: Stores parsed `[OFCEvent, EventLocation | null][]` arrays in memory. On subsequent reads, if `file.stat.mtime` and `file.stat.size` match the cached entry, the provider returns the cached events in **0ms** (bypassing disk read and regex parsing).
- **Reactive Vault Invalidation**: Binds directly to Obsidian `Vault` lifecycle events (`vault.on('modify')`, `vault.on('delete')`, `vault.on('rename')`) to clear/evict modified file entries immediately, guaranteeing zero stale data.

---

## Zero-Allocation Structural Equality (`areEventsEqual`)

During cache delta syncs (`CacheSyncHandler.syncCalendar()`):
- Replaces expensive `JSON.stringify()` serialization with direct scalar property comparisons across all `OFCEvent` discriminator branches (`single`, `recurring`, `rrule`).
- **Zero Allocations & Zero Hash Collisions**: Executes in nanoseconds per event pair, generates 0 temporary string allocations, and eliminates 32-bit hash collision risks completely.

---

## Streamlined Lookahead Window Filtering (`TimeEngine`)

`TimeEngine` maintains a rolling **7-day lookahead cache** for notifications and status bar updates:
- **$O(1)$ Fast Date String Filtering**: Skips single events outside the `[now - 24h, now + 7d]` window using scalar date string comparisons before allocating Luxon `DateTime` objects or running timezone math.
- Keeps occurrence cache rebuilds bounded under **< 5ms** even in vaults containing thousands of historical single events.

---

## Cross-Platform Idle Scheduling & Main-Thread Yielding (`runWhenIdle` & `yieldToMainThread`)

To ensure heavy background syncs never freeze the UI across desktop and mobile platforms:
- **Cross-Platform `runWhenIdle`**: Polyfills `requestIdleCallback` with fallback to `window.setTimeout()` and `window.clearTimeout()`, guaranteeing reliable execution on Electron Desktop and WebKit Mobile (iOS/iPadOS/Android).
- **Batched Yielding**: Long-running loops (e.g. daily note scans) yield execution back to the browser event loop using `await yieldToMainThread()` between batches.
- **Strict Zero-Overhead Guard**: Evaluates `LoadDebugProfiler.isEnabled` before capturing any timing metrics.

---

## Load Debug Profiler (`LoadDebugProfiler`)

A high-performance diagnostic timing engine tracks plugin startup, staging, and indexing performance:

### Zero-Overhead Architecture
- When disabled (`LoadDebugProfiler.isEnabled === false`), all profiler entry points (`startStage`, `startProvider`, `endProvider`, `startPhase`, `endPhase`, `recordYield`) evaluate `if (!this.enabled) return;` immediately on entry.

### Metrics Captured
1. **Startup Milestones**:
   - `onloadDurationMs`: Time spent in `plugin.onload()`.
   - `timeToLayoutReadyMs`: Delay from plugin start until Obsidian workspace layout is ready.
   - `layoutReadyToPopulateMs`: Delay from layout ready until cache population starts.
   - `totalPopulateDurationMs`: Total wall-clock time required for cache population.
2. **Stage & Provider Metrics**:
   - Total duration and provider breakdowns for `Stage 1 Local`, `Stage 2 Local`, `Stage 1 Remote`, `Stage 2 Remote`.
   - Individual provider status (`OK` / `FAILED`), event counts, and timing.
3. **Internal Processing Phases**:
   - `Cache Delta Sync & Indexing`: Measure of 3-way set diffing, identity re-mapping, and `EventStore` updates in `CacheSyncHandler`.
   - `TimeEngine Setup & Map Building`: Timing of initial `TimeEngine` initialization and global provider identifier map creation.
4. **Overhead & Post-Processing**:
   - `totalYieldDurationMs`: Accumulated time spent yielding to the main thread across all `yieldToMainThread()` calls.
   - `unaccountedDurationMs`: Remaining duration computed via `totalPopulateDuration - (stages + phases + yields)`, guaranteeing 100% accounting.

### UI & Inspection Architecture
- **On-Demand Benchmark Modal**: `showLoadDebugLogModal` uses `CopyTextModal` to display a formatted breakdown, copy the report to clipboard, or re-run a live benchmark on demand via `runBenchmarkAndGetReport()`.

---

## Efficient In-Memory Indexing (`EventStore`)

To ensure that dragging events and switching views remains fluid, the `EventStore` maintains multiple synchronous indexes:

1. **Primary Map**: `SessionID -> Event`. (O(1) access for UI updates).
2. **Calendar Index**: `CalendarID -> Set<SessionID>`. (Fast filtering when toggling calendar visibility).
3. **Path Index**: `FilePath -> Set<SessionID>`. (Instant updates when a file is modified externally).

---

## Optimistic UI & Rollback

Every user-initiated change (drag, resize, edit) follows an **Optimistic Pattern**:
1. The `EventCache` updates the in-memory `EventStore` and notifies the UI **immediately**.
2. The UI re-renders without waiting for file I/O or network responses.
3. The `ProviderRegistry` attempts the durable write in the background.
4. **Failure Path**: If the write fails (e.g., network timeout, file locked), the cache **rolls back** the in-memory change and triggers a second UI update to revert the event to its original position.

---

## Memory Management

- **Event Pruning**: Remote providers (like Google) implement a rolling cache. Events far outside the viewport are eventually purged from memory and re-fetched as needed to prevent unbounded memory growth.
- **Stateless Enhancers**: Normalization (Timezones, Categories) is performed by stateless functions to avoid object-bloat and reference-leakage.

---

[Event Cache](eventcache.md) · [Provider Architecture](../calendars/architecture.md) · [Data Flow](data-flow.md)
