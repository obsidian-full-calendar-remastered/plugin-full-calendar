# Performance & Staged Loading

!!! abstract "Philosophy"
    Full Calendar is designed to be **instant-on**, even for vaults with thousands of events spread across years of history. We achieve this through a staged loading strategy and an efficient in-memory indexing system.

## Staged Loading Sequence

When the plugin initializes (or when a full resync is triggered), the `ProviderRegistry` executes a four-phase non-blocking staged fetch:

### Stage 1 (Local): The Critical Window
- **Range**: Current Date ± 3 months (`stage1Range`).
- **Goal**: Immediate UI population from local vault notes.
- **Behavior**: Local providers (priority < 100) load range-filtered events. Once complete, `onAllComplete()` fires so the calendar UI becomes interactive immediately.

### Stage 2 (Local): Background Vault Notes
- **Range**: All time (Full Vault History).
- **Goal**: Searchability and long-term local event completeness.
- **Behavior**: Processes full local provider datasets in the background.

### Stage 1 (Remote): Critical Window Remote Sync
- **Range**: Current Date ± 3 months.
- **Goal**: Fetch visible remote events without blocking UI interactions.
- **Behavior**: Fetches active range events for remote providers (CalDAV, Google, Outlook, ICS).

### Stage 2 (Remote): Background Remote Sync & Optimization
- **Range**: All time (Full Remote History).
- **Goal**: Complete remote calendar sync.
- **Behavior**: Fetches remaining remote historical data. For read-only remote providers (like ICS feeds) where Stage 1 already retrieved the full payload, Stage 2 skips redundant network re-downloads and re-parsing.

## Non-Blocking Main-Thread Yielding (`yieldToMainThread`)

To ensure that heavy event parsing (e.g. `ical.js` ICS payload parsing, recurrence expansions, array diffing) never freezes the Obsidian UI:
- Every provider fetch and stage transition in `ProviderRegistry` yields control to the browser event loop using `await yieldToMainThread()`.
- Uses `requestIdleCallback` (with a 50ms fallback timeout) or `window.setTimeout(0)`.
- This ensures mouse clicks, typing, UI animations, and layout recalculations remain smooth during background sync operations.

## Load Debug Profiler (`LoadDebugProfiler`)

A dedicated diagnostic timing engine tracks plugin startup and staging performance:
- **Zero-Overhead Guard**: When disabled in settings (`loadDebugTiming: false`), all method calls evaluate `if (!this.enabled) return;` for zero performance impact.
- **Metrics Tracked**:
  - Initial plugin startup (`onload()`, `onLayoutReady()`, time to `cache.populate()`).
  - Stage totals (`Stage 1 Local`, `Stage 2 Local`, `Stage 1 Remote`, `Stage 2 Remote`).
  - Individual provider duration, event count, and status (`OK` / `FAILED`).

## Efficient In-Memory Indexing (`EventStore`)

To ensure that dragging events and switching views remains fluid, the `EventStore` maintains multiple synchronous indexes:

1.  **Primary Map**: `SessionID -> Event`. (O(1) access for UI updates).
2.  **Calendar Index**: `CalendarID -> Set<SessionID>`. (Fast filtering when toggling calendar visibility).
3.  **Path Index**: `FilePath -> Set<SessionID>`. (Instant updates when a file is modified externally).

## Optimistic UI & Rollback

Every user-initiated change (drag, resize, edit) follows an **Optimistic Pattern**:
1.  The `EventCache` updates the in-memory `EventStore` and notifies the UI **immediately**.
2.  The UI re-renders without waiting for file I/O or network responses.
3.  The `ProviderRegistry` attempts the durable write in the background.
4.  **Failure Path**: If the write fails (e.g., network timeout, file locked), the cache **rolls back** the in-memory change and triggers a second UI update to revert the event to its original position.

## Memory Management

- **Event Pruning**: Remote providers (like Google) implement a rolling cache. Events far outside the viewport are eventually purged from memory and re-fetched as needed to prevent unbounded memory growth.
- **Stateless Enhancers**: Normalization (Timezones, Categories) is performed by stateless functions to avoid object-bloat and reference-leakage.

---

[Event Cache](eventcache.md) · [Provider Architecture](../calendars/architecture.md) · [Data Flow](data-flow.md)
