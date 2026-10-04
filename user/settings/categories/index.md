# Advanced Categorization Settings

!!! abstract "Philosophy"
    Organize your events visually. Categories allow you to group related events, apply consistent colors, and use smart matching logic to automate your organization.

## Category Management

Access these settings in **Full Calendar Settings → Advanced Categorization**.

*   **Enable Advanced Categorization**: The global toggle for category-based coloring and matching.
*   **Categories List**: 
    *   Add, rename, or delete categories.
    *   **Color Picker**: Assign a unique color to each category using the integrated HSL color picker. These colors are applied to event blocks across all calendar views.

## Smart Matching Logic

The plugin uses the category list to perform "Smart Matching" when parsing event titles.

*   **Matching Rule**: If an event title starts with `<Category Name> - `, the plugin automatically assigns that category and applies the corresponding color. See: [Event Naming Convention](../events/categories.md).
*   **UI Integration**: When creating events via the [FCR Command](../features/nlp.md), you can explicitly assign categories using the `in <calendar>` or title-matching syntax.

*   **Workspace Filtering**: Within a [Workspace](workspaces.md), you can choose to `Show Only` or `Hide` specific categories. This allows you to create focused views (e.g., "Work Only" vs "Personal Only") without changing your global settings.

## Bulk Categorization Updates

If you decide to rename or merge categories, you don't need to update every note manually. You can use the **Bulk Update Vault** utility to surgically update your notes to match your new settings.

For safety guidelines and details on how this process modifies your files, see the **[Backward Compatibility Tracker](../../architecture/system/backward-compatibility.md#active-legacy-support)**.

---

[Calendar Sources](sources.md) · [Workspaces](workspaces.md) · [Back to Index](index.md)
