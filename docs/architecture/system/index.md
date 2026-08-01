# Architecture Docs

!!! abstract "Philosophy"
    These docs are written to be **comprehensive and navigable at the same time**. We prefer compact, high-signal sections over fragmented notes, and we use callouts, emphasis, and direct links so readers can find key decisions quickly without hunting across pages.

!!! info "Two Audiences, One Contract"
    The split in site navigation is intentional. **User Docs** describe workflows and practical operation; **Architecture Docs** define implementation boundaries, invariants, and extension contracts. Both tracks must remain consistent.

!!! warning "Source-of-Truth Rule"
    Architecture Docs and the Jest suite are the implementation authority. If behavior diverges from this section, treat it as a defect and raise it to maintainers immediately. Contributor updates must be precise: append or modify only the relevant parts instead of rewriting unrelated content.

## Decision Matrix

| Question | Start Here | Related Deep Dive |
|---|---|---|
| Where does canonical state live and mutate? | [EventCache Contract](eventcache.md) | [Event Storage and Identifiers](event-storage.md) |
| How does the plugin achieve 0ms UI freezing & off-main-thread processing? | [Performance & Web Workers](performance.md) | [Core Systems](core-systems.md) |
| How does the plugin handle centralized, optimized searching, filtering, and sorting? | [Event Filtering and Sorting](event-filtering-sorting.md) | [EventCache Contract](eventcache.md) |
| How are internal events translated to FullCalendar? | [FullCalendar Interop](interop.md) | [Data Flow](data-flow.md) |
| How do external plugins get safe access? | [API Architecture](api-architecture.md) | [API Integration Blueprint](api-integration-blueprint.md) |
| How is provider behavior structured and extended? | [Provider Architecture](../calendars/architecture.md) | [Provider Blueprint](../calendars/provider-blueprint.md) |
| How does the Obsidian Tasks provider query and surgically edit files? | [Tasks Provider Architecture](../calendars/tasks-integration.md) | [Global Query Filtering](../calendars/tasks-integration.md#global-query-filtering-architecture-tasksqueryfilter) |
| Where are feature-level policies documented? | [Features Architecture](features/index.md) | [Timezone Architecture](features/timezone-architecture.md) |
| How does ActivityWatch infer and persist intent blocks? | [ActivityWatch Architecture](../activitywatch/index.md) | [ActivityWatch Implementation](../activitywatch/implementation.md) |
| How does Chrono Analyser connect and scale insights? | [Chrono Analyser Architecture](../chrono_analyser/architecture.md) | [Insights Engine](../chrono_analyser/insights-architecture.md) |
| How does the plugin scope and package stylesheets? | [Styling Architecture & CSS Audit](styling.md) | [System Overview](overview.md) |

## Scope

This section is concept-first and implementation-bound. It documents ownership, data movement, invariants, extension points, and verification policy. Provider-specific mechanics stay in their feature pages so this area remains the stable system contract.

## Implementation Anchors

Event orchestration: `src/core/EventCache.ts`  
Web Worker manager: `src/workers/WorkerManager.ts`  
Centralized filtering & sorting: `src/core/EventFilterSortEngine.ts`  
In-memory indexes: `src/core/EventStore.ts`  
Normalization pipeline: `src/core/EventEnhancer.ts`  
Provider contract and routing: `src/providers/Provider.ts`, `src/providers/ProviderRegistry.ts`  
View integration: `src/ui/view.ts`

Compact index: [Overview](overview.md) · [EventCache](eventcache.md) · [Performance](performance.md) · [Filtering & Sorting](event-filtering-sorting.md) · [Storage](event-storage.md) · [Interop](interop.md) · [API Architecture](api-architecture.md) · [API Blueprint](api-integration-blueprint.md) · [Data Flow](data-flow.md) · [Core Systems](core-systems.md) · [Features](features/index.md) · [ActivityWatch](../activitywatch/index.md) · [Providers](../calendars/architecture.md) · [Chrono](../chrono_analyser/architecture.md) · [Styling](styling.md)
