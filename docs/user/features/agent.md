# Calendar Agent (Managed AI & BYOK)

!!! abstract "Feature Overview"
    Transform how you manage your schedule with an AI calendar agent docked right inside Obsidian. Start immediately with the default **1,000,000-credit signup-free trial** and **Managed Plans** (**strictly GDPR-compliant with Zero Data Retention**), or switch seamlessly at any time to **Bring-Your-Own-Key (BYOK)** for OpenAI, OpenRouter, Groq, DeepSeek, or 100% offline local models (**Ollama** / **LM Studio**).

---

## Core Principles, GDPR Compliance & Zero Data Retention

The Calendar Agent is engineered from the ground up around strict European privacy standards and deterministic local safety boundaries:

*   🇪🇺 **Strictly GDPR Compliant & Zero Data Retention (ZDR)**:
    *   **Stateless EU Inference**: Managed AI requests are processed transiently over stateless EU endpoints (`/v1/chat/completions`) with **Zero Data Retention** active and **API model training explicitly disabled**.
    *   **Zero Prompt or Calendar Storage**: Neither our Cloudflare edge gateway nor the upstream AI provider logs, stores, or trains on your prompts, responses, or calendar events.
    *   **Local-Only Conversation History**: All chat threads and proposals stay exclusively on your device inside `.obsidian/plugins/full-calendar-remastered/agent/`.
    *   **Privacy-Safe Abuse Protection**: Anonymous trial rate protection evaluates only coarse daily IPv4 `/24` (or IPv6 `/48`) subnet counters—raw client IP addresses are never stored.
*   🔒 **Zero Vault Access**: The agent has **no access** to your vault's markdown notes, filesystem, or personal documents. It communicates solely with the sandboxed Full Calendar schedule bridge.
*   🛡️ **Cryptographically Hash-Bound Write-Approval Gate**: The agent can **never silently mutate** your calendar. Every create, update, delete, or batch import is staged as an interactive proposal card bound to a **SHA-256 canonical argument hash**, a **5-minute expiration TTL**, and **optimistic source-event snapshot verification** requiring your explicit click on **Approve & apply**.
*   🔑 **OS Keychain & Web Crypto P-256 Security**: Device private keys (`ECDSA P-256`), session tokens, and BYOK API keys are stored strictly in your operating system keychain via Obsidian's native `app.secretStorage`—never in plaintext `data.json` or synced vault files.

---

## Managed AI Plans & Free Trial (Default)

Out of the box, the Calendar Agent is pre-configured to **Free trial and managed plans** (**Settings → Full Calendar Remastered → Integrations → Agentic automations → ⚙️**).

### Weighted Token Credits (WTC)

Instead of arbitrary "chat count" limits that penalize short questions, Managed AI meters exact token consumption transparently using **Weighted Token Credits**:

*   **1 uncached input token** = `1 credit`
*   **1 cached input token** = `0.1 credits` (`10×` efficiency)
*   **1 output token** = `4 credits` (`4×` base rate)

| Plan | Price | Credit Allowance | Single-Dimension Token Equivalents | Active Devices | Context Window |
| :--- | :---: | :---: | :--- | :---: | :---: |
| **Free trial** | **$0** | **1,000,000 credits** *(lifetime)* | Up to **1M** input, **10M** cached, or **250k** output tokens | 1 device | 16,000 tokens |
| **Pro** | **$7 / month** | **10,000,000 credits** / month | Up to **10M** input, **100M** cached, or **2.5M** output tokens | 3 devices | 32,000 tokens |
| **Power** | **$11 / month** | **24,000,000 credits** / month | Up to **24M** input, **240M** cached, or **6M** output tokens | 5 devices | 32,000 tokens |

### How to Activate

