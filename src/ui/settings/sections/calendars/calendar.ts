/**
 * @file calendar.ts
 * @brief A wrapper for initializing and rendering the FullCalendar.js library.
 *
 * @description
 * This file provides the `renderCalendar` function, which is a factory for
 * creating a `Calendar` instance from the `@fullcalendar/core` library. It
 * encapsulates all the configuration and boilerplate needed to set up the
 * calendar, including plugins, views, toolbar settings, and interaction
 * callbacks.
 *
 * @exports renderCalendar
 *
 * @license See LICENSE.md
 */

import type {
  Calendar,
  EventApi,
  EventClickArg,
  EventHoveringArg,
  EventSourceInput,
  LocaleSingularArg
} from '@fullcalendar/core';

import { Menu, activeDocument, Platform, type App } from 'obsidian';
import type { PluginDef } from '@fullcalendar/core';
import type { RecurringInstanceState } from '../../../../providers/Provider';
import { createDateNavigation } from '../../../../features/navigation/DateNavigation';
import {
  patchRRuleTimezoneExpansion,
  type RRulePluginLike
} from '../../../../features/timezone/Timezone';
import { PluginState } from '../../../../core/PluginState';
import {
  fetchWeatherForecast,
  type WeatherInfo,
  formatTempRange
} from '../../../../features/weather/Weather';
import { WeatherDetailModal } from '../../../../features/weather/WeatherDetailModal';
import { openDailyNoteForDate } from '../../../../features/daily-notes/openDailyNote';
import { i18n } from '../../../../features/i18n/i18n';

export interface ExtraRenderProps {
  eventClick?: (info: EventClickArg) => void;
  customButtons?: {
    [key: string]: {
      text: string;
      click: (ev?: MouseEvent) => void | Promise<void>;
    };
  };

  select?: (startDate: Date, endDate: Date, allDay: boolean, viewType: string) => Promise<void>;
  modifyEvent?: (event: EventApi, oldEvent: EventApi, newResource?: string) => Promise<boolean>;
  eventMouseEnter?: (info: EventHoveringArg) => void;
  firstDay?: number;
  initialView?: { desktop: string; mobile: string };
  timeFormat24h?: boolean;
  openContextMenuForEvent?: (event: EventApi, mouseEvent: MouseEvent) => Promise<void>;
  toggleTask?: (event: EventApi, isComplete: boolean) => Promise<boolean>;
  getRecurringInstanceState?: (event: EventApi) => Promise<RecurringInstanceState | null>;
  dateRightClick?: (date: Date, mouseEvent: MouseEvent) => void;
  viewRightClick?: (mouseEvent: MouseEvent, calendar: Calendar) => void;
  eventDragStop?: (event: EventApi, mouseEvent: MouseEvent) => void;
  forceNarrow?: boolean;
  resources?: { id: string; title: string; eventColor?: string }[];
  onViewChange?: () => void; // Add view change callback
  businessHours?: boolean | object; // Support for business hours
  drop?: (taskId: string, date: Date, allDay: boolean) => Promise<void>; // Drag-and-drop from backlog
  timeZone?: string;

  // New granular view configuration properties
  slotMinTime?: string;
  slotMaxTime?: string;
  slotDuration?: string;
  slotLabelInterval?: string;
  allDaySlot?: boolean;
  timeGridDayHeaderFormat?: string;
  weekends?: boolean;
  hiddenDays?: number[];
  dayMaxEvents?: number | boolean;
  highlightCurrentOrNextEvent?: boolean;
  onSearchQueryChange?: (query: string) => void;
  initialSearchQuery?: string;
  onEventsSet?: () => void;
  /**
   * Called by the `eventsSet` FullCalendar hook whenever the rendered event
   * count reaches zero on a time-grid view.  Receives the live Calendar
   * instance so the caller can inspect `cal.getEvents()` and `cal.view.type`.
   * Used by the blank-view diagnostic to emit console warnings and Notices.
   */
  onBlankView?: (cal: Calendar) => void;
  headerToolbar?: false | object;
  footerToolbar?: false | object;
  height?: 'auto' | number | 'parent';
  weatherHide?: boolean;
}

type TimeGridDayHeaderFormat =
  'ddmm-day' | 'mmdd-day' | 'day-ddmm' | 'day-mmdd' | 'ddmmyyyy-day' | 'mmddyyyy-day';

