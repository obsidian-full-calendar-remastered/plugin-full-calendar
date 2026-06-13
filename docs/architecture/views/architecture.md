# Views Architecture

This page describes how calendar views are rendered, controlled, and filtered.

## Core Components

- **View Integration**: [`src/ui/view.ts`](file:///d:/Codes/plugin-full-calendar/src/ui/view.ts) manages the leaf lifecycles and initializes the presenter.
- **Presentation Enhancer**: [`src/core/ViewEnhancer.ts`](file:///d:/Codes/plugin-full-calendar/src/core/ViewEnhancer.ts) intercepts raw events and shapes them for presentation.
- **Workspace Manager**: [`src/features/workspaces/WorkspaceManager.ts`](file:///d:/Codes/plugin-full-calendar/src/features/workspaces/WorkspaceManager.ts) resolves active configurations and applies filters.
- **Advanced Query Evaluator**: [`src/features/workspaces/bases/BasesFilterEvaluator.ts`](file:///d:/Codes/plugin-full-calendar/src/features/workspaces/bases/BasesFilterEvaluator.ts) recursively parses and evaluates Obsidian Bases filters against note metadata.

---

## Design Boundaries

- View code is a "dumb" renderer focused on FullCalendar lifecycle and callbacks.
- [`ViewEnhancer`](file:///d:/Codes/plugin-full-calendar/src/core/ViewEnhancer.ts) and [`WorkspaceManager`](file:///d:/Codes/plugin-full-calendar/src/features/workspaces/WorkspaceManager.ts) decouple data shaping and view configuration overrides from the presentation layer.
- Core event state is owned by the [`EventCache`](file:///d:/Codes/plugin-full-calendar/src/core/EventCache.ts), never by the views.

---

## Data Flow: Workspace Bases Query Filtering

When a workspace is activated or refreshed:

```mermaid
sequenceDiagram
    participant View as CalendarView
    participant Enhancer as ViewEnhancer
    participant Manager as WorkspaceManager
    participant Vault as Obsidian Vault
    participant Evaluator as BasesFilterEvaluator

    View->>Enhancer: loadBasesFilter()
    Enhancer->>Manager: loadBasesFilter()
    Manager->>Vault: read(basisQueryPath)
    Vault-->>Manager: YAML content
    Note over Manager: Parse and cache filters

    View->>Enhancer: getEnhancedData(allSources)
    Enhancer->>Manager: getFilteredEventSources(allSources)
    loop For each CachedEvent
        Manager->>Evaluator: evaluateBaseFilter(cachedFilter, file)
        Evaluator-->>Manager: boolean (match)
    end
    Manager-->>Enhancer: filtered event sources
    Enhancer-->>View: enhanced data package
    Note over View: Render on screen
```

### Live Updates

If a `.base` query file is edited in the workspace, the plugin's metadata change listener in [`src/main.ts`](file:///d:/Codes/plugin-full-calendar/src/main.ts) detects the file modification and triggers a cache resync:
```typescript
PluginState.getCache().resync();
```
This triggers a complete asynchronous query reload and view refresh.

---

## Related User Docs

- [Workspaces](../../user/views/workspaces.md)
- [Timeline View Usage](../../user/views/timeline_view.md)

