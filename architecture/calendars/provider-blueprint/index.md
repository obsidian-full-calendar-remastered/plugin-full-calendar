# Provider Blueprint (How to Add a New Provider)

!!! abstract "Blueprint goal"
    A provider is valid only when it respects the shared contract and integrates with registry, cache, and docs/test policies. This page is the canonical add-provider checklist.

## Step 1: Define provider config and UI

1. Add typed config schema/type for the provider.
2. Implement a configuration component for settings modal flow.
3. Keep source-specific validation inside the provider domain.

## Step 2: Implement provider contract

Implement the `CalendarProvider` interface with clear source capability boundaries (see [Provider Architecture](architecture.md) for orchestration model and [Provider Implementations and Patches](provider-implementations.md) for non-standard cases):

- `getEvents` is mandatory.
- `createEvent` / `updateEvent` / `deleteEvent` should throw explicit read-only errors if unsupported.
- `getEventHandle` must return stable persistent identity.
- Set `CalendarProviderCapabilities.supportsAlarms` only when the provider can persist `OFCEvent.alarms`.
- Set `CalendarProviderCapabilities.ownsRecurringInstanceOverrides` when single-instance recurrence edits are provider-native and shared recurrence code should not create local child notes or infer behavior from provider type strings.
- Providers that serialize ICS must preserve recurrence semantics for both `type: rrule` and `type: recurring`; UI-created recurring events must leave the app as real provider recurrence rules, not as single events that only look recurring locally.
- Optional hooks (`initialize`, `toggleComplete`, `canBeScheduledAt`) are allowed only when needed.

If recurring instance complete/skip semantics are provider-owned, implement the normalized recurring-instance hooks described in [Provider Implementations and Patches](provider-implementations.md#provider-agnostic-recurring-instance-semantics).

## Step 3: Register and instantiate via registry

1. Register dynamic loader in `registerBuiltInProviders`.
2. Ensure source `type` maps to the exported class static `type`.
3. Verify initialization path in `initializeInstances` and runtime source updates (mutation/write routing behavior is defined in [EventCache Contract](../system/eventcache.md)).

## Step 4: Choose load priority intentionally

Load priority controls staged loading behavior (profiling context: [Calendar Load Profiling Audit](../dev-logs/devlog_calendar_load_profiling_2026-04-11.md)):

- Lower values load earlier and improve perceived first render.
- Higher values can defer expensive or non-critical providers.
- Priorities should reflect startup UX and source latency profile.

## Step 5: Validate identifier and sync behavior

- Ensure `getEventHandle` produces durable IDs across reads.
- Confirm mapping `calendarId::persistentId` remains stable.
- Verify update ingestion paths do not duplicate or orphan events.

## Step 6: Ship with docs and tests

Minimum expectation before merge:

- Unit tests for parser/serializer or source edge cases.
- Integration tests for cache-provider mutation path.
- Architecture docs update in [Provider Architecture](architecture.md) and, when behavior is specialized, [Provider Implementations and Patches](provider-implementations.md).
- User docs update if the provider is user-configurable.

Validation expectations and documentation sync policy are defined in [Testing and Validation](../system/testing.md).

!!! warning "Contributor contract"
    Append or modify only relevant documentation sections. Do not rewrite unrelated architecture pages when adding a provider.

## Integration anchors

- `src/providers/Provider.ts`
- `src/providers/ProviderRegistry.ts`
- `src/ui/settings/SettingsTab.tsx`
