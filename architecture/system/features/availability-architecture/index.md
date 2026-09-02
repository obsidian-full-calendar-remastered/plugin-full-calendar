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

## Data Security, Privacy & Serverless Hosting

!!! success "Privacy First"
    All scheduling computations and slot layout operations are performed **locally** within Obsidian. None of your raw calendar events, schedules, descriptions, or titles are ever sent to, processed by, or stored on external servers under our control.

!!! info "Static Client-Side Viewer"
    We maintain a static HTML site hosted entirely via GitHub Pages:
    *   **Viewer URL**: `https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/assets/share-availability.html`
    *   **No Server Storage**: This static viewer contains no server-side databases, API keys, tracking scripts, or analytics.

!!! tip "Client-Side Gist Retrieval Pipeline"
    The web sharing pipeline is structured as follows to ensure absolute transparency and user control:
    1.  **Gist Query Parameters**: The viewer page parses the query string to extract the secret Gist ID (e.g. `?gist=GIST_ID`).
    2.  **Direct GitHub API Query**: The user's browser makes a client-side REST call directly to GitHub's server to fetch the raw unlisted gist.
    3.  **On-Device Resolution**: The fetched JSON schedule payload is decoded and adjusted dynamically to the viewer's local browser timezone (using Luxon) entirely on the client side.

!!! warning "Secret Gist Visibility"
    Schedules are stored as unlisted (secret) GitHub Gists on your account. While they are not crawlable or indexable by search engines, anyone who possesses the generated URL has read-access to the anonymous JSON payload. You can manually delete or edit your published Gists directly via the GitHub Gists Dashboard.

---

## Robustness & Validation

To ensure stability and prevent resource exhaustion, the following validations are executed:
- **Timezone Sanitization:** If the display timezone is configured as `'system'`, the system resolves it dynamically to the current IANA environment timezone.
- **Chronological Validation:** Validates that `startDate <= endDate`, throwing an error otherwise.
- **Time Window Validation:** Validates that `startTime < endTime`, throwing an error if start is after or equal to end. Robustly parses time formats and falls back to default hours (`09:00` and `17:00`) on empty or malformed strings.
- **Performance Warnings:** Displays a warning notice in the UI for ranges larger than 90 days, warning users of potential slot generation slowdowns.

---

[Availability Architecture](availability-architecture.md) · [ICS Export Architecture](ics-export-architecture.md) · [Break Timer Architecture](break-timer-architecture.md) · [Event Linked Notes Architecture](event-linked-notes.md) · [Back to Index](../index.md)
