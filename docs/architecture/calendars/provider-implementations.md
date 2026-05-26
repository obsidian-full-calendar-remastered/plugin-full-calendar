# Provider Implementations and Patches

!!! abstract "Implementation focus"
    This page summarizes important provider implementations and highlights non-standard behavior or patches that contributors must preserve.

## Provider families

| Family      | Providers             | Notes                                                                   |
| ----------- | --------------------- | ----------------------------------------------------------------------- |
| Local       | Full Note, Daily Note | Vault-backed, file-centric parsing and persistence.                     |
| Remote      | Google, Outlook, CalDAV, ICS   | Network-backed with auth/protocol handling and staged loading behavior. |
| Integration | Tasks, TaskNotes, Bases | Plugin/API integration with custom semantics beyond simple event files. |
| Virtual     | Holidays              | Computed on-the-fly from bundled data; no vault file or network backing. |

## Key implementation notes

### Full Note Provider

Creates one-note-per-event records, supports full CRUD, and uses robust filename collision handling to avoid destructive overwrites.

### Daily Note Provider

Parses list items under configured heading and performs line-targeted updates. Implements a persistent locally-allocated `uid` mechanism (`[uid:: N]`) instead of legacy deduplication matching, enabling deterministic title edits and O(1) hinted line lookups during sync updates.

Timed-event serialization is source-configured and provider-owned:

- `default`: writes inline Dataview time fields such as `[startTime:: 02:30]` and `[endTime:: 03:30]`
- `dayPlanner`: writes a strict prefixed title form: `HH:mm - HH:mm Title`

Read behavior must stay format-agnostic:

- First prefer inline `startTime` and `endTime` fields when present.
- Only if those fields are absent, fall back to strict `HH:mm - HH:mm Title` parsing.
- Do not couple read behavior to the provider's configured write format.

This split allows forward writes to follow the selected provider format while preserving compatibility with older daily-note lines and mixed historical data.

### ICS Provider (non-standard hybrid)

Single provider supports both remote URLs (`http`, `https`, `webcal`) and local vault `.ics` files. It is intentionally read-only and normalizes remote/local acquisition into one contract surface.

Timezone and recurrence edge handling rationale is documented in [RRULE Timezone Date-Shift Fix](../dev-logs/devlog_rrule_timezone_patch.md).

### CalDAV Provider (protocol patch behavior)

Uses direct `REPORT`/`GET` flow with robust XML namespace handling and fallback retrieval paths when calendar-data is not returned inline. This is intentionally defensive due to server variability.

#### VTODO & VEVENT Dual-REPORT Architecture
- **Dual-REPORT Strategy:** Under the CalDAV RFC 4791 specification, time-range queries cannot filter for both `VEVENT` and `VTODO` components using a logical `OR` condition within a single `calendar-query` report, because sibling `comp-filter` elements are logically ANDed. To query both component types efficiently and standard-compliantly, the provider executes two sequential `REPORT` queries: one for `VEVENT` and one for `VTODO`.
- **Fallback Avoidance:** If a server does not support standard `REPORT` queries and triggers a compatibility `PROPFIND` fallback (which fetches all files in the collection), the provider flags `fellBack = true` and skips the second `VTODO` `REPORT` query entirely, as the fallback has already fetched all objects (both events and tasks) in a single request.
- **Content Deduplication:** All retrieved calendar objects are combined and deduplicated based on their raw ICS payload content to eliminate any overlaps.
- **VTODO Parser/Formatter Mappings:** The ICS parser handles `VTODO` components by mapping them to `OFCEvent` structures (interpreting completion time or `COMPLETED` status, and mapping `due` as the end date). The ICS formatter serializes tasks into standard-compliant `VTODO` elements using `DUE` and `COMPLETED` properties.


### Google Provider

Uses OAuth-backed authenticated requests, handles recurrence cancellation edge cases (`cancelled` instances merged into skip dates), and keeps provider-facing payload conversion isolated in parser/auth modules.

For token and permission boundaries, see [API Architecture](../system/api-architecture.md).

### Outlook Provider

Uses OAuth Authorization Code + PKCE with proxy-backed token and refresh exchange. Parsing and payload mapping are isolated in parser/auth modules similar to Google provider boundaries.

Outlook provider intentionally normalizes nullable Graph recurrence linkage (`seriesMasterId`) into optional event fields expected by core validation.

Current limitation: recurring single-instance override write path is not yet implemented.

### Tasks Provider (non-standard surgical writer)

Not a simple calendar source: it integrates with Tasks plugin cache, supports task-completion toggles, time-token parsing in task text, and surgical markdown line rewrites while preserving task metadata patterns.

