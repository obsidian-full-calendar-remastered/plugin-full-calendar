# Timezone Support

Full Calendar is fully timezone-aware to ensure that your events are always accurate, especially if you travel, work with remote teams, or use calendar feeds from different timezones.

For implementation details of a past one-day recurrence shift bug and its patch, see the [RRULE timezone patch devlog](../../architecture/dev-logs/devlog_rrule_timezone_patch.md).

## Display Timezone

This is the most important setting. It determines the timezone that the entire calendar view is rendered in. By default, it uses your computer's local system timezone.

You can override this in **Settings → Display & Behavior → Display Timezone**.

Changing this is useful for:

-   **Trip Planning:** Set the display timezone to your destination's timezone to see your schedule as it will be locally.

-   **Remote Collaboration:** Set it to a colleague's timezone to easily schedule meetings.

!!! info "Display Timezone Selector"
    The **Display Timezone** dropdown includes a search field and supports standard IANA timezone identifiers (e.g. `America/New_York`, `Europe/Berlin`, `Asia/Tokyo`), as well as a `System Default` option.

## How Timezones are Handled

The plugin works to find the "source of truth" for an event's time and then convert it to your chosen display timezone.

-   **Remote Calendars (ICS/CalDAV):** Events from sources like [Google Calendar](../calendars/gcal.md) almost always have timezone information embedded in them (e.g., `TZID=America/New_York`). The plugin reads this information and performs a precise conversion. UTC events are also handled correctly.
    -   **Recurring Events:** To prevent time drift during Daylight Saving Time (DST) transitions, recurring patterns are passed directly to the calendar view to be expanded dynamically using the *source* timezone, guaranteeing precision.
-   **[Full Note](../calendars/local.md) & [Daily Note](../calendars/dailynote.md) Calendars:** When you create or edit a timed event in a local note, the plugin automatically stamps it with your current display timezone in the frontmatter (e.g., `timezone: Europe/London`). This anchors the event to a specific moment in time.

### Legacy Note Auto-Upgrade

If you have older notes created with a version of the plugin that did not support explicit timezones, Full Calendar implements an **auto-upgrade policy** to ensure data consistency as you move between timezones.

For details on how the plugin repairs and stamps legacy notes, see the **[Backward Compatibility Tracker](../../architecture/system/backward-compatibility.md#active-legacy-support)**.

## Troubleshooting

See: **[Troubleshooting: Wrong event times](../guides/troubleshooting.md#why-are-my-event-times-wrong-dsttimezones)**