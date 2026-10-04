# Tasks Plugin Integration

!!! abstract "Philosophy"
    The Tasks integration is a **bidirectional time-blocking bridge**. It transforms your [Obsidian Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) into interactive calendar blocks, allowing you to drag unscheduled items from a sidebar backlog directly into your daily schedule.


!!! tip "Power Up with Categories"
    Tasks also support **[Advanced Categories](../events/categories.md)**. Add a category prefix to your task (e.g., `- [ ] Work - Finish report`) to color-code it on your calendar grid.

## Core Workflow

The integration revolves around two surfaces: the **Backlog** (where unscheduled tasks live) and the **Calendar** (where scheduled tasks are blocked).

1.  **Collect**: Write tasks in any markdown file using the Tasks plugin syntax.
2.  **Queue**: Open the **Tasks Backlog** sidebar (via the **[Command Palette](../guides/commands-and-shortcuts.md)**) to see undated items.
3.  **Schedule**: Drag a task from the backlog onto a calendar time slot. Full Calendar surgically updates the markdown file with the appropriate date emoji and time block.

<!-- Image missing: ../../assets/calendars/task-backlog.gif -->

4.  **Execute**: Mark tasks as complete directly on the calendar; the checkbox state syncs back to your note instantly.

## Backlog Filtering & Global Queries

The Tasks Backlog supports multiple filters that work together seamlessly to help you manage even the largest backlogs:

- **Missing Date** dropdown: selects which missing Tasks date marker defines backlog membership (`⏳`, `🛫`, or `📅`).
- **Backlog Query** setting: defines a Full Calendar-specific Tasks query that is applied only to the sidebar backlog.
- **Fuzzy Search** input: filters visible backlog rows by task title, file name, or full file path.
- **Global Query Filter** (Toggle): When **"Include global query in the backlog"** is enabled in settings, Full Calendar will retrieve the global query string defined in your Obsidian Tasks plugin settings and apply all its filter rules to the backlog in real-time. This is extremely powerful for excluding archive files, private areas, templates, or only matching specific folders/tags automatically.

### Proposed Backlog Query Setting

The dedicated backlog query would let you filter the Full Calendar backlog without changing the global query used by the Tasks plugin itself.

Example setting value:

```tasks
path does not include Templates
folder includes Projects
tags do not include someday
priority is not lowest
```

With this query configured, a task appears in the backlog only when all of these are true:

- It is missing the configured **Backlog Filter Date**.
- It is not completed.
- It matches every supported line in the **Backlog Query**.
- If **Include global query in the backlog** is also enabled, it also matches every supported line in the Tasks plugin global query.
- It matches the current fuzzy search text, if any.

This keeps the global Tasks query as a broad vault-wide default while allowing Full Calendar to maintain a narrower scheduling queue. For example, the global query might hide archived notes everywhere, while the backlog query shows only actionable project tasks that are ready to schedule.

Unsupported Tasks query lines should be ignored in the same way they are ignored for global query filtering. Display and layout instructions such as `sort by`, `group by`, `limit`, `hide`, and `show` do not affect the backlog query.

### Supported Global Query Syntax

Full Calendar implements a lightweight, on-the-fly execution engine for Obsidian Tasks queries, supporting:

*   **Positive & Negative Path/Folder matches**:
    *   `path does not include 05 - Someday`
    *   `path includes Work`
    *   `folder includes Projects`
*   **Tag filtering (with or without `#`)**:
    *   `tags include wellness` (or `tags include #wellness`)
    *   `tags do not include archive`
*   **Priority filters**:
    *   `priority is high`
    *   `priority is not none`
*   **Regular Expression evaluation**:
    *   `description regex matches /wellness/i`
    *   `path regex does not match /archive/i`
*   **Logical AND combination**: Each line in your global query acts as an additional constraint; all lines must match for a task to be shown.
*   **Comment & Ignored lines**: Lines starting with `#` and search layout instructions (like `limit`, `explain`, `sort by`, `group by`) are automatically ignored.

### Fuzzy Search behavior

- Search is case-insensitive.
- Multiple keywords are supported (space-separated).
- A keyword matches if it appears directly or as a fuzzy character subsequence in title/path text.

Examples:

- `meeting daily` matches tasks with both terms across title/path.
- `projA/roadmap` matches by path fragment.
- `wkpln` can match `weekly-plan` via fuzzy subsequence matching.

## Creating Unscheduled Tasks in the Backlog

At the bottom of the backlog sidebar, the persistent fixed footer allows you to queue **unscheduled (undated)** tasks immediately.

| Action | Target Location | Date/Time State | Primary Use Case |
|---|---|---|---|
| **Backlog Creation** | Sidebar Footer | **None** (Undated) | Quick brainstorming or queuing a task to drag-and-schedule later. |
| **[Grid Creation](../events/index.md)** | Calendar Grid | **Active** (Dated) | Blocking a specific date/time slot on your calendar immediately. |

