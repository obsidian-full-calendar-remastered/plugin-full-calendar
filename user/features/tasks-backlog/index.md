# Task Backlog Panel

The **Task Backlog** is a unified sidebar panel that aggregates all of your unscheduled, undated, and pending tasks in one place. It serves as a central staging queue for scheduling tasks onto your calendar.

!!! tip "Aggregated Power"
    Rather than being tied to a single calendar or task manager, the Task Backlog sidebar automatically pulls and merges backlog items from all of your active task-supporting providers—including **[Obsidian Tasks](../calendars/tasks-plugin-integration.md)**, **[Google Tasks](../calendars/gtasks.md)**, and **[CalDAV Tasks (VTODO)](../calendars/caldav.md)**.

---

## Accessing the Backlog

You can open the Task Backlog sidebar panel in two ways:
1. Click the **List Todo** (`list-todo`) ribbon icon in the left sidebar.
2. Open the **Command Palette** (`Ctrl/Cmd + P`), search for `Full Calendar: Open task backlog`, and press Enter.

---

## Backlog Controls & Interaction

The Task Backlog view is highly optimized to help you quickly organize and schedule large collections of tasks.

### 🔍 Fuzzy Search & Filtering
- Use the search input at the top of the backlog to instantly filter tasks by **title**, **source provider**, or **associated file path**.
- Select the provider dropdown next to the search bar to filter tasks by a specific calendar source (e.g. only show CalDAV tasks or only show Obsidian Tasks).

### 📅 Drag-and-Drop Scheduling
To block out time or assign a date to a task:
1. Simply drag any task from the backlog sidebar.
2. Drop it onto a specific date or time slot on your calendar grid.
3. Full Calendar will automatically update the task's due date (or scheduled date) in the corresponding provider and sync the changes in real-time.

### 📥 Completion Toggling
Click the checkbox directly next to a task title in the backlog sidebar to mark it as completed. Once marked, it will automatically sync to your provider and disappear from the backlog.

---

## Adding Unscheduled Tasks

The persistent footer at the bottom of the backlog sidebar panel provides a quick input field to queue new, undated tasks on the fly:

1. Select the target source/provider from the source dropdown.
2. Type your task title in the input box.
3. Click the **+** button or press Enter to create the task immediately.

---

## Related Sections

- [Google Tasks Sync](../calendars/gtasks.md)
- [CalDAV Integration](../calendars/caldav.md)
- [Obsidian Tasks Integration](../calendars/tasks-plugin-integration.md)
