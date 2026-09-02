# API Integration Blueprint

!!! abstract "Dedicated Integration Recipes"
    The API integration guide has been expanded into production-ready blueprints in the new **[API Architecture Section](../api/index.md)**.
    
    Please visit **[Integration Recipes & Blueprints](../api/recipes-blueprints.md)** for full code recipes and error-handling patterns.

---

## Integration Strategies Summary

1. **Third-Party Obsidian Plugins**: Request access via `PublicAPI.requestAccess()` and call methods on `AuthorizedAPI`. See [Plugin Blueprint](../api/recipes-blueprints.md#1-third-party-obsidian-plugins).
2. **In-Obsidian User Scripts (DataviewJS / Templater)**: Pass Personal Access Token (PAT) to `PublicAPI.withToken()`. See [DataviewJS / Templater Blueprints](../api/recipes-blueprints.md#2-dataviewjs-inline-queries--dashboards).
3. **CLI / External Automation (Bash, Python, Cron)**: Enable the Local REST Server and authenticate requests via HTTP `Bearer` tokens. See [Python & cURL Blueprints](../api/recipes-blueprints.md#4-python-cli--background-automation).

---

[API Integration Recipes](../api/recipes-blueprints.md) · [API Architecture Index](../api/index.md) · [System Architecture Index](index.md)
