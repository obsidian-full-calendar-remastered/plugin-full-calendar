# Tasks in Events

Turn any event in a local calendar into a task that can be marked as complete.

## Creating a Task

In the event editor modal, simply check the **"Is a Task"** box. A "Completed" checkbox will appear.

-   **For single events:** You can set the initial completion status right in the modal.
-   **For recurring events:** The "Completed" checkbox will be disabled in the main editor. You can mark individual instances as complete directly on the calendar.

Alternatively, you can right-click any local event on the calendar and select "Turn into task."

## Completing Tasks

Once an event is a task, a checkbox will appear next to its title on the calendar.

-   **Single Events:** Click the checkbox to mark it complete. The event will be crossed out, and completion status will be added to its frontmatter (either a `completed` timestamp or a boolean `true`, depending on your [calendar configuration](../calendars/local.md#task-completion-style)).
-   **Recurring Events:** You can now complete recurring tasks on an instance-by-instance basis! Checking the box for a recurring task will mark only that day's instance as complete, leaving future instances untouched.

![Task Events](../../assets/events/task-events.gif)