# CalDAV Tasks

**CalDAV Tasks** connects task or reminder collections stored as standard iCalendar `VTODO` resources. It is separate from the regular [CalDAV calendar](caldav.md) source so a task collection is never treated as an appointment calendar.

Tested with iCloud Reminders via its CalDAV `VTODO` collection. This is observed interoperability, not an Apple API guarantee; the implementation uses only standard CalDAV/iCalendar requests.

## Configuration

1. Open **Settings → Full Calendar → Calendar Sources**.
2. Select **CalDAV Tasks**, then add the source.
3. Enter the direct task-list collection URL, username, and password.
4. For iCloud, use the Apple Account email and an [Apple app-specific password](https://support.apple.com/en-us/HT204397). Do not use the normal Apple Account password.

The collection URL must point to the task/reminder calendar itself, for example `https://example-caldav-server/<account>/calendars/tasks/`. Paths vary by server and account. Automatic principal and task-list discovery is not yet included.

Passwords follow Full Calendar's existing CalDAV credential handling. When Obsidian SecretStorage is available, the saved password is removed from plugin settings and is not displayed in the calendar-source row.

## Mapping and synchronization

| VTODO data | Full Calendar behavior |
| --- | --- |
| `DTSTART` | Preferred calendar placement |
| `DUE` without `DTSTART` | Calendar placement; retained as a due value, not an event end |
| No usable date | Unified Task Backlog |
| `STATUS:COMPLETED` or `COMPLETED` | Completed task |
| `PERCENT-COMPLETE:100` | Completed task |
| `NEEDS-ACTION` / `IN-PROCESS` | Active task |
| `CANCELLED` | Kept out of the active calendar/backlog |
| `RRULE` | Parsed for display and preserved during ordinary edits |

Date-only, floating date/time, UTC, and `TZID` values are supported. When both `DTSTART` and `DUE` exist, moving the task shifts both while retaining their interval. Full Calendar does not invent a duration for a due-only reminder.

The source supports:

- Read and refresh without title/date-based duplication.
- Create with a stable UID and conditional `PUT`.
- Edit title, date/time, description, and completion.
- Complete and reopen using `STATUS` plus `COMPLETED`.
- Delete the exact CalDAV resource URL.
- ETag conflict protection on updates.
- Undated task creation and drag scheduling through the Task Backlog.

Updates fetch and patch the original `VTODO`. Unmapped properties, including unknown `X-APPLE-*` extensions and existing recurrence rules, are retained.

## Apple Reminders manual test

Never place credentials or unredacted server responses in screenshots, logs, fixtures, issues, or commits.

1. Generate an Apple app-specific password.
2. Obtain the account's direct VTODO collection URL and add it as **CalDAV Tasks**.
3. In Apple Reminders, create `Test reminder` with a due date and time.
4. Refresh Full Calendar and verify the task, due time, and incomplete checkbox.
5. Change its title and date/time in Full Calendar; verify both changes in Apple Reminders.
6. Complete it in Full Calendar; verify it is completed in Apple Reminders.
7. Reopen it in Full Calendar; verify it becomes active again.
8. Create a dated task in Full Calendar; verify it appears in Apple Reminders.
9. Create an undated task in the Full Calendar backlog, then drag it onto the calendar; verify the remote due/scheduled date.
10. Delete a task from Full Calendar and verify removal in Apple Reminders.
11. Refresh and restart Obsidian; verify no duplicate resources appear.
12. Delete or change a task from Apple Reminders and verify the next refresh reflects the remote state.

## Limitations

- Entering an account root and automatically discovering task lists is not yet supported; use a direct collection URL.
- Existing `RRULE` data is displayed and preserved, but creating/changing recurrence and editing or completing one recurring instance are not yet supported.
- Cancelled tasks are not rendered because the shared task model has no separate cancelled visual state.
- Server-side sync tokens are not yet used; refreshes query the VTODO collection and reconcile stable href/UID/ETag identity.

## Troubleshooting

- **Authentication failed (401):** verify the username and app-specific password.
- **Permission denied (403):** the account can read the collection but cannot perform the requested operation.
- **Not a calendar collection:** use the direct task-list collection URL rather than an account or principal root.
- **No VTODO capability:** choose a collection that advertises or contains tasks/reminders.
- **Conflict (409/412):** refresh first; the task changed remotely after it was loaded.
- **Malformed iCalendar:** the invalid resource is skipped while other tasks continue loading.
