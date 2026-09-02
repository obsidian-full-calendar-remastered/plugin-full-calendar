# FCR Command — Natural Language Orchestrator

The **FCR Command** is your single point of control for Full Calendar Remastered. 

!!! tip "Usage"
    Open it from the [Command Palette](../guides/commands-and-shortcuts.md) (`Ctrl/Cmd + P → "FCR Command"`) and use natural language to do anything: [create events](../events/manage.md), [navigate views](../views/index.md), [open settings](../settings/index.md), [sync data](../reference/data_integrity.md), and more.

---

## How It Works

1. Open the Command Palette (`Ctrl/Cmd + P`)
2. Search for **FCR Command**
3. Type any command in natural language
4. A **live preview** shows exactly what will happen before you hit **Run**
5. Press **Enter** or click **Run** to execute

---

## Everything You Can Do

### 📅 Create Events

| What you type | What happens |
|---|---|
| `Team standup tomorrow at 9 am` | Creates "Team standup" tomorrow at 9:00 AM |
| `next tuesday at 4:30 pm Sprint review` | Creates "Sprint review" next Tuesday at 4:30 PM |
| `in 3 hours Deploy release` / `in 3 hrs ...` | Creates "Deploy release" 3 hours from now |
| `in 30 minutes Break` / `in 30 mins ...` | Creates "Break" 30 minutes from now |
| `some event for last 8 hours` / `... last 8 hrs` | Creates "some event" starting 8 hours ago and ending now |
| `some event for next 8 hours` / `... next 8 hrs` | Creates "some event" starting now and ending 8 hours from now |
| `day after tomorrow Workshop` | Creates "Workshop" two days from now |
| `Matthews 2 in daily1` | Creates "Matthews 2" in the "daily1" calendar (smart match) |
| `Meeting in Work calendar` | Creates "Meeting" in the "Work" calendar (explicit match) |
| `every monday Standup at 9 am` | Creates recurring "Standup" every Monday |
| `daily Standup` | Creates "Standup" repeating every day |
| `on 9th at 3 pm for 7 hrs Working` | Creates "Working" on the upcoming 9th, lasting 7 hours |
| `add event tomorrow Dentist` | Strips "add event" prefix, creates "Dentist" tomorrow |
| `create event Lunch for 30 mins` | Strips "create event" prefix, sets duration to 30 mins |
| `category work FINA 3203 N19 at 5pm in work` | Creates "Work - FINA 3203 N19" at 5:00 PM in calendar "work" |
| `FINA 3203 N19 category work at 5pm in work` | Same as above, category can be stated at the start or later in the phrase |
| `Focus from 3pm to 5 pm` | Creates "Focus" with explicit start 3:00 PM and end 5:00 PM |
| `Call at 430pm` | Parses compact time and creates "Call" at 4:30 PM |

### 🧭 Navigate Views

| What you type | What happens |
|---|---|
| `open weekly view` | Switches to the [week view](../views/index.md) |
| `show month view` | Switches to the [month view](../views/index.md) |
| `view day view` | Switches to the [day view](../views/index.md) |
| `open calendar` | Opens the main [calendar tab](../views/index.md) |
| `open sidebar` | Opens the [calendar sidebar](../views/index.md) |

### 📆 Go to Date

| What you type | What happens |
|---|---|
| `go to tomorrow` | Navigates the calendar to tomorrow's date |
| `goto next tuesday` | Navigates to next Tuesday |
| `jump to next week` | Navigates 7 days forward |

### ⚙️ Plugin Orchestration

| What you type | What happens |
|---|---|
| `open settings` | Opens Full Calendar [settings tab](../settings/index.md) |
| `open chrono` / `show analyser` | Opens the [Chrono Analyser](../chrono_analyser/introduction.md) dashboard ([Config](../chrono_analyser/settings.md)) |
| `show changelog` / `show whats new` | Displays the [changelog](../../whats_new.md) |
| `open milestones` / `show achievements` | Opens the [milestones page](milestones.md) |
| `reset cache` / `clear event cache` | Clears and rebuilds the [event cache](../reference/data_integrity.md) |
| `refresh calendars` / `revalidate remote calendars` | Resyncs all [remote calendars](../calendars/index.md) |
| `sync activitywatch` / `sync aw` | Pulls latest data from [ActivityWatch](../calendars/activitywatch.md) / [TaskNotes](../calendars/tasknotes.md) |

