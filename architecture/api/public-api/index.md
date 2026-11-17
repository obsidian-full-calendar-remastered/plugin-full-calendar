# Public JavaScript API Reference

!!! abstract "Purpose"
    The [`PublicAPI`](../../../src/api/PublicAPI.ts#L225) class provides the primary entry point for in-vault JavaScript automation (Obsidian third-party plugins, DataviewJS blocks, Templater scripts). It grants access to an [`AuthorizedAPI`](../../../src/api/PublicAPI.ts#L171) instance upon presenting a valid token.

---

## 1. API Entry Point & Access Pattern

The plugin exposes an instance of `PublicAPI` on the Obsidian plugin registry under:

```typescript
const fcPlugin = app.plugins.plugins['full-calendar'];
const publicApi = fcPlugin?.api; // Instance of PublicAPI
```

Third-party plugins obtain access programmatically using `requestAccess()`. In-vault scripts (DataviewJS / Templater) obtain access by passing a generated [Personal Access Token (PAT)](scopes-permissions.md#personal-access-tokens-pats) directly to `withToken()`.

---

## 2. PublicAPI Class Contract

Source anchor: [`src/api/PublicAPI.ts#L225`](../../../src/api/PublicAPI.ts#L225)

### `requestAccess(pluginId, reason, requestedScopes?)`

Prompts the user with an [`AuthorizationModal`](../../../src/api/AuthorizationModal.ts) requesting access for a plugin.

```typescript
public requestAccess(
  pluginId: string,
  reason: string,
  requestedScopes?: ApiScope[]
): Promise<string | null>
```

* **Parameters**:
  * `pluginId` (`string`): Unique identifier of the calling plugin (e.g. `'my-dashboard-plugin'`).
  * `reason` (`string`): Human-readable explanation displayed in the authorization modal.
  * `requestedScopes` (`ApiScope[]`, optional): Array of required permission scopes. Defaults to `['events:read']` via [`normalizeApiScopes`](scopes-permissions.md#scope-normalization).
* **Returns**: `Promise<string | null>` - Resolves to a generated UUID token string if approved by the user, or `null` if rejected or cancelled.
* **Storage Side-Effect**: Saves a new record in `FullCalendarSettings.apiTokens[token]` containing `pluginId`, `reason`, `requestedScopes`, `grantedScopes`, and `grantedAt`.

---

### `withToken(token)`

Validates a token string and returns an capability-wrapped [`AuthorizedAPI`](#3-authorizedapi-interface-specification) instance.

```typescript
public withToken(token: string): AuthorizedAPI | null
```

* **Parameters**:
  * `token` (`string`): A PAT (`ofc_pat_...`) or plugin access token.
* **Returns**: `AuthorizedAPI | null` - Returns an authorized capability object if valid, or `null` if invalid, missing, or revoked.
* **Side Effects**:
  * Updates `tokenRecord.lastUsedAt = Date.now()` and asynchronously calls `PluginState.saveSettings()`.
  * **Legacy Migration**: Automatically converts legacy `authorizedTokens` records into modern `apiTokens` records with `system:full-access` scope upon invocation.

---

## 3. AuthorizedAPI Interface Specification

Source anchor: [`src/api/PublicAPI.ts#L171`](../../../src/api/PublicAPI.ts#L171)

The table below documents every method exposed on `AuthorizedAPI`, its required scope assertion, parameter types, return types, and target subsystem:

| Method Name | Required Scope | Parameters | Return Type | Subsystem / Action |
|---|---|---|---|---|
| `openCalendar()` | `ui:open-calendar` | None | `Promise<void>` | Focuses or creates main calendar tab leaf. |
| `openSidebar()` | `ui:open-sidebar` | None | `Promise<void>` | Focuses or opens calendar right sidebar leaf. |
| `changeView(viewName)` | `ui:change-view` | `viewName: string` | `Promise<void>` | Switches FullCalendar view (e.g. `timeGridWeek`). |
| `openCreateModal(initialData?)` | `ui:modals` | `initialData?: Partial<OFCEvent>` | `void` | Launches the event creation modal UI. |
| `getAllEvents()` | `events:read` | None | `unknown[]` | Returns raw cached event collections across sources. |
| `getEventById(id)` | `events:read` | `id: string` | `OFCEvent \| null` | Returns normalized event object by ID. |
| `getEventDetails(id)` | `events:read` | `id: string` | `ApiEventDetails` | Returns event object, calendar ID, and file location. |
| `getEvents(criteria, sorts?)` | `events:read` | `criteria: EventFilterCriteria, sorts?: EventSortCriteria[]` | `QueryableEvent[]` | Runs structured filtering and sorting via [`EventFilterSortEngine`](../system/event-filtering-sorting.md). |
| `createEvent(calendarId, event, options?)` | `events:write` | `calendarId: string, event: OFCEvent, options?: { silent?: boolean }` | `Promise<boolean>` | Adds event to calendar source & writes vault note. |
| `updateEvent(eventId, event, options?)` | `events:write` | `eventId: string, event: OFCEvent, options?: { silent?: boolean }` | `Promise<boolean>` | Updates event data in storage. |
| `deleteEvent(eventId, options?)` | `events:write` | `eventId: string, options?: { silent?: boolean; instanceDate?: string; force?: boolean }` | `Promise<void>` | Deletes or suppresses event instance. |
| `moveEvent(eventId, newCalendarId, newEventData?)` | `events:write` | `eventId: string, newCalendarId: string, newEventData?: OFCEvent` | `Promise<void>` | Transfers event to a different calendar source. |
| `processEvent(eventId, processor, options?)` | `events:write` | `eventId: string, processor: (e: OFCEvent) => OFCEvent, options?: { silent?: boolean }` | `Promise<boolean>` | Atomic read-modify-write event transaction. |
| `toggleRecurringInstance(eventId, instanceDate, isDone)` | `events:write` | `eventId: string, instanceDate: string, isDone: boolean` | `Promise<void>` | Toggles completion state for recurring instance. |
| `modifyRecurringInstance(eventId, instanceDate, newEvent)` | `events:write` | `eventId: string, instanceDate: string, newEvent: OFCEvent` | `Promise<void>` | Overrides recurring event instance details. |
| `scheduleTask(taskId, date, allDay?)` | `events:write` | `taskId: string, date: Date, allDay?: boolean` | `Promise<void>` | Schedules task item to calendar date. |
| `validateTaskSchedule(taskId, date)` | `events:write` | `taskId: string, date: Date` | `Promise<{ isValid: boolean; reason?: string }>` | Validates task scheduling feasibility. |
| `getCalendarSources()` | `providers:read` | None | `CalendarInfo[]` | Returns all registered calendar source configurations. |
| `getProviderCapabilities(calendarId)` | `providers:read` | `calendarId: string` | `ProviderCapabilities` | Returns capability flags for provider source. |
| `revalidateRemoteCalendars(force?)` | `providers:write` | `force?: boolean` | `void` | Triggers background reload of remote calendars. |
| `reloadProviderNow(calendarId)` | `providers:write` | `calendarId: string` | `void` | Forces immediate reload of specific calendar. |
| `getSettings()` | `settings:read` | None | `FullCalendarSettings` | Returns cloned deep copy of current settings. |
| `updateSettings(partial, options?)` | `settings:write` | `partial: Partial<FullCalendarSettings>, options?: { save?: boolean }` | `Promise<void>` | Updates and persists plugin configuration. |
| `saveSettings()` | `settings:write` | None | `Promise<void>` | Persists current plugin settings to disk. |
| `loadSettings()` | `settings:read` | None | `Promise<void>` | Reloads plugin settings from disk. |
| `getInternalState()` | `system:full-access` | None | `InternalState` | Returns raw singletons (`plugin`, `cache`, `registry`, etc.). |

---

## 4. Scope Assertion & Error Handling

Each method invocation on `AuthorizedAPI` internally calls [`assertScope(grantedScopes, requiredScope)`](../../../src/api/PublicAPI.ts#L28):

```typescript
function assertScope(grantedScopes: ApiScope[], required: ApiScope) {
  if (!hasApiScope(grantedScopes, required)) {
    throw new Error(`Full Calendar API: Missing required scope: ${required}`);
  }
}
```

!!! failure "Scope Error Handling"
    If an integration script attempts to invoke a method without holding the required scope (or `system:full-access`), an exception is thrown immediately:
    
    ```javascript
    try {
      api.createEvent("work-cal", eventData);
    } catch (err) {
      console.error(err.message); 
      // Output: "Full Calendar API: Missing required scope: events:write"
    }
    ```

---

[Back to API Index](index.md) · [Overview](overview.md) · [REST Server](rest-server.md) · [Scopes & Permissions](scopes-permissions.md)
