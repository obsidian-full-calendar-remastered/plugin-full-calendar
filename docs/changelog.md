# Full Calendar Changelog

This page provides a detailed breakdown of every version of the Full Calendar plugin, including new features, improvements, and bugfixes. 

Corresponds to  
-   **For Users**: [Releases](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/releases)  
-   **For Dev**: `git tags` of the `main` branch


## v0.13.2

### New Features

-   **[Weather Forecast Integration](user/features/weather.md)**  
    _Introduced an Open-Meteo weather integration for daily, weekly, and monthly views._  
    - Debounced geocoding and coordinates resolution in Settings  
    - In-memory cached daily weather forecasting mapped to WMO emojis and text descriptions  
    - Column-header horizontal weather panel in Day/Week views  
    - Minimal weather emoji indicators in Month view day cells  

-   **[ChronoAnalyser Demo](user/chrono_analyser/introduction.md)**  
    _Introduced the ChronoAnalyser demo to improve accessibility and provide a preview of analytical capabilities._

-   **[Dynamic Asset System (i18n + NLP)](user/features/nlp.md)**  
    _Implemented dynamic loading of i18n and NLP payloads with remote asset synchronization and GitHub Actions deployment pipeline support._

-   **Versioned Remote Asset Refresh**  
    _Added automatic remote asset refresh for ChronoAnalyser, i18n, and NLP components to ensure consistency across updates._

-   **[Google Calendar Integration](user/calendars/gcal.md)**  
    _Implemented Google calendar provider support with full event lifecycle handling._

-   **[Outlook Integration Improvements](user/calendars/outlook.md)**  
    _Enhanced Outlook provider implementation and refined integration handling._

-   **[Reactive Event Linked Notes](user/features/event-linked-notes.md)**  
    _Introduced a fully reactive linked-notes system for calendar events with template-driven note creation and metadata linking._  
    - TemplateEngine for isolated body templating  
    - LinkedNoteIndex for in-memory metadata mapping (`fc-event-uid`, `fc-calendar-id`)  
    - Decoupled utilities (`noteUtils.ts`) for note operations  
    - Provider-wide integration (Google, CalDAV, ICS, Outlook)  
    - UI integration (event modal + settings)  
    - Full unit test coverage  

