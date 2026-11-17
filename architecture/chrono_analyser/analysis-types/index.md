# Analysis Types Implementation

!!! abstract "Chart strategy contract"
    Analysis types are strategy-driven render paths orchestrated by `AnalysisController`. Each analysis type shares filter state but owns chart-specific aggregation and rendering behavior.

## Implemented analysis families

| Analysis family | Implementation path | Typical output |
|---|---|---|
| Category breakdown | Pie strategy + DataManager pie prep | Category/project/subproject share distributions |
| Hierarchical breakdown | Sunburst strategy + DataManager sunburst prep | Multi-level time distribution drilldown |
| Time-series trend | Time-series strategy + Plotter time-series renderer | Duration/count trends over time |
| Activity patterns | Activity strategy + Plotter activity renderer | Hour/day pattern insights |

## Controller behavior

`AnalysisController` manages:

- active chart type and chart-specific state,
- decision to re-render vs React update reuse,
- filter acquisition from `UIService`,
- strategy dispatch to plotter/data-prep paths.

For time-based charts, recurring expansion is explicitly enabled in analysis data fetch options so temporal distributions reflect occurrences instead of only base definitions.

## Data and rendering path

`DataService` -> `DataManager` -> `AnalysisController` -> chart-specific prep -> `plotter.ts` render.

The same filtered dataset can drive different strategies without changing source ingestion paths.

## Extension blueprint

To add a new analysis type:

1. Add UI selector entry and any chart-specific controls.
2. Add chart-specific filter extraction in `UIService`.
3. Add data-prep/aggregation helper when needed.
4. Add rendering function in plotter layer.
5. Wire new strategy branch in `AnalysisController`.

## Integration anchors

- `src/chrono_analyser/AnalysisController.ts`
- `src/chrono_analyser/ui/UIService.ts`
- `src/chrono_analyser/data/DataManager.ts`
- `src/chrono_analyser/ui/plotter.ts`
