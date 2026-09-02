# Remote / Local calendars in .ics format

Add any calendar that you have a link to in .ics format to Obsidian. This includes public calendars like [this one of US holidays](https://www.officeholidays.com/subscribe/usa), but also includes [private Google Calendars](https://support.google.com/calendar/answer/37648?hl=en#zippy=%2Csync-your-google-calendar-view-edit%2Cget-your-calendar-view-only%2Csecret-address) and [public Apple Calendars](https://support.apple.com/guide/icloud/share-a-calendar-mm6b1a9479/icloud). The walkthrough below shows where to find a Google Calendar's private .ics link, and how to add it to Obsidian, but any URL will work just as well.

!!! tip "Power Up with Categories"
    ICS calendars also support [Advanced Categories](../events/categories.md). If an external event has a title like `Project - Review`, the plugin will automatically apply the "Project" color and category styling.

--- 

### Refreshed
Calendars are re-fetched automatically from their source at most every five minutes. 

### Command Pallette
Use `Full Calendar: Revalidate remote calendars` to manually revalidate remote calendars directly.

![Google Calendar private ICS setup walkthrough in plugin settings](../../assets/calendars/sync-setup-ics.gif)

Note: `webcal://` links are automatically converted to `https://` when added.

---

## Read-only and timezone behavior

- ICS calendars are read-only inside Obsidian.
- **Video Conferencing & Links**: Extracts meeting URLs from RFC 7986 `CONFERENCE` attributes or Microsoft Teams specific fields, merging them directly into the parsed location or description. Injected URLs and description links are fully clickable inside the [Event Details modal](../events/manage.md#video-conference--linkification-support). For details, see [Video Conference & Linkification Support](../events/manage.md#video-conference--linkification-support).
- Events are parsed with their source timezone (including TZID/UTC) and converted to your Display Timezone for viewing.
- Cancellations/exceptions present in the feed are respected.


## Troubleshooting

See: [Troubleshooting: Remote calendars not updating](../guides/troubleshooting.md#why-are-my-remote-calendars-not-updating)