Full flow and invariants are detailed in [Tasks Integration Architecture](tasks-integration.md).

#### Tasks date-field integration contract

The Tasks integration has two explicit date-field settings:

- `settings.tasksIntegration.backlogDateTarget` controls which incomplete tasks appear in the Tasks Backlog.
- `settings.tasksIntegration.calendarDisplayDateTarget` controls which Tasks date marker is used for calendar display and calendar/backlog write-back.

Backlog filtering must use `backlogDateTarget`, not a hardcoded definition of "undated":

| Target          | Backlog filter                                   |
| --------------- | ------------------------------------------------ |
| `scheduledDate` | Include incomplete tasks without `scheduledDate` |
| `startDate`     | Include incomplete tasks without `startDate`     |
| `dueDate`       | Include incomplete tasks without `dueDate`       |

Calendar display and write-back must use `calendarDisplayDateTarget` with no fallback:

| Target          | Calendar display                | Markdown write-back              |
| --------------- | ------------------------------- | -------------------------------- |
| `scheduledDate` | Only tasks with `scheduledDate` | Write or replace `⏳ YYYY-MM-DD` |
| `startDate`     | Only tasks with `startDate`     | Write or replace `🛫 YYYY-MM-DD` |
| `dueDate`       | Only tasks with `dueDate`       | Write or replace `📅 YYYY-MM-DD` |

Backlog filter UI entry points must use the same `backlogDateTarget` setting:

- Settings -> Integrations -> Obsidian Tasks Integration.
- The dropdown in the Tasks Backlog view header.

Changing the setting must save plugin settings and call `providerRegistry.refreshBacklogViews()` so all open backlog views re-query the provider. Backlog filtering belongs in `TasksPluginProvider.getUndatedTasks()` because the provider owns the Tasks cache shape and the date-field mapping. UI components should not duplicate that filtering logic.

Calendar event drag/update behavior and backlog drag/drop both write `calendarDisplayDateTarget`. `TasksPluginProvider._taskToOFCEvent()` must also read only `calendarDisplayDateTarget`; do not reintroduce scheduled/due/start fallback priority. Because event-cache contents are derived from the display field, changing `calendarDisplayDateTarget` may require an Obsidian restart or plugin reload for all open views to fully reflect the new policy.

The `openEditModalAfterBacklogDrop` setting gates the Tasks plugin edit modal after backlog drops. Its default is `false`, so the normal drag/drop path stays fast and non-blocking unless the user explicitly opts into the modal.

#### Tasks time-format contract

- `settings.tasksIntegration.taskDisplayFormat` controls how timed tasks are serialized back to markdown.
- Default is `dayPlanner` for new installs and forward writes.
- `standard` remains available as a compatibility/user preference mode.

Serialization modes:

| Mode         | Example output |
| ------------ | -------------- |
| `dayPlanner` | `- [ ] 5:00 - 19:00 Task title ⏳ 2026-05-02` |
| `standard`   | `- [ ] Task title (5:00 AM-7:00 AM) ⏳ 2026-05-02` |

Parsing must support both schemas regardless of the selected write mode. Do not introduce a read-mode switch tied to `taskDisplayFormat`.

### TaskNotes Provider (provider-owned NLP endpoint)

TaskNotes is a plugin-runtime integration provider and intentionally avoids HTTP transport. It reads from TaskNotes cache APIs and writes via TaskNotes service/UI endpoints.

Key contracts:

- Create behavior is provider-owned and configurable by source `dispatchMode`.
- Default dispatch endpoint is `search` (Search + Create selector flow).
- Alternate endpoint `create` opens TaskNotes create modal directly.
- Full Calendar NLP dispatch remains generic; provider decides endpoint semantics.

TaskNotes create delegation path:

```text
1. NLP resolves target and calls EventCache.addEvent (1)
2. Registry routes to TaskNotesProvider.createEvent (2)
3. Provider opens UI and throws DelegatedProviderActionError (3)
4. Cache handler rolls back optimistic state (4)
```

1.  Determines which calendar should handle the request based on the NLP result.
2.  The registry acts as the central router for all provider operations.
3.  The error signal tells the core that the action has been successfully handed off.
4.  Ensures no "ghost" events remain in the UI while the user is in the other plugin's modal.

This prevents duplicate modal UX and keeps provider-specific behavior outside dispatcher logic.

