# Remote / Local calendars in .ics format

Add any calendar in `.ics` format to Obsidian — whether it is a **local `.ics` file stored in your vault** (e.g. `Calendars/my-schedule.ics`) or a **remote URL**.

This includes public calendars like [this one of US holidays](https://www.officeholidays.com/subscribe/usa), but also includes [private Google Calendars](https://support.google.com/calendar/answer/37648?hl=en#zippy=%2Csync-your-google-calendar-view-edit%2Cget-your-calendar-view-only%2Csecret-address) and [public Apple Calendars](https://support.apple.com/guide/icloud/share-a-calendar-mm6b1a9479/icloud). The walkthrough below shows where to find a Google Calendar's private .ics link, and how to add it to Obsidian, but any URL or local path will work just as well.

!!! info "Local .ics Files"
    To use a local file, simply enter its relative path from the vault root (for example: `Calendars/export.ics`). The plugin reads it directly from your vault without needing external network access.

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
- Events with explicit timezones (including `TZID` parameters or UTC `Z` indicators) are parsed in their source timezone and converted to your Display Timezone for viewing.
- **Floating Event Time Preservation**: Events without a `TZID` parameter and without a UTC indicator (`Z`) are treated as floating event times. Their exact nominal hour is preserved without shifting relative to system or display timezone conversions.
- **Display Mode Property (`X-OFC-DISPLAY`)**: Honors the `X-OFC-DISPLAY` property on `VEVENT` components, allowing external calendar feeds to define custom FullCalendar display styles (`background`, `inverse-background`, `list-item`, `block`).
- **Multi-Date Cancellations (`EXDATE`)**: Recurring events and tasks parse and respect all comma-separated dates across multiple `EXDATE` properties, ensuring multi-date cancellations from Outlook, WebCal, and external feeds are cleanly excluded.


## Troubleshooting

See: [Troubleshooting: Remote calendars not updating](../guides/troubleshooting.md#why-are-my-remote-calendars-not-updating)
