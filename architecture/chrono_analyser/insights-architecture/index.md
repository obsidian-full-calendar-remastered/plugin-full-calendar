# Insights Engine Implementation

!!! abstract "Insights role"
    Insights are generated analytics narratives layered on top of analysed records, not raw event files. The engine consumes translated records and returns structured, actionable insight payloads for UI rendering.

## Processing model

1. Input records are tagged in batches against configured insight groups.
2. Global insights run across full datasets.
3. Persona-targeted insights run on segmented subsets (for example productivity and wellness views).
4. Output is returned as structured fragments and action payloads for drill-down interactions.

## Why it is structured this way

- Batch processing keeps UI responsive for large datasets.
- Tagging and persona segmentation avoid hard-coded one-size-fits-all summaries.
- Structured text fragments enable richer rendering than plain strings.
- Action payloads let users jump from insight cards into concrete filtered charts.

## Output contract

Each insight carries:

- category and sentiment,
- display fragments (supports highlighted/bold fragments),
- optional payload items with nested sub-items,
- optional analysis filter action payload for interactive pivot.

## Configuration dependence

Insight quality is strongly tied to user-defined insight groups and matching rules (hierarchy, project, keyword filters plus muting rules). Empty or weak configuration yields weak insights by design.

## Integration anchors

- `src/chrono_analyser/data/InsightsEngine.ts`
- `src/chrono_analyser/ui/components/InsightsRenderer.ts`
- `src/chrono_analyser/ui/ui.ts`
- `src/chrono_analyser/AnalysisController.ts`
