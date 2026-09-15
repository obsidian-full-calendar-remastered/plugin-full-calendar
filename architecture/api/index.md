# API Architecture

!!! abstract "Philosophy"
    These docs provide a **comprehensive, high-density, and navigable** source of truth for the Full Calendar Remastered developer API and local REST server. We prioritize precise contracts, compact reference tables, code-anchored invariants, and direct hyperlinking so maintainers and third-party developers can build, integrate, and verify programmatic interfaces quickly.

!!! info "Two Audiences, One Contract"
    * **[User Feature Documentation](../../user/features/api.md)**: Explains UI setup, Personal Access Token generation, basic cURL/DataviewJS code snippets, and security toggles.
    * **API Architecture Docs**: Defines exact component boundaries, permission scope checks, REST endpoint schemas, authorization modal lifecycles, and `InternalAPI` execution contracts. Both tracks must remain synchronized.

!!! warning "Security & Process Invariants"
    The API layer MUST enforce strict capability-gated authorization on all entry points. The local HTTP listener binds strictly to `127.0.0.1` on desktop environments and disables itself on mobile. State mutations MUST route through [`EventCache`](../system/eventcache.md) or [`ProviderRegistry`](../calendars/architecture.md) to preserve vault integrity.

---

## Decision Matrix

| Question | Start Here | Related Deep Dive |
|---|---|---|
| What is the overall API architecture and system flow? | [Overview](overview.md) | [Data Flow](../system/data-flow.md) |
| How do in-vault plugins call the JavaScript API? | [Public JS API](public-api.md) | [Recipes & Integration Blueprints](recipes-blueprints.md#1-third-party-obsidian-plugins) |
| How do external scripts or CLI tools query/mutate via HTTP? | [REST Server Specification](rest-server.md) | [Recipes & Integration Blueprints](recipes-blueprints.md#4-cli--external-automation-python-bash) |
| What permission scopes exist and how are tokens validated? | [Scopes & Permissions](scopes-permissions.md) | [Public JS API](public-api.md#token-authentication--validation) |
| How does `InternalAPI` translate API calls into cache & view actions? | [Internal API Engine](internal-api.md) | [EventCache Contract](../system/eventcache.md) |
| How do I write DataviewJS, Templater, or Python recipes? | [Recipes & Integration Blueprints](recipes-blueprints.md) | [User API Feature Guide](../../user/features/api.md) |

---

## Component Scope Map

| Component | Class / Entry Point | Responsibility | Key File Anchor |
|---|---|---|---|
| **Public API** | [`PublicAPI`](../../../src/api/PublicAPI.ts#L225) | Exposed on `app.plugins.plugins['full-calendar'].api`. Manages `requestAccess()` modal prompts and `withToken()` capability verification. | [`src/api/PublicAPI.ts`](../../../src/api/PublicAPI.ts) |
| **Authorized API** | [`AuthorizedAPI`](../../../src/api/PublicAPI.ts#L171) | Capability-wrapped interface returned by `withToken()`. Enforces per-method scope assertions. | [`src/api/PublicAPI.ts`](../../../src/api/PublicAPI.ts#L34) |
| **REST Server** | [`LocalServer`](../../../src/api/LocalServer.ts#L62) | Local Node.js HTTP listener (`127.0.0.1:${port}`). Intercepts Bearer token requests and routes to `AuthorizedAPI`. | [`src/api/LocalServer.ts`](../../../src/api/LocalServer.ts) |
| **Internal Engine** | [`InternalAPI`](../../../src/api/InternalAPI.ts#L27) | Unexposed engine executing workspace leaf focus, view changing, modal creation, and event querying. | [`src/api/InternalAPI.ts`](../../../src/api/InternalAPI.ts) |
| **Scope System** | [`apiScopes`](../../../src/api/apiScopes.ts#L12) | Normalizes scope arrays (`normalizeApiScopes`), verifies scope grants (`hasApiScope`), defines `FULL_ACCESS_SCOPE`. | [`src/api/apiScopes.ts`](../../../src/api/apiScopes.ts) |
| **Auth Modal** | [`AuthorizationModal`](../../../src/api/AuthorizationModal.ts#L18) | User-facing consent modal shown when an Obsidian plugin invokes `requestAccess()`. | [`src/api/AuthorizationModal.ts`](../../../src/api/AuthorizationModal.ts) |

---

## Architectural Rules & Invariants

1. **Bouncer Boundary**: Neither `PublicAPI` nor `LocalServer` may directly mutate cache state or bypass scope evaluation. All operations MUST be validated through `withToken()` or `assertScope()`.
2. **Localhost Isolation**: [`LocalServer`](../../../src/api/LocalServer.ts#L94) MUST bind exclusively to IPv4 `127.0.0.1`. Remote binding or network exposure is strictly forbidden.
3. **Platform Safety**: On mobile environments (iOS/Android Capacitor), `LocalServer.start()` MUST NOT instantiate Node.js `http` listeners to prevent runtime exceptions.
4. **Canonical State Authority**: All event additions, edits, deletions, and moves MUST execute through [`EventCache`](../system/eventcache.md) methods (`addEvent`, `updateEventWithId`, `deleteEvent`, `moveEventToCalendar`), never by directly modifying memory structures.

---

## Implementation Anchors

* Public bouncer & token store: [`src/api/PublicAPI.ts`](../../../src/api/PublicAPI.ts)
* Authorized API capability wrapper: [`src/api/PublicAPI.ts#L34`](../../../src/api/PublicAPI.ts#L34)
* Local HTTP server & request routing: [`src/api/LocalServer.ts`](../../../src/api/LocalServer.ts)
* Internal action dispatcher: [`src/api/InternalAPI.ts`](../../../src/api/InternalAPI.ts)
* Scope definitions & checking logic: [`src/api/apiScopes.ts`](../../../src/api/apiScopes.ts)
* Plugin consent modal: [`src/api/AuthorizationModal.ts`](../../../src/api/AuthorizationModal.ts)
* Settings schema & PAT tokens: [`src/types/settings.ts#L180-L200`](../../../src/types/settings.ts)

---

Compact index: [Overview](overview.md) · [Public JS API](public-api.md) · [REST Server](rest-server.md) · [Scopes & Permissions](scopes-permissions.md) · [Internal API](internal-api.md) · [Recipes & Blueprints](recipes-blueprints.md) · [System Index](../system/index.md)
