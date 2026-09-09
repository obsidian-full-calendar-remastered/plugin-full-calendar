# Styling Architecture & CSS Audit

- **Date**: 2026-07-16
- **Plugin Version**: 0.13.4.4 (Beta)
- **Status**: Active / Deduplicated

!!! abstract "Styling Philosophy"
    The Obsidian Full Calendar plugin implements a local, performance-optimized, theme-compatible stylesheet architecture. By compiling separate module-level styles into a single production stylesheet bundle (`styles.css`), we maintain low layout latency while isolating custom interface designs from Obsidian's global style rules.

---

## Directory & File Mapping

Styling is modularized across the codebase to group presentation rules with their corresponding feature logic:

| Stylesheet File Path | File Size | Role & Target UI Components |
|---|---|---|
| [src/styles.css](file:///d:/Codes/plugin-full-calendar/src/styles.css) | ~41.5 KB | Global helper classes (`.u-*`), NLP Quick Add layout, Milestones timeline tracking, Milestone celebration animations, and the fullscreen Break Timer blur overlay. |
| [src/ui/settings/sections/calendars/styles/overrides.css](file:///d:/Codes/plugin-full-calendar/src/ui/settings/sections/calendars/styles/overrides.css) | ~39.8 KB | FullCalendar core overrides, daygrid/timegrid/list view configurations, edit event modal layouts, day-choice selectors, onboarding flows, and mobile responsiveness (`.is-phone`). |
| [src/chrono_analyser/ui/styles/main_styles.css](file:///d:/Codes/plugin-full-calendar/src/chrono_analyser/ui/styles/main_styles.css) | ~40.2 KB | Chrono Analyser dashboard component layouts, Plotly legends/slices styling, stats cards, and detail popups. |
| [src/features/task-backlogs/task-backlog.css](file:///d:/Codes/plugin-full-calendar/src/features/task-backlogs/task-backlog.css) | ~10.9 KB | Layouts, item cards, list groupings, and dragging animations for the standalone Task Backlog sidebar view. |
| [src/ui/settings/changelogs/changelog.css](file:///d:/Codes/plugin-full-calendar/src/ui/settings/changelogs/changelog.css) | ~9.2 KB | Version logs, what's new modals, and tab settings inside the plugin settings pane. |
| [src/features/codeblock/codeblock.css](file:///d:/Codes/plugin-full-calendar/src/features/codeblock/codeblock.css) | ~1.6 KB | Layout systems for embedded codeblocks/widgets (`.ofc-layout-horizontal`, `.ofc-layout-vertical`, `.ofc-layout-view-item`) and backlog borders. |

---

## Architectural Rules & Invariants

To avoid CSS conflicts in Obsidian's highly customizable runtime environment, all stylesheets must adhere to the following scoping and modularity rules:

### 1. Zero Global Class Pollution
Generic class names (e.g., `.container`, `.header`, `.overlay`, `.loading`, `.detail-popup`) must **never** be defined globally in any style sheet. They must be nested under their parent view container (e.g., `.chrono-analyser-view` or `.ofc-calendar-shell`).

### 2. Scoped Obsidian Overrides
Overriding Obsidian's native classes (such as `.setting-item`, `.setting-item-name`, `.setting-item-info`, or `.modal-content`) must always be scoped to the plugin's own wrapper class to prevent styling bugs from bleeding into Obsidian's main settings pane:
```css
/* CORRECT: Safe, scoped override */
.full-calendar-edit-modal .setting-item {
    display: flex;
    align-items: center;
}

/* INCORRECT: Will bleed globally, affecting other plugins and Obsidian settings */
.setting-item {
    display: flex;
}
```

### 3. Reusable UI Utilities
Shared layout patterns and UI shapes (like `.ofc-range-separator`, `.ofc-warning-box`, and `.ofc-setup-card`) should be defined under the **Generic Reusable UI Utilities** section in [src/styles.css](file:///d:/Codes/plugin-full-calendar/src/styles.css) rather than being duplicated inside separate feature stylesheets.

---

## Refactoring & Audit Log (July 16, 2026)

On July 16, 2026, an extensive styling audit was performed to resolve duplicate style statements and class selector redundancies. The refactoring accomplished:

1. **Deduplication of `src/styles.css`**: Removed a massive **182-line exact duplicate block** (lines 1779-1960) containing duplicated minimal weather, availability modal, and mobile responsive declarations.
2. **Consolidation of Layout Rules**: Removed duplicated flexbox, sizing, and structural properties for `.ofc-layout-horizontal`, `.ofc-layout-vertical`, and `.ofc-layout-view-item` in `styles.css`, shifting layout authority to the centralized definitions in `codeblock.css`.
3. **Fixing Embedded Backlog Wrapper styles**: Resolved a class mismatch where `BacklogWidgetStrategy.ts` added `ofc-embedded-backlog-container` to the DOM but `codeblock.css` targeted `.ofc-embedded-backlog`. The styles were updated to match the correct container and stripped of properties already defined in `task-backlog.css`.
4. **Verification**: Compiled CSS bundle size successfully shrunk and zero style errors were reported under the CSS linter suite (`npx eslint -c eslint.css.config.mjs`).