The mutation lifecycle this relies on is defined in [EventCache Contract](../system/eventcache.md#mutation-lifecycle-authoritative-path).

### Holiday Provider (virtual, bundled data)

Read-only provider that surfaces [date-holidays](https://github.com/commenthol/date-holidays) data as all-day `OFCEvent` objects. No vault file, no network request, no `EventLocation`.

**Architecture invariants:**

- `isRemote = false`, `loadPriority = 5` — loads in the first provider wave alongside local sources.
- CRUD methods (`createEvent`, `updateEvent`, `deleteEvent`, `createInstanceOverride`) unconditionally reject. `getCapabilities()` returns `{ canCreate: false, canEdit: false, canDelete: false }`.
- Events are typed `single`, `allDay: true`, `date: YYYY-MM-DD`, ID format `date-holidays:{date}:{name}`.
- **Timezone:** provider intentionally omits any timezone argument to `date-holidays`. All-day events carry no time component; the plugin's [`EventEnhancer`](../system/data-flow.md) applies the global display timezone uniformly. Passing a per-provider timezone here would cause double-correction.

**Cache model:**

Results are cached in `localStorage` keyed by a djb2 hash of `country|state|region|holidayTypes|display` plus year. TTL is 30 days. Hash change on config edit = automatic cache invalidation. `localStorage` failures are silently swallowed (plugin functions correctly; data is recomputed on next open).

**Config hash inputs** (`src/providers/holidays/HolidayProvider.ts` `_computeConfigHash`):

```
country | state | region | holidayTypes | display
```

**Source files:**

- `src/providers/holidays/typesHoliday.ts` — `HolidayProviderConfig`, `HolidayTypeFilter`, `getHolidayTypesForFilter()`
- `src/providers/holidays/HolidayProvider.ts` — provider class, cache layer, `OFCEvent` conversion
- `src/providers/holidays/ui/HolidayConfigComponent.tsx` — settings modal; links to [date-holidays country list](https://github.com/commenthol/date-holidays/blob/master/docs/Holidays.md) and [type specification](https://github.com/commenthol/date-holidays/blob/master/docs/specification.md#types-of-holidays) inline

User docs: [Holidays calendar](../../user/calendars/holidays.md)

---

## Cross-provider orchestration constraints

- Registry is the only runtime router for provider read/write operations.
- Providers expose capabilities (`canCreate`, `canEdit`, `canDelete`) and optional custom hooks (`toggleComplete`, `canBeScheduledAt`).
- Persistent event identity must be surfaced through `getEventHandle()` so global identifier mapping remains stable.

Provider contract and registration rules are specified in [Provider Architecture](architecture.md) and [Provider Blueprint](provider-blueprint.md).

## Provider-agnostic recurring instance semantics

Recurring-instance completion and skip behavior must remain provider-owned while the UI and core remain provider-agnostic.

Contract location:

- `src/providers/Provider.ts` defines `RecurringInstanceState` and optional `RecurringInstanceStateProvider` hooks.

Contract shape:

- `getRecurringInstanceState(event, instanceDate)` returns normalized state (`completed`, `skipped`) for a concrete instance date.
- `setRecurringInstanceState(event, instanceDate, nextState)` applies provider-owned persistence and returns success/failure.

Design goals:

- No provider-specific recurrence fields (for example backend-specific arrays or flags) may leak into generic UI logic.
- UI checkbox and styling logic must consume only normalized `RecurringInstanceState`.
- Mutation orchestration remains generic; provider adapters translate normalized state into backend-native operations.

### Rollout pattern for additional providers

When adding recurring-instance semantics to another provider (CalDAV, Google, Tasks, etc.), follow this sequence:

1. Keep provider-specific recurrence persistence internal to the provider implementation.
2. Implement `RecurringInstanceStateProvider` in that provider.
3. Map backend-native state to `RecurringInstanceState` in `getRecurringInstanceState(...)`.
4. Map normalized target state back to backend-native write operations in `setRecurringInstanceState(...)`.
5. Avoid introducing provider-type checks in shared UI/core pathways.

This no-provider-branching rule aligns with [Data Flow](../system/data-flow.md#flow-invariants) and [Events Architecture](../events/architecture.md#design-boundaries).

### Current adoption

- TaskNotes provider implements this contract and adapts TaskNotes recurring-instance APIs behind the generic interface.
- Existing providers that do not implement this optional interface continue to use legacy fallback behavior.

## Integration anchors

- `src/providers/Provider.ts`
- `src/providers/ProviderRegistry.ts`
- `src/providers/fullnote/FullNoteProvider.ts`
- `src/providers/dailynote/DailyNoteProvider.ts`
- `src/providers/ics/ICSProvider.ts`
- `src/providers/caldav/CalDAVProvider.ts`
- `src/providers/google/GoogleProvider.ts`
- `src/providers/tasks/TasksPluginProvider.ts`
- `src/providers/tasknotes/TaskNotesProvider.ts`
- `src/providers/holidays/HolidayProvider.ts`
