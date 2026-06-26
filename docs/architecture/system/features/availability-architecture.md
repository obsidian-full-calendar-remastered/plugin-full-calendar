# Availability Sharing Architecture

This document details the architectural layout, data flow, and components of the **Availability Sharing** feature. The system is designed to calculate free/busy slots locally and expose them via Markdown or a serverless client-side web viewer.

---

## Architectural Workflow

The following pipeline describes how availability is fetched, resolved, and shared:

```
[Event Cache]
      │ (Local/Remote Events)
      ▼
[Internal API] ──► Query & Filter (Filters out all-day events)
      │
      ▼
[AvailabilityService] ──► Merge overlaps & Compute free slots
      │
      ├──► [Markdown Exporter] ──► Save as .md file in vault
      │
      └──► [GithubGistService] ──► Publish secret Gist
                  │
                  ▼
            [share.html (hosted on mkdocs)] ──► Fetch Gist client-side
```

---

## Key Components

### 1. Slot Solver (`AvailabilityService`)
The [AvailabilityService](file:///d:/Codes/plugin-full-calendar/src/features/availability/AvailabilityService.ts) acts as the core logical engine:
- Queries timed events using [PluginState.getInternalAPI().getEvents()](file:///d:/Codes/plugin-full-calendar/src/api/FullCalendarAPI.ts#L119).
- Filters out all-day events to prevent holidays from blocking schedules.
- Sorts and merges overlapping/adjacent busy slots into continuous intervals.
- Generates the complement gaps within the configured daily bounds to determine available slots.

### 2. Gist Upload Wrapper (`GithubGistService`)
The [GithubGistService](file:///d:/Codes/plugin-full-calendar/src/features/availability/GithubGistService.ts) interfaces with the GitHub API:
- Uses Obsidian's [requestUrl](file:///d:/Codes/plugin-full-calendar/src/features/availability/GithubGistService.ts#L8) to bypass browser CORS restrictions.
- Handles authorization using the token retrieved from the [CredentialStore](file:///d:/Codes/plugin-full-calendar/src/features/credentials/CredentialStore.ts).
- Reuses the stored Gist ID to patch existing availability files, preventing Gist sprawl.

### 3. Serverless Client Viewer (`share.html`)
The public-facing schedule viewer is a single, standalone HTML asset located at [docs/assets/share.html](file:///d:/Codes/plugin-full-calendar/docs/assets/share.html):
- **Client-Side Rendering**: Fetches and parses the Gist content dynamically on page load.
- **Timezone Aware**: Uses [Luxon](https://moment.github.io/luxon/) to transform absolute ISO datetimes into the host IANA timezone or the viewer's local browser timezone.

---

## Data Security and Privacy

> [!NOTE]
> All scheduling computations are performed locally within Obsidian. Online web sharing is completely serverless.

> [!WARNING]
> Web links point to secret (unlisted) GitHub Gists. While not discoverable via search engines, anyone with the generated URL has read-access to the anonymized JSON payload.

---

## Robustness & Validation

To ensure stability and prevent resource exhaustion, the following validations are executed:
- **Timezone Sanitization:** If the display timezone is configured as `'system'`, the system resolves it dynamically to the current IANA environment timezone.
- **Chronological Validation:** Validates that `startDate <= endDate`, throwing an error otherwise.
- **Time Window Validation:** Validates that `startTime < endTime`, throwing an error if start is after or equal to end. Robustly parses time formats and falls back to default hours (`09:00` and `17:00`) on empty or malformed strings.
- **Performance Warnings:** Displays a warning notice in the UI for ranges larger than 90 days, warning users of potential slot generation slowdowns.
