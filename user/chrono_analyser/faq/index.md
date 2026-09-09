# Chrono Analyser FAQ & Troubleshooting

Find answers to common questions and tips for resolving issues with Chrono Analyser.

---

## Fast Navigation

| I need help with | Go to |
|---|---|
| A control label or field meaning | [Configuration](settings.md) |
| Dashboard concepts and interaction model | [Introduction](introduction.md) |
| Practical setups | [Use Cases](usecases.md) |

## General

**Q: How do I enable Chrono Analyser?**  
A: Click the **Analysis** button in the main calendar view. If you don't see it, make sure you have at least one calendar source configured.

**Q: What is "Category Coloring" and why does it matter?**  
A: Category Coloring lets you group events by category (e.g., "Work", "Personal"). Chrono Analyser uses these categories for its most powerful analysis mode.  
➡️ [Learn more about Category Coloring](../events/categories.md)

**Q: What do "Hierarchy", "Project", and "Sub-project" mean?**  
A: `Hierarchy` is the top-level grouping. In category mode it usually comes from your top-level category; in legacy mode it comes from the Full Note calendar source/folder. `Project` and `Sub-project` are the next levels down and are derived from your title/category structure.  
➡️ [See the terminology and derivation rules](settings.md#how-hierarchy-project-and-sub-project-are-derived)

---

## Features

**Q: How do I create Insight Groups?**  
A: Click the ⚙️ icon in the Insights panel. You can define groups based on categories, projects, or keywords.

**Q: Do all rules in an Insight Group have to match?**  
A: No. A record is added to a group if it matches any listed hierarchy, any listed project, or any matching sub-project keyword.  
➡️ [See the exact matching behavior](settings.md#how-matching-works)

**Q: What does "Ignore in Dashboard" do?**  
A: It removes the group from the persona-based Productivity and Wellness insight families, but the group can still contribute to generic overview cards if records match it.

**Q: Can I analyze events from Google Calendar or other remote sources?**  
A: Yes, but only if Category Coloring is enabled. Otherwise, only Full Note Calendar events are included.

**Q: How do I use the date range selector?**  
A: Use the date picker or preset buttons (Today, This Week, etc.) above the chart to filter your analysis.

**Q: What does the "Filter by category" box actually search?**  
A: It searches **project names**, not the hierarchy field. It supports inclusion, exclusion, quotes, and regular-expression tokens.  
➡️ [See pattern syntax and examples](settings.md#pattern-syntax)

**Q: Why do some insight items open charts when I click them?**  
A: Insight payload items can prefill the analyzer controls automatically. This is intentional and is the main drill-down path from summaries into charts.  
➡️ [See interaction behavior](introduction.md#what-clicking-does)

---

## Troubleshooting

See the **[Central Troubleshooting Guide](../guides/troubleshooting.md#chrono-analyser)** for help with empty insights, missing events, muting habit projects, or responsiveness issues.

---

## More Help

- [Chrono Analyser Introduction](introduction.md)
- [Chrono Analyser Configuration](settings.md)
- [User Use Cases](usecases.md)
- [Getting Started](../../getting_started.md)

---