---

## Provider-Aware Create Flow

`CREATE_EVENT` commands are dispatched through the same provider pipeline used by normal event creation.

*   For local/standard calendar providers, events are created directly in the target source.
*   For TaskNotes providers, creation is delegated to TaskNotes native UI.

This means NLP create commands no longer open an extra intermediate Full Calendar create modal before provider handling.

## TaskNotes NLP Endpoint

For TaskNotes calendars, configure the NLP endpoint at **Settings → Integrations → TaskNotes Integration**:

*   **Search + Create (selector modal)** *(default)*
*   **Direct Create (task creation modal NLP)**

Both modes prefill TaskNotes with parsed NLP text so you can quickly confirm and finalize in TaskNotes-native UI.

---

!!! example "Smart Calendar Matching"
    **Input:** `Tomorrow at 4pm Matthews 2 in daily1`

    - **If `daily1` is a calendar** → Title = "Matthews 2", Calendar = "daily1"
    - **If `daily1` is NOT a calendar** → Title = "Matthews 2 in daily1" (left as-is)

    You can also use the explicit form `in Work calendar` which always works regardless of name matching.

---

## Time References

| Phrase | Meaning |
|---|---|
| `at 4 pm` / `at 4:30 pm` | Sets time to 4:00 PM / 4:30 PM |
| `at 430pm` | Compact format for 4:30 PM |
| `from 3pm to 5 pm` | Sets explicit start/end time range |
| `at 12 am` | Midnight (00:00) |
| `at 12 pm` | Noon (12:00) |
| `at noon` | 12:00 PM |
| `at midnight` | 12:00 AM |

## Date References

| Phrase | Meaning |
|---|---|
| `today` | Today's date |
| `tomorrow` | Tomorrow's date |
| `yesterday` | Yesterday's date |
| `day after tomorrow` | Two days from now |
| `next tuesday` | The upcoming Tuesday (wraps to following week if needed) |
| `next week` | 7 days from now |
| `next month` | 30 days from now |
| `in 3 days` | 3 days from now |
| `in 2 weeks` | 14 days from now |
| `on 9th` / `on 4th` | The upcoming 9th/4th of the month (rolls to next month if day passed) |

## Duration References

| Phrase | Meaning |
|---|---|
| `for 1 hr` / `for 7 hrs` | Sets event duration to 1 or 7 hours |
| `for 30 mins` / `for 5 min` | Sets event duration to 30 or 5 minutes |
| `for last 8 hours` / `for last 8 hrs` | Sets start time to 8 hours ago, and end time to now |
| `for next 8 hours` / `for next 8 hrs` | Sets start time to now, and end time to 8 hours from now |

---

!!! example "Combining Phrases"
    **Input:** `next tuesday at 4 pm Team sync in Work calendar`

    **Result:** Title = "Team sync", Date = next Tuesday, Time = 4:00 PM, Calendar = "Work"

---

!!! info "Supported Languages"
    The FCR Command follows the same [internationalization pipeline](i18n.md) as the rest of the plugin:

    - **Maximal support**: English
    - **Basic support**: French, German, Spanish, Italian (_help improve it on [GitHub](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar)_)

    The language is automatically detected from your Obsidian language setting. Non-English payloads are fetched on first use and cached locally.

---

!!! tip "Power User Tips"
    - **Title placement**: Put the event title anywhere — the engine strips matched patterns and uses whatever's left.
    - **Anchored time parsing**: Time is prioritized with `at` or `from` triggers to avoid accidental matches from title numbers.
    - **Category keyword placement**: `category <name>` works both at the beginning and later in the sentence.
    - **Category typo tolerance**: Common typos in `category <name>` are fuzzy-matched to your saved categories.
    - **Live preview is your safety net**: Always check the preview card before running — it shows exactly what will happen.
    - **"in" calendar smart matching**: Type `in <calendar_name>` at the end without needing to write "calendar".
    - **Relative date rollover**: "on 9th" will resolve to this month if it's the 7th, but next month if it's already the 10th.
    - **No match is safe**: If the engine doesn't recognize any patterns, the entire input becomes the event title.
    - **Time math works**: "for 7 hrs" at 3 PM correctly sets the end time to 10 PM.

---

## Troubleshooting

See the **[Central Troubleshooting Guide](../guides/troubleshooting.md#fcr-command-nlp)** for help with command recognition, date resolution, and calendar matching.
