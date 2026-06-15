# Holidays calendar

Display national and regional public holidays as read-only, all-day events — no network required. Powered by the [date-holidays](https://github.com/commenthol/date-holidays) library which bundles [CLDR](https://cldr.unicode.org/)-based holiday definitions for [100+ countries](https://github.com/commenthol/date-holidays/blob/master/docs/Holidays.md).

!!! tip "Offline-first"
    All holiday data is bundled inside the plugin. Holidays appear instantly on first load and work indefinitely without internet.

---

## Adding a Holidays calendar

Settings → Calendars → **Add calendar** → **Holidays**.

| Field | Required | Example | Notes |
|---|---|---|---|
| **Calendar Name** | — | `UK Holidays` | Display label in the calendar list |
| **Country** | ✓ | `GB`, `US`, `DE` | [ISO 3166-1 alpha-2](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2) code. [Supported list →](https://github.com/commenthol/date-holidays/blob/master/docs/Holidays.md) |
| **State / Province** | — | `ca`, `by`, `on` | [ISO 3166-2](https://en.wikipedia.org/wiki/ISO_3166-2) sub-division code. Leave blank for national holidays only. |
| **Region** | — | `no` | City/district code for hyper-local calendars (e.g. New Orleans `no` inside Louisiana `la`). [Supported list →](https://github.com/commenthol/date-holidays/blob/master/docs/Holidays.md) |
| **Holiday Types** | — | *Public only* | See [Holiday types](#holiday-types) below |
| **Display Style** | — | *Background highlight* | See [Display styles](#display-styles) below |

---

## Holiday types

Tiers are cumulative — each level adds to the one above.

| Tier | Includes |
|---|---|
| Public holidays only | Official public holidays |
| Public + Bank | + Closures for banking/financial institutions |
| Public + Bank + Observance | + Observance days (not necessarily days off) |
| All except optional | + School holidays |
| All types | + Optional/regional observances |

[date-holidays type specification →](https://github.com/commenthol/date-holidays/blob/master/docs/specification.md#types-of-holidays)

---

## Display styles

Controls the [FullCalendar display mode](https://fullcalendar.io/docs/event_render_hooks) applied to every holiday event in this calendar.

| Style | Use case |
|---|---|
| **Solid block** | Holidays appear like regular all-day events |
| **Background highlight** | Subtle tinted band across the day column — good for large calendars |
| **Inverse background** | Inverted color band — high contrast for holiday awareness |
| **Auto** | FullCalendar decides based on context |
| **Hidden** | Calendar is kept but events are not rendered |

---

## Behavior

- **Read-only.** Holidays cannot be created, edited, or deleted from the calendar.
- **Timezone.** Events are all-day (`YYYY-MM-DD`) with no time component. The plugin's [display timezone](../settings/index.md) applies globally — no per-calendar timezone override exists or is needed.
- **Cache.** Results are cached per `(country × state × region × holiday types × display style × year)` in `localStorage` for 30 days. Changing any setting invalidates the cache automatically on next load.
- **Range.** On initial populate, the current year ± 1 are pre-loaded. Additional years are loaded on demand as the user navigates.

## Troubleshooting

See the **[Central Troubleshooting Guide](../guides/troubleshooting.md#holidays-calendar)** for help with missing holidays, state/region codes, or local variations.