!!! note "Workflow"
    Creating a task in the backlog footer generates a raw, undated item within your source provider (e.g. [Tasks Plugin](tasks-plugin-integration.md) or [CalDAV](caldav.md)). Drag it from the sidebar onto the grid to [surgical block time](../guides/commands-and-shortcuts.md) instantly.

---

## Data Mapping & Emojis

Full Calendar respects the Tasks plugin's emoji-based data model. You can configure which specific date field controls the calendar display.

| Setting | Emoji | Logic |
|---|---|---|
| **Scheduled Date** | `⏳` | **Default.** Best for daily "to-do" scheduling. |
| **Start Date** | `🛫` | Best for tracking when you *begin* a multi-day effort. |
| **Due Date** | `📅` | Best for hard deadlines and commitments. |

> [!IMPORTANT]
> **No Fallback**: If you set the calendar to show "Due Dates," a task with *only* a scheduled date (`⏳`) will stay in the backlog and will not appear on the calendar until a due date (`📅`) is added.

---

## Time-Blocking Syntax

To position a task at a specific time (rather than just as an "all-day" event), Full Calendar supports two formats.

**Default write format (new behavior): Day Planner**

| Format | Example | Result |
|---|---|---|
| **Day Planner Range** | `- [ ] 5:00 - 19:00 Wellness - Task` | Preferred default for new/updated tasks |
| **Day Planner Point Time** | `- [ ] 14:30 Standup` | Timed task with default duration |

**Legacy format (still supported for reading/parsing):**

| Syntax | Example | Result |
|---|---|---|
| **Point Time** | `(14:30)` | Starts at 2:30 PM (default duration) |
| **Time Range** | `(9:00-10:30)` | Blocks exactly 90 minutes |
| **12h Format** | `(2:30 PM)` | Correctly parsed and displayed |

### Format Schema

Day Planner schema:

```text
- [ ] <H:mm> - <H:mm> <title text> <date marker>
- [ ] <H:mm> <title text> <date marker>
```

Legacy schema:

```text
- [ ] <title text> (<H:mm-H:mm>) <date marker>
- [ ] <title text> (<H:mm>) <date marker>
```

Where `<date marker>` is one of `⏳ YYYY-MM-DD`, `🛫 YYYY-MM-DD`, or `📅 YYYY-MM-DD` (depending on integration settings).

**Example Task Lines:**

- `- [ ] 5:00 - 19:00 Sync with Team ⏳ 2025-03-28`
- `- [ ] Sync with Team (14:00-15:00) ⏳ 2025-03-28`

*Dragging an event on the calendar automatically updates this time-block in your markdown.*

> [!NOTE]
> Full Calendar parses both formats automatically in calendar/backlog views. You do not need to migrate older tasks for them to remain visible and schedulable.

---

## Power User Features

The integration includes several automatic behaviors to keep your calendar clean:

*   **Title Cleaning**: If enabled in [settings](../settings/index.md), Full Calendar can automatically strip `#tags` from task titles on the calendar view for a cleaner look.
*   **Default Durations**: Timed tasks without an end-time (e.g., `(14:30)`) are assigned a default **30-minute duration**.
*   **Multi-Day & Custom Statuses**: Tasks spanning multiple days or using custom statuses (e.g., `/`, `>`, `-`) are correctly parsed and rendered.

## Integration Settings

!!! warning "Reloading the Plugin / Restarting Obsidian"
    When you add a **Tasks** calendar source for the first time, you may need to reload the Full Calendar plugin (or restart Obsidian) for the backlog sidebar command (`Full Calendar: Open tasks backlog`), ribbon icon, and settings section to register and appear in the UI.

Once you add a **Tasks** source in **[Calendar Settings](../settings/sources.md)**, a new **Integrations → Tasks** section appears:

*   **Backlog Filter Date**: Choose which missing date makes a task "unscheduled" (e.g., show tasks missing a `⏳`).
*   **Calendar Display Date**: Choose which date determines the task's position on the grid.
*   **Auto-Open Edit Modal**: If enabled, dropping a task from the backlog will immediately open the Tasks plugin's native edit modal for further refinement.
*   **Task Time Format**: Choose how Full Calendar writes time back to task lines. Default is **Day Planner Format**.
*   **Include global query in the backlog**: If enabled, applies the Obsidian Tasks global query filters to the backlog view to hide unwanted tasks.

## Advanced Settings

Access the tasks Plugin Integration specific settings at (only visible if the Tasks Calendar is added).

> Settings -> Integrations -> Tasks Plugin Integration

<!-- Image missing: ../../assets/calendars/tasks-integration.gif -->

---

[TaskNotes Integration](tasknotes.md) · [Advanced Categorization](../settings/categories.md) · [FCR Command](../features/nlp.md) · [Technical Architecture](../../architecture/calendars/tasks-integration.md)
