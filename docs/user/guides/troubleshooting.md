# Troubleshooting

Use this page as a first response checklist for common issues.

## General

??? question "How do I reset the event cache?"
    <a id="how-do-i-reset-the-event-cache"></a>
    If something is not working as expected, the first thing to try is [resetting the event cache](../reference/data_integrity.md).
    
    - Run the command [`Full Calendar: Reset Event Cache`](commands-and-shortcuts.md).

    This forces the plugin to re-read all events from all your sources. This is a safe operation and often fixes synchronization or display issues.

??? question "Why are my events missing?"
    <a id="why-are-my-events-missing"></a>
    1. Follow the [Reset Event Cache](#how-do-i-reset-the-event-cache) steps above.
    2. Reopen the calendar view.
    3. Verify calendar source is enabled and visible in [Settings](../settings/index.md).

## Events & Calendars

??? question "Why are my remote calendars not updating?"
    <a id="why-are-my-remote-calendars-not-updating"></a>
    1. Run the command `Full Calendar: Revalidate remote calendars`.
    2. Recheck provider credentials and account setup.
    3. Confirm network access and provider limits.

??? question "Why are my reminders not firing?"
    <a id="why-are-my-reminders-not-firing"></a>
    1. Confirm [reminder settings](../settings/reminders.md) are enabled.
    2. Confirm OS-level [notifications](../features/reminders.md) are allowed for Obsidian.
    3. Test with an event that starts within a short window.

    See: [Reminders and Notifications](../features/reminders.md)

??? question "Why are my event times wrong (DST/Timezones)?"
    <a id="why-are-my-event-times-wrong-dsttimezones"></a>
    1. Check display timezone settings in [Settings](../settings/index.md).
    2. Confirm source calendar timezone assumptions.
    3. Re-test with new event creation in target timezone.

    See: [Timezone Support](../events/timezones.md)

??? question "How do I force a 24-hour format and European (DD/MM/YYYY) date display while keeping English UI?"
    <a id="how-do-i-force-24-hour-format-and-european-dates"></a>
    If your system defaults override the calendar formatting, you can force Obsidian to display a 24-hour clock and European date order (while keeping Obsidian's interface in English) by launching it with the `LANG` environment variable set to `en_DK.UTF-8` on Linux or macOS:
    
    ```bash
    LANG=en_DK.UTF-8 obsidian
    ```
    
    This ensures that Electron/Obsidian inherits the 24-hour format directly from this standard ISO locale. For more details on this setup and community discussion, see [GitHub Issue #272, Comment 4529803759](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/272#issuecomment-4529803759).

## FCR Command (NLP)

??? question "FCR Command not found"
    Make sure the plugin is up to date. Search for "[FCR Command](../features/nlp.md)" in the command palette.

??? question "Wrong date resolved"
    "next \<weekday\>" always advances forward, never backward. "Next Wednesday" on a Wednesday means one week later.

??? question "Phrase conflicts"
    Rules are ordered by specificity — "in 3 hours" will not accidentally match "in Work calendar".

??? question "Category phrase at the start not applied"
    Use `category <name>` with your title text after it (for example: `category work FINA 3203 N19 at 5pm in work`).
    If [category coloring](../events/categories.md) is enabled, the [NLP layer](../features/nlp.md) fuzzy-matches to saved category names.

??? question "Time not parsed as expected"
    Prefer anchored time phrases like `at 5pm` or `from 3pm to 5pm`.
    Compact forms such as `430pm` are supported when preceded by `at` or `from`.

??? question "Calendar not matched"
    Smart matching is case-insensitive. Check that the name exactly matches your calendar's display name in [Settings](../settings/index.md).



## Others

If the above steps don't resolve your issue, please feel free to reach out.

[:material-github: Submit an issue on GitHub](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues){ .md-button .md-button--primary }

---

[Getting Started](../../getting_started.md) · [Commands and Shortcuts](commands-and-shortcuts.md) · [Interactions and Gestures](../features/interactions.md)

