# EventCache Contract

!!! abstract "Why this page exists"
    This page is the implementation contract for the central state engine. If you need to reason about event lifecycle, optimistic updates, rollback, publish behavior, or cache ownership, start here.

## Role in the architecture

`EventCache` is the single runtime authority for event state. It does not directly parse files or call remote APIs; it delegates source I/O to `ProviderRegistry`, stores normalized events in `EventStore`, and broadcasts deterministic updates to UI and feature subscribers.

## Responsibilities

| Responsibility | Component / Practical behavior |
|---|---|
| Staged population | `CacheSyncHandler`: Calls `ProviderRegistry.fetchAllByPriority()` and syncs provider results asynchronously in non-blocking slices using `yieldIfFrameBudgetExceeded(frameStart, 5)` and `MessageChannel` macro-task yielding. |
| State ownership | `EventCache` & `EventStore`: Persists canonical event state and exposes query APIs for views/features. |
| Mutation orchestration | `CacheMutationHandler`: Executes optimistic add/update/delete, then commits or rolls back based on provider result (e.g., [Tasks Optimistic Flow](../calendars/tasks-integration.md#optimistic-ui-updates)). |
| Publish/subscribe hub | `CacheSubscriptionManager`: Emits `update` payloads (`events`, `calendar`, `resync`) and `time-tick` state for reminder/time UI flows. |
| Identifier bridge | `EventCache`: Uses `ProviderRegistry` to map persistent provider identifiers to session IDs used by the UI. |

## Mutation lifecycle (authoritative path)

1. UI action calls a cache mutation API (`addEvent`, `updateEventWithId`, `deleteEventWithId`).
2. Cache performs optimistic in-memory state update in `EventStore`.
3. Cache flushes an update payload to subscribers for immediate UX response.
4. Cache delegates durable write to the owning provider via `ProviderRegistry`.
5. Success path replaces optimistic state with provider-authoritative result; failure path rolls back and republishes correction.

### Delegated provider action exception path

Some providers intentionally hand off creation/edit UX to native integration UI instead of returning a created entity immediately.

- Signal: provider throws `DelegatedProviderActionError`.
- Cache behavior: roll back optimistic placeholder state.
- UX behavior: do not show generic create-failed notice.

This contract allows provider-owned UI flows (for example TaskNotes NLP handoff) without polluting dispatcher logic with provider-specific branches.

### Recurring instance state path (provider-agnostic)

Recurring-instance status operations (complete/skip for a single occurrence) use a normalized contract rather than provider-type branching.

Flow:

1. UI interaction identifies a recurring instance date.
2. Interaction layer asks the owning provider for normalized instance state (`RecurringInstanceStateProvider.getRecurringInstanceState`).
3. UI submits desired normalized state (`setRecurringInstanceState`) back to the provider.
4. Provider performs backend-native persistence and emits/propagates cache refresh updates through existing provider update channels.

Invariants:

- Core/UI never inspect backend-specific recurring fields.
- Provider implementations own translation from normalized state to backend semantics.
- Providers that do not implement this optional interface keep existing fallback behavior.

!!! warning "Invariant"
    No subsystem should mutate persistent event state outside `EventCache`. Direct provider-to-UI mutation paths are architectural violations.

## Subscription contract

- `update`: event-level or calendar-level changes for rendering/sync.
- `time-tick`: high-frequency temporal state for reminders and now-indicator style behavior.

Consumers should subscribe/unsubscribe cleanly and must handle batched updates instead of assuming one-event-at-a-time delivery.

### UI Refresh Invariant (Partial vs. Full Reload)

To avoid timing-sensitive DOM issues in FullCalendar rendering, **never broadcast empty `affectedCalendars` payloads on event updates**.
- **State mutations & File Syncs**: Every state mutation (add, delete, update) and file synchronization event (`syncFile`) must collect and explicitly pass the affected `calendarId`s.
- **UI Performance & Stability**: Passing explicit calendar IDs forces `view.ts` to perform a stable, surgical refresh of only the changed event sources. Omitted or empty calendar IDs trigger a destructive full-calendar DOM reload, which is prone to timing conflicts and stale element display.

## Integration anchors

- `src/core/EventCache.ts`
- `src/core/EventStore.ts`
- `src/core/cache/CacheMutationHandler.ts`
- `src/core/cache/CacheSubscriptionManager.ts`
- `src/core/cache/CacheSyncHandler.ts`
- `src/providers/ProviderRegistry.ts`
- `src/core/TimeEngine.ts`
- `src/ui/view.ts`
