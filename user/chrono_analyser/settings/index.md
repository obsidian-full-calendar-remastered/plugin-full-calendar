# Chrono Analyser Settings

!!! abstract "Philosophy"
    Configure the intelligence of your dashboard. Chrono Analyser uses a rule-based system to categorize your historical data into meaningful "Insight Groups."

## Accessing Configuration

To configure the analyser, open the **[Chrono Analyser Dashboard](introduction.md)** and click the `⚙️` (Settings) icon in the **Proactive Insights** panel.

## Configuration Router

| Need | Jump To |
|---|---|
| Understand each field in the modal | [Rule Parameters](#rule-parameters) |
| Understand what matches and what does not | [How Matching Works](#how-matching-works) |
| Understand the chart filters and analysis controls | [Filter and Chart Controls](#filter-and-chart-controls) |
| Understand which insights a group can influence | [Persona](#persona) |

## Insight Groups

Insight Groups are the foundation of your analysis. You can create groups like "Work," "Wellness," or "Learning."

Each Insight Group is a reusable bucket of matching rules. Chrono Analyser tags records with every group they match, then uses those tags to build overview cards and persona-driven insights.

### Rule Parameters

For each group, you can define how the engine identifies relevant events:

*   **Group Name**: Your own label for the bucket, such as `Deep Work`, `Client A`, or `Exercise`. This name is also what appears in overview insights.
*   **Persona**: Chooses the analytical model applied to the group. See [Persona](#persona).
*   **Matching Hierarchies**: Exact hierarchy names to include. In category mode these are usually top-level categories; in legacy mode they are Full Note calendar folder/source names.
*   **Matching Projects**: Exact project names to include.
*   **Muted Projects**: Exact project names to exclude from Habit Consistency checks after a group match has already happened.
*   **Matching Sub-project Keywords**: Keyword list that matches when a sub-project contains the text anywhere.
*   **Muted Sub-project Keywords**: Keyword list that excludes matching records from Habit Consistency checks after a group match has already happened.

### Persona

The persona controls which specialized insights can use this group:

*   **🎯 Productivity**: Feeds focus, week-over-week movement, and at-risk initiative insights.
*   **❤️ Wellness & Routine**: Feeds weekly consistency and monthly balance insights.
*   **⚪ Ignore in Dashboard**: Excludes the group from the persona-based insight families above.

`Ignore in Dashboard` does **not** remove the group from all analyzer behavior. The group can still appear in generic overview insights if records match it.

### How Matching Works

Chrono Analyser uses inclusive matching for group assignment:

*   A record joins a group if **any one** of these matches succeeds:
*   a hierarchy matches a listed hierarchy,
*   a project matches a listed project,
*   or a sub-project contains one of the listed keywords.

Matching behavior is slightly different per field:

| Field | Matching type | Case sensitivity |
|---|---|---|
| Matching Hierarchies | Exact equality | Case-insensitive |
| Matching Projects | Exact equality | Case-insensitive |
| Matching Sub-project Keywords | Substring contains | Case-insensitive |
| Muted Projects | Exact equality | Case-sensitive |
| Muted Sub-project Keywords | Substring contains | Case-insensitive |

Muted rules currently affect the **Habit Consistency / at-risk activity** logic. They do not remove the record from charts or from the generic Activity Overview card.

### How Hierarchy, Project, and Sub-project Are Derived

The names you see in the configuration modal come from the analyzer data model:

| Analyzer field | Category-based mode | Legacy folder-based mode |
|---|---|---|
| Hierarchy | First category segment | Full Note calendar source or folder path |
| Project | Event sub-category when available, otherwise event title | First segment parsed from the note title |
| Sub-project | Event title when a sub-category exists, otherwise `none` | Remaining title text after `Project - `, otherwise `none` |

If these values are not what you expect, first review your [Category Coloring format](../events/categories.md) or your [Full Note calendar naming](../calendars/local.md).

## Data Management

*   **Version Control**: The analyser maintains its own configuration version to ensure compatibility across plugin updates.
*   **Unsaved Changes**: The configuration modal will warn you if you attempt to close it with pending changes. Use the **Save** button to persist your rules to the `chrono_analyser_config` in the **[main plugin settings](../settings/fc_config.md)**.

## Filter and Chart Controls

The lower half of the Chrono Analyser view is separate from Insight Group configuration, but it is just as important for accessibility.

### Global Filters

*   **Filter by hierarchy**: Autocomplete filter over known hierarchies.
*   **Filter by project**: Autocomplete filter over known projects.
*   **Filter by category**: Pattern search over **project names**. The label is historical; this filter does not search the hierarchy field.
*   **Date range**: Manual picker with `Today`, `Yesterday`, `This week`, `This month`, and `Clear dates` shortcuts.

### Pattern Syntax

The `Filter by category` input supports both inclusion and exclusion terms:

*   Inclusion terms are combined with **AND** logic.
*   Prefix a term with `-` to exclude it.
*   Use quotes for multi-word phrases.
*   Each token is treated as a **case-insensitive regular expression**.

Examples:

*   `meeting` matches project names containing `meeting`.
*   `client review` requires both `client` and `review` to match.
*   `client -internal` includes `client` but excludes `internal`.
*   `"project alpha" -archive` matches the exact phrase `project alpha` and excludes `archive`.

### Analysis Controls

*   **Metric**: Switch between total duration and event count.
*   **Categorywise (pie)**: Break down by hierarchy, project, or sub-project.
*   **Categorywise (sunburst)**: Drill from hierarchy to project, or from project to sub-project.
*   **Time-series trend**: Show daily, weekly, or monthly data as either an overall line or a stacked area chart.
*   **Activity patterns**: Analyze totals by day of week, hour of day, or a day-versus-hour heatmap.

Clicking an item inside an insight card can prefill these controls automatically to help you inspect the underlying records.

## Reading the Generated Insights

| Insight family | What it tells you | Depends on |
|---|---|---|
| Global Snapshot | What dominated or lagged in the last week by hierarchy | Recent dated records |
| Activity Overview | Your top Insight Groups over the last 30 days | Matching groups |
| Productivity | Focus distribution, movers, and lapsed initiatives | Groups with `Productivity` persona |
| Wellness & Routine | Weekly consistency and monthly balance | Groups with `Wellness & Routine` persona |
| Habit Consistency / At-risk activities | Projects that were active in the previous month but absent in the last 7 days | Non-muted matching records |

## Integration with Main Settings

The Chrono Analyser respects your global **[Category Coloring](../settings/categories.md)** toggle. 

*   If **Categories** are enabled, the analyser uses your category list as the available hierarchies. 
*   If **Categories** are disabled, it defaults to using the parent folder names of your **[Full Note Calendars](../calendars/local.md)**.

---

[Introduction](introduction.md) · [Advanced Categorization](../settings/categories.md) · [FAQ](faq.md) · [Back to Index](index.md)
