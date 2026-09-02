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
- Provider-specific recurring overrides are declared through `CalendarProviderCapabilities.ownsRecurringInstanceOverrides`. Shared recurrence code checks that capability instead of hardcoding provider types.
- CalDAV recurrence overrides are edited inside the shared server `.ics` object. Updating or deleting one override must replace or remove only the matching `VEVENT` with the same `UID` and `RECURRENCE-ID`; it must not PUT a one-event calendar over the whole resource or DELETE the resource URL.
- Recurring deletes are centralized in `RecurringEventManager.handleDelete`. Any GUI path that calls `EventCache.deleteEvent()` for a recurring master or linked override must show the same recurring-delete modal unless the caller explicitly uses `force`.
- Dragging or resizing a recurring occurrence opens `RescheduleRecurringModal`, allowing either an occurrence override or a whole-sequence update. Single events bypass this modal and use the normal update path.
- ICS serialization treats both internal recurrence shapes as provider-recurring data: `type: rrule` is serialized from its raw `rrule`, and `type: recurring` is converted into an RFC 5545 `RRULE` before writing to CalDAV/ICS providers.
- Video conference and linkification support is implemented in a provider-agnostic, schema-unmodified manner. Remote meeting URLs (e.g. from Google Calendar's `conferenceData`, Outlook's `onlineMeetingUrl`, iCalendar's `CONFERENCE` or X-properties) are extracted at the parser stage and merged into the canonical `location` or `description` fields using a shared helper `injectMeetingUrl` (empty location gets the URL; non-empty location appends the URL to the description). In the UI, the `linkify` utility recursively splits text on HTTP/HTTPS bounds to render clickable `<a>` tags.

## Related User Docs

- [Event Management](../../user/events/manage.md)
- [Recurring Events](../../user/events/recurring.md)
- [Tasks](../../user/events/tasks.md)
- [Timezone Support](../../user/events/timezones.md)