export async function renderCalendar(
  containerEl: HTMLElement,
  eventSources: EventSourceInput[],
  settings?: ExtraRenderProps & { enableAdvancedCategorization?: boolean }
): Promise<Calendar> {
  const interactionDocument = activeDocument ?? containerEl.ownerDocument;
  const mirrorParent = (activeDocument ?? containerEl.ownerDocument).body;

  // Map plugin locale codes to FullCalendar locale identifiers.
  // 'en' needs no locale override (FullCalendar defaults to English).
  // 'zh' maps to 'zh-cn' because FullCalendar ships no bare 'zh' locale.
  const pluginLang = i18n.language ?? 'en';
  let fcLocalePromise: Promise<{ default: LocaleSingularArg } | null>;
  switch (pluginLang) {
    case 'de':
      fcLocalePromise = import('@fullcalendar/core/locales/de.js');
      break;
    case 'fr':
      fcLocalePromise = import('@fullcalendar/core/locales/fr.js');
      break;
    case 'it':
      fcLocalePromise = import('@fullcalendar/core/locales/it.js');
      break;
    case 'es':
      fcLocalePromise = import('@fullcalendar/core/locales/es.js');
      break;
    case 'zh':
      fcLocalePromise = import('@fullcalendar/core/locales/zh-cn.js');
      break;
    default:
      fcLocalePromise = Promise.resolve(null);
  }

  const [core, list, rrule, daygrid, timegrid, interaction, luxon, fcLocale] = await Promise.all([
    import('@fullcalendar/core'),
    import('@fullcalendar/list'),
    import('@fullcalendar/rrule'),
    import('@fullcalendar/daygrid'),
    import('@fullcalendar/timegrid'),
    import('@fullcalendar/interaction'),
    import('@fullcalendar/luxon3'),
    fcLocalePromise
  ]);

  // Optionally load scheduler plugin only when needed
  const showResourceViews = !!settings?.enableAdvancedCategorization;
  const resourceTimeline = showResourceViews
    ? await import('@fullcalendar/resource-timeline')
    : null;
  const MOBILE_BREAKPOINT = 500;
  const COMPACT_DESKTOP_BREAKPOINT = 910;
  const SWIPE_MIN_DISTANCE = 60;
  const SWIPE_DIRECTION_RATIO = 1.2;

  const getResponsiveWidth = (): number => {
    const measuredWidth = containerEl.getBoundingClientRect().width || containerEl.clientWidth;
    return measuredWidth > 0 ? measuredWidth : window.innerWidth;
  };

  const isMobile = Platform.isPhone || getResponsiveWidth() < MOBILE_BREAKPOINT;
  const isNarrow = settings?.forceNarrow || isMobile;

  // Apply RRULE monkeypatch on every render to capture the latest settings.timeZone.
  // We apply the extracted logic from Timezone.ts to safely handle DST offsets.
  {
    const rrulePlugin = ((rrule as unknown as { default?: RRulePluginLike }).default ||
      rrule) as unknown as RRulePluginLike;

    patchRRuleTimezoneExpansion(rrulePlugin, settings?.timeZone);
  }

  const {
    eventClick,
    select,
    modifyEvent,
    eventMouseEnter,
    openContextMenuForEvent,
    toggleTask,
    getRecurringInstanceState,
    dateRightClick,
    viewRightClick,
    eventDragStop,
    customButtons,
    resources,
    onViewChange,
    businessHours,
    drop,
    onSearchQueryChange,
    initialSearchQuery,
    onEventsSet,
    onBlankView
  } = settings || {};

  // Wrap eventClick to ignore shadow events
  const wrappedEventClick =
    eventClick &&
    ((info: EventClickArg) => {
      // Ignore clicks on shadow events
      if (info.event.extendedProps.isShadow) {
        return;
      }
      return eventClick(info);
    });

  const parentEl = containerEl.parentElement;
  let agendaEl: HTMLElement | null = null;
  let cal: Calendar | null = null;
  let blankViewTimer: number | null = null;

  const getOrCreateAgendaEl = (): HTMLElement | null => {
    if (!isNarrow) return null;
    if (agendaEl) return agendaEl;
    if (!parentEl) return null;
    agendaEl = parentEl.querySelector<HTMLElement>('.ofc-mobile-agenda');
    if (!agendaEl) {
      agendaEl = parentEl.createDiv({ cls: 'ofc-mobile-agenda' });
    }
    return agendaEl;
  };

  const hideMobileAgenda = () => {
    const el = getOrCreateAgendaEl();
    if (el) {
      el.setCssProps({ display: 'none' });
    }
    containerEl.setCssProps({ height: '100%' });
    if (cal) {
      cal.updateSize();
    }
  };

  const updateMobileAgenda = (date: Date) => {
    const el = getOrCreateAgendaEl();
    if (!el || !cal) return;

    el.setCssProps({ display: 'flex' });
    containerEl.setCssProps({ height: '55%' });
    cal.updateSize();

    el.empty();

    const headerEl = el.createDiv({ cls: 'ofc-mobile-agenda-header' });
    const formattedDate = new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    }).format(date);
    headerEl.createEl('h4', { text: formattedDate });

    const listEl = el.createDiv({ cls: 'ofc-mobile-agenda-list' });

    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

    const dayEvents = cal.getEvents().filter((event: EventApi) => {
      if (event.extendedProps?.isShadow) return false;
      const eventStart = event.start?.getTime() || 0;
      const eventEnd = event.end?.getTime() || eventStart;
      return eventStart < endOfDay && eventEnd > startOfDay;
    });

    if (dayEvents.length === 0) {
      listEl.createDiv({ cls: 'ofc-mobile-agenda-empty', text: 'No events' });
      return;
    }

    dayEvents.sort((a: EventApi, b: EventApi) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      const aStart = a.start?.getTime() || 0;
      const bStart = b.start?.getTime() || 0;
      return aStart - bStart;
    });

    dayEvents.forEach((event: EventApi) => {
      const itemEl = listEl.createDiv({ cls: 'ofc-mobile-agenda-item' });

      const dotEl = itemEl.createDiv({ cls: 'ofc-mobile-agenda-item-dot' });
      const eventColor = event.backgroundColor || event.borderColor || 'var(--interactive-accent)';
      dotEl.setCssProps({ backgroundColor: eventColor });

      const timeEl = itemEl.createDiv({ cls: 'ofc-mobile-agenda-item-time' });
      if (event.allDay) {
        timeEl.setText('All day');
      } else if (event.start) {
        const startStr = new Intl.DateTimeFormat(undefined, {
          hour: 'numeric',
          minute: '2-digit',
          hour12: !settings?.timeFormat24h
        }).format(event.start);

        let endStr = '';
        if (event.end) {
          endStr = ` - ${new Intl.DateTimeFormat(undefined, {
            hour: 'numeric',
            minute: '2-digit',
            hour12: !settings?.timeFormat24h
          }).format(event.end)}`;
        }
        timeEl.setText(`${startStr}${endStr}`);
      }

      itemEl.createDiv({ cls: 'ofc-mobile-agenda-item-title', text: event.title });

      itemEl.addEventListener('click', ev => {
        if (wrappedEventClick && cal) {
          wrappedEventClick({
            event,
            el: itemEl,
            jsEvent: ev,
            view: cal.view
          } as unknown as EventClickArg);
        }
      });
    });
  };

  const modifyEventCallback =
    modifyEvent &&
    (({
      event,
      oldEvent,
      revert,
      newResource
    }: {
      event: EventApi;
      oldEvent: EventApi;
      revert: () => void;
      newResource?: { id: string };
    }): void => {
      void (async () => {
        // Extract the string ID from the newResource object
        const success = await modifyEvent(event, oldEvent, newResource?.id);
        if (!success) {
          revert();
        }
      })();
    });

  type ToolbarMode = 'narrow' | 'compact-desktop' | 'desktop';
  type ToolbarLayout = {
    mode: ToolbarMode;
    headerToolbar: { left: string; center: string; right: string } | false;
    footerToolbar: { left: string; right: string } | false;
  };

  const getToolbarLayout = (windowWidth: number): ToolbarLayout => {
    const narrow = !!settings?.forceNarrow || Platform.isPhone || windowWidth < MOBILE_BREAKPOINT;

    const hasButton = (name: string): boolean => {
      if (['prev', 'next', 'prevYear', 'nextYear', 'today', 'title'].includes(name)) {
        return true;
      }
      if (['views', 'search', 'navigate', 'more'].includes(name)) {
        return true;
      }
      if (name === 'timeline') {
        return showResourceViews;
      }
      return !!(customButtons && customButtons[name]);
    };

    const filterToolbarString = (str: string): string => {
      return str
        .split(' ')
        .map(group => {
          return group
            .split(',')
            .filter(btn => hasButton(btn))
            .join(',');
        })
        .filter(group => group.length > 0)
        .join(' ');
    };

    if (narrow) {
      return {
        mode: 'narrow',
        headerToolbar: {
          left: 'title',
          center: '',
          right: ''
        },
        footerToolbar: {
          left: filterToolbarString('prev,today,next search'),
          right: filterToolbarString('more')
        }
      };
    }

    if (windowWidth < COMPACT_DESKTOP_BREAKPOINT) {
      return {
        mode: 'compact-desktop',
        headerToolbar: {
          left: filterToolbarString('prev,today,next search'),
          center: 'title',
          right: filterToolbarString('analysis more')
        },
        footerToolbar: false
      };
    }

    const fullDesktopViewGroup = ['views', showResourceViews ? 'timeline' : null]
      .filter(Boolean)
      .join(',');

    return {
      mode: 'desktop',
      headerToolbar: {
        left: filterToolbarString('workspace prev,today,navigate,next search'),
        center: 'title',
        right: filterToolbarString(`analysis ${fullDesktopViewGroup}`)
      },
      footerToolbar: false
    };
  };

  const initialToolbarLayout = getToolbarLayout(getResponsiveWidth());
  let currentToolbarMode: ToolbarMode = initialToolbarLayout.mode;

  const formatTimeGridDayHeader = (date: Date): string => {
    const format =
      (settings?.timeGridDayHeaderFormat as TimeGridDayHeaderFormat | undefined) || 'day-mmdd';
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const dd = String(day).padStart(2, '0');
    const mm = String(month).padStart(2, '0');
    const yyyy = String(date.getFullYear());

    switch (format) {
      case 'ddmm-day':
        return `${day}/${month} ${weekday}`;
      case 'mmdd-day':
        return `${month}/${day} ${weekday}`;
      case 'day-ddmm':
        return `${weekday} ${day}/${month}`;
      case 'ddmmyyyy-day':
        return `${dd}/${mm}/${yyyy} ${weekday}`;
      case 'mmddyyyy-day':
        return `${mm}/${dd}/${yyyy} ${weekday}`;
      case 'day-mmdd':
      default:
        return `${weekday} ${month}/${day}`;
    }
  };

  type ViewSpec = {
    type: string;
    duration?: { days?: number; weeks?: number };
    buttonText: string;
    slotMinWidth?: number;
    dayHeaderContent?: (arg: { date: Date }) => string;
  };
  const views: Record<string, ViewSpec> = {
    timeGridWeek: {
      type: 'timeGrid',
      duration: { weeks: 1 },
      buttonText: 'week',
      dayHeaderContent: arg => formatTimeGridDayHeader(arg.date)
    },
    timeGridDay: {
      type: 'timeGrid',
      duration: { days: 1 },
      buttonText: isNarrow ? '1' : 'day',
      dayHeaderContent: arg => formatTimeGridDayHeader(arg.date)
    },
    timeGrid3Days: {
      type: 'timeGrid',
      duration: { days: 3 },
      buttonText: '3',
      dayHeaderContent: arg => formatTimeGridDayHeader(arg.date)
    }
  };
  if (showResourceViews) {
    views.resourceTimelineDay = {
      type: 'resourceTimeline',
      duration: { days: 1 },
      buttonText: 'Timeline day'
    };
    views.resourceTimelineWeek = {
      type: 'resourceTimeline',
      duration: { weeks: 1 },
      buttonText: 'Timeline week',
      slotMinWidth: 100
    };
  }

  const customButtonConfig: Record<string, { text: string; click: (ev: MouseEvent) => void }> = {
    ...customButtons
  };

  let dateNavigation: ReturnType<typeof createDateNavigation> | null = null;

  const addViewOptionsToMenu = (menu: Menu, mode: ToolbarMode): void => {
    const viewOptions =
      mode === 'narrow'
        ? {
            dayGridMonth: 'Month',
            timeGrid3Days: '3 Days',
            timeGridDay: 'Day',
            listWeek: 'List'
          }
        : {
            dayGridMonth: 'Month',
            timeGridWeek: 'Week',
            timeGridDay: 'Day',
            listWeek: 'List'
          };

    for (const [viewName, viewLabel] of Object.entries(viewOptions) as [string, string][]) {
      menu.addItem(item =>
        item.setTitle(viewLabel).onClick(() => {
          cal?.changeView(viewName);
        })
      );
    }
  };

  // Always add the "Views" dropdown
  customButtonConfig.views = {
    text: 'View ▾',
    click: (ev: MouseEvent) => {
      const menu = new Menu();
      addViewOptionsToMenu(menu, currentToolbarMode);
      menu.showAtMouseEvent(ev);
    }
  };

  customButtonConfig.search = {
    text: '⌕',
    click: () => {
      const input = containerEl.querySelector<HTMLInputElement>('.ofc-toolbar-search-input');
      const wrap = containerEl.querySelector<HTMLElement>('.ofc-toolbar-search-input-wrap');
      if (!input || !wrap) {
        return;
      }
      wrap.setCssProps({ width: '180px' });
      input.focus();
      input.select();
    }
  };

  // Add the "Navigate" dropdown - will be configured after calendar creation
  customButtonConfig.navigate = {
    text: '▾',
    click: (ev: MouseEvent) => {
      dateNavigation?.showNavigationMenu(ev);
    }
  };

  // Keep compact layouts uncluttered by routing secondary actions into a single menu.
  customButtonConfig.more = {
    text: 'More ▾',
    click: (ev: MouseEvent) => {
      const menu = new Menu();

      if (customButtons?.workspace) {
        menu.addItem(item => {
          item.setTitle('Workspace').onClick(() => {
            void customButtons.workspace.click(ev);
          });
        });
      }

      menu.addItem(item => {
        item.setTitle('Go to date').onClick(() => {
          dateNavigation?.showNavigationMenu(ev);
        });
      });

      if (currentToolbarMode === 'compact-desktop' || currentToolbarMode === 'narrow') {
        menu.addSeparator();
        addViewOptionsToMenu(menu, currentToolbarMode);
      }

      if (showResourceViews) {
        menu.addSeparator();
        menu.addItem(item =>
          item.setTitle('Timeline week').onClick(() => {
            cal?.changeView('resourceTimelineWeek');
          })
        );
        menu.addItem(item =>
          item.setTitle('Timeline day').onClick(() => {
            cal?.changeView('resourceTimelineDay');
          })
        );
      }

      menu.showAtMouseEvent(ev);
    }
  };

  // Conditionally add the "Timeline" dropdown
  if (showResourceViews) {
    customButtonConfig.timeline = {
      text: 'Timeline ▾',
      click: (ev: MouseEvent) => {
        const menu = new Menu();
        menu.addItem(item =>
          item.setTitle('Timeline week').onClick(() => {
            cal?.changeView('resourceTimelineWeek');
          })
        );
        menu.addItem(item =>
          item.setTitle('Timeline day').onClick(() => {
            cal?.changeView('resourceTimelineDay');
          })
        );
        menu.showAtMouseEvent(ev);
      }
    };
  }

  // FullCalendar Premium open-source license key (GPLv3 projects)
  // See: https://fullcalendar.io/license for details
  // Narrow dynamic imports to expected shapes without pervasive any usage.
  const CalendarCtor = (core as { Calendar: typeof Calendar }).Calendar;
  const dayGridPlugin = daygrid.default;
  const timeGridPlugin = timegrid.default;
  const listPlugin = list.default;
  const rrulePlugin = rrule.default;
  const interactionPlugin = (interaction as { default: PluginDef }).default;
  const luxonPlugin = (luxon as { default: PluginDef }).default;
  const resourceTimelinePlugin = resourceTimeline ? resourceTimeline.default : null;

  let currentUpcomingEventIds = new Set<string>();

  const isEditableTarget = (target: EventTarget | null): boolean => {
    const element = target instanceof Node && target.instanceOf(Element) ? target : null;
    if (!element) {
      return false;
    }

    return !!element.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], .cm-content, .cm-editor, .markdown-source-view, .markdown-preview-view'
    );
  };

  const toggleEventHighlightById = (eventId: string, add: boolean) => {
    const escapedId = CSS.escape(eventId);
    const elements = containerEl.querySelectorAll<HTMLElement>(`[data-event-id="${escapedId}"]`);
    elements.forEach(el => {
      el.toggleClass('ofc-event-current-or-next', add);

      // Month/Week/Timeline views often clip event glow at harness level,
      // so toggle a class on the nearest harness wrapper too.
      const harness = el.closest<HTMLElement>(
        '.fc-timegrid-event-harness, .fc-daygrid-event-harness, .fc-timeline-event-harness'
      );
      harness?.toggleClass('ofc-event-current-or-next-harness', add);
    });
  };

  const findCurrentOrNextEventIds = (events: EventApi[]): Set<string> => {
    const result = new Set<string>();
    if (!settings?.highlightCurrentOrNextEvent) {
      return result;
    }

    const nowMs = Date.now();
    let currentCandidate: EventApi | null = null;
    let currentCandidateEnd = Number.POSITIVE_INFINITY;
    let nextCandidate: EventApi | null = null;
    let nextCandidateStart = Number.POSITIVE_INFINITY;

    for (const event of events) {
      if (event.extendedProps?.isShadow || !event.start || event.allDay) {
        continue;
      }

      const startMs = event.start.getTime();
      const rawEndMs = event.end?.getTime() ?? startMs;
      // Treat zero-duration events as a 1ms window so equality checks stay deterministic.
      const endMs = rawEndMs <= startMs ? startMs + 1 : rawEndMs;

      if (startMs <= nowMs && nowMs < endMs) {
        if (endMs < currentCandidateEnd) {
          currentCandidate = event;
          currentCandidateEnd = endMs;
        }
        continue;
      }

      if (startMs > nowMs && startMs < nextCandidateStart) {
        nextCandidate = event;
        nextCandidateStart = startMs;
      }
    }

    const activeEvent = currentCandidate ?? nextCandidate;
    if (activeEvent?.id) {
      result.add(activeEvent.id);
    }
    return result;
  };

  const updateCurrentOrNextEventHighlight = () => {
    const nextUpcomingEventIds = findCurrentOrNextEventIds(cal?.getEvents() || []);

    for (const oldId of currentUpcomingEventIds) {
      if (!nextUpcomingEventIds.has(oldId)) {
        toggleEventHighlightById(oldId, false);
      }
    }

    // Always reapply in case FullCalendar remounted DOM nodes.
    for (const newId of nextUpcomingEventIds) {
      toggleEventHighlightById(newId, true);
    }

    currentUpcomingEventIds = nextUpcomingEventIds;
  };

  let pendingHeaders: { dateStr: string; el: HTMLElement }[] = [];
  let pendingCells: { dateStr: string; el: HTMLElement }[] = [];
  let activeForecast: Record<string, WeatherInfo> | null = null;

  const formatDateLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const injectHeaderWeather = (el: HTMLElement, dateStr: string, data: WeatherInfo) => {
    if (el.querySelector('.ofc-weather-panel')) {
      return;
    }

    const currentSettings = PluginState.getSettings();
    const unit = currentSettings?.weatherUnit === 'F' ? 'F' : 'C';

    const innerEl = el.querySelector('.fc-scrollgrid-sync-inner') || el;
    const panelEl = innerEl.createDiv({ cls: 'ofc-weather-panel' });

    const emojiTempEl = panelEl.createDiv({ cls: 'ofc-weather-emoji-temp' });
    emojiTempEl.createSpan({ cls: 'ofc-weather-emoji' }).setText(data.emoji);
    emojiTempEl
      .createSpan({ cls: 'ofc-weather-temp' })
      .setText(formatTempRange(data.minTemp, data.maxTemp, unit));

    panelEl.createDiv({ cls: 'ofc-weather-desc' }).setText(data.desc);

    panelEl.setCssProps({ cursor: 'pointer' });
    panelEl.addEventListener('click', e => {
      e.stopPropagation();
      const doc = el?.ownerDocument || activeDocument;
      interface PopoutWindow {
        app: App;
      }
      const activeApp =
        (doc?.defaultView as unknown as PopoutWindow | null)?.app ||
        (window as unknown as PopoutWindow).app;
      if (activeApp) {
        new WeatherDetailModal(activeApp, dateStr, data).open();
      }
    });
  };

  const injectUnconfiguredHeaderWeather = (el: HTMLElement, isFirst: boolean) => {
    if (el.querySelector('.ofc-weather-panel')) {
      return;
    }

    const innerEl = el.querySelector('.fc-scrollgrid-sync-inner') || el;
    const panelEl = innerEl.createDiv({ cls: 'ofc-weather-panel is-unconfigured' });

    const emojiTempEl = panelEl.createDiv({ cls: 'ofc-weather-emoji-temp' });
    emojiTempEl.createSpan({ cls: 'ofc-weather-emoji' }).setText('🌤️❓');

    if (isFirst) {
      emojiTempEl.createSpan({ cls: 'ofc-weather-temp' }).setText('Configure');
      panelEl.createDiv({ cls: 'ofc-weather-desc' }).setText('Set weather location');
    } else {
      emojiTempEl.createSpan({ cls: 'ofc-weather-temp' }).setText('Setup');
      panelEl.createDiv({ cls: 'ofc-weather-desc' }).setText('Click to configure');
    }

    panelEl.setCssProps({ cursor: 'pointer' });
    panelEl.addEventListener('click', e => {
      e.stopPropagation();
      const doc = el?.ownerDocument || activeDocument;
      interface ObsidianAppWindow {
        app: App & { setting?: { open: () => void; openTabById: (id: string) => void } };
      }
      const activeApp =
        (doc?.defaultView as unknown as ObsidianAppWindow | null)?.app ||
        (window as unknown as ObsidianAppWindow).app;
      if (activeApp && activeApp.setting) {
        activeApp.setting.open();
        activeApp.setting.openTabById('full-calendar-remastered');
      }
    });
  };

  const injectCellWeather = (el: HTMLElement, dateStr: string, data: WeatherInfo) => {
    const topEl = el.querySelector('.fc-daygrid-day-top');
    if (!topEl) return;

    if (topEl.querySelector('.ofc-weather-month-emoji')) {
      return;
    }

    const emojiEl = topEl.createSpan({ cls: 'ofc-weather-month-emoji' });
    emojiEl.setText(data.emoji);

    emojiEl.setCssProps({ cursor: 'pointer' });

    // Stop click bubbling and open the weather modal
    emojiEl.addEventListener('click', e => {
      e.stopPropagation();
      const doc = el?.ownerDocument || activeDocument;
      interface PopoutWindow {
        app: App;
      }
      const activeApp =
        (doc?.defaultView as unknown as PopoutWindow | null)?.app ||
        (window as unknown as PopoutWindow).app;
      if (activeApp) {
        new WeatherDetailModal(activeApp, dateStr, data).open();
      }
    });

    // Stop mousedown/pointerdown bubbling to prevent FullCalendar date-select and drag highlights
    emojiEl.addEventListener('mousedown', e => {
      e.stopPropagation();
    });
    emojiEl.addEventListener('pointerdown', e => {
      e.stopPropagation();
    });
  };

  const bindDailyNoteClick = (el: HTMLElement, date: Date, selector: string): void => {
    if (!PluginState.getSettings().openDailyNoteOnDateClick) {
      return;
    }
    const dateLabel = el.querySelector<HTMLElement>(selector);
    if (!dateLabel || dateLabel.dataset.ofcDailyNoteBound === 'true') {
      return;
    }

    dateLabel.dataset.ofcDailyNoteBound = 'true';
    dateLabel.setCssProps({ cursor: 'pointer' });
    dateLabel.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      void openDailyNoteForDate(PluginState.getPlugin().app, date);
    });
  };

  const handleViewChangeAndFetchWeather = async (view: { activeStart: Date; activeEnd: Date }) => {
    // DO NOT clear pendingHeaders, pendingCells, or activeForecast at the start of this function!
    // FullCalendar mounts headers and cells BEFORE datesSet triggers.
    // Clearing them here discards the DOM elements collected during dayHeaderDidMount/dayCellDidMount.

    const pluginSettings = PluginState.getSettings();
    if (settings?.weatherHide || pluginSettings.weatherHide) {
      pendingHeaders = [];
      pendingCells = [];
      return;
    }

    if (pluginSettings.weatherLatitude === null || pluginSettings.weatherLongitude === null) {
      pendingHeaders = [];
      pendingCells = [];
      return;
    }

    const latitude = pluginSettings.weatherLatitude ?? 50.088;
    const longitude = pluginSettings.weatherLongitude ?? 14.4208;

    if (!view) return;

    const start = view.activeStart;
    const end = new Date(view.activeEnd.getTime() - 24 * 60 * 60 * 1000); // end date is exclusive

    const today = new Date();
    const minStart = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
    const maxEnd = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

    const actualStart = start < minStart ? minStart : start;
    const actualEnd = end > maxEnd ? maxEnd : end;

    if (actualStart > actualEnd) {
      return;
    }

    const startStr = formatDateLocal(actualStart);
    const endStr = formatDateLocal(actualEnd);

    const forecast = await fetchWeatherForecast(latitude, longitude, startStr, endStr);

    if (forecast) {
      activeForecast = forecast;

      pendingHeaders.forEach(({ dateStr, el }) => {
        if (forecast[dateStr]) {
          injectHeaderWeather(el, dateStr, forecast[dateStr]);
        }
      });
      pendingHeaders = [];

      pendingCells.forEach(({ dateStr, el }) => {
        if (forecast[dateStr]) {
          injectCellWeather(el, dateStr, forecast[dateStr]);
        }
      });
      pendingCells = [];
    }
  };

  cal = new CalendarCtor(containerEl, {
    dayHeaderDidMount: arg => {
      if (arg.view.type.startsWith('timeGrid')) {
        bindDailyNoteClick(arg.el, arg.date, '.fc-col-header-cell-cushion');
      }
      const pluginSettings = PluginState.getSettings();
      if (settings?.weatherHide || pluginSettings.weatherHide) {
        return;
      }
      const isUnconfigured =
        pluginSettings.weatherLatitude === null || pluginSettings.weatherLongitude === null;
      if (isUnconfigured) {
        const isFirst = pendingHeaders.length === 0;
        pendingHeaders.push({ dateStr: formatDateLocal(arg.date), el: arg.el });
        injectUnconfiguredHeaderWeather(arg.el, isFirst);
        return;
      }
      const dateStr = formatDateLocal(arg.date);
      if (activeForecast && activeForecast[dateStr]) {
        injectHeaderWeather(arg.el, dateStr, activeForecast[dateStr]);
      } else {
        pendingHeaders.push({ dateStr, el: arg.el });
      }
    },
    dayCellDidMount: arg => {
      bindDailyNoteClick(arg.el, arg.date, '.fc-daygrid-day-number');
      const pluginSettings = PluginState.getSettings();
      if (
        settings?.weatherHide ||
        pluginSettings.weatherHide ||
        pluginSettings.weatherLatitude === null ||
        pluginSettings.weatherLongitude === null
      ) {
        return;
      }
      const dateStr = formatDateLocal(arg.date);
      if (activeForecast && activeForecast[dateStr]) {
        injectCellWeather(arg.el, dateStr, activeForecast[dateStr]);
      } else {
        pendingCells.push({ dateStr, el: arg.el });
      }
    },
    datesSet: (info: { view: { activeStart: Date; activeEnd: Date; type: string } }) => {
      void handleViewChangeAndFetchWeather(info.view);

      if (isNarrow && info.view.type === 'dayGridMonth') {
        const today = new Date();
        const targetDate =
          today >= info.view.activeStart && today < info.view.activeEnd
            ? today
            : info.view.activeStart;

        const year = targetDate.getFullYear();
        const month = String(targetDate.getMonth() + 1).padStart(2, '0');
        const day = String(targetDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        window.requestAnimationFrame(() => {
          containerEl.querySelectorAll('.fc-daygrid-day').forEach(el => {
            if (el.getAttribute('data-date') === dateStr) {
              el.classList.add('ofc-day-selected');
            } else {
              el.classList.remove('ofc-day-selected');
            }
          });
        });

        updateMobileAgenda(targetDate);
      } else {
        hideMobileAgenda();
      }
    },
    // Only include schedulerLicenseKey when resource-timeline plugin is loaded
    ...(showResourceViews && resourceTimelinePlugin
      ? { schedulerLicenseKey: 'GPL-My-Project-Is-Open-Source' }
      : {}),
    customButtons: customButtonConfig,
    timeZone: settings?.timeZone,
    height: settings?.height,
    // Set the FullCalendar locale so month names, day names, and toolbar button
    // labels match the user's Obsidian language selection.
    ...(fcLocale ? { locale: fcLocale.default } : {}),
    plugins: [
      // View plugins
      dayGridPlugin,
      timeGridPlugin,
      listPlugin,
      // Only include the heavy scheduler plugin when needed
      ...(showResourceViews && resourceTimelinePlugin
        ? ([resourceTimelinePlugin] as const)
        : ([] as const)),
      // Drag + drop and editing
      interactionPlugin,
      rrulePlugin,
      luxonPlugin
    ],
    initialView:
      settings?.initialView?.[isNarrow ? 'mobile' : 'desktop'] ||
      (isNarrow ? 'timeGrid3Days' : 'timeGridWeek'),
    nowIndicator: true,
    scrollTimeReset: false,
    dayMaxEvents: settings?.dayMaxEvents !== undefined ? settings.dayMaxEvents : true, // Use setting override or default to true
    headerToolbar:
      settings?.headerToolbar !== undefined
        ? settings.headerToolbar
        : initialToolbarLayout.headerToolbar,
    footerToolbar:
      settings?.footerToolbar !== undefined
        ? settings.footerToolbar
        : initialToolbarLayout.footerToolbar,
    // Cast at usage point to satisfy FullCalendar without polluting variable with any
    views,
    ...(showResourceViews && {
      resourceAreaHeaderContent: 'Categories',
      resources,
      resourcesInitiallyExpanded: false
    }),

    // Business hours configuration
    ...(businessHours && { businessHours }),

    eventAllow: (dropInfo, _draggedEvent) => {
      // dropInfo.resource is the resource that the event is being dropped on
      const resource = (dropInfo as { resource?: { extendedProps?: { isParent?: boolean } } })
        .resource;
      if (resource?.extendedProps?.isParent) {
        return false; // Disallow drop on parent
      }
      return true; // Allow drop on children (or in non-resource views)
    },

    windowResize: () => {
      const nextToolbarLayout = getToolbarLayout(getResponsiveWidth());
      if (nextToolbarLayout.mode === currentToolbarMode) {
        return;
      }

      currentToolbarMode = nextToolbarLayout.mode;
      if (settings?.headerToolbar !== false) {
        cal?.setOption('headerToolbar', nextToolbarLayout.headerToolbar);
      }
      if (settings?.footerToolbar !== false) {
        cal?.setOption('footerToolbar', nextToolbarLayout.footerToolbar);
      }
    },

    firstDay: settings?.firstDay,
    // New granular view configuration settings
    ...(settings?.slotMinTime !== undefined && { slotMinTime: settings.slotMinTime }),
    ...(settings?.slotMaxTime !== undefined && { slotMaxTime: settings.slotMaxTime }),
    ...(settings?.slotDuration !== undefined && { slotDuration: settings.slotDuration }),
    ...(settings?.slotLabelInterval !== undefined && {
      slotLabelInterval: settings.slotLabelInterval
    }),
    ...(settings?.allDaySlot !== undefined && { allDaySlot: settings.allDaySlot }),
    ...(settings?.weekends !== undefined && { weekends: settings.weekends }),
    ...(settings?.hiddenDays !== undefined && { hiddenDays: settings.hiddenDays }),
    ...(settings?.timeFormat24h && {
      eventTimeFormat: {
        hour: 'numeric',
        minute: '2-digit',
        hour12: false
      },
      slotLabelFormat: {
        hour: 'numeric',
        minute: '2-digit',
        hour12: false
      }
    }),
    eventSources,
    eventClick: wrappedEventClick,

    selectable: select && true,
    selectMirror: select && true,
    select:
      select &&
      ((info): void => {
        void (async () => {
          await select(info.start, info.end, info.allDay, info.view.type);
          info.view.calendar.unselect();
        })();
      }),

    // Handle date clicks (including right-clicks for navigation menu)
    dateClick: info => {
      // Only handle right-clicks for date navigation
      if (info.jsEvent.button === 2 && dateRightClick) {
        info.jsEvent.preventDefault();
        dateRightClick(info.date, info.jsEvent);
        return;
      }

      // Mobile click selects day and updates agenda list
      if (isNarrow && info.view.type === 'dayGridMonth') {
        containerEl.querySelectorAll('.fc-daygrid-day').forEach(el => {
          el.classList.remove('ofc-day-selected');
        });
        info.dayEl.classList.add('ofc-day-selected');
        updateMobileAgenda(info.date);
      }
    },

    editable: modifyEvent && true,
    // Keep drag mirror anchored to the viewport, not transformed Obsidian panes.
    fixedMirrorParent: mirrorParent,
    eventDragStop:
      eventDragStop &&
      (info => {
        eventDragStop(info.event, info.jsEvent);
      }),
    eventDrop: modifyEventCallback,
    eventResize: modifyEventCallback,

    eventMouseEnter,

    eventDidMount: ({ event, el, textColor }) => {
      // Don't add context menu or checkboxes to shadow events
      if (event.extendedProps.isShadow) {
        el.addClass('fc-event-shadow');
        return;
      }

      el.setAttribute('data-event-id', event.id);
      el.toggleClass('ofc-event-current-or-next', currentUpcomingEventIds.has(event.id));
      const eventColor = event.backgroundColor || event.borderColor || '';
      if (eventColor) {
        el.style.setProperty('--event-color', eventColor);
      }

      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        if (openContextMenuForEvent) {
          void openContextMenuForEvent(event, e);
        }
      });
      if (toggleTask) {
        if (event.extendedProps.isTask) {
          const checkbox = createEl('input', {
            attr: { type: 'checkbox' }
          });
          checkbox.checked = !!event.extendedProps.taskCompleted;

          const syncVisualState = (state: RecurringInstanceState | null) => {
            const completed = state?.completed ?? checkbox.checked;
            const skipped = state?.skipped ?? false;

            checkbox.checked = completed;
            el.toggleClass('ofc-task-completed', completed);
            el.toggleClass('ofc-task-skipped', skipped);
          };

          checkbox.onclick = async e => {
            e.stopPropagation();
            if (e.target) {
              const ret = await toggleTask(event, (e.target as HTMLInputElement).checked);
              if (!ret) {
                (e.target as HTMLInputElement).checked = !(e.target as HTMLInputElement).checked;
              }
            }
          };

          if (getRecurringInstanceState) {
            void (async () => {
              const instanceState = await getRecurringInstanceState(event);
              if (!instanceState) {
                return;
              }
              syncVisualState(instanceState);
            })();
          }

          // Make the checkbox more visible against different color events.
          if (textColor === 'black') {
            checkbox.addClass('ofc-checkbox-black');
          } else {
            checkbox.addClass('ofc-checkbox-white');
          }

          if (checkbox.checked) {
            el.addClass('ofc-task-completed');
          }

          // Depending on the view, we should put the checkbox in a different spot.
          const container =
            el.querySelector('.fc-event-time') ||
            el.querySelector('.fc-event-title') ||
            el.querySelector('.fc-list-event-title');

          container?.addClass('ofc-has-checkbox');
          container?.prepend(checkbox);
        }
      }
    },

    viewDidMount: () => {
      onViewChange?.();
      updateCurrentOrNextEventHighlight();
      window.requestAnimationFrame(() => ensureToolbarSearchControl());
    },

    eventsSet: () => {
      updateCurrentOrNextEventHighlight();
      onEventsSet?.();

      if (blankViewTimer !== null) {
        window.clearTimeout(blankViewTimer);
        blankViewTimer = null;
      }

      // Fire blank-view diagnostic if the caller registered a handler and the
      // rendered event list (excluding shadow events) remains empty after settling.
      if (onBlankView && cal) {
        const nonShadowCount = cal.getEvents().filter(e => !e.extendedProps?.isShadow).length;
        if (nonShadowCount === 0) {
          blankViewTimer = window.setTimeout(() => {
            blankViewTimer = null;
            if (cal && cal.el) {
              const currentNonShadowCount = cal
                .getEvents()
                .filter(e => !e.extendedProps?.isShadow).length;
              if (currentNonShadowCount === 0) {
                onBlankView(cal);
              }
            }
          }, 300);
        }
      }
    },

    // Enable drag-and-drop from external sources (e.g., Tasks Backlog)
    droppable: drop && true,
    drop:
      drop &&
      (info => {
        // Get the task ID from the dragged element's data transfer
        const taskId = info.draggedEl.getAttribute('data-task-id');
        if (taskId) {
          void drop(taskId, info.date, info.allDay);
        }
      }),

    longPressDelay: 250
  });

  // Keep toolbar mode and sizing in sync with pane/container changes
  // (e.g. Obsidian sidebars opening/closing) that do not emit window resize.
  const resizeObserver = new ResizeObserver(() => {
    const nextToolbarLayout = getToolbarLayout(getResponsiveWidth());
    if (nextToolbarLayout.mode !== currentToolbarMode) {
      currentToolbarMode = nextToolbarLayout.mode;
      if (settings?.headerToolbar !== false) {
        cal.setOption('headerToolbar', nextToolbarLayout.headerToolbar);
      }
      if (settings?.footerToolbar !== false) {
        cal.setOption('footerToolbar', nextToolbarLayout.footerToolbar);
      }
      window.requestAnimationFrame(() => ensureToolbarSearchControl());
    }

    cal.updateSize();
  });
  resizeObserver.observe(containerEl);

  let searchQuery = initialSearchQuery || '';
  let searchExpanded = !!searchQuery;
  let searchDebounceId: number | null = null;

  const scheduleSearchQueryUpdate = () => {
    if (searchDebounceId !== null) {
      window.clearTimeout(searchDebounceId);
    }
    searchDebounceId = window.setTimeout(() => {
      onSearchQueryChange?.(searchQuery);
    }, 80);
  };

  const ensureToolbarSearchControl = () => {
    const searchButtonEl = containerEl.querySelector<HTMLButtonElement>('.fc-search-button');
    if (!searchButtonEl) {
      return;
    }

    const allWrapEls = Array.from(
      containerEl.querySelectorAll<HTMLElement>('.ofc-toolbar-search-input-wrap')
    );
    const anchoredWrapEl = searchButtonEl.nextElementSibling;
    const keepWrapEl =
      anchoredWrapEl instanceof HTMLElement &&
      anchoredWrapEl.classList.contains('ofc-toolbar-search-input-wrap')
        ? anchoredWrapEl
        : null;

    for (const wrapEl of allWrapEls) {
      if (keepWrapEl && wrapEl === keepWrapEl) {
        continue;
      }
      wrapEl.remove();
    }

    if (searchButtonEl.dataset.ofcSearchBound === 'true' && keepWrapEl) {
      const isSearchActive = searchExpanded || !!searchQuery;
      keepWrapEl.setCssProps({
        width: isSearchActive ? (Platform.isPhone ? '140px' : '180px') : '0px'
      });
      keepWrapEl.toggleClass('is-active-query', !!searchQuery);
      const toolbarEl = searchButtonEl.closest('.fc-toolbar');
      toolbarEl?.classList.toggle('ofc-search-active', isSearchActive);
      return;
    }

    searchButtonEl.dataset.ofcSearchBound = 'true';
    searchButtonEl.type = 'button';
    searchButtonEl.ariaLabel = 'Search events';
    searchButtonEl.toggleClass('clickable-icon', true);
    searchButtonEl.parentElement?.toggleClass('ofc-toolbar-search-host', true);

    const inputWrapEl =
      keepWrapEl ||
      (() => {
        const wrapEl = createDiv({ cls: 'ofc-toolbar-search-input-wrap' });
        wrapEl.setCssProps({
          width: searchExpanded || searchQuery ? '180px' : '0px'
        });

        const inputEl = createEl('input', {
          cls: 'ofc-toolbar-search-input',
          attr: { type: 'text', placeholder: 'Search events...', 'aria-label': 'Search events' },
          value: searchQuery
        });

        const clearEl = createEl('button', {
          cls: 'clickable-icon ofc-toolbar-search-clear',
          text: '×',
          attr: { type: 'button', 'aria-label': 'Clear search' }
        });
        clearEl.setCssProps({ display: searchQuery ? 'inline-flex' : 'none' });

        wrapEl.appendChild(inputEl);
        wrapEl.appendChild(clearEl);
        searchButtonEl.insertAdjacentElement('afterend', wrapEl);
        return wrapEl;
      })();

    const searchInputEl = inputWrapEl.querySelector<HTMLInputElement>('.ofc-toolbar-search-input');
    const clearButtonEl = inputWrapEl.querySelector<HTMLButtonElement>('.ofc-toolbar-search-clear');
    if (!searchInputEl || !clearButtonEl) {
      return;
    }

    searchInputEl.value = searchQuery;

    const syncState = () => {
      const isSearchActive = searchExpanded || !!searchQuery;
      inputWrapEl.setCssProps({
        width: isSearchActive ? (Platform.isPhone ? '140px' : '180px') : '0px'
      });
      clearButtonEl.setCssProps({ display: searchQuery ? 'inline-flex' : 'none' });
      searchButtonEl.toggleClass('is-active', isSearchActive);
      inputWrapEl.toggleClass('is-active-query', !!searchQuery);
      const toolbarEl = searchButtonEl.closest('.fc-toolbar');
      toolbarEl?.classList.toggle('ofc-search-active', isSearchActive);
    };

    searchButtonEl.addEventListener('click', () => {
      searchExpanded = true;
      syncState();
      searchInputEl.focus();
      searchInputEl.select();
    });

    searchInputEl.addEventListener('input', () => {
      searchQuery = searchInputEl.value;
      syncState();
      scheduleSearchQueryUpdate();
    });

    searchInputEl.addEventListener('blur', () => {
      if (searchQuery) {
        return;
      }
      searchExpanded = false;
      syncState();
    });

    searchInputEl.addEventListener('keydown', evt => {
      if (evt.key === 'Escape') {
        if (searchQuery) {
          searchQuery = '';
          searchInputEl.value = '';
          scheduleSearchQueryUpdate();
        } else {
          searchExpanded = false;
        }
        syncState();
        searchInputEl.blur();
      }
    });

    clearButtonEl.addEventListener('mousedown', evt => {
      evt.preventDefault();
      searchQuery = '';
      searchInputEl.value = '';
      scheduleSearchQueryUpdate();
      syncState();
      searchInputEl.focus();
    });

    syncState();
  };

  cal.render();
  ensureToolbarSearchControl();

  if (!containerEl.hasAttribute('tabindex')) {
    containerEl.setAttribute('tabindex', '0');
  }

  const onPointerDownFocus = (event: PointerEvent) => {
    if (isEditableTarget(event.target)) {
      return;
    }

    containerEl.focus({ preventScroll: true });
  };

  const onKeyDownNavigate = (event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return;
    }

    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
      return;
    }

    if (isEditableTarget(event.target) || isEditableTarget(interactionDocument.activeElement)) {
      return;
    }

    event.preventDefault();
    if (event.key === 'ArrowLeft') {
      cal.prev();
      return;
    }

    cal.next();
  };

  let touchStartX: number | null = null;
  let touchStartY: number | null = null;
  let swipeEnabled = false;

  const onTouchStartNavigate = (event: TouchEvent) => {
    if (event.touches.length !== 1 || isEditableTarget(event.target)) {
      swipeEnabled = false;
      return;
    }

    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    swipeEnabled = true;
  };

  const onTouchEndNavigate = (event: TouchEvent) => {
    if (!swipeEnabled || touchStartX === null || touchStartY === null || !event.changedTouches[0]) {
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;

    touchStartX = null;
    touchStartY = null;
    swipeEnabled = false;

    if (Math.abs(deltaX) < SWIPE_MIN_DISTANCE) {
      return;
    }

    if (Math.abs(deltaX) < Math.abs(deltaY) * SWIPE_DIRECTION_RATIO) {
      return;
    }

    if (deltaX < 0) {
      cal.next();
      return;
    }

    cal.prev();
  };

  containerEl.addEventListener('pointerdown', onPointerDownFocus);
  containerEl.addEventListener('keydown', onKeyDownNavigate);
  containerEl.addEventListener('touchstart', onTouchStartNavigate, { passive: true });
  containerEl.addEventListener('touchend', onTouchEndNavigate, { passive: true });

  updateCurrentOrNextEventHighlight();
  const activeHighlightInterval = window.setInterval(updateCurrentOrNextEventHighlight, 60_000);
  const onVisibilityChange = () => {
    if (interactionDocument.visibilityState === 'visible') {
      updateCurrentOrNextEventHighlight();
    }
  };
  interactionDocument.addEventListener('visibilitychange', onVisibilityChange);

  const originalDestroy = cal.destroy.bind(cal);
  cal.destroy = () => {
    if (blankViewTimer !== null) {
      window.clearTimeout(blankViewTimer);
      blankViewTimer = null;
    }
    resizeObserver.disconnect();
    containerEl.removeEventListener('pointerdown', onPointerDownFocus);
    containerEl.removeEventListener('keydown', onKeyDownNavigate);
    containerEl.removeEventListener('touchstart', onTouchStartNavigate);
    containerEl.removeEventListener('touchend', onTouchEndNavigate);
    window.clearInterval(activeHighlightInterval);
    interactionDocument.removeEventListener('visibilitychange', onVisibilityChange);
    if (agendaEl) {
      agendaEl.remove();
    }
    originalDestroy();
  };

  // Set up date navigation after calendar is created
  dateNavigation = createDateNavigation(cal, containerEl);

  // Update the navigate button click handler
  const navigateButton = containerEl.querySelector('.fc-navigate-button') as HTMLButtonElement;
  if (navigateButton) {
    navigateButton.addEventListener('click', (ev: MouseEvent) => {
      dateNavigation.showNavigationMenu(ev);
    });
  }

  // Add general right-click handler to calendar container for view-level navigation
  if (viewRightClick) {
    containerEl.addEventListener('contextmenu', (event: MouseEvent) => {
      // Only handle if not handled by specific date or event right-clicks
      if (!event.defaultPrevented) {
        event.preventDefault();
        viewRightClick(event, cal);
      }
    });
  }

  return cal;
}
