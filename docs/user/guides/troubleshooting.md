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



## Google & Outlook Calendars

??? question "Google Calendar: OAuth login redirect fails"
    <a id="google-calendar-authentication-manual-flow"></a>
    If standard login fails or your browser cannot automatically redirect back to Obsidian (due to firewall blocks, local port restrictions, or specific sandbox/browser security settings):
    
    1. Go to **Settings** → **Calendars** → **Google Calendar Settings**.
    2. Enable **Copy-paste authorization**.
    3. Click **Login with Google**. Instead of automatically launching the browser, a modal will display the OAuth authorization URL.
    4. Copy the URL, paste it manually into the browser of your choice, and authorize the integration.
    5. Copy the resulting code/token and paste it back into Obsidian to complete authentication.

??? question "Outlook Calendar: Account connection fails or custom token fails"
    <a id="outlook-calendar"></a>
    If custom token creation and account connection fails:
    
    - Verify the Azure app is configured for Desktop/Native flow.
    - Verify redirect URI is exactly `http://localhost:42813/callback`.
    - Ensure your proxy has the required Microsoft environment variables.
    - Reconnect the account after any authorization config change.
    
    If events are missing:
    
    - Revalidate remote calendars from command or settings.
    - Confirm the event exists in the selected Outlook calendar.
    - Confirm the calendar source is linked to the expected Outlook account.

??? question "Google & Outlook: Authentication fails on mobile (Android / iOS)"
    <a id="mobile-authentication-workaround"></a>
    Obsidian's strict app sandboxing on iOS and Android can block native OAuth redirect loops, making direct mobile authentication fail. Use the following workaround for now:
    
    To authorize Google Calendar, Google Tasks, or Outlook on mobile, use this synchronization workaround:
    
    1. **Enable Plaintext Mode on Desktop:** In Full Calendar Settings → Integrations, toggle on **Store credentials in plaintext (sync compatibility)**.
    2. **Authenticate on Desktop:** Connect your Google or Outlook accounts on your desktop client. Credentials will be written in plaintext directly into `data.json`.
    3. **Sync to Mobile:** Sync your Obsidian vault to your mobile device.
    4. **Disable Plaintext Mode on Mobile:** Toggle **Store credentials in plaintext** back to **off** on first on your mobile device. This results in migrating the tokens from plain text into secured format. Now, do the same for desktop.
    5. **Automated Migration:** The migration script will instantly kick in on both platforms, importing the credentials securely into each local device's keychain storage and clearing the plaintext values from `data.json`.
    
    For ongoing tracking and updates on native mobile OAuth, see [GitHub Issue #191](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/191).

## Special Calendars (Bases & Holidays)

??? question "Bases Calendar: Troubleshooting missing events, wrong notes, or category coloring"
    <a id="bases-calendar"></a>
    - **Basis is now depreciated and will be removed**
    - **No events showing**: Ensure the Bases plugin is enabled and the selected `.base` file exists; confirm your notes have a `date` (or `start`/`due`) frontmatter field.
    - **Wrong notes included**: Refine your Base filters (tags/folder) and ensure the `.base` file is saved.
    - **Categories missing**: Add `category` and optional `subCategory` to note frontmatter so titles render with hierarchy.

??? question "Holidays Calendar: Troubleshooting holiday details or codes"
    <a id="holidays-calendar"></a>
    - **No holidays showing**: Verify the country code is a valid [ISO 3166-1 alpha-2](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2) code (exactly 2 uppercase letters). Check the [supported countries list](https://github.com/commenthol/date-holidays/blob/master/docs/Holidays.md).
    - **Fewer holidays than expected**: The selected holiday type tier may be too narrow. Try **Public + Bank + Observance** or **All types** to include more tiers.
    - **State/region code not working**: State and region codes are lowercase in date-holidays (e.g. `ca` not `CA`). Verify against the [supported countries list](https://github.com/commenthol/date-holidays/blob/master/docs/Holidays.md).
    - **Wrong holidays for my location**: Add the state/province code to narrow down national holidays to your region. Some countries (e.g. Germany `DE`) have significant per-state variation.

## Workspaces

??? question "Workspaces: Troubleshooting filtering, colors, or YAML loading"
    <a id="workspaces"></a>
    - **No Events Displayed**: Check if you have defined category filters or Bases filters that are too restrictive. Ensure your `.base` file path is correct relative to the vault root.
    - **Wrong Colors**: Ensure your workspace's `categorySettings` color hex codes are valid (e.g., `#ffffff`).
    - **YAML Errors**: Validate your `.base` file using a YAML linter if the workspace fails to load.

## Chrono Analyser

??? question "Chrono Analyser: Troubleshooting empty insight datasets or missing events"
    <a id="chrono-analyser"></a>
    - **My insights look empty or incorrect**: Double-check your Insight Group configuration. The most common issues are using the wrong field, expecting AND logic between fields, or forgetting that sub-project keywords use substring matching while project/hierarchy lists use exact matching. See [matching rules](../chrono_analyser/settings.md#how-matching-works).
    - **Events are missing from analysis**: Ensure Category Coloring is enabled if you want remote calendars included. If it is disabled, Chrono Analyser only analyzes Full Note calendar records. Also verify that the affected events have valid dates and durations.
    - **Habit Consistency is flagging projects I do not care about**: Add those project names to **Muted Projects** or add a keyword to **Muted Sub-project Keywords** in the relevant Insight Group. See [muted rules](../chrono_analyser/settings.md#how-matching-works).
    - **The analyser is slow or unresponsive**: Try resetting the event cache from the plugin command palette. For very large datasets, consider filtering by date or category.

## Internationalization (i18n)

??? question "Internationalization (i18n): Translation issues"
    <a id="internationalization-i18n"></a>
    - If a string appears in English, It's likely that the key has not been translated into your language yet. Help us translate it via a PR or [upload translation here](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/discussions/310).


## Others

If the above steps don't resolve your issue, please feel free to reach out.

[:material-github: Submit an issue on GitHub](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues){ .md-button .md-button--primary }

---

[Getting Started](../../getting_started.md) · [Commands and Shortcuts](commands-and-shortcuts.md) · [Interactions and Gestures](../features/interactions.md)

