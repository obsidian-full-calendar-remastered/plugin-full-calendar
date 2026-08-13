# Journals Calendar

Use a **Journals** calendar to store Full Calendar events inside entries managed by the [Obsidian Journals community plugin](https://github.com/srg-kostyrko/obsidian-journal). Each calendar connects to one Journals **Day** journal and writes events beneath a configured heading.

## Requirements

- Install and enable the Obsidian Journals community plugin.
- Configure at least one **Day** journal in Journals.
- Obsidian's core Daily Notes plugin is not required when you use this calendar source.

## Add a Journals calendar

1. Open **Full Calendar settings**.
2. Open **Manage Calendars**.
3. Select **Journals** as the calendar type and click the add button.
4. Select the **Day journal** Full Calendar should use.
5. Choose or enter the **Heading** where events should be written.
6. Select the timed-event **Format**, then add the calendar.

When the selected journal's templates contain headings, Full Calendar offers them in the Heading dropdown. You can also enter a heading manually and change it later from the configured calendar row.

## How entries and events are stored

Full Calendar asks the selected Day journal for the entry that matches the event date:

- If the entry already exists, Full Calendar preserves its contents and adds only the event.
- If the entry does not exist, Journals creates it using that journal's configured folder, filename and date formatting, templates, and frontmatter or journal metadata.

After resolving the entry, Full Calendar uses its normal date-note event format and heading behavior. For example, when the configured heading is `Schedule`, events are written beneath:

```markdown
## Schedule
```

If that heading is missing, Full Calendar appends it to the entry before adding the event.

## Multiple Journals calendars

You can add multiple Journals calendars and connect each one to a different Day journal. For example:

- `Journals: Music`
- `Journals: PHD`

Each calendar keeps its own selected journal, heading, color, and other calendar settings.

## Journals or Daily Note?

| Calendar source | Date-note provider | Instance limit |
| --- | --- | --- |
| **Daily Note** | Obsidian Daily Notes or Periodic Notes | One Daily Note calendar |
| **Journals** | A selected Journals Day journal | Multiple Journals calendars |

The two source types may coexist. Journals calendars do not count against the one-Daily-Note-calendar limit.

## Limitations and troubleshooting

- Journals must remain installed and enabled.
- Only Journals **Day** journals can be selected.
- If the selected Day journal is renamed or deleted, remove or reconfigure the affected Full Calendar source.
- Recurring events and multi-day single events are not supported by date-note calendars; use a [Full Note calendar](local.md) for those events.
- Duplicate event titles on the same date are not supported within one Journals calendar.

[Daily Note Calendar](dailynote.md) · [Working with Events](../events/index.md) · [Troubleshooting](../guides/troubleshooting.md)
