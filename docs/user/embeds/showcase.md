# Showcase & Blueprints

Explore pre-configured dashboard setups and copy-paste templates to build beautiful, functional interfaces inside your daily logs, project homepages, or central command notes.

!!! info "Get Showcased"
    submit your own in [Discussions](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/discussions/new?category=show-and-tell) and get it showcased here! Do not forget to include screenshot as well as the code block, and any other plugins or setups essential for reproducing your dashboard.

=== "Daily Planner Companion"
    !!! info "A: Daily Planner Setup"
        Designed for daily templates. It locks to the note's date (`defaultDate: auto`) and renders your day grid next to the unscheduled task backlog panel.

        ````yaml
        ```fc-calendar
        defaultDate: auto
        calendars:
          - "Personal Schedule"
          - "Work Tasks"
        height: 480px
        layout:
          orientation: horizontal
          views:
            # Column 1: Daily schedule (65% width)
            - type: calendar
              view: timeGridDay
              width: 65%
              header: false
              weather: true

            # Column 2: Unscheduled Task Backlog (35% width)
            - type: backlog
              width: 35%
              showSearch: true
              showFooter: true
        ```
        ````

=== "Homepage Command Center"
    !!! info "B: Homepage Center Layout"
        Displays a monthly grid and a scrollable milestone agenda list side-by-side with custom colors.

        ````yaml
        ```fc-calendar
        calendars:
          - "Personal Calendar"
          - "Work Events"
        tagFilter: "#milestone"
        height: 520px
        layout:
          orientation: horizontal
          views:
            # Column 1: Mini Month Overview grid (60% width)
            - type: calendar
              view: dayGridMonth
              width: 60%
              header: true
              zoomLevel: 1

            # Column 2: Upcoming Milestones Agenda list (40% width)
            - type: calendar
              view: listWeek
              width: 40%
              header: false
              styles:
                --fc-event-bg-color: "rgba(123, 44, 191, 0.2)"
                --fc-event-border-color: "#7b2cbf"
                --fc-event-text-color: "#ffffff"
        ```
        ````

=== "Project Sprint Tracker"
    !!! info "C: Project Sprint List"
        Pasted inside project folder hubs. Limits sources to folders, filters by sprint path, and auto-collapses height.

        ````yaml
        ```fc-calendar
        view: listWeek
        height: fit
        pathFilter: "Projects/Sprint-Alpha/"
        sortBy: "priority"
        sortOrder: "desc"
        styles:
          fontSize: "12px"
          borderRadius: "6px"
        ```
        ````

=== "Sidebar Weather companion"
    !!! info "D: Sidebar Strip"
        Vertical weather forecast widget displaying condition emojis and temperature spreads. Designed for right/left sidebars.

        ````yaml
        ```fc-calendar
        type: weather
        variant: minimal
        orientation: vertical
        width: 100%
        height: 380px
        defaultDate: today
        ```
        ````
---

[Overview](index.md) · [Deep Dive Parameter Specs](deep_dive.md) · [Dashboard Showcase](showcase.md) · [Widget Architecture](../../architecture/views/embedded_widgets.md)