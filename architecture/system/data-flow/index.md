# Data Flow

!!! abstract "Flow Philosophy"
    All runtime paths converge through the same center: **providers ingest and persist data, while EventCache arbitrates state and publishes updates**. This keeps read/write behavior consistent across local and remote calendars.

## Runtime Flows

### Initial Load
Plugin startup initializes registry, cache, and managers; providers supply raw records; normalization/enhancement runs; EventStore indexes results; subscribers then render the first stable state.

### User-Initiated Mutation
UI captures intent (create/edit/drag/resize), EventCache applies optimistic state transition (1), ProviderRegistry routes the write to the owning provider (2), and cache confirms or rolls back based on provider result (3).
{ .annotate }

1.  **Optimistic UI** ensures zero latency for the user.
2.  **Routing** is based on the calendar source's unique ID.
3.  **Rollbacks** handle network failures or permission issues gracefully.

### External Update Ingestion
Vault or remote changes are observed by providers, affected records are re-read (1), EventCache performs sync and diff (2), and subscribers receive batched notifications (3).
{ .annotate }

1.  Only modified files/records are processed to maintain performance.
2.  The diffing engine prevents duplicate event notifications.
3.  Batching ensures the UI only redraws once even for multiple simultaneous updates.

### Time Tick and Reminder Path
TimeEngine computes upcoming occurrences within its horizon, emits time state through cache notifications, and notification features trigger reminders according to configured rules.

## Flow Invariants

!!! warning "Flow Invariants"
    Do not bypass EventCache for mutations. Do not emit provider-specific state directly to UI subscribers. Normalization and diffing must occur before broad publish to keep UI behavior deterministic.

## Code Anchors

Primary orchestrator: `src/core/EventCache.ts`  
Temporal computation: `src/core/TimeEngine.ts`  
Notification handling: `src/features/notifications/NotificationManager.ts`  
Provider dispatch: `src/providers/ProviderRegistry.ts`