1.  Open **Settings → Full Calendar Remastered → Integrations**.
2.  Click the **gear icon (⚙️)** on **Agentic automations** (the top item in Integrations).
3.  Ensure **Provider mode** is set to **Free trial and managed plans**:
    *   **Free Trial (No Signup Required)**: Click **Start free trial** to immediately generate a device keypair and activate your 1,000,000 lifetime credits.
    *   **Paid Plans (Pro $7/mo · Power $11/mo)**: Subscribe at [full-calendar-remastered.in/pricing](https://full-calendar-remastered.in/pricing/). Your `fcr_live_...` license key is displayed immediately on the confirmation page and emailed from `no-reply@full-calendar-remastered.in` (along with subscription management links). Paste it into **License key activation** and click **Activate key**. The raw key is exchanged once for a hardware-bound P-256 device session and immediately discarded from memory.
    *   **Device Management**: Click **Refresh balance** at any time to sync your authoritative server balance, or click **Deactivate device** to release your activation slot when moving to a new computer or mobile device.

---

## Getting Started & Accessing the Agent

The Calendar Agent can be accessed in three coordinated entry points backed by **real-time dual-panel synchronization**:

### A. Calendar Cockpit HUD (Left Panel)
If the [Calendar Cockpit](../views/calendar-cockpit.md) is open, the agent is embedded directly as a collapsible accordion card (**`AgentHudModule`**):
*   Provides quick prompt entry, compact starter pills, dynamic follow-up chips, a docked live activity strip, and in-place proposal cards right beside your calendar grid.
*   Features a one-click **Open Panel** launcher button in the composer bar to pop open the full Right Sidebar Leaf (carrying over any draft text).

### B. Right Sidebar Leaf & Command Modal
The full-featured Calendar Agent lives in Obsidian's persistent **Right Sidebar Leaf** (and can also be summoned anywhere via the **Agent Command Modal**):
1.  **Cockpit Launcher**: Click the **Open panel** icon (`panel-right-open`) in the Cockpit Agent HUD composer bar.
2.  **Ribbon Icon**: Click the **robot** (`bot`) icon on Obsidian's left ribbon.
3.  **Command Palette**: Press ++ctrl+p++ (or ++cmd+p++ on macOS) and search for `Full Calendar: Open calendar agent`.

### Real-Time Dual-Panel Synchronization
All mounted Calendar Agent surfaces (Left Cockpit HUD, Right Sidebar Leaf, and Command Modal) share one live `AgentEngine` stream:
*   **Mid-Stream Hydration**: Opening the Right Sidebar (or switching to a tab with the Cockpit) while a run is already in progress immediately reconstructs the live step trace, streamed text, and docked timer.
*   **Cross-Panel Actions**: Sending a prompt, clicking **Stop**, switching/creating/deleting sessions, toggling batch checklist checkboxes, or approving/rejecting proposals synchronizes instantaneously across every open panel without jumping your scroll position.

```text
+----------------------------------------------------------+
| [Default Session (3 msgs) v]    [+]    [Trash]   [Logs]  |
+----------------------------------------------------------+
| User: Move Thursday standup to Friday at 11 AM           |
|                                                          |
| > [✓ Completed 2 steps in 2.4s]                          |
| Assistant: I've staged the update for your review:       |
|                                                          |
| | [UPDATE]  Work       Thu, Sep 10 · 10:00 AM – 10:30 AM |
| | Team Standup                                           |
| | ● Work › Engineering                                   |
| | Date:                                                  |
| |   − 2026-09-10                                         |
| |   + 2026-09-11                                         |
| | Start time:                                            |
| |   − 10:00 AM                                           |
| |   + 11:00 AM                                           |
| | End time:                                              |
| |   − 10:30 AM                                           |
| |   + 11:30 AM                                           |
| |                            [Reject]  [Approve & apply] |
|                                                          |
| (Check for conflicts on Friday)  (Add agenda notes)      |
+----------------------------------------------------------+
| [ 2 pending proposals ]  [Reject all]  [Approve all (2)] |
+----------------------------------------------------------+
| ● Preparing event update...               2 steps · 3.4s |
+----------------------------------------------------------+
| [ Ask agent or automate schedule...         ] [Send/Stop]|
+----------------------------------------------------------+
```

---

## Multi-Session History

Manage multiple independent conversation threads locally without losing past context:

*   **Session Selector**: Click the dropdown at the top of the Right Sidebar Leaf to switch between past conversations. Each entry displays the thread title and message count.
*   **New Session (`+`)**: Click the plus icon to start a fresh conversation thread. The agent automatically generates a descriptive title from your first prompt.
*   **Delete Session (`Trash`)**: Delete the active conversation thread when you are done.
*   **Persistent Staged Proposals**: Unapproved proposals remain attached to their session thread; switching or clearing sessions while a generation is active cleanly detaches the in-flight run so no response leaks into the newly opened thread.

---

## Live Progress & Cancellation

When running multi-step tool calls or waiting on slower reasoning models, progress remains transparent across two coordinated layers:

*   **Collapsible Step Trace**: Each assistant turn renders a compact `<details>` trace above its reply showing reasoning status, tool preparation previews (e.g., *Preparing event update...*), and per-step execution results (such as event counts loaded) alongside exact durations. Finished traces fold neatly into a single clickable summary bar.
*   **Docked Live Activity Bar**: Anchored permanently between the scroll area and the composer (above **Send** / **Stop**), the live strip shows a pulsing indicator, the current phase, an active step count badge, and a live `0.0s` elapsed timer—remaining visible even when scrolled far up in a long thread. Clicking the bar jumps directly to the bottom progress trace.
*   **Instant Stop**: Clicking **Stop** in any panel immediately aborts active SSE streams, in-flight CORS fallback requests, or online schedule fetches (`browse_schedule_online`) and discards partial uncompleted fragments cleanly.

---

## Natural Language Scheduling & Suggestions

You can interact with the agent using natural phrasing, backed by Copilot-style empty-state starters and dynamic per-reply follow-up chips:

### Welcome Starter Cards & Dynamic Follow-Up Chips
*   **Empty-Session Starters**: New conversations display clickable starters (full prompt cards in the Right Sidebar Leaf; compact starter pills in the Cockpit HUD). Schedule queries (`What's my schedule today?`, `Summarize my events for the next 7 days`) send automatically, while creation/import/cleanup templates pre-fill the composer so you can customize details before sending:

| Starter Template | Interaction | Purpose |
|---|---|---|
| **What's my schedule today?** | Auto-sends immediately | Summarizes all timed and all-day events for today. |
| **Summarize my events for the next 7 days.** | Auto-sends immediately | Provides a day-by-day overview of your upcoming week. |
| **Add an event...** | Pre-fills composer | Drafts a new event with custom date, time, calendar, and optional category. |
| **Import from a URL...** | Pre-fills composer | Fetches a public syllabus, conference schedule, or `.ics` feed and stages a batch checklist. |
| **Clean up or reschedule...** | Pre-fills composer | Helps batch-rename, re-time, or clean up events over a chosen date range. |

*   **Dynamic Follow-Up Chips**: After completing a reply, the agent may surface up to 3 contextual next-step chips right beneath the assistant bubble (for example, rescheduling follow-ups or adding notes). Clicking a chip sends it immediately.

### Smart Category & Taxonomy Enforcement

The agent adapts dynamically to Full Calendar's **Advanced Categorization** setting (**Settings → Full Calendar Remastered → Categories**):

*   **When Advanced Categorization is Enabled**: You do not need to type manual `Category - SubCategory - ` prefixes. Pass clean natural descriptions; the agent queries your configured categories, picks matching `category` / `subCategory` fields, displays them on proposal cards as a color-coded dot breadcrumb (`● Category › SubCategory`), and lets Full Calendar's core enhancer format `Category - SubCategory - Title` automatically on save without ever duplicating prefixes.
*   **When Advanced Categorization is Disabled**: Event titles stay strictly literal without injected category prefixes or category breadcrumbs, and category-only update proposals are rejected for safety. Toggling this setting immediately refreshes all visible proposal cards in place across open panels.

---

## The Write-Approval Gatekeeper

To guarantee complete safety, the agent cannot write directly to your calendars or files. All mutations are returned as **Interactive Proposal Cards** protected by SHA-256 hash verification, a 5-minute TTL, and optimistic concurrency checks. Cards render with a subtle type-colored left accent rail, calendar badge, and full schedule date/time (honoring your `12h`/`24h` setting, multi-day spans, cross-year dates, and recurring indicators):

*   **In-Place Updates Without Scroll Jump**: Approving or rejecting a card transforms that card in place into a sleek **single-line compact resolved row** (showing status icon, title, applied schedule, and `Applied` / `Rejected` pill) without wiping the DOM or throwing your scrollbar to the bottom.
*   **Sticky Bulk Action Bar**: Whenever 2 or more actionable pending proposals exist in a thread, a sticky footer bar appears with **Reject all** and **Approve all (N)** (updating live with `Applying X/Y...` progress).
*   **Transient Error Recovery**: If writing to a remote/disk calendar fails due to a transient error (e.g., offline CalDAV or rate limit), the card stays unlocked with an inline error notice and a **Retry apply** button instead of permanently discarding the proposal. Permanent errors (expired 5-minute TTL, missing target event, or external event edits detected since preview) lock safely with a clear diagnostic message.

=== "Create Event Proposal"
    Displays the `CREATE` badge, target calendar, formatted date/time schedule, clean event title, optional `● Category › SubCategory` breadcrumb (when Advanced Categorization is enabled), location, and notes.
    *   Click **Approve & apply** to commit the event to your calendar cache and write to storage.
    *   Click **Reject** to discard the proposal.

=== "Update Event Proposal"
    Displays the `UPDATE` badge, calendar, existing/updated schedule in the header, event title, optional category breadcrumb, and stacked **`−` old / `+` new** inset diff rows for every modified field (`Title`, `Date`, `Start time`, `End time`, `All day`, `Category`, `SubCategory`, `Description`).
    *   If the underlying event changed externally after the preview was generated, approval is blocked automatically and a fresh preview is requested.

=== "Delete Event Proposal"
    Displays the `DELETE` badge alongside a snapshot of the target event's date, time window (or `All day`), recurrence status, optional category breadcrumb, deletion reason, and a confirmation warning before removal.

=== "Batch Import Checklist"
    When scraping schedules or adding multiple events at once, the agent produces an interactive batch card with individual checkboxes showing each item's schedule and optional category dot tag:
    *   Check or uncheck individual items in the list (dynamically recomputing the approval hash and syncing checkboxes across all open agent panels).
    *   Click **Approve selected (N)** to import only the chosen events.

---

## Web Schedule Scraping

Importing course schedules, conference talks, or community events is seamless:

1.  Provide the public URL to the agent:
    > *"Please check the lecture schedule at `https://university.edu/course-cs101` and add all Tuesday lectures to my College calendar."*
2.  The agent uses Obsidian's secure HTTP engine to retrieve the page content, stripping unnecessary scripts and styling.
3.  The agent extracts the dates, times, and lecture titles, formatting them to your taxonomy standards.
4.  A **Batch Import** card is staged in the sidebar for your review. Select the lectures you want and click **Approve selected**.

!!! note "Security Notice on Web Scraping"
    The web browsing tool blocks loopback (`127.0.0.1`, `localhost`) and private network IP ranges to protect local services against Server-Side Request Forgery (SSRF). Only valid public `http` and `https` URLs are supported.

---

## Switching to Bring-Your-Own-Key (BYOK) & Local Models

If you prefer to use your own API key or run 100% offline local models, open **Settings → Full Calendar Remastered → Integrations → Agentic automations (⚙️)** and switch **Provider mode** to **Bring your own key (byok)**:

| Setting | Purpose | Default / Example |
|---|---|---|
| **Provider mode** | Switches between `Free trial and managed plans` (default) and `Bring your own key (byok)`. | `Free trial and managed plans` |
| **Api endpoint preset** | Quick BYOK presets for OpenAI, OpenRouter, Groq, DeepSeek, Ollama, and LM Studio. | `Custom endpoint` |
| **Endpoint url** | Base URL for OpenAI-compatible chat completions. | `https://api.openai.com/v1` |
| **Model name** | Model identifier for completions. | `gpt-4o-mini` |
| **Model temperature** | Optional sampling temperature (e.g. `0.2`). Leave empty to use provider defaults (recommended for Claude, o1/o3, and reasoning models). | Empty (provider default) |
| **Api key** | Provider authentication key (stored in OS Keychain). | `sk-...` |
| **Test connection** | Pings the endpoint to verify authentication and reachability. | Click **Test connection** |
| **Diagnostics & privacy** | Opens the audit log modal or clears all chat history. | Click **View audit trail** |

### Connecting to Local Offline Models

=== "Ollama"
    1. Install and start [Ollama](https://ollama.com).
    2. Pull a tool-capable model, e.g. `ollama run llama3.1`.
    3. Switch **Provider mode** to **Bring your own key (byok)** and choose the **Ollama (Local)** preset:
       * **Endpoint URL**: `http://localhost:11434/v1`
       * **Model**: `llama3.1`
       * **API Key**: Leave blank.
    4. Click **Test connection**.

=== "LM Studio"
    1. Start [LM Studio](https://lmstudio.ai) and load your model.
    2. Start the local inference server on port `1234`.
    3. Switch **Provider mode** to **Bring your own key (byok)** and choose the **LM Studio (Local)** preset:
       * **Endpoint URL**: `http://localhost:1234/v1`
       * **Model**: `default`
       * **API Key**: Leave blank.
    4. Click **Test connection**.

---

## Audit Logs & Troubleshooting

Every action, tool call, proposal, latency measurement, and token usage count is recorded in a local structured JSONL audit trail:

*   Click the **scroll** icon in the sidebar header or choose **View audit trail** in settings to open the [Agent Audit Modal](../../architecture/system/features/agent-architecture.md#4-plugin-confined-storage-agentstorage).
*   **Export audit log**: Copies the entire raw JSONL log to your clipboard for debugging or developer support.
*   **Clear logs**: Purges the audit trail immediately.

---

## Related Documentation

*   [Developer & REST API](api.md)
*   [FCR Command (NLP)](nlp.md)
*   [Event Management](../events/manage.md)
*   [Calendar Agent Architecture](../../architecture/system/features/agent-architecture.md)
*   [Agent API Specification](../../architecture/api/agent-spec.md)
*   [Privacy Policy & GDPR Zero Data Retention](../legal/privacy-policy.md)
