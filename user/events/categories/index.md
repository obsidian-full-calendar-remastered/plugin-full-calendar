# Advanced Categories

The Advanced Categories feature is a powerful system for organizing and visualizing your events. It works by parsing a `Category` and optional `Sub-Category` from your event titles, unlocking features like fine-grained color-coding and the [Timeline View](../views/timeline_view.md).

This system is designed to work across **all calendar sources**, including remote calendars like Google Calendar and iCal feeds, making it a universal standard for your vault.

!!! success "Why You Should Use This"
    - **See Your Life at a Glance:** Assign unique colors to "Work," "Personal," "Fitness," etc., to instantly see how your time is allocated.
    - **Future-Proof Your Vault:** This system is the foundation for many upcoming features, including timeline views and advanced analytics. Adopting it now will ensure you get the most out of Full Calendar.
    - **Universal Compatibility:** A single, consistent organizational method for local and remote events.

---

## The Title Format

The plugin uses a specific format to identify categories and sub-categories in your event titles.

`Category - Sub-Category - Event Name`

The delimiter is a **dash surrounded by spaces (` - `)**.

-   `✅ Correct: Work - Project Sync - Daily Standup`
-   `✅ Correct: Personal - Run` (Sub-category is optional)
-   `❌ Incorrect: Work-Project Sync` (Missing spaces around the dash)

When displayed on the calendar, the `Category` is stripped from the title to keep the view clean (e.g., you'll see `Project Sync - Daily Standup`). The full title is always preserved in the note.

Storage details:

- [Daily Note calendars](../calendars/dailynote.md): The category and sub-category are part of the list item text (the title). Inline fields do not include a separate category key.
- [Full Note calendars](../calendars/local.md): The category and sub-category are encoded in the `title` field of frontmatter; separate `category`/`subCategory` keys are not persisted in frontmatter.

!!! tip "Why this format?"
    This title-based approach was chosen for maximum compatibility. Most remote calendar systems (like Google Calendar) don't have a dedicated "category" field that syncs externally. By embedding the category in the title, you can organize events from *any* source, and the plugin will recognize them.

---

## Enabling Advanced Categories

This feature can perform a one-time, permanent modification of your event notes. **It is highly recommended to back up your vault before enabling this feature.**

1.  Go to **Full Calendar Settings → Advanced categorization and Timeline**.
2.  Toggle **"Enable Advanced Categorization"** on.
3.  A bulk-update modal will ask how you want to categorize your existing local events:
    -   **Use Parent Folder (Smart):** For events that do *NOT* already look categorized, the parent folder name is used as the category. Titles already in `Category - Title` or `Category - Sub-Category - Title` format are skipped.
    -   **Use Parent Folder (Forced):** The parent folder's name will be prepended to *all* event titles, even if they already have one. Use with caution, as this can create nested categories (e.g., `NewCat - OldCat - Title`).
    -   **Forced Default Update:** You provide a default category, and it will be prepended to *all* event titles.
4.  If you cancel this modal, no bulk changes are applied.

!!! info "Bulk Migration Modal"
    The migration modal inspects your vault and lists every modified event note prior to executing changes, so you can review updated titles before saving.

## Managing Category Colors

Once enabled, a new management section will appear in the settings.

-   **Add a Category:** Start typing in the "Add a new category..." input box. It provides autocomplete suggestions for categories found in your vault that you haven't configured yet. Click **Add**.
-   **Change Color:** Click the color swatch next to any category to open a color picker.
-   **Delete a Setting:** Click **Delete** to remove a category's color setting. This *does not* remove the category from your event titles.
-   **Save:** After making changes, click **Save Category Settings**.

!!! tip "Autocomplete Suggestions"
    The input field dynamically scans all event titles across your active calendars to suggest unconfigured categories as you type.

---

## Disabling Advanced Categories

When you turn this feature off, you can choose a non-destructive or cleanup path.

1.  Toggle "Enable Advanced Categorization" off in settings.
2.  In the disable modal, choose one option:
    -   **Disable without cleanup:** Only disables the feature flag. No bulk processing is run, event titles are not changed, and saved category color settings are kept.
    -   **Disable and clean up notes:** Runs bulk cleanup for local calendars (removing known `Category - ` prefixes) and clears saved category color settings.