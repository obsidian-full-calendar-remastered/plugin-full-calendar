# Milestones Architecture

Milestones are implemented as a feature-layer policy that consumes canonical plugin state and provider outcomes. The module tracks durable progress counters, evaluates unlock rules, and exposes read-only card data for settings rendering.

## Four Single Sources Of Truth

1. **Persistent milestone state in settings** (1)
2. **Milestone rule definitions** (2)
3. **Success-only mutation hooks** (3)
4. **Settings-page presentation flow** (4)
{ .annotate }

1.  Stored in `settings.milestones` (counters and `unlockedAt` maps).
2.  Located in `src/features/milestones/milestones.ts`.
3.  Integrated into `src/core/cache/CacheMutationHandler.ts`.
4.  Handled by `LazySettingsTab.ts` and `SettingsTab.tsx`.

## Data Model

Milestone state is stored under settings.milestones:

- counters: Record of numeric counters for global actions, provider-scoped actions, day buckets, and metadata.
- unlockedAt: Record of unlock timestamps keyed by milestone id.

Counters include categories such as:

- action totals by scope
- daily buckets for streak and consistency calculations
- metadata counters for NLP, recurring series, timezone diversity, and lifetime span markers

## Tracking Pipeline

1. Cache mutation executes operation (1)
2. Provider attempted through registry (2)
3. CacheMutationHandler calls recordMilestoneAction (3)
4. `milestones.ts` updates counters (4)
5. Unlock evaluation runs (5)
6. Persistence via `PluginState.persistData` (6)
7. New unlocks queued to toast notifier (7)
{ .annotate }

1.  Triggered by user actions like creating or editing events.
2.  Delegation ensures the underlying source handles the persistence first.
3.  Only called after confirmed success to avoid false positives.
4.  Updates both scoped counters and metadata.
5.  Evaluated against `MILESTONE_DEFINITIONS`.
6.  Ensures progress is saved even if Obsidian crashes.
7.  Immediate user feedback for achievements.

Failure paths and delegated action rollbacks do not commit milestone progress.

## Computation Strategy

Each milestone definition has a compute function that returns current and target values. Compute functions are deterministic over the current milestone state and selected runtime context where required.

Representative computation types:

- direct totals such as created.total
- provider-aggregated totals across remote or task families
- threshold counts such as number of providers above a target
- day-series analysis for streak and consistency objectives
- live environment checks such as active remote source count and local live event totals
- datetime contextual analysis such as late-night, early-morning, or weekend operations
- active configuration analysis such as distinct configured providers or active workspaces

## UI Rendering Contract

The settings milestones page consumes `getMilestoneCards()` and does not mutate milestone state. Card fields include id, title, description, targetLabel, current, percent, and unlocked.

Sorting contract:
- Unlocked cards first.
- Lexicographic title order inside same unlock group.

Locked Indicator Styling:
- Cards for unachieved milestones are visually grayed out (`opacity: 0.6` and `grayscale(100%)`).
- A hover transition is implemented that smoothly scales opacity to `0.85` and reduces grayscale to `40%`, encouraging the user to interact and discover advanced goals.

Toast Notification & Conversion Banner:
- Toast alerts are styled using rich, premium glassmorphic properties (gradient overlays, backdrop filters, custom spring animations).
- The first line of the toast displays the actual milestone title, while the second line displays the description.
- Contains a call-to-action conversion footer with a yellow primary "Sponsor" button and a shaded secondary "See Financial Goal" button.
- Implements pause-on-hover: entering the mouse on a toast pauses the auto-dismiss timer, and leaving it resumes the timer.

Footer contract:
- Use shared settings footer renderer to preserve consistent layout and behavior.

## Internationalization Contract

All user-facing milestone text is sourced from locale keys. The architecture relies on translation keys in rule definitions and notice keys for unlock toasts.

## Extension Checklist

To add a new milestone:

1. Add a new definition in MILESTONE_DEFINITIONS with id and i18n keys.
2. Add or reuse compute primitives in milestones.ts.
3. Add translation keys in en locale and required locales.
4. Verify increment paths are covered by success-only mutation hooks.
5. Validate settings page rendering and toast behavior.

## Related Docs

- [Features Architecture](index.md)
- [Settings Architecture](../../settings/architecture.md)
- [Event Cache](../eventcache.md)
- [User Guide: Milestones and Progress](../../../user/features/milestones.md)
