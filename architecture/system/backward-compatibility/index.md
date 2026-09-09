# Backward Compatibility Tracker

!!! abstract "Philosophy"
    Full Calendar Remastered (FCR) is committed to zero-friction upgrades. This document tracks all active legacy support logic, its location in the codebase, and the rationale for maintaining it.

## Active Legacy Support

| Feature / Migration | Supported Since | Code Location | Rationale |
|---|---|---|---|
| **Timezone Auto-Upgrade** | `ea817059` | `feat(arch): Implement provider architecture, multi-account support, and notifications` |
| **ICS Path Polymorphism** | `6606ff5` | `feat: ActivityWatch FSM sync + continuity rewrite, provider identity diff, settings UX, and Tasks integrations (#142 #166 #175) (#238)` |
| **Google OAuth Migration** | `ea817059` | `feat(arch): Implement provider architecture, multi-account support, and notifications` |
| **Bulk Categorization Tool** | `c6017712` | `feat(workspace): add customizable calendar workspaces with filtering, UI, and performance improvements (#90)` |
| **Stable Source IDs** | `c6017712` | `feat(workspace): add customizable calendar workspaces with filtering, UI, and performance improvements (#90)` |
| **Category - Title Parsing** | `v0.10.0` | (Legacy feature supporting the `Category - Title` naming convention) |
| **Frontmatter Colon Title Fallback Parser** | `v0.13.5` | `src/providers/fullnote/frontmatter.ts` | Allows notes with unquoted colons in titles (`title: Super: Event`) to load even if Obsidian's YAML metadata cache fails. |

## Retired Support (Breaking Changes)

*   **v0.10.0**: Removed support for the `calendar: name` key in frontmatter in favor of directory-based source identification.
*   **v0.12.0**: Removed legacy `resourceTimeline` view support if Advanced Categorization is disabled (sanitizes to `timeGridWeek`).

## Maintenance Policy

1.  **Detection**: Legacy data should be detected at the "Read/Load" boundary.
2.  **Reparation**: Whenever possible, the plugin should perform a "Lazy Upgrade" (upgrading data only when it is modified by the user).
3.  **Deprecation Notices**: Before retiring any support, a console warning and 3-month lead time in the [Changelog](../../changelog.md) is required.

---

[System Overview](overview.md) · [Testing and Validation](testing.md) · [Data Flow](data-flow.md)
