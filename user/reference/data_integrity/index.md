# Data Integrity and File Modifications

This plugin is designed to respect your data and your vault. We believe you should always be in control of your files. This page provides a transparent overview of every situation where the Full Calendar plugin might create or modify notes in your vault.

> The following are the ONLY workflows that is intended / allowed to make changes to the files in your Vault. Anything above and beyond this constitutes unintentional data loss and should be immediately **reported**.

---

### 1. Explicit Modifications (User-Initiated)

These are large-scale changes that **only happen after you explicitly consent** through one or more confirmation windows.

#### Enabling/Disabling Advanced Categories

-   **What it does:** When you enable the **[Advanced Categories](../events/categories.md)** feature, the plugin offers one-time bulk-update methods for local events (smart/forced) to add category prefixes to titles (e.g., `My Meeting` becomes `Work - My Meeting`). When you disable it, you can either disable without cleanup (no file/content changes) or disable and clean up (remove known category prefixes from local event titles and clear saved category color settings).
-   **How it's triggered:** By toggling "Enable Advanced Categorization" in the settings.
-   **User Control:** **This is a fully consented action.** Bulk operations run only after you choose a workflow in the modal. You can also cancel or choose a non-destructive disable path.

---

### 2. Side-Effect Modifications (Predictable)

These are file modifications that happen as a direct, predictable result of an action you take within the calendar UI.

#### Creating Daily Notes

-   **What it does:** If you use a "Daily Note" calendar and create or drag an event to a date for which a daily note does not yet exist, the plugin will create the note for you based on your Daily Note template.
-   **How it's triggered:** Creating a new event or moving an existing event to a new day in a Daily Note calendar.
-   **User Control:** This is an expected and necessary side-effect of using a Daily Note calendar. It saves you the step of having to manually create the note before adding an event to it.

#### Renaming Event Notes

-   **What it does:** When you edit an event's title or date in a Full Note calendar, the plugin will automatically rename the associated `.md` file to match (e.g., `2023-01-01 My Meeting.md`). This keeps your filenames in sync with your event data.
-   **How it's triggered:** Editing the title or date of an event in a Full Note calendar via the event modal.
-   **User Control:** This is a predictable side-effect of editing an event.

---

### 3. Implicit Modifications (Automatic)

This is the most important category to be aware of. These are modifications that may happen automatically to ensure feature compatibility.

#### Frontmatter Quote Formatting & Colon Safety

-   **What it does:** When writing or updating frontmatter fields in Full Note calendar files, string fields (such as `title`, `category`, and `description`) are serialized with double quotes by default (e.g. `title: "Super: Event"`).
-   **Why it's done:** Unquoted colons (e.g. `title: Super: Event`) violate YAML mapping syntax and cause parser failures in Obsidian. Double-quoting prevents frontmatter corruption while leaving body content untouched.

#### Timezone Auto-Upgrade for Full Note Calendars

-   **What it does:** To support robust timezone conversions, timed events in "Full Note" calendars need a `timezone` field in their frontmatter. If the plugin detects a note from a previous version that is missing this field, it will add it. 
-   **How it's triggered:** This modification happens automatically when the plugin **reads** an event note that doesn't have a timezone (e.g., when you open the calendar view).
- **Expected modification** - The only allowed modification of your files in this workflow is to append a `Timezone` tag with your local timezone.
-   **User Control:** While its intention is to seamlessly upgrade your notes for timezone support, we recognize that any modification without a prompt can be surprising, and can introduce unwanted bugs.