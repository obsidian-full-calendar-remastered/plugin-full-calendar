# Live Preview Event Decorators

Full Calendar Remastered features deep, modern integration with the **Obsidian Live Preview editor (CodeMirror 6)**. This feature automatically decorates calendar event text in your files, transforming plain text or YAML frontmatter blocks into premium, highly interactive, and beautifully stylized UI widgets.

---

## 1. Daily Notes: Interactive Event Pills

When you open a Daily Note, the plugin scans the page for inline events (both plain text list items and standard Obsidian checklist checkboxes). While your cursor is elsewhere, these events are replaced with **sleek interactive event pills**:

* **Color-Coded Identifiers**: Each pill uses a custom colored dot and left border representing the event's source calendar color.
* **Smart Time Representation**: Renders start and end times clearly (e.g., `10:00 - 11:30`).
* **Category Badges**: Pill shapes are decorated with harmonized category badges that reflect the event's categorization.
* **Interactive Task Checkboxes**: If the event is configured as a task checklist item, a native checkbox is embedded in the pill. Clicking this checkbox immediately toggles the task completion state (marking it as `'x'` or `false`), updating the markdown document, and triggering a fast cache refresh!
* **Flat List Overrides**: To avoid cumulative offset errors and layout shifts inside lists, the editor automatically neutralizes list margins, text-indents, and bullet paddings on decorated lines. The event pill is rendered perfectly flat and flush against the editor width, maintaining clean layout alignment.
* **Quick Actions on Hover**: Hovering over any inline pill reveals quick actions (such as an Edit icon) that launch the standard Event Editing modal.

### Active-Line Exclusion

We understand that you still need to easily edit your plain-text notes. The Live Preview decorator utilizes a high-performance **Active-Line Exclusion** strategy. Whenever your editing cursor moves onto a decorated line, the visual pill is instantly hidden, revealing the raw Markdown so you can make direct text edits without any obstruction. Moving your cursor away instantly restores the premium pill.

---

## 2. Dedicated Notes: Elegant Header Cards

When editing a dedicated Event Note (FullNote) in Live Preview, the complex and text-heavy YAML frontmatter section at the top of the file can be distracting. The plugin automatically generates an **Elegant Metadata Header Card** block widget inside the editor:

* **Seamless YAML Properties Integration**: Rather than clashing with Obsidian's native properties view or overlapping metadata blocks, the decorator automatically scans and detects your note's frontmatter boundaries. The elegant header card is inserted **precisely underneath the YAML properties block**. This allows you to edit standard properties/metadata while the visual card acts as your central control deck.
* **Header Banner & Brand**: A gorgeous color banner at the top showing the name of the parent calendar (e.g., "Local Notes").
* **Large Title**: Your event title is rendered in high-end, premium typography.
* **Datetime & Category Tags**: Displays clear datetime stamps (with timezone awareness) and responsive badges for categories and subcategories.
* **Quick Controls**: Convenient quick-action buttons are docked inside the header card, allowing you to instantly **Edit details** or **Delete the event** directly from the editor without switching pages or opening calendar sidebars.

---

## 3. Disabling Live Preview Decorations

If you prefer to edit raw markdown task items (`- [ ]`) directly without CodeMirror inline event pills or header card widgets replacing your text, you can disable this feature in settings:

1. Open **Plugin Settings** -> **Appearance**.
2. Turn off the **Enable Live Preview event decoration** toggle.
3. The editor will instantly update across all open notes, removing all live preview decorations while leaving your calendar UI views and tasks integrations fully operational.

---

## Technical Performance

The Live Preview system is built to be extremely fast and lightweight:
* **Cache-Driven Pulls**: Decorators do not parse markdown documents on the fly; they pull pre-parsed, highly optimized event payloads from the plugin's central **Event Cache**.
* **Zero Input Latency**: Active-line exclusion and DOM rendering are debounced and highly optimized to avoid causing layout thrashing or typing lag.
* **State Bridge Rendering**: Powered by a decoupled `StateField` bridge, ensuring block widgets render smoothly without triggering CodeMirror runtime warnings.

