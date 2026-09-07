// src/ui/changelogs/changelogData.ts

export interface Change {
  type: 'new' | 'fix' | 'improvement';
  title: string;
  description: string;
}

export interface Version {
  version: string;
  changes: Change[];
}

// Add new versions to the TOP of this array.
export const changelogData: Version[] = [
  {
    version: '0.13.6',
    changes: [
      {
        type: 'new',
        title: 'Journals Calendar Provider',
        description:
          'Connect multiple Day journals with official [Journals 3.2+ API](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/journals/) support, template heading discovery, and legacy 2.x fallback.'
      },
      {
        type: 'new',
        title: 'Dedicated CalDAV Tasks Provider',
        description:
          'Manage [CalDAV tasks (VTODO)](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/caldav-tasks/) with Apple Reminders compatibility, task backlog integration, and ETag conflict safety.'
      },
      {
        type: 'new',
        title: 'Workspace Default Calendar',
        description:
          'Designate a [default calendar per workspace](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/views/workspaces/#workspace-default-calendar) for targeted new event creation that respects visible calendar filters.'
      },
      {
        type: 'new',
        title: 'Open Location URLs & Linked Note Hover Preview',
        description:
          'Launch meeting or map URLs directly via the [context menu](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/events/hover_context/#right-click-context-menu) and preview linked notes with Obsidian Page Preview.'
      },
      {
        type: 'improvement',
        title: 'Lossless Drag & Resize & Rescheduling Isolation',
        description:
          'Preserve multiline descriptions, locations, and frontmatter during [drag and resize](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/events/manage/#moving-events), and isolate single-event recurring overrides without rule leakage.'
      },
      {
        type: 'improvement',
        title: 'Authoritative Timezones & Startup Performance',
        description:
          'Unified [authoritative timezone resolution](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/events/timezones/#how-timezones-are-handled) across all subsystems, non-blocking instant UI mounting, and built-in load profiling diagnostics.'
      },
      {
        type: 'fix',
        title: 'Mobile Google OAuth & Recurring Task Completion',
        description:
          'Automatic [copy-paste fallback](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/gcal/#feature-notes) when iOS popups are blocked, and fixed recurring task checkbox completion on the calendar view.'
      }
    ]
  },
  {
    version: '0.13.5',
    changes: [
      {
        type: 'new',
        title: 'Availability Sharing',
        description:
          '[Publish free/busy schedules](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/features/availability/) as local Markdown or a secret client-side GitHub Gist viewer.'
      },
      {
        type: 'new',
        title: 'ICS Export Filters',
        description:
          '[Export](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/features/ics-export/) a specific date range, filter by daily time window, exclude weekends or all-day items, and narrow by category.'
      },
      {
        type: 'new',
        title: 'Linked Note template Presets',
        description:
          '[Customise BreakTimer](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/features/break-timer/) to remind you to take breaks, with cute cat animation inspired by [zokuzoku/cat-gatekeeper](https://github.com/zokuzoku/cat-gatekeeper)'
      },
      {
        type: 'new',
        title: 'BreakTimer Animation',
        description:
          '[Choose between templates](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/features/event-linked-notes/#4-template-presets-power-users) for linked notes.'
      },
      {
        type: 'improvement',
        title: 'Mobile UX Refresh',
        description:
          'Month view is more compact, supported time-grid views pinch-to-zoom, and mobile layout switching moved into the More menu.'
      },
      {
        type: 'fix',
        title: 'Google Scope Preservation',
        description:
          'Google Calendar and Google Tasks now preserve merged OAuth scopes when accounts are reauthorized.'
      },
      {
        type: 'fix',
        title: 'Linked Note bug fixes',
        description:
          'Template presets now preserve custom frontmatter and linked notes reuse open tabs when opened from the calendar.'
      }
    ]
  },
  {
    version: '0.13.4',
    changes: [
      {
        type: 'new',
        title: 'HOT: Unified Task Backlog across Tasks, CalDAV, and Google Tasks',
        description:
          'Backlog is now provider-agnostic with better drag scheduling/unscheduling and improved sync consistency across [Tasks](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/tasks-plugin-integration/), [CalDAV](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/caldav/), and [Google Tasks](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/gtasks/).'
      },
      {
        type: 'new',
        title: 'Google Tasks Two-Way Sync',
        description:
          'Added first-class [Google Tasks](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/gtasks/) provider support, including task scheduling, completion sync, and backlog integration.'
      },
      {
        type: 'new',
        title: 'Holidays Calendar Provider',
        description:
          'Introduced configurable [Holidays calendar](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/holidays/) support for regional holiday overlays in your views.'
      },
      {
        type: 'new',
        title: 'Embedded Widgets + Dashboard Showcases',
        description:
          'Added unified [embedded widget](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/embeds/index/) architecture for weather/backlog/analytics-style calendar codeblocks and dashboards.'
      },
      {
        type: 'new',
        title: 'Weather Forecast UX and Reliability',
        description:
          'Expanded [weather forecasts](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/features/weather/) with richer display and stronger caching/offline behavior.'
      },
      {
        type: 'improvement',
        title: 'Recurring Overrides on External Calendars',
        description:
          'Improved [recurring event override](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/events/recurring/) behavior for remote providers with safer instance mutation and reminder sync.'
      },
      {
        type: 'improvement',
        title: 'Developer API and Local Server Enhancements',
        description:
          'Enhanced [API & CLI](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/features/api/) workflows with stronger local-server and credential handling foundations.'
      },
      {
        type: 'fix',
        title: 'Task Placement, Linked Notes, and VTODO Stability',
        description:
          'Fixed backlog/task placement edge cases, linked-note duplication/race conditions, and improved CalDAV VTODO synchronization reliability.'
      }
    ]
  },
  {
    version: '0.13.2',
    changes: [
      {
        type: 'new',
        title: 'HOT: Link unique notes to Remote events with templates, metadata, and UI controls',
        description:
          'Added automatic [linked note](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/features/event-linked-notes/) creation for events with templates, metadata linking, and seamless integration across providers with UI controls. Supports [CalDAV](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/caldav/), [Google](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/gcal/), [Outlook](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/outlook/)'
      },
      {
        type: 'new',
        title: 'HOT-beta: Unified Reminders & FCR Companion for OS native notifications',
        description:
          'Introducing [centralized reminder engine](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/features/reminders/) with [FCR Reminder Companion App](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/features/fcr-reminder/) integration, including background sync, manual sync command, and improved reliability even when obsidian is not running.'
      },
      {
        type: 'new',
        title: 'ChronoAnalyser Demo for easy onboarding',
        description:
          'Introduced [ChronoAnalyser](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/chrono_analyser/introduction/) demo and added dynamic [i18n](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/features/i18n/)/[NLP](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/features/nlp/) asset loading with remote synchronization and automatic version-based refresh.'
      },
      {
        type: 'new',
        title: 'Tasks Global Query Filtering',
        description:
          'Added support for [Obsidian Tasks](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/tasks-plugin-integration/#supported-global-query-syntax) global query in backlog, enabling advanced filtering (tags, folders, priority, regex) via new setting.'
      },
      {
        type: 'new',
        title:
          '[CalDAV](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/caldav/) VTODO Support',
        description:
          'Extended [CalDAV](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/caldav/) to support tasks (VTODO) with improved fetching and consistency.'
      },
      {
        type: 'improvement',
        title:
          '[Timezone](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/architecture/system/features/timezone-architecture/) Handling (ICS/[CalDAV](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/caldav/))',
        description:
          'Improved [timezone](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/architecture/system/features/timezone-architecture/) accuracy for events with correct TZID handling and consistent UTC/local serialization.'
      },
      {
        type: 'improvement',
        title:
          '[Event Cache](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/architecture/system/eventcache/) & UI Refresh',
        description:
          'Optimized calendar refresh behavior to avoid full reloads, improving performance and visual stability during updates.'
      },
      {
        type: 'fix',
        title:
          '[Google](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/gcal/) & [Outlook](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/outlook/) Settings Issues',
        description:
          'Fixed provider settings state inconsistencies affecting calendar configuration and updates.'
      },
      {
        type: 'fix',
        title:
          '[Daily Note](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/dailynote/) Notify Serialization',
        description:
          'Resolved issue where reminder metadata was incorrectly stored as object strings.'
      },
      {
        type: 'fix',
        title: 'Instance Initialization & Sync',
        description:
          'Fixed issues where [calendar instances](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/architecture/calendars/architecture/) and sources were not updating correctly during initialization.'
      }
    ]
  },
  {
    version: '0.13.1',
    changes: [
      {
        type: 'improvement',
        title: 'Provider Lifecycle & Cleanup',
        description:
          'Added optional `teardown` method for CalendarProvider and ensured proper cleanup before registry reinitialization and shutdown to improve lifecycle stability.'
      },
      {
        type: 'improvement',
        title: 'Obsidian Community Lint & Document Handling',
        description:
          'Resolved lint issues and improved document handling in `getCalendarColors` and `renderCalendar` for more robust rendering behavior.'
      },
      {
        type: 'fix',
        title: 'Cache & Update Queue Stability',
        description:
          'Fixed `clearUpdateQueue` and improved update flush logic in CacheSubscriptionManager, ensuring correct handling of recurring child event deletions and burst update consistency.'
      },
      {
        type: 'fix',
        title: 'CalDAV Recurring Sync Collisions',
        description:
          'Resolved recurring sync-key collisions by using recurring event IDs instead of UID for RRULE events, preventing conflicts between series parents and RECURRENCE-ID exceptions. Includes regression test for yearly RRULE + exception scenarios. ([#260](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/260))'
      },
      {
        type: 'fix',
        title: 'TaskNotes Sync & Stability',
        description:
          'Stabilized provider-driven updates and drag/toggle sync. Improvements include: ignoring unclaimed file watcher updates, recovering missing provider-session mappings from cache, normalizing persistent IDs, coalescing burst updates, ignoring stale payloads, preferring canonical cache state, and ensuring scheduled changes remain authoritative even if time estimate persistence fails.'
      }
    ]
  }
];