-   **[Tasks Global Query Support](user/calendars/tasks-plugin-integration.md#supported-global-query-syntax)** ([#263](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/263), [#264](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/264))  
    _Added support for Obsidian Tasks global query filtering in the backlog sidebar._  
    - `includeGlobalQueryInBacklog` setting + translations  
    - SOLID-compliant `TasksQueryFilter` parser  
    - Supports path, folder, tag, priority, and regex (+/- rules)  
    - Real-time filtering in `getUndatedTasks()`  
    - Comprehensive Jest test coverage  

-   **[CalDAV VTODO Support](user/calendars/caldav.md)** ([#258](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/258))  
    _Extended CalDAV provider to support VTODO tasks and improved fetching logic._

-   **[FCR Reminder Companion Integration](user/features/fcr-reminder.md)**  
    _Implemented full integration with the FCR Reminder Companion daemon._  
    - Settings UI + synchronization pipeline  
    - 24-hour upcoming reminder payload generation  
    - Deep-link vault integration  
    - Manual sync command and NLP intent (`SYNC_FCR_REMINDER`)  
    - Startup liveness retries + high-visibility warning system  

-   **[Unified Reminder System](user/features/reminders.md)**  
    _Centralized notification logic via `NotificationManager`._  
    - Single source of truth for trigger calculation  
    - Support for custom `notify` frontmatter overrides  
    - Companion mutex to suppress duplicate notifications  
    - Public API exposure for reusable payload generation  
    - Full Jest test suite  

-   **[Daily Note Enhancements](user/calendars/dailynote.md)** ([#208](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/208))  
    _Added support for Day Planner format integration in daily notes._


### Improvements & Fixes

-   **CalDAV Timezone Handling** ([#265](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/265))  
    _Improved ICS timezone serialization to ensure correctness across local and UTC contexts._  
    - Added `addTimeProperty` helper to enforce TZID consistency  
    - Correct UTC construction using `ical.Time` options  
    - Expanded formatter test coverage  
    - Updated timezone architecture documentation  

-   **Event Cache Stability & UI Refresh** ([#262](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/262))  
    _Improved update propagation and UI refresh behavior._  
    - Pass affected calendar IDs through sync pipeline  
    - Prevent unnecessary FullCalendar reloads  
    - Enforce partial refresh (UI Refresh Invariant)  
    - Added comprehensive type-safe Jest tests  

-   **Google & Outlook Fixes** ([#268](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/268))  
    _Fixed CalendarSettings state management inconsistencies._

-   **Instance Initialization Fixes**  
    _Added listener for instance initialization and ensured proper source updates in CalendarSettings._

-   **Linked Notes Stability Improvements**  
    _Fixed note creation, templating, and frontmatter serialization issues across providers._

-   **Daily Note Serialization Fix**  
    _Resolved incorrect object stringification in `notify` attributes._

-   **ICS / VTODO Compliance Fixes** ([#258](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/258), [#257](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/257))  
    _Aligned VTODO handling with RFC 5545 inclusive DUE semantics._  
    - Removed incorrect +/-1 day adjustments  
    - Fixed negative duration issues  
    - Unified behavior across single and recurring tasks  
    - Expanded parser and formatter test coverage  

-   **ICS Serialization Improvements**  
    _Enhanced VTODO serialization and timezone handling consistency._

-   **Reminder System Refactor**  
    _Simplified FCR Reminder integration by delegating payload generation to `NotificationManager`._

-   **Code Cleanup**  
    _Removed outdated Outlook provider exports and improved internal structure._


---


## v0.13.0

-   **[Natural Language Processing (NLP)](user/features/nlp.md)** ([#253](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/253), [#255](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/255))  
    _Introduced the FCR Command NLP engine for natural language scheduling. Features include duration parsing, next-occurring day logic, recurrence, smart calendar matching, and explicit category/time extraction._

-   **[TaskNotes Integration](user/calendars/tasknotes.md)** ([#245](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/245), [#253](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/253))  
    _Added seamless integration with the TaskNotes plugin. Supports event sync, updates, completion handling, recurring task creation, and NLP-driven task selector prefilling._

-   **[Milestones System](user/features/milestones.md)** ([#255](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/255))  
    _Introduced a brand new Milestones tracking system to reward user actions (creating, moving, updating events) with a dedicated UI modal, toast notifications, and NLP intent integration._

-   **[Outlook Integration](user/calendars/outlook.md)** ([#259](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/259))  
    _Added robust Outlook integration featuring OAuth2 with PKCE, full recurrence support, and improved frontmatter/metadata handling._

-   **[FullCalendar API](user/settings/api.md)** ([#253](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/253))  
    _Exposed a public API for programmatic calendar control, secured by scoped access and token management._

-   **Tasks Plugin Enhancements** ([#208](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/208), [#250](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/250), [#254](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/254))  
    _Added Day Planner format support, 24h time prefix serialization, and a bulk migration action. Also added deduplication for mirrored tasks and fuzzy search/filtering in the task backlog._

-   **CalDAV Enhancements** ([#234](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/234), [#251](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/251))  
    _Hardened mobile auth with a runtime-safe fallback, improved import UX with structured error reporting, and fixed calendar object fetching._

-   **Event Cache & Core Refactoring** ([#253](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/253))  
    _Completely refactored (implementation logic untouched) the Event Cache into `CacheMutationHandler`, `CacheSubscriptionManager`, and `CacheSyncHandler` for optimistic UI updates and improved recurring event handling._

-   **General Event Fixes** ([#244](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/244), [#256](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/256))  
    _Fixed 1-hour duration default when converting all-day to timed events, fixed DailyNote UID collisions on moves, hardened ICS `RECURRENCE-ID` handling, and improved frontmatter parsing reliability._

-   **i18n & UI** ([#246](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/246), [#249](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/249), [#216](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/216))  
    _Added Chinese (zh) localization, translated remaining hardcoded text, unified modal styles, and anchored drag mirrors to the viewport for better event handling._

---

## v0.12.9

-   **ActivityWatch sync** ([#238](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/238))  
    _Added a dedicated ActivityWatch sync engine with continuity-aware ingestion, auto-sync scheduling, and title templating._

-   **Tasks integrations** ([#142](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/142), [#166](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/166), [#175](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/175))  
    _Expanded Tasks backlog and display settings, plus payload handling and workflow improvements._

-   **Core sync identity** ([#238](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/238))  
    _Switched sync handling to keyed identity diffs with reverse lookup maps and safer continuity replacement to reduce churn and duplicate blocks._

-   **Settings and calendar UX**  
    _Updated settings navigation, calendar interactions, search behavior, and mobile responsiveness._

-   **Build, docs, and i18n**  
    _Reduced startup and bundle overhead, refreshed locale loading, and added ActivityWatch architecture documentation._

---

## v0.12.8

Thanks to [@oskardotglobal](https://github.com/oskardotglobal) and [@rolfkleef](https://github.com/rolfkleef) for their contributions in this release!


-   **Tasks Time Features** ([#227](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/227))  
    _Tasks can now have an optional time block._
    -   Add drag-drop task time block updates. Dragging to a time updates the start time; dragging to all-day removes it.

-   **CalDAV enhancements** ([#230](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/230))  
    _Auto-fetch calendar name and color when importing a collection, and correctly validate it._

-   **Advanced Categorization enhancements** ([#222](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/222), [#231](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/231))  
    _More robust advanced categorization workflows._
    -   Added "Disable without cleanup" option to advanced categorization modal.


-   **Robust timezone handling for recurring/all-day events** ([#194](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/194), [#223](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/223), [#231](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/231))  
    _Timezone handling has been further hardened._
    -   Prevent `RRULE TZID` one-day date shift when recurring.
    -   Prevent timezone shift for all-day date-only events (floating dates).

-   **Provider file sync refactor** ([#224](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/224))  
    _Refactored `ProviderRegistry` file delete handling during rename races. Fixed `FullNoteProvider` rename logic to avoid `ENOENT` errors._

-   **Remote Payload Hardening** ([#218](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/218))  
    _Handle null-body statuses and fail fast on malformed CalDAV xml payloads to prevent ghost syncing issues._

-   **UI, Workspaces & Localization**  
    _Desktop and mobile UI responsiveness updates. Workspace calendar filters now show user-defined calendar names making it easier to distinguish when you have multiples of the same source. Updated ES/FR/IT translations._

---

## v0.12.7.1

-   **Asynchronous Event Discovery Pipeline**  
    _The core synchronization engine has been rewritten to eliminate UI freezes and dramatically improve load performance._
    -   Re-architected `ProviderRegistry` remote discovery into a true Stage 1 → Stage 2 pipeline.
    -   Stage 2 for each provider now begins immediately after its own Stage 1 completes, removing the previous global Promise barrier.
    -   Enables background pipelining and significantly reduces perceived startup time.

-   **Local Provider Concurrency**  
    _Improved I/O throughput and removed unnecessary blocking during startup._
    -   Parallelized Local Provider Stage 1 reads using `Promise.all` instead of sequential `for..of` iteration.
    -   Prevents main-thread stalls during large vault scans.

-   **EventCache Optimization**  
    _Removed expensive diffing operations that caused major slowdowns on large datasets._
    -   Eliminated O(N) `JSON.stringify` comparisons in `EventCache.syncCalendar` when cache size changes significantly (e.g., Stage 2 replacing Stage 1 data).
    -   Added short-circuit invalidation logic to bypass redundant comparisons.

-   **Selective UI Reconciliation**  
    _Replaced full calendar teardown cycles with targeted updates._
    -   Updated `EventCache` and `CalendarView` flush callbacks to accept an `affectedCalendars` array.
    -   Replaced `removeAllEventSources()` with selective `removeEventSource` / `addEventSource` operations for dirty calendars only.
    -   Fully resolves prior 1–3 second UI freezes during large refreshes.

-   **DailyNoteProvider Algorithm Fix**  
    _Eliminated a critical O(N²) bottleneck in event resolution._
    -   Removed full Vault Daily Note cache iteration from `getEventHandle`.
    -   Events now resolve purely by date string.
    -   `ProviderRegistry` securely injects authoritative `location.path` metadata before write/delete operations.

-   **Performance Audit Results**  
    _Benchmark run on 1000+ Daily Note events and 69 Google Calendar events._
    -   Daily Note Stage 1: 1209.1ms → 110.8ms (~11x faster)
    -   Daily Note Stage 2: 2839.4ms → 143.3ms (~20x faster)
    -   Remote Stage timings remain steady while now starting earlier in the pipeline.
    -   Total two-stage discovery: 4880.9ms → 908.9ms (>5x faster overall)
    -   Complete elimination of observable main-thread UI freezing on load.

-   **Linting & Type Safety**  
    _Strengthened long-term maintainability and compliance._
    -   Enforced ESLint rules for UI string formatting consistency.
    -   Improved TypeScript type safety across core components.
    -   Refactored related modules to align with stricter linting and safer type contracts.

---

## v0.12.7

-   **Local ICS Support**  
    _You can now view `.ics` files stored directly in your Obsidian vault!_
    -   Added a mode toggle for standard Web URLs versus Vault relative files.
    -   Extended provider interfaces to safely support the `app.vault` API.

-   **Timezone & DST Hardening** ([#194](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/194))  
    _The timezone pipeline has been modularized and significantly hardened for recurring events crossing Daylight Saving Time boundaries._
    -   Removed `luxon` entirely in favor of native and internal logic.
    -   Corrected floating time expansion, EU/US DST transitions, and half-hour/45-min offset zones.
    -   Restored dynamic display timezone toggles.
    -   Fixed missing DTSTART/EXDATE alignment in RRule passthrough.

-   **Staged Loading Architecture**  
    _Dramatic startup performance and UI responsiveness improvements._
    -   Providers now load events in two stages: Stage 1 quickly fetches a 3-month window surrounding the current date, while Stage 2 quietly loads the full history in the background.
    -   Eliminates UI locking when CalDAV or Google APIs stall or time out on huge event caches.

-   **Linting & Code Quality**  
    _The codebase has been migrated to standard `eslint.config.mjs` and native `eslint-plugin-obsidianmd`._
    -   Refactored 80+ warnings across 18 core files.
    -   Eliminated thousands of unsafe `any` usages and tightened type safety for caching and Google Auth.
    -   Safeguarded tests with mocked vaults and standard JS generic mocks.

-   **General UI Fixes** ([#169](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/169), [#191](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/191), [#214](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/214), [#218](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/218))  
    _Fixed LiveSync header injections by targeting `contentEl`, improved mobile responsiveness across fullcalendar views, improved edit modal error namespace, and added proper API error handling for HTTP POST timeouts._

---

## v0.12.6

Thanks to [@kapej42](https://github.com/kapej42) and [@mivanit](https://github.com/mivanit) for the incredible contributions in this release!

-   **Full CalDAV Two-Way Sync** ([#205](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/205))  
    _CalDAV calendars are no longer read-only! You can now create, edit, and delete events directly in Obsidian, and changes will sync back to your CalDAV server._

-   **Mobile Workspace Support** ([#203](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/203))  
    _Workspaces are now fully accessible on mobile!_
    -   Added workspace button to footer toolbar on mobile/narrow views.
    -   Improved menu handling and truncated labels for better fit.
    -   Renamed button from `WS ▾` to `Workspace ▾` for clarity.

-   **Mobile Monthly View** ([#201](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/201))  
    _You can now access the monthly view on mobile devices via the view dropdown or workspace settings._

-   **Rich Read-Only Modal** ([#205](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/205))  
    _The event details modal for read-only events has been upgraded to show rich information including descriptions, attendees, and more, matching the editing experience._

-   **ICS Parsing & Date Validation** ([#199](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/199), [#203](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/203))  
    _Major hardening of the ICS parser for better compatibility and stability:_
    -   **Timezones:** Map Windows timezones (e.g., `W. Europe Standard Time`) to IANA identifiers, fixing issues with Outlook/Exchange calendars falling back to UTC.
    -   **Date Handling:** Convert `YYYYMMDD` dates to ISO format, validated skip dates in recurring events, and handled all-day events more robustly.
    -   **Validation:** Added defensive checks to prevent `RangeError: Invalid time value` crashes and improved error logging.

-   **Google Calendar Settings** ([#204](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/204))  
    _Fixed an issue where the Google Calendar settings menu for credentials was not displaying correctly._

-   **Title Parsing** ([#203](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/203))  
    _Fixed category parsing to prevent false positives (e.g., "anything - Red Hat One") and now shows the full title when no category is defined._

-   **Other Fixes**  
    -   Scheduler license key is now only included when the resource-timeline plugin is loaded.
    -   Updated `CONTRIBUTING.md` standards.

---


## v0.12.5

-   **CalDAV validation and parsing** ([#193](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/193))  
    _CalDAVProvider now validates calendar collections with PROPFIND, parses calendar-data via DOMParser, adds JSDOM-backed tests, and surfaces clearer errors when a URL is not a calendar collection._

-   **Provider initialization and cache refresh** ([#173](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/173))  
    _Providers call initialize() after construction, load events into the cache with completion callbacks, adjust load priorities, and resync event sources without a full calendar rebuild._

-   **Google auth and recurring timezone handling** ([#191](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/191), [#190](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/190), [#94](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/94))  
    _Mobile OAuth opens windows synchronously to avoid popup blockers; recurring Google events now honor exdates and BYDAY across timezones, correctly hiding deleted instances and preserving durations across DST._

-   **ChronoAnalyser data integrity and Bases provider**  
    _ChronoAnalyser pulls from the main EventStore with corrected category/project parsing, and you can now add an Obsidian Bases calendar (with a guard to enable the Bases plugin first)._ 

---


## v0.12.4

-   **CalDAV and Provider Architecture Refactor** ([#102](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/102))  
    _The calendar source/provider system has been refactored for modularity, reliability, and easier extension. CalDAV support is now more robust and easier to configure._

-   **Multi-Language (i18n) Support**  
    _Full Calendar now supports multiple languages. The UI will automatically switch based on your Obsidian language setting. Developers can add new translations via the i18n system with type-safe keys._

-   **Provider Registry and Error Handling**  
    _Provider registry logic has been improved for better calendar source management and error handling. Adding new calendar types is now simpler and safer._

-   **Documentation and Translation Files**  
    _Updated documentation and added instructions for contributing new translations. See [i18n documentation](user/features/i18n.md)._ 

---


## v0.12.3.1-beta

-   **Tasks Provider Rearchitected for Performance and Precision** ([#151](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/151), [#155](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/155))  
    _The Tasks provider is now powered by the official Tasks plugin's live cache, eliminating manual vault scans and delivering instant updates. Edits are now "surgical," preserving user metadata like links, tags, and comments when scheduling or completing tasks._

-   **Robust and Stable Settings UI** ([#141](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/141))  
    _The settings panel has been refactored for stability. The color picker no longer loses focus on changes, and a new `CalendarSettingRow` component ensures a consistent and reliable layout for all calendar sources._

-   **Provider-Specific Task Completion** ([#143](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/143), [#144](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/144))  
    _The `toggleComplete` logic is now abstracted, allowing calendar providers to implement their own custom behavior for completing tasks._

-   **ICS Timezone Fallback** ([#91](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/91))  
    _Remote ICS calendars with unrecognized timezones will now safely fall back to UTC instead of failing to load._

---


## v0.12.3

-   **Deep Tasks Integration with Backlog & Filtering** ([#122](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/122), [#128](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/128), [#136](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/136))  
    _Full Calendar now has first-class support for the Obsidian Tasks plugin. A new "Tasks" calendar source syncs your tasks directly onto the calendar. Features include a dedicated task backlog, drag-and-drop rescheduling, and in-calendar completion. Create, update, and delete tasks without leaving the calendar view._

-   **Advanced Date Navigation** ([#106](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/106))  
    _Navigate your calendar with precision using the new "Go To" dropdown in the toolbar. It features a reusable `DatePicker` and context-aware navigation. Right-click on the calendar to jump to a specific month, week, or day._

-   **Task Management Workflow & Parsing** ([#132](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/132), [#134](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/134), [#138](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/138))  
    _The Tasks integration includes advanced parsing for dated and undated tasks, multi-day event support, and custom status detection. A new setting allows stripping tags from task titles for a cleaner display. The entire parsing logic is covered by a comprehensive test suite for maximum reliability._

-   **Performance & Stability**  
    _The plugin now performs surgical updates on file changes instead of full-vault rescans, significantly improving performance in large vaults. Remote calendars now load in a non-blocking, priority-ordered manner, and race conditions during event source removal have been fixed._

-   **Provider Architecture**  
    _The provider registry now loads calendars with priority and uses a new `isFileRelevant()` hook for cleaner file-change handling. "Manage calendar" logic has been delegated to the respective providers for better modularity._

-   **Notification and Reminder Reliability**  
    _End-time reminders now fire correctly for events that are already in progress, ensuring you never miss the end of an important block of time._

-   **Core Component Stability** ([#100](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/100), [#101](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/101), [#126](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/126))  
    _Fixed numerous bugs, including a race condition when removing event sources, an issue preventing the create modal from appearing if no editable calendars exist, and a bug where the Daily Notes calendar would fail without a template. New calendars now appear instantly in settings without a "Provider not found" flash._

---


## v0.12.2 (beta)

-   **Multi-day Daily Note events with explicit endDate**  
    _Daily Note calendar now supports explicit multi‑day events via `[endDate:: YYYY-MM-DD]` while remaining backward compatible with legacy overnight detection._

-   **Central TimeEngine**  
    _Single timer maintains a sorted time-sensitive cache and publishes a `time-tick` event consumed by status bar, notifications, and other listeners._

-   **Status Bar current/upcoming events**  
    _Lightweight status bar UI subscribes to `TimeEngine` to surface what's happening now and next._

-   **Interactive time‑axis zoom** ([#96](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/96))  
    _Ctrl/Cmd + scroll to dynamically zoom the vertical (timeGrid) or horizontal (resourceTimeline) axis for fast focus changes._

-   **Advanced recurrence intervals & positional monthly rules** ([#97](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/97))  
    _Support for interval-based repeats (e.g., every 2 weeks) and positional monthly rules (2nd Tuesday, last Friday) with iCal import/export parity._

-   **Codebase compliance & safety**  
    _Replaced loose `any` casts, moved inline styles to CSS, added `instanceof` guards for file/folder objects, removed custom leaf detaching on unload._

-   **Reactive calendar view lifecycle**  
    _`view-config-changed` now triggers targeted cache repopulation and a new `resync` event prompts precise re-renders for snappier UI updates._

-   **NotificationManager refactor**  
    _No internal timer; now a passive subscriber to `TimeEngine`, reducing duplicate intervals and simplifying lifecycle management._

-   **Robust timezone conversion for cross-day events**  
    _`convertEvent` rewritten as a pure function; correctly handles explicit `endDate` and legacy overnight semantics with stricter type guards._

---


## v0.12.1 (beta)

-   **Event Reminder System with Desktop Notifications (BETA)**  
    _Introducing the `NotificationManager` for native desktop notifications. Users can opt-in to receive reminders 10 minutes before events start and, optionally, 10 minutes before they end. Perfect for never missing important meetings or deadlines._

-   **Multi-Account Google Calendar Integration**  
    _Google Calendar integration now supports connecting and managing multiple accounts simultaneously. Features a dedicated account management hub with a streamlined two-step wizard for adding new calendars from any connected account._

-   **Provider-Based Architecture with Multi-Account Support**  
    _Complete architectural overhaul to a provider-based system where each calendar source (Local, Daily Notes, ICS, CalDAV, Google) is a self-contained, instanced provider. The new `ProviderRegistry` acts as a central persistence gateway, managing all I/O and abstracting storage details. This enables stateful features and robust multi-account Google Calendar integration._

-   **Event-Driven Settings with Instant Updates**  
    _Settings persistence refactored to a publish/subscribe model. The `saveSettings` function now diffs old vs new state and publishes granular events (`sources-changed`, `view-config-changed`, `settings-updated`). Calendar views re-render instantly without flicker or unnecessary reloads._

-   **Lazy-Loading for Faster Startup Performance**  
    _Heavy dependencies are now dynamically imported only when needed: FullCalendar engine loads when opening a calendar view, React modals load on demand. This dramatically reduces startup time and memory usage._

-   **Centralized Event Enhancement Pipeline**  
    _New `EventEnhancer` module centralizes all timezone conversions and category parsing, essentially intercepting all raw events befor it reaches the Cache. Business logic extracted into dedicated stateless modules with a new `WorkspaceManager` handling all workspace filtering and display logic._

-   **Timezone Handling for Recurring Events** [#94](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/94)  
    _Recurring events now properly handle timezones with endDate support, resolving timezone branching issues and ensuring correct time display across different time zones._

-   **ICS events now loads properly** [#91](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/91)  
    _Parsing issues in Remote ICS calendar is fixed and should now load properly._

---

## v0.11.9

-   **Calendar Workspaces** ([#90](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/90))  
    _Save and switch between customized calendar setups (sources, filters, and view preferences). Workspaces include a header switcher, a command palette action ("Full Calendar: Switch Workspace"), and an optional default workspace on startup. Saved state covers selected sources (Local, Daily Notes, ICS, CalDAV, Google), category/sub‑category filters, tasks visibility, all‑day toggle, initial view (month/week/day/timeline), week start, and time‑grid display options._

-   **Faster Switching and Rendering**  
    _Workspace application is incremental (sources → filters → view) to avoid full calendar rebuilds. Switching preserves context where possible (e.g., scroll/selection) and significantly improves responsiveness on large vaults._

-   **Workspace Management UX**  
    _Add Save as Workspace, Rename, Delete in the calendar header menu; set a Default Workspace in Settings; and assign hotkeys through Obsidian’s Hotkeys for one‑press switching._

-   **Edit Modal Sub‑category Parsing**  
    _Fixes a regression where sub‑categories could disappear when editing the title in the modal. The title parser now consistently preserves the `Category - SubCategory - Title` format on save._

-   **Workspace Persistence Edge Cases**  
    _Improved robustness when loading a workspace that references a removed or renamed source. Adds safe fallbacks to an "All Events" view and clearer status messaging._

---

## v0.11.8

-   **Business Hours and Background Events Support**  
    _Highlight working hours in calendar views and display events as background highlights (e.g., vacations or focus blocks). Configurable via settings and event frontmatter._

-   **Timeline View Category Shadow Events** ([#76](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/76))  
    _Adds optional display of category shadow events in Timeline View for better visual context and planning._

-   **Real-Time Duplicate Event Validation** ([#67](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/67))  
    _Prevents creation of duplicate events in the calendar interface, improving scheduling accuracy._

-   **Edit Modal Now Supports Subcategory Editing**  
    _The "Edit Event" modal now parses and displays sub-categories directly in the event title. Users can edit them inline and changes are preserved._

-   **Settings Modal Reorganization and Footer**  
    _UI updates include reorganized settings for better clarity, hover hints for display options, and a new footer for versioning and help links._

-   **Configuration Migration for Legacy Support**  
    _Legacy settings like `subprojectKeywords_exclude` are migrated automatically, and missing fields (e.g., `persona`) are filled safely._

-   **Type Safety and Safer DOM Manipulations** ([#69](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/69), [#71](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/71))  
    _Removed unsafe type assertions across key modules (`DailyNoteCalendar`, `GoogleCalendar`, `interop`) and introduced robust DOM update utilities (`safeCreateEl`, `safeEmpty`)._

-   **Recurring Task Completion Preserves Child Timing** ([#75](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/75))  
    _Undoing completed recurring tasks now correctly retains the timing of override events. Adds full test coverage for various edge cases._

-   **All-Day Events Treated as Floating in RRULE**  
    _All-day recurring events now behave correctly as floating events, fixing unintended start time offsets._

-   **Coverage for Business Hours, Background Events, and Override Logic**  
    _New test suites validate schema correctness, UI rendering, and recurring timing behavior._

---

## v0.11.7

-   **Full Google Calendar Integration with Two‑Way Sync**  
    _Connect your Google account to create, modify, and delete events (including recurring events) directly in Obsidian. Includes OAuth 2.0 authentication, calendar selection, and proper token refresh handling._

-   **Centralized and Reusable Form Components**  
    _Inputs like URL, Username, Password, Directory Select, and Heading have been refactored into dual‑mode primitives with a `readOnly` mode for consistent display. A generic `TextInput` replaces one‑off components._

-   **Modularized Settings Tab and Changelog Component**  
    _Settings sections are now organized into dedicated renderers with improved type safety. A new `Changelog.tsx` component has been added for clearer update visibility._

-   **Unified Event Parsing Pipeline**  
    _Calendar parsers now output raw events without settings dependencies and pass them through a single `enhanceEvent` function for category logic. Tests have been updated to separately verify raw parsing and enhancement._

-   **Modular Event Cache Management**  
    _The `EventCache` logic is split into dedicated modules (`RemoteCacheUpdater`, `LocalCacheUpdater`, `IdentifierManager`, `RecurringEventManager`), making synchronization and recurring event handling more reliable._

-   **Daily Note Calendar Parsing and Cache Update Logic**  
    _Parsing bugs in `DailyNoteCalendar` have been fixed, and `modifyEvent` now correctly flags dirty events to ensure the UI updates when frontmatter changes (e.g., `skipDate`)._

-   **Codebase Refactor for Type Safety and Maintainability**  
    _Shared types and utilities have been centralized, internal names clarified, and redundant code removed—all without changing user‑facing behavior._

---

## v0.11.6

-   **Advanced Categorization with Hierarchical Timeline View**  
    _Events can now be organized by categories and sub-categories in a new Resource Timeline view. Expandable groups and aggregated parent rows make it easier to manage complex schedules._

-   **Drag-and-Drop Category Reassignment**  
    _Change an event’s category or sub-category directly from the timeline view by dragging it to a different lane. Titles and metadata update automatically._

-   **Cleaner UI and Initial View Options**  
    _The event modal and settings UI have been polished with dropdown options and a new initial view setting that supports the timeline view._

-   **Smarter Event Titles and Filenames**  
    _Events now display clearer titles (e.g., `SubCategory - Event Name`) while keeping filenames and internal data consistent._

-   **Multi-Level Category Parsing**  
    _Parsing of event titles with multiple category levels (e.g., `Category - SubCategory - Title`) has been fixed, ensuring correct category and sub-category assignment._

-   **License Update**  
    _The plugin license has been updated to GPLv3 to comply with FullCalendar requirements._

---

## v0.11.5-beta

-   **Monthly and Yearly Recurring Events**  
    _You can now create events that repeat every month or every year — perfect for things like anniversaries, billing cycles, or project reviews._

-   **Smarter "Repeats" Menu in Event Modal**  
    _The old "Recurring" checkbox is gone. Instead, use a new dropdown to choose from Weekly, Monthly, or Yearly recurrence. The UI updates dynamically to match your selection._

-   **Human-Friendly Filenames for Recurring Notes**  
    _Recurring event notes now get cleaner, more descriptive names like `(Every year on July 30th) My Event.md`._

-   **Enhanced Timezone and All-Day Support**  
    _Timezone handling for recurring events is now more accurate, and All-Day events display correctly across time boundaries._

-   **Right-Click Task Toggle for Recurring Tasks**  
    _Recurring tasks can now be marked as complete using the right-click menu, just like one-off tasks._

-   **Safer Rendering and UI Cleanups**  
    _Removed use of unsafe HTML injection in the UI. Improved event rendering, loading states, and general UI responsiveness._

---

## v0.11.4

-   **Smarter Recurring Events and Tasks**  
    _Recurring events can now be edited per-instance — drag, resize, or complete a task without affecting the whole series. Changes are reversible and tracked cleanly._

-   **Safe Deletion with Confirmation Options**  
    _Deleting a recurring event now asks whether to remove just one instance, the entire series, or promote existing edits to standalone events._

-   **Better Task Behavior for Repeating Events**  
    _Recurring tasks now behave just like regular ones — you can check them off individually, and they show up correctly in the calendar._

-   **Multi-day all-day events fix by @yalikebaz**  
    _Multi-day all-day events made inclusive for local calendars. Thanks to @yalikebaz for the fix!_

-   **Performance and Architecture Improvements**  
    _Refactored recurring event logic, improved performance on large calendars, and cleaned up the plugin architecture to prepare for future features._

---
## v0.11.3

-   **Insights Engine has smarter Dashboard with Personas**  
    _Adding persona (predefined rules like "Productivity", "Routine") to Categories in Insight Config Setting now cater to more powerful analysis._

-   **Insights Panel and Dashboard Bugfixes**  
    _Multiple bugfixes and UI adjustments focused on the Insights panel._

---

## v0.11.2

-   **Insights Engine in ChronoAnalyser**  
    _New intelligent engine that can analyse your calendar for past events and give you cool insights._

-   **Redesigned ChronoAnalyser UI/UX**  
    _Chronoanalyser now much more elegant. Check it using the `Analysis` button in the Full-Calendar Window._

-   **Multiple Bugfixes in ChronoAnalyser**  
    _Make ChronoAnalyser more stable and reliable. Plotting and Insights now work more reliably._

---

## v0.11.1

-   **Category Coloring Engine and Settings UI**  
    _A new optional setting, 'Enable Category Coloring,' allows you to color events based on a category defined in the event's title (e.g., 'Work - Project Meeting'). This overrides the default calendar color for fine-grained visual organization._

-   **Category-Aware Event Modal**  
    _The Edit/Create Event modal now features a dedicated 'Category' input field. It provides intelligent autocomplete suggestions based on all your previously used categories, making categorization fast and consistent._

-   **Redesigned Event Modal UI/UX**  
    _The Edit/Create Event modal has been completely redesigned with a polished two-column layout, logical grouping of fields, and a dedicated footer for actions, improving clarity and ergonomics._

-   **Color Palette Enhancements**  
    _Colors no longer default to black, but are now rotated from a carefully chosen Palette._

-   **"Open Note" Workflow Enhancement**  
    _Clicking 'Open Note' in the modal now opens the note in a split view, improving calendar-note navigation._

---

## v0.10.13-beta

-   **Robust Timezone Support**  
    _Events from local and remote calendars are now fully timezone-aware, fixing bugs related to DST and travel._

-   **Strict Timezone Mode for Daily Notes**  
    _A new setting allows users to anchor daily note events to a specific timezone, just like regular notes._

-   **Correctly Parse UTC Events from ICS Feeds**  
    _Fixed a critical bug where events specified in UTC from Google Calendar and other sources would appear at the wrong time._

---

## v0.10.8

-   **ChronoAnalyser Released**  
    _ChronoAnalyser can now analyse your time spending! Check the new `Analysis` button in the Full-Calendar Window._

---

## v0.10.7

-   **Initial Plugin Release**  
    _Welcome to the first version of the enhanced Full Calendar!_

---

_For a summary of major features, see [What's New](whats_new.md)._
