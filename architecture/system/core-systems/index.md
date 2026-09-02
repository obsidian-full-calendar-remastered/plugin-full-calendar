# Core Systems

!!! abstract "Ownership Model"
    Core systems define the canonical event lifecycle. If ownership is unclear, the default is: **EventCache governs transitions, EventStore governs indexed retrieval, and enhancers/engines transform without becoming state authorities.**

## System Contracts

| System | Owns | Guarantees |
|---|---|---|
| EventCache | Canonical event state and mutation workflow. | Single source of truth, consistent publish semantics, rollback-capable mutation path.
| EventStore | In-memory indexed event persistence. | Fast retrieval by key and metadata relations with stable lookup behavior.
| WorkerManager | Off-main-thread background processing engine. | Single-file inline Blob Web Worker execution for O(N) cache diffing and payload parsing with transparent main-thread fallback.
| EventEnhancer | Normalization and write-path preparation. | Category/timezone-safe transformations and consistent shape before persistence/render.
| TimeEngine | Temporal occurrence horizon and tick state. | Predictable upcoming-state computation for reminders and time-aware UI.
| ViewEnhancer + WorkspaceManager | Presentation shaping and workspace policies. | UI-facing filtering/overrides without leaking business logic into components.

## Non-Negotiable Invariants

Event mutations must route through EventCache. Provider adapters must not become alternate state stores. Heavy O(N) array comparisons and iCalendar string parsing must execute in background Web Workers or time-budgeted main-thread slices. Presentation modules can filter and annotate but cannot redefine core ownership semantics.

## Code Anchors

Event lifecycle: `src/core/EventCache.ts`  
Indexed storage: `src/core/EventStore.ts`  
Web Worker manager: `src/workers/WorkerManager.ts`  
Web Worker tasks: `src/workers/calendarWorkerTask.ts`  
Normalization pipeline: `src/core/EventEnhancer.ts`  
Temporal engine: `src/core/TimeEngine.ts`  
View shaping: `src/core/ViewEnhancer.ts`  
Workspace policy: `src/features/workspaces/WorkspaceManager.ts`
