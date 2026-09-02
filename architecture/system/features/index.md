# Features Architecture

!!! abstract "Feature layer purpose"
    Feature modules encapsulate specialized behavior that should not bloat core state orchestration. They consume canonical state from `EventCache` and implement focused policies (timezone, reminders, recurrence, workspaces, category workflows).

## Scope map

| Feature area | Primary role | Core dependencies |
|---|---|---|
| Timezone | Source/display/system timezone correctness and recurrence patch behavior. | `EventEnhancer`, `TimeEngine`, provider parsing paths |
| Reminders | Time-tick driven notification policy and deduplicated reminder delivery. | `TimeEngine`, `EventCache`, Notification APIs |
| Milestones | Success-only progress tracking, unlock evaluation, and read-only settings presentation. | `CacheMutationHandler`, `PluginState`, `settings.milestones`, settings UI |
| Recurrence | Instance overrides and parent-child lifecycle semantics. | `EventCache`, provider mutation paths |
| Workspaces | View-level filtering and setting overrides for presentation segmentation. | `ViewEnhancer`, settings |
| Category | Parsing, normalization, and bulk categorization workflows. | `EventEnhancer`, settings, UI controls |
| NLP (FCR Command) | Universal orchestrator: NL event creation, view navigation, settings, cache, sync. | `smartCalendar`, `InternalAPI`, `PluginState`, `EventCache`, `ProviderRegistry` |
| Event Linked Notes | Linking local markdown notes to remote events via reactive indexing. | `LinkedNoteIndex`, `TemplateEngine`, `noteUtils`, UI / Providers |
| Note Templates | Shared rendering contract for generated local and linked notes. | `TemplateEngine`, provider create flows, linked note manager |
| Break Timer | System-wide idle evaluation, multi-window hooks, and fullscreen wellness card overlay coordination. | `PluginState`, `activeDocument`/`activeWindow`, settings UI |
| ICS Export | Event cache serialization into iCalendar RFC 5545 format with select-filters. | `eventsToIcs`, `App Vault`, browser download APIs |

## Architecture rule

Feature modules may transform, filter, and react, but they must not replace core ownership boundaries.

- State authority remains in `EventCache`.
- Provider authority remains in provider modules.
- Feature modules are policy and behavior layers around those authorities.

## Focused deep dives

- [Timezone Architecture](timezone-architecture.md)
- [Reminders Architecture](reminders-architecture.md)
- [FCR Reminder Companion Architecture](fcr-reminder-architecture.md)
- [Milestones Architecture](milestones-architecture.md)
- [NLP Engine Architecture](nlp-architecture.md)
- [Event Linked Notes Architecture](event-linked-notes.md)
- [Note Templating Architecture](templates.md)
- [Break Timer Architecture](break-timer-architecture.md)
- [ICS Export Architecture](ics-export-architecture.md)
- [ActivityWatch Architecture](../../activitywatch/index.md)
