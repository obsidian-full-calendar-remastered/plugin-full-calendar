# Calendar Agent (BYOK)

!!! abstract "Feature Overview"
    Transform how you manage your schedule with a private, Bring-Your-Own-Key (**BYOK**) AI calendar agent docked right inside Obsidian. Query your upcoming events, find free slots, draft complex meetings, and scrape online schedules (like university syllabi or conference timetables)—all without leaving your calendar view.

---

## Core Principles & Privacy

The Calendar Agent operates under strict privacy and architectural boundaries:

*   🔒 **Zero Vault Access**: The agent has **no access** to your vault's filesystem, notes, or private documents. It only communicates with the Full Calendar internal schedule API.
*   🛡️ **Write-Approval Gate**: The agent can **never silently mutate** your calendar. Every create, update, delete, or batch import is staged as an interactive proposal card that requires your explicit review and one-click approval.
*   🔑 **OS Keychain Security**: API keys are securely stored in your operating system keychain via Obsidian's native `app.secretStorage`. They are never committed to your vault or exposed in plaintext settings files.
*   💻 **Local & Cloud Model Support**: Complete freedom of choice. Connect to OpenAI, OpenRouter, Groq, DeepSeek, or run completely offline with local models using **Ollama** or **LM Studio**.
*   📂 **Zero Vault Residue**: All conversation history and structured audit logs are confined exclusively to `.obsidian/plugins/full-calendar-remastered/agent/`. Deleting or uninstalling the plugin removes all agent data with zero vault clutter.

---

## Getting Started

### 1. Opening the Agent Sidebar

The Calendar Agent lives in Obsidian's persistent **Right Sidebar Leaf**, allowing you to converse with the agent while keeping your main calendar or notes visible:

1.  **Ribbon Icon**: Click the **robot** (`bot`) icon on Obsidian's left ribbon.
2.  **Command Palette**: Press ++ctrl+p++ (or ++cmd+p++ on macOS) and search for `Full Calendar: Open calendar agent`.

The right sidebar view opens immediately, complete with conversation history, quick action pills, and an auto-resizing write bar.

```
+--------------------------------------------------------+
| [Default Session (3 msgs) v]  [+]  [Trash]  [Logs]     |
+--------------------------------------------------------+
| User: What's my schedule for today?                   |
| Assistant: You have 3 events scheduled:               |
|   * 09:00 AM - 10:00 AM: Team Standup                  |
|   * 01:30 PM - 02:30 PM: Project Review                |
|   * 04:00 PM - 05:00 PM: Deep Work Block               |
|                                                        |
| [Proposal: create event]                               |
| Title: Meeting with Alice                              |
| 📅 2026-09-10 ⏰ 14:00 - 15:00                         |
| [Reject]                               [Approve & apply] |
+--------------------------------------------------------+
| (What's my schedule today?) (Events this week) (...)   |
+--------------------------------------------------------+
| [ Ask agent or automate schedule...           ] [Send] |
+--------------------------------------------------------+
```

---

## Multi-Session History

Manage multiple independent conversation threads without losing past context:

*   **Session Selector**: Click the dropdown at the top of the sidebar to switch between past conversations. Each entry displays the thread title and message count.
*   **New Session (`+`)**: Click the plus icon to start a fresh conversation thread. The agent automatically generates a descriptive title from your first prompt.
*   **Delete Session (`Trash`)**: Delete the active conversation thread when you are done.
*   **Persistent Staged Proposals**: Any unapproved or pending proposals stay attached to their respective conversation session so you can review them later.

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

To guarantee complete safety, the agent cannot write directly to your calendars or files. All mutations are returned as **Interactive Proposal Cards**:

=== "Create Event Proposal"
    Displays the event title, category chip, start and end dates/times, target calendar, and optional notes.
    *   Click **Approve & apply** to commit the event to your calendar cache and write to disk.
    *   Click **Reject** to discard the proposal.

=== "Update Event Proposal"
    Shows a clear visual diff of modified fields before any existing event is changed:
    *   `Title: Old Title → New Title`
    *   `Start: 10:00 → 11:00`
    *   `End: 11:00 → 12:00`

=== "Delete Event Proposal"
    Displays a warning card indicating that the event will be removed, showing the event title and the reason for deletion.

=== "Batch Import Checklist"
    When scraping schedules or adding multiple events at once, the agent produces an interactive batch card with individual checkboxes:
    *   Check or uncheck individual items in the list.
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

## Configuration & Provider Setup

Open **Settings → Integrations → Calendar agent (BYOK)** to configure your model:

| Setting | Purpose | Default / Example |
|---|---|---|
| **Enable agent write bar** | Toggles the agent feature and ribbon icon. | `Enabled` |
| **Api endpoint preset** | Quick presets for OpenAI, OpenRouter, Groq, DeepSeek, Ollama, and LM Studio. | `Custom endpoint` |
| **Endpoint url** | Base URL for OpenAI-compatible chat completions. | `https://api.openai.com/v1` |
| **Model name** | Model identifier for completions. | `gpt-4o-mini` |
| **Api key** | Provider authentication key (stored in OS Keychain). | `sk-...` |
| **Test connection** | Pings the endpoint to verify authentication and reachability. | Click **Test connection** |
| **Diagnostics & privacy** | Opens the audit log modal or clears all chat history. | Click **View audit trail** |

### Connecting to Local Offline Models

For 100% offline privacy, you can run open-weights models locally:

=== "Ollama"
    1. Install and start [Ollama](https://ollama.com).
    2. Pull a tool-capable model, e.g. `ollama run llama3.1`.
    3. In Full Calendar settings, choose the **Ollama (Local)** preset:
       * **Endpoint URL**: `http://localhost:11434/v1`
       * **Model**: `llama3.1`
       * **API Key**: Leave blank.
    4. Click **Test connection**.

=== "LM Studio"
    1. Start [LM Studio](https://lmstudio.ai) and load your model.
    2. Start the local inference server on port `1234`.
    3. In Full Calendar settings, choose the **LM Studio (Local)** preset:
       * **Endpoint URL**: `http://localhost:1234/v1`
       * **Model**: `default`
       * **API Key**: Leave blank.
    4. Click **Test connection**.

---

## Audit Logs & Troubleshooting

Every action, tool call, proposal, latency measurement, and token usage count is recorded in a local structured JSONL audit trail:

*   Click the **scroll** icon in the sidebar header or choose **View audit trail** in settings to open the [Agent Audit Modal](../../architecture/system/features/agent-architecture.md#4-audit-trail-agentauditlogger).
*   **Export audit log**: Copies the entire raw JSONL log to your clipboard for debugging or developer support.
*   **Clear logs**: Purges the audit trail immediately.

---

## Related Documentation

*   [Developer & REST API](api.md)
*   [FCR Command (NLP)](nlp.md)
*   [Event Management](../events/manage.md)
*   [Calendar Agent Architecture](../../architecture/system/features/agent-architecture.md)
*   [Agent API Specification](../../architecture/api/agent-spec.md)
