# Permission Scopes & Security Architecture

!!! abstract "Security Philosophy"
    Full Calendar Remastered enforces a capability-gated security model. Callers are granted specific **scopes** upon authorization. No third-party script or REST client can execute actions beyond its granted scopes.

---

## 1. Permission Scope Specifications

Source anchor: [`src/api/apiScopes.ts#L12`](../../../src/api/apiScopes.ts#L12)

The system defines 11 granular permission scopes:

| Scope ID (`ApiScope`) | Label | Description | Capability / Methods Allowed | Risky Flag |
|---|---|---|---|---|
| `ui:open-calendar` | Open calendar | Open or focus the main calendar view leaf. | `openCalendar()` | No |
| `ui:open-sidebar` | Open sidebar | Open or focus the right calendar sidebar view leaf. | `openSidebar()` | No |
| `ui:change-view` | Change view | Switch active view (`timeGridWeek`, `dayGridMonth`, etc.). | `changeView()` | No |
| `ui:modals` | Open modals | Launch event creation and editing modal dialogs. | `openCreateModal()` | No |
| `events:read` | Read events | Query cached events, event details, and file locations. | `getAllEvents()`, `getEventById()`, `getEventDetails()`, `getEvents()` | No |
| `events:write` | Write events | Create, modify, move, process, schedule, or delete events. | `createEvent()`, `updateEvent()`, `deleteEvent()`, `moveEvent()`, `processEvent()`, `toggleRecurringInstance()`, `modifyRecurringInstance()`, `scheduleTask()`, `validateTaskSchedule()` | No |
| `providers:read` | Read providers | List configured calendar sources and capability flags. | `getCalendarSources()`, `getProviderCapabilities()` | No |
| `providers:write` | Control providers | Trigger background revalidation or force-reload providers. | `revalidateRemoteCalendars()`, `reloadProviderNow()` | No |
| `settings:read` | Read settings | Read current plugin settings configuration. | `getSettings()`, `loadSettings()` | No |
| `settings:write` | Write settings | Update and persist plugin configuration settings. | `updateSettings()`, `saveSettings()` | No |
| `system:full-access` | Full control | Unrestricted access to raw internal plugin state. | `getInternalState()` + all above methods | **Yes** (`risky: true`) |

---

## 2. Scope Evaluation Logic

Source anchor: [`src/api/apiScopes.ts#L73-L92`](../../../src/api/apiScopes.ts#L73-L92)

### Scope Normalization (`normalizeApiScopes`)
Sanitizes user or plugin requested scopes against known scope IDs:

```typescript
export function normalizeApiScopes(scopes?: ApiScope[]): ApiScope[] {
  const requested: ApiScope[] = scopes && scopes.length > 0 ? scopes : ['events:read'];
  const unique = new Set<ApiScope>();
  requested.forEach((scope: ApiScope) => {
    if (scopeIds.has(scope)) {
      unique.add(scope);
    }
  });
  return Array.from(unique);
}
```

### Scope Checking (`hasApiScope`)
Evaluates whether a granted scope list satisfies a required scope:

```typescript
export function hasApiScope(granted: Iterable<ApiScope>, required: ApiScope): boolean {
  const grantSet = new Set(granted);
  return grantSet.has(FULL_ACCESS_SCOPE) || grantSet.has(required);
}
```

!!! tip "Full Access Super-Scope"
    Holding `system:full-access` automatically satisfies any required scope check across the entire API surface.

---

## 3. Token Storage Schema & Persistence

Source anchor: [`src/types/settings.ts`](../../../src/types/settings.ts)

Tokens are stored inside `FullCalendarSettings.apiTokens` keyed by token string:

```typescript
export interface ApiTokenRecord {
  pluginId: string;
  reason: string;
  requestedScopes: ApiScope[];
  grantedScopes: ApiScope[];
  grantedAt: number;
  lastUsedAt?: number;
}
```

### Personal Access Tokens (PATs) vs Plugin Tokens
* **Plugin Access Tokens**: Issued when a plugin calls [`PublicAPI.requestAccess()`](public-api.md#requestaccesspluginid-reason-requestedscopes). Stored with `pluginId: 'your-plugin-id'`.
* **Personal Access Tokens (PATs)**: Generated manually by the user in **Settings → API & Security**. Prefixed with `ofc_pat_` and assigned `pluginId: 'personal'`.

### Legacy Token Migration
When [`PublicAPI.withToken(token)`](public-api.md#withtokentoken) encounters a legacy token record in `settings.authorizedTokens`, it automatically migrates the token to the `apiTokens` store:

```typescript
const migratedRecord: ApiTokenRecord = {
  pluginId: legacyToken.pluginId,
  reason: legacyToken.reason,
  requestedScopes: [FULL_ACCESS_SCOPE],
  grantedScopes: [FULL_ACCESS_SCOPE],
  grantedAt: legacyToken.grantedAt
};
tokenStore[token] = migratedRecord;
void PluginState.saveSettings();
```

---

## 4. Threat Model & Security Mitigations

| Threat Vector | Risk Level | Mitigation Strategy |
|---|---|---|
| **Unauthorized External Access** | Critical | REST server binds strictly to `127.0.0.1`. Requests without valid Bearer tokens are rejected with `401 Unauthorized`. |
| **Plugin Over-Privilege** | High | Modal prompts display requested scopes. Users can deselect risky scopes before approving. |
| **Token Compromise / Exposure** | High | Users can instantly revoke any token in **Settings → API & Security**, invalidating it across JS and REST interfaces. |
| **Mobile Runtime Exceptions** | Medium | REST listener is disabled on mobile platforms (`PluginState.isMobile()`). |

---

[Back to API Index](index.md) · [Overview](overview.md) · [Public JS API](public-api.md) · [REST Server](rest-server.md)
