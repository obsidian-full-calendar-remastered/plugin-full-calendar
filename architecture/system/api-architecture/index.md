# API Architecture

!!! abstract "Dedicated API Architecture Section"
    The API documentation has been expanded into a dedicated, clean, high-density architectural documentation section.
    
    Please visit **[API Architecture Index](../api/index.md)** for complete specifications:
    
    * 🏛️ **[API Architecture Overview](../api/overview.md)**: System flow, dual-layer design, and security sandbox model.
    * ⚡ **[Public JavaScript API](../api/public-api.md)**: In-vault plugin registry lookup, `requestAccess()`, and `AuthorizedAPI` method contracts.
    * 🌐 **[Local REST Server](../api/rest-server.md)**: HTTP daemon (`127.0.0.1:8540`), CORS headers, Bearer token middleware, and REST schemas.
    * 🛡️ **[Scopes & Permissions](../api/scopes-permissions.md)**: Capability matrix, token storage, and revocation mechanics.
    * 🧩 **[Internal API Engine](../api/internal-api.md)**: Active view tracking, workspace leaves, and `EventCache` integration.
    * 📘 **[Recipes & Blueprints](../api/recipes-blueprints.md)**: Production code blueprints for plugins, DataviewJS, Templater, and Python.

---

## Quick Component Summary

| Component | Responsibility | Must Not Own | Deep Dive |
|---|---|---|---|
| [`PublicAPI`](../../src/api/PublicAPI.ts#L225) | Bouncer surface on `app.plugins.plugins['full-calendar'].api`. Handles token verification, PAT resolution, and plugin access request modals. | Direct event state or provider I/O. | [Public JS API Spec](../api/public-api.md) |
| [`LocalServer`](../../src/api/LocalServer.ts#L62) | Localhost HTTP server (`127.0.0.1:${port}`) running in Node.js. Translates incoming REST API requests (Bearer Token) into programmatically executed operations. | UI presentation or file writing policies. | [REST Server Spec](../api/rest-server.md) |
| [`InternalAPI`](../../src/api/InternalAPI.ts#L27) | Executes raw actions (querying, opening views, modifying events) using [`PluginState`](core-systems.md). | Third-party validation logic or CLI exposure. | [Internal API Engine](../api/internal-api.md) |
| [`PluginState`](core-systems.md) | Runtime singleton holding references to settings, cache, registry, and system capabilities. | Alternative sources of state. | [Core Systems Spec](core-systems.md) |
| [`EventCache`](eventcache.md) | Canonical cached event state and database mutations. | UI decisions or CLI protocol formatting. | [EventCache Contract](eventcache.md) |
| [`ProviderRegistry`](../calendars/architecture.md) | Network/Local calendar source route management and synchronization. | Client filtering engines. | [Provider Architecture](../calendars/architecture.md) |

---

[API Architecture Index](../api/index.md) · [System Architecture Index](index.md)
