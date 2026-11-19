# Calendar Agent (Managed AI & BYOK)

!!! abstract "Feature Overview"
    Transform how you manage your schedule with an AI calendar agent docked right inside Obsidian. Start immediately with the default **500,000-credit signup-free trial** and **Managed Plans** (**strictly GDPR-compliant with Zero Data Retention**), or switch seamlessly at any time to **Bring-Your-Own-Key (BYOK)** for OpenAI, OpenRouter, Groq, DeepSeek, or 100% offline local models (**Ollama** / **LM Studio**).

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
| **Free trial** | **$0** | **500,000 credits** *(lifetime)* | Up to **500k** input, **5M** cached, or **125k** output tokens | 1 device | 16,000 tokens |
| **Pro** | **$7 / month** | **10,000,000 credits** / month | Up to **10M** input, **100M** cached, or **2.5M** output tokens | 3 devices | 32,000 tokens |
| **Power** | **$11 / month** | **24,000,000 credits** / month | Up to **24M** input, **240M** cached, or **6M** output tokens | 5 devices | 32,000 tokens |

### How to Activate

1.  Open **Settings → Full Calendar Remastered → Integrations**.
2.  Click the **gear icon (⚙️)** on **Agentic automations** (the top item in Integrations).
3.  Ensure **Provider mode** is set to **Free trial and managed plans**:
    *   **Free Trial (No Signup Required)**: Click **Start free trial** to immediately generate a device keypair and activate your 500,000 lifetime credits.
    *   **Paid Plans (Pro $7/mo · Power $11/mo)**: Subscribe at [full-calendar-remastered.in/pricing](https://full-calendar-remastered.in/pricing/). Your `fcr_live_...` license key is displayed immediately on the confirmation page and emailed from `no-reply@full-calendar-remastered.in` (along with subscription management links). Paste it into **License key activation** and click **Activate key**. The raw key is exchanged once for a hardware-bound P-256 device session and immediately discarded from memory.
    *   **Device Management**: Click **Refresh balance** at any time to sync your authoritative server balance, or click **Deactivate device** to release your activation slot when moving to a new computer or mobile device.

---

## Getting Started & Accessing the Agent

The Calendar Agent can be accessed in two coordinated ways:

### A. Calendar Cockpit HUD (Left Panel)
If the [Calendar Cockpit](../views/calendar-cockpit.md) is open, the agent is embedded directly as an accordion card (**`AgentHudModule`**):
*   Provides quick prompt entry, suggestion pills, and proposal approvals right beside your calendar grid.
*   Features a one-click **Open Panel** launcher button in its card header to immediately pop open the full Right Sidebar Leaf.

### B. Right Sidebar Leaf
The full-featured Calendar Agent lives in Obsidian's persistent **Right Sidebar Leaf**, ideal for deep conversational planning, multi-session management, and reviewing full audit trails:
1.  **Cockpit Launcher**: Click the open panel icon in the Cockpit Agent HUD header.
2.  **Ribbon Icon**: Click the **robot** (`bot`) icon on Obsidian's left ribbon.
3.  **Command Palette**: Press ++ctrl+p++ (or ++cmd+p++ on macOS) and search for `Full Calendar: Open calendar agent`.

```text
+--------------------------------------------------------+
| [Default Session (3 msgs) v]  [+]  [Trash]  [Logs]     |
+--------------------------------------------------------+
| User: What's my schedule for today?                    |
| Assistant: You have 3 events scheduled:                |
|   * 09:00 AM - 10:00 AM: Team Standup                  |
|   * 01:30 PM - 02:30 PM: Project Review                |
|   * 04:00 PM - 05:00 PM: Deep Work Block               |
|                                                        |
| [Proposal: create event]                               |
| Title: Meeting with Alice                              |
| 📅 2026-09-10 ⏰ 14:00 - 15:00                        |
| [Reject]                             [Approve & apply] |
+--------------------------------------------------------+
| (What's my schedule today?) (Events this week) (...)   |
+--------------------------------------------------------+
| [ Ask agent or automate schedule...           ] [Send] |
+--------------------------------------------------------+
```

---

## Multi-Session History

Manage multiple independent conversation threads locally without losing past context:

*   **Session Selector**: Click the dropdown at the top of the sidebar to switch between past conversations. Each entry displays the thread title and message count.
*   **New Session (`+`)**: Click the plus icon to start a fresh conversation thread. The agent automatically generates a descriptive title from your first prompt.
*   **Delete Session (`Trash`)**: Delete the active conversation thread when you are done.
*   **Persistent Staged Proposals**: Any unapproved or pending proposals stay attached to their respective conversation session.

---

## Natural Language Scheduling & Suggestions

You can interact with the agent using natural phrasing. Quick suggestion pills are provided just above the write bar for instant queries:

| Quick Pill | Example Prompt | Action |
|---|---|---|
| **What's my schedule today?** | *"What events do I have scheduled for today?"* | Summarizes all timed and all-day events for today. |
| **Events this week** | *"Summarize my events for the next 7 days."* | Provides an overview grouped by day. |
| **Add event...** | *"Add a meeting with Sarah on Thursday from 3 PM to 4 PM in Work calendar."* | Stages a new event proposal. |
| **Import from URL...** | *"Browse the schedule at https://example.com/syllabus and extract the exam dates into Study calendar."* | Scrapes the page, extracts dates, and stages a batch proposal. |

### Smart Category & Taxonomy Enforcement

The agent enforces Full Calendar's `Category - SubCategory - Title` standard:

*   When you prompt: *"Schedule a design sprint for Project Phoenix tomorrow at 10 AM"*, the agent automatically formats the title as `Work - Phoenix - Design Sprint` and assigns the matching color category.
*   The agent queries your active user categories dynamically to ensure full consistency with your existing color coding.

---

## The Write-Approval Gatekeeper

To guarantee complete safety, the agent cannot write directly to your calendars or files. All mutations are returned as **Interactive Proposal Cards** protected by cryptographic hash verification, a 5-minute TTL, and optimistic concurrency checks:

=== "Create Event Proposal"
    Displays the event title, category chip, start and end dates/times, target calendar, and optional notes.
    *   Click **Approve & apply** to commit the event to your calendar cache and write to disk.
    *   Click **Reject** to discard the proposal.

=== "Update Event Proposal"
    Shows a clear visual diff of modified fields (and a scope warning if targeting an entire recurring series) before any existing event is changed:
    *   `Title: Old Title → New Title`
    *   `Start: 10:00 → 11:00`
    *   `End: 11:00 → 12:00`
    *   If the underlying event changed externally after the preview was generated, approval is blocked automatically and a fresh preview is requested.

=== "Delete Event Proposal"
    Displays a warning card indicating that the event (or recurring series) will be removed, showing the event title and the reason for deletion.

=== "Batch Import Checklist"
    When scraping schedules or adding multiple events at once, the agent produces an interactive batch card with individual checkboxes:
    *   Check or uncheck individual items in the list (dynamically updating the approval hash).
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
