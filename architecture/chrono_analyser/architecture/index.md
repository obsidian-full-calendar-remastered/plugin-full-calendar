# Chrono Analyser Architecture

!!! abstract "Architectural role"
    Chrono Analyser is a pure data-consumer subsystem. It does not own source file I/O and does not maintain a competing event truth. It consumes canonical plugin state and builds analysis-specific views.

## Core principles

1. Single source of truth: events are consumed from main cache.
2. Modular architecture: data translation/indexing, orchestration, and rendering are separated.
3. Strategy-based charting: analysis types are pluggable without rewriting controller core.

## Pipeline

1. Data service reads from EventCache.
2. Translator maps event data to analysis records.
3. Data manager indexes records for filtering.
4. Controller applies analysis strategy.
5. Plotter renders chart output.

## Insight pipeline extension

Beyond chart rendering, the insights engine performs batched tagging, persona/group segmentation, and structured narrative generation with actionable drill-down payloads.

See: [Insights Engine Implementation](insights-architecture.md)

## Analysis-type extension

Chart families (pie, sunburst, time-series, activity patterns) are implemented as strategy branches with chart-specific filters and data prep paths.

See: [Analysis Types Implementation](analysis-types.md)

## Why this matters

- Avoids duplicated source parsing logic.
- Keeps analysis consistent with calendar state.
- Supports extension by adding chart strategies, translator rules, and insights policies.

## Code anchors

- `src/chrono_analyser/README.md`
- `src/chrono_analyser/AnalysisView.ts`
- `src/chrono_analyser/AnalysisController.ts`
- `src/chrono_analyser/data/translator.ts`
- `src/chrono_analyser/data/DataManager.ts`
- `src/chrono_analyser/data/InsightsEngine.ts`
