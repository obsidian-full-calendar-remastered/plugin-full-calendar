# Google Tasks Two-Way Sync

Manage and schedule your tasks from Google Tasks directly inside Obsidian using **OAuth 2.0 authentication**.

!!! success "Verified Integration"
    Google Tasks shares the same secure, verified Google OAuth infrastructure as our Google Calendar integration. You only need to authenticate your Google Account once to gain access to both Google Calendar and Google Tasks.

---

## Quick Start: Connecting and Configuring

### 1️⃣ Connecting Your Google Account
If you haven't already connected a Google account:
1. Open **[Full Calendar Settings](../settings/index.md) → [Calendar Sources](../settings/sources.md)**.
2. Under **Integrations**, ensure your Google Account is connected.
3. If you connected your account in a previous version of the plugin, you may need to **Reconnect** the account to authorize the new Google Tasks API permission scope (`https://www.googleapis.com/auth/tasks`).

### 2️⃣ Adding Google Tasks Calendars
1. In the **Calendars** section of the settings, select **Google Tasks** from the source type dropdown and click **+**.
2. Select your connected Google Account in the setup wizard.
3. The plugin will fetch and display all available task lists from your Google Tasks account.
4. Select one or more task lists you want to add, then click **Add Google Task List** to complete the configuration.

---

## Key Features & Workflows

### 📥 Zero-Impact Backlog Integration
Any undated or incomplete tasks on your Google Tasks list automatically appear in the sidebar **Tasks Backlog** panel. 

- **Access the Backlog:** Open the Tasks Backlog sidebar to view all active, unscheduled tasks.
- **Drag-and-Drop Scheduling:** To schedule a task, drag it from the backlog list and drop it onto any date in your calendar view. This instantly writes the corresponding due date back to Google Tasks.

### 📅 Two-Way Synchronization
- **Dated Tasks:** Tasks with due dates appear on the calendar as all-day events.
- **Real-Time Sync:** Changing a task title, changing its date on the calendar, or deleting it entirely in Obsidian syncs instantly back to Google Tasks.
- **Completion Toggling:** Click the checkbox next to any task in your calendar or backlog view to toggle its completion status. This automatically marks it as completed or incomplete on the web!

### 📝 Linked Notes
Keep detailed project notes or task descriptions locally in Obsidian while keeping them linked to your remote task.
- Click a task event in the calendar or backlog, and click **Create Event Note**.
- A local markdown note will be created, indexed, and linked.
- The linked note indicator will automatically show that a local page is associated with the Google Task.

---

## Limitations

- **No Multi-Day Tasks:** Google Tasks natively only supports single due dates.
- **No Complex Recurrence:** The Google Tasks API does not support standard recurring calendar rules (such as RRULEs). All synchronized tasks are mapped and handled as single events.

---

[Google Calendar Two-Way Sync](gcal.md) · [Tasks Plugin Integration](tasks-plugin-integration.md) · [Back to Index](index.md)
