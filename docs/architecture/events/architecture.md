# Events Architecture

This page describes how event logic is organized.

## Core Components

- Event state orchestration: `src/core/EventCache.ts`
- Event indexing and lookup: `src/core/EventStore.ts`
- Event normalization pipeline: `src/core/EventEnhancer.ts`
- Recurrence behavior: `src/features/recur_events/`
- Event modal and edit form UI: `src/ui/modals/EditEvent.tsx` (implemented as a clean, divider-free layout with collapsible Advanced Options via HTML5 details)

## Design Boundaries

- UI actions trigger changes, but EventCache owns event state.
- Recurrence logic is delegated to dedicated feature managers.
- Provider write operations are routed through provider registry.
- Recurring instance completion/skip semantics are exposed through provider-agnostic contracts and implemented inside providers (no provider-specific recurrence branching in shared UI/core paths).

## Related User Docs

- [Event Management](../../user/events/manage.md)
- [Recurring Events](../../user/events/recurring.md)
- [Tasks](../../user/events/tasks.md)
- [Timezone Support](../../user/events/timezones.md)
