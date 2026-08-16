<div align="right">
  <img src="https://img.shields.io/github/downloads/obsidian-full-calendar-remastered/plugin-full-calendar/total?label=Downloads" alt="Downloads" />
  <a href="#contributors-"><img src="https://img.shields.io/badge/all_contributors-12-orange.svg?style=flat-square" alt="All Contributors" /></a>
  <a href="https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/"><img src="https://img.shields.io/badge/Version-v_0.13.5-blue" alt="Version" /></a>
</div>


<!-- ![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22obsidian-full-calendar%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json) -->

# Full Calendar (Remastered) Plugin

<img src="docs/assets/branding/v0.13.1-hero-section.gif" alt="Prisma Calendar Preview" width="100%">

Keep your calendar in your vault! This plugin integrates the [FullCalendar](https://github.com/fullcalendar/fullcalendar) library into your Obsidian Vault so that you can keep your ever-changing daily schedule and special events and plans alongside your tasks and notes, and link freely between all of them.

> Checkout the [Documentation](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/); [Development Timeline](https://github.com/users/YouFoundJK/projects/2) for the development timeline.

Full Calendar supports multiple calendar sources:

- [**Full Note**](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/local/): Events from frontmatter on individual notes
- [**Daily Note**](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/dailynote/): Events from event lists in daily notes
- [**Journals**](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/journals/): Events from selected Obsidian Journals Day journals
- [**ICS**](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/ics/): Read-only remote or local ICS files
- [**CalDAV**](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/caldav/): Two-way sync with CalDAV servers
- [**CalDAV Tasks**](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/caldav-tasks/): Two-way VTODO task/reminder sync, tested with iCloud Reminders
- [**Google Calendar**](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/gcal/): Two-way sync with Google Calendar

Integrations include

- [**Tasks Plugin**](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/tasks-plugin-integration/): Sync with the Obsidian Tasks plugin
- [**TaskNote Integration**](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/tasknotes/): Sync with TaskNote Plugin
- [**ActivityWatcher Integration**](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/activitywatch/): Integrates into [ActivityWatcher](https://activitywatch.net/).

![Sample Calendar](https://raw.githubusercontent.com/obsidian-full-calendar-remastered/plugin-full-calendar/main/docs/assets/guides/sample-calendar.png)


> This is the remastered edition of original [Full Calender plugin](https://github.com/obsidian-community/obsidian-full-calendar) by [Davis Haupt](https://davi.sh/), with the [core additions](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/whats_new/).

The FullCalendar Standard library is released under the [MIT License](https://opensource.org/licenses/MIT). FullCalendar Premium, including [Premium Plugins](https://fullcalendar.io/docs/plugin-index) and the `fullcalendar-scheduler` bundle, are utilized under the [GPLv3 license](http://www.gnu.org/licenses/gpl-3.0.en.html) as part of FullCalendar's [GPLv3 open-source project](https://fullcalendar.io/license) provision. It's an awesome piece of work, and it would not have been possible to make something like this plugin so easily without it.

## Installation

1. Add to your obsidian vault from the [Obsidian Plugin Store](https://community.obsidian.md/plugins/full-calendar-remastered).
2. Obsidian community guidelines block any on demand caching of external libraries and require all of these to be bundled into a single file. For this reason our `main.js` is 7.2 MB (380 ms loadtime). If you prefer a leaner on ~1.4MB (160ms loadtime), build it yourself via 
```bash
git clone https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar.git
pnpm run prod:lead
```


### Your turn to support OpenSource
> FCR is developed at a [high velocity](https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/SustainabilityEthics/#the-economic-reality-of-maintenance) using AI-augmented engineering. To keep up this pace (and avoid reverting to slow, manual coding), the project relies on a small community subsidy to cover AI tools (25 USD / month). 

If this project has helped you consider supporting:

<div align="center">
  <br>
  <a href="https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/SustainabilityEthics/">
    <img src="https://img.shields.io/badge/💖_Sponsor_FCR_%26_View_Transparency_Math-3a7be4?style=for-the-badge" alt="Sponsor FCR" />
  </a>
  <br><br>
</div>



## Contributors ✨

Thanks goes to these wonderful people ([✨](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="8.33%"><a href="https://discord.gg/QFp6B74ASr?%20%3C--%20Blobbo%20and%20Chrono"><img src="https://avatars.githubusercontent.com/u/19922066?v=4?s=40" width="40px;" alt="Hadrian Tang"/><br /><sub><b>Hadrian Tang</b></sub></a><br /><a href="https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/commits?author=Happypig375" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="8.33%"><a href="https://github.com/kapej42"><img src="https://avatars.githubusercontent.com/u/26510924?v=4?s=40" width="40px;" alt="Klaas-Pieter (K.P.) Majoor"/><br /><sub><b>Klaas-Pieter (K.P.) Majoor</b></sub></a><br /><a href="https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/commits?author=kapej42" title="Code">💻</a> <a href="#content-kapej42" title="Content">🖋</a></td>
      <td align="center" valign="top" width="8.33%"><a href="https://mivanit.github.io/"><img src="https://avatars.githubusercontent.com/u/19347900?v=4?s=40" width="40px;" alt="mivanit"/><br /><sub><b>mivanit</b></sub></a><br /><a href="https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/commits?author=mivanit" title="Code">💻</a></td>
      <td align="center" valign="top" width="8.33%"><a href="https://drostan.org/"><img src="https://avatars.githubusercontent.com/u/223935?v=4?s=40" width="40px;" alt="Rolf Kleef"/><br /><sub><b>Rolf Kleef</b></sub></a><br /><a href="https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/commits?author=rolfkleef" title="Code">💻</a> <a href="https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/commits?author=rolfkleef" title="Documentation">📖</a> <a href="https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/commits?author=rolfkleef" title="Tests">⚠️</a></td>
      <td align="center" valign="top" width="8.33%"><a href="https://github.com/oskardotglobal"><img src="https://avatars.githubusercontent.com/u/52569953?v=4?s=40" width="40px;" alt="Oskar Manhart"/><br /><sub><b>Oskar Manhart</b></sub></a><br /><a href="https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/commits?author=oskardotglobal" title="Code">💻</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!
