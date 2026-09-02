# Provider Architecture

!!! abstract "Provider architecture intent"
    Providers are the extensibility backbone of Full Calendar. They isolate source-specific parsing/persistence while exposing one shared runtime contract to the core state engine.

## Contract and orchestration

`Provider` defines operations and capabilities (see [Provider Blueprint](provider-blueprint.md)); `ProviderRegistry` owns registration, lifecycle, load-priority orchestration, fetch/write routing, and global identifier mapping. `EventCache` only talks to providers through this registry path (see [EventCache Contract](../system/eventcache.md)).

## Provider families

| Family | Providers | Design note |
|---|---|---|
| Local | Full Note, Daily Note | Vault-backed parsing and write paths with file/location identity. |
| Remote | Google, Outlook, CalDAV, ICS | Network-backed ingestion and protocol/auth handling. |
| Integration | [Tasks](tasks-integration.md), [Task Backlog](task-backlog.md), [TaskNotes](provider-implementations.md#tasknotes-provider-provider-owned-nlp-endpoint), Bases | Plugin-integrated sources with custom semantics beyond plain calendar files. |

## Runtime flow (provider perspective)

1. Registry selects provider instances by configured sources.
2. Providers return raw source events and source locations/handles.
3. Cache normalizes events through enhancer and stores canonical state (see [Core Systems](../system/core-systems.md)).
4. Mutations route back to providers through registry and capability checks.

## Non-standard implementations and patches

Important implementation-specific behavior is documented in the implementation deep dive page, including:

- Daily Note provider source-level timed-event write format (`default` vs `dayPlanner`) with format-agnostic read fallback.
- ICS hybrid behavior (remote URL and local file support in one read-only provider).
- CalDAV defensive REPORT/GET retrieval and XML namespace fallback handling.
- [Tasks provider](tasks-integration.md) surgical markdown updates and custom completion scheduling semantics.
- Provider load-priority tuning for staged startup behavior.
- Recurrence/timezone behavior tracked in [RRULE Timezone Date-Shift Fix](../dev-logs/devlog_rrule_timezone_patch.md).

See: [Provider Implementations and Patches](provider-implementations.md)
See: [Outlook Provider Architecture](outlook.md)

## New provider onboarding

Use the canonical blueprint when adding sources so registration, identifiers, capabilities, and tests/docs stay consistent:

See: [Provider Blueprint](provider-blueprint.md)

## Where to look in code

- `src/providers/Provider.ts`
- `src/providers/ProviderRegistry.ts`
- `src/providers/fullnote/`
- `src/providers/dailynote/`
- `src/providers/google/`
- `src/providers/outlook/`
- `src/providers/caldav/`
- `src/providers/ics/`
- `src/providers/tasks/`
- `src/providers/tasknotes/`
- `src/providers/bases/`
- `src/features/task-backlogs/`
