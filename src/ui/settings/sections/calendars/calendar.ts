/**
 * @file calendar.ts
 * @brief A wrapper for initializing and rendering the FullCalendar.js library.
 *
 * @description
 * This file provides the `renderCalendar` function, which acts as the orchestrator
 * for creating a `Calendar` instance from the `@fullcalendar/core` library. It wires
 * together toolbar controls, interactive event handlers, gestures, and decorators.
 *
 * @exports renderCalendar
 *
 * @license See LICENSE.md
 */

import type {
  Calendar,
  EventApi,
  EventClickArg,
  EventSourceInput,
  LocaleSingularArg,
  PluginDef
} from '@fullcalendar/core';

import { activeDocument, Platform } from 'obsidian';
import type { RecurringInstanceState } from '../../../../providers/Provider';
import { createDateNavigation } from '../../../../features/navigation/DateNavigation';
import {
  patchRRuleTimezoneExpansion,
  resolveEffectiveTimezone,
  type RRulePluginLike
} from '../../../../features/timezone/Timezone';
import { i18n } from '../../../../features/i18n/i18n';
import {
  buildCalendarViews,
  buildCustomButtons,
  createToolbarSearchController,
  getToolbarLayout,
  MOBILE_BREAKPOINT,
  type ToolbarMode
} from './calendarToolbar';
import {
  attachTaskCheckbox,
  createEventHighlightManager,
  createMobileAgendaManager,
  setupCalendarNavigationGestures
} from './calendarInteractions';
import { createWeatherDecorator } from './calendarWeather';

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
  eventMouseOver?: (event: EventApi, el: HTMLElement, mouseEvent: MouseEvent) => void;
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
  onViewChange?: () => void;
  businessHours?: boolean | object;
  drop?: (taskId: string, date: Date, allDay: boolean) => Promise<void>;
  timeZone?: string;

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
  onBlankView?: (cal: Calendar) => void;
  headerToolbar?: false | object;
  footerToolbar?: false | object;
  height?: 'auto' | number | 'parent';
  weatherHide?: boolean;
  defaultDate?: string;
}

export async function renderCalendar(
  containerEl: HTMLElement,
  eventSources: EventSourceInput[],
  settings?: ExtraRenderProps & { enableAdvancedCategorization?: boolean }
): Promise<Calendar> {
  const interactionDocument = activeDocument ?? containerEl.ownerDocument;
  const mirrorParent = (activeDocument ?? containerEl.ownerDocument).body;

  // Map plugin locale codes to FullCalendar locale identifiers.
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

  const showResourceViews = !!settings?.enableAdvancedCategorization;
  const resourceTimeline = showResourceViews
    ? await import('@fullcalendar/resource-timeline')
    : null;

  const getResponsiveWidth = (): number => {
    const measuredWidth = containerEl.getBoundingClientRect().width || containerEl.clientWidth;
    return measuredWidth > 0 ? measuredWidth : window.innerWidth;
  };

  const isMobile = Platform.isPhone || getResponsiveWidth() < MOBILE_BREAKPOINT;
  const isNarrow = settings?.forceNarrow || isMobile;

  // Apply RRULE monkeypatch on every render to capture the latest settings.timeZone.
  {
    const rrulePlugin = ((rrule as unknown as { default?: RRulePluginLike }).default ||
      rrule) as unknown as RRulePluginLike;

    patchRRuleTimezoneExpansion(rrulePlugin, resolveEffectiveTimezone(settings?.timeZone));
  }

  const {
    eventClick,
    select,
    modifyEvent,
    eventMouseOver,
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
      if (info.event.extendedProps.isShadow) {
        return;
      }
      return eventClick(info);
    });

  let cal: Calendar | null = null;
  let blankViewTimer: number | null = null;
  let dateNavigation: ReturnType<typeof createDateNavigation> | null = null;

  const weatherDecorator = createWeatherDecorator(containerEl, settings);
  const mobileAgendaManager = createMobileAgendaManager(containerEl, isNarrow, settings);
  const highlightManager = createEventHighlightManager(
    containerEl,
    settings,
    () => cal,
    interactionDocument
  );
  const searchController = createToolbarSearchController({
    containerEl,
    initialSearchQuery,
    onSearchQueryChange
  });

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
        const success = await modifyEvent(event, oldEvent, newResource?.id);
        if (!success) {
          revert();
        }
      })();
    });

  const initialToolbarLayout = getToolbarLayout(getResponsiveWidth(), {
    forceNarrow: settings?.forceNarrow,
    customButtons,
    showResourceViews
  });
  let currentToolbarMode: ToolbarMode = initialToolbarLayout.mode;

  const views = buildCalendarViews({
    isNarrow,
    showResourceViews,
    timeGridDayHeaderFormat: settings?.timeGridDayHeaderFormat
  });

  const customButtonConfig = buildCustomButtons({
    customButtons,
    showResourceViews,
    getToolbarMode: () => currentToolbarMode,
    getCalendar: () => cal,
    getDateNavigation: () => dateNavigation,
    containerEl
  });

  const gestures = setupCalendarNavigationGestures({
    containerEl,
    getCalendar: () => cal,
    interactionDocument
  });

  const CalendarCtor = (core as { Calendar: typeof Calendar }).Calendar;
  const dayGridPlugin = daygrid.default;
  const timeGridPlugin = timegrid.default;
  const listPlugin = list.default;
  const rrulePlugin = rrule.default;
  const interactionPlugin = (interaction as { default: PluginDef }).default;
  const luxonPlugin = (luxon as { default: PluginDef }).default;
  const resourceTimelinePlugin = resourceTimeline ? resourceTimeline.default : null;

  cal = new CalendarCtor(containerEl, {
    dayHeaderDidMount: weatherDecorator.handleDayHeaderDidMount,
    dayCellDidMount: weatherDecorator.handleDayCellDidMount,
    datesSet: (info: { view: { activeStart: Date; activeEnd: Date; type: string } }) => {
      void weatherDecorator.handleViewChangeAndFetchWeather(info.view);

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

        mobileAgendaManager.updateMobileAgenda(targetDate, cal, wrappedEventClick);
      } else {
        mobileAgendaManager.hideMobileAgenda(cal);
      }
    },
    ...(showResourceViews && resourceTimelinePlugin
      ? { schedulerLicenseKey: 'GPL-My-Project-Is-Open-Source' }
      : {}),
    customButtons: customButtonConfig,
    timeZone: resolveEffectiveTimezone(settings?.timeZone),
    height: settings?.height,
    ...(fcLocale ? { locale: fcLocale.default } : {}),
    plugins: [
      dayGridPlugin,
      timeGridPlugin,
      listPlugin,
      ...(showResourceViews && resourceTimelinePlugin
        ? ([resourceTimelinePlugin] as const)
        : ([] as const)),
      interactionPlugin,
      rrulePlugin,
      luxonPlugin
    ],
    initialView:
      settings?.initialView?.[isNarrow ? 'mobile' : 'desktop'] ||
      (isNarrow ? 'timeGrid3Days' : 'timeGridWeek'),
    ...(settings?.defaultDate && settings.defaultDate !== 'today'
      ? { initialDate: settings.defaultDate }
      : {}),
    nowIndicator: true,
    scrollTimeReset: false,
    dayMaxEvents: settings?.dayMaxEvents !== undefined ? settings.dayMaxEvents : true,
    headerToolbar:
      settings?.headerToolbar !== undefined
        ? settings.headerToolbar
        : initialToolbarLayout.headerToolbar,
    footerToolbar:
      settings?.footerToolbar !== undefined
        ? settings.footerToolbar
        : initialToolbarLayout.footerToolbar,
    views,
    ...(showResourceViews && {
      resourceAreaHeaderContent: 'Categories',
      resources,
      resourcesInitiallyExpanded: false
    }),

    ...(businessHours && { businessHours }),

    eventAllow: (dropInfo, _draggedEvent) => {
      const resource = (dropInfo as { resource?: { extendedProps?: { isParent?: boolean } } })
        .resource;
      if (resource?.extendedProps?.isParent) {
        return false;
      }
      return true;
    },

    windowResize: () => {
      const nextToolbarLayout = getToolbarLayout(getResponsiveWidth(), {
        forceNarrow: settings?.forceNarrow,
        customButtons,
        showResourceViews
      });
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
        gestures.cancelSwipeGesture();
        void (async () => {
          await select(info.start, info.end, info.allDay, info.view.type);
          info.view.calendar.unselect();
        })();
      }),

    dateClick: info => {
      if (info.jsEvent.button === 2 && dateRightClick) {
        info.jsEvent.preventDefault();
        dateRightClick(info.date, info.jsEvent);
        return;
      }

      if (isNarrow && info.view.type === 'dayGridMonth') {
        containerEl.querySelectorAll('.fc-daygrid-day').forEach(el => {
          el.classList.remove('ofc-day-selected');
        });
        info.dayEl.classList.add('ofc-day-selected');
        mobileAgendaManager.updateMobileAgenda(info.date, cal, wrappedEventClick);
      }
    },

    editable: modifyEvent && true,
    fixedMirrorParent: mirrorParent,
    eventDragStart: () => {
      gestures.cancelSwipeGesture();
    },
    eventDragStop: info => {
      gestures.cancelSwipeGesture();
      if (eventDragStop) {
        eventDragStop(info.event, info.jsEvent);
      }
    },
    eventResizeStart: () => {
      gestures.cancelSwipeGesture();
    },
    eventResizeStop: () => {
      gestures.cancelSwipeGesture();
    },
    eventDrop: modifyEventCallback,
    eventResize: modifyEventCallback,

    eventDidMount: ({ event, el }) => {
      if (event.extendedProps.isShadow) {
        el.addClass('fc-event-shadow');
        return;
      }

      el.setAttribute('data-event-id', event.id);
      if (eventMouseOver) {
        el.addEventListener('mouseover', mouseEvent => {
          eventMouseOver(event, el, mouseEvent);
        });
      }
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

      attachTaskCheckbox({
        event,
        el,
        eventColor,
        toggleTask,
        getRecurringInstanceState
      });
    },

    viewDidMount: () => {
      onViewChange?.();
      highlightManager.updateCurrentOrNextEventHighlight();
      window.requestAnimationFrame(() => searchController.ensureToolbarSearchControl());
    },

    eventsSet: (events?: EventApi[]) => {
      highlightManager.updateCurrentOrNextEventHighlight(events);
      onEventsSet?.();

      if (blankViewTimer !== null) {
        window.clearTimeout(blankViewTimer);
        blankViewTimer = null;
      }

      if (onBlankView && cal) {
        const currentEvents = events ?? cal.getEvents() ?? [];
        const nonShadowCount = currentEvents.filter(e => !e.extendedProps?.isShadow).length;
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

    droppable: drop && true,
    drop:
      drop &&
      (info => {
        const taskId = info.draggedEl.getAttribute('data-task-id');
        if (taskId) {
          void drop(taskId, info.date, info.allDay);
        }
      }),

    longPressDelay: 250
  });

  const resizeObserver = new ResizeObserver(() => {
    const nextToolbarLayout = getToolbarLayout(getResponsiveWidth(), {
      forceNarrow: settings?.forceNarrow,
      customButtons,
      showResourceViews
    });
    if (nextToolbarLayout.mode !== currentToolbarMode) {
      currentToolbarMode = nextToolbarLayout.mode;
      if (settings?.headerToolbar !== false) {
        cal.setOption('headerToolbar', nextToolbarLayout.headerToolbar);
      }
      if (settings?.footerToolbar !== false) {
        cal.setOption('footerToolbar', nextToolbarLayout.footerToolbar);
      }
      window.requestAnimationFrame(() => searchController.ensureToolbarSearchControl());
    }

    cal.updateSize();
  });
  resizeObserver.observe(containerEl);

  cal.render();
  searchController.ensureToolbarSearchControl();

  if (!containerEl.hasAttribute('tabindex')) {
    containerEl.setAttribute('tabindex', '0');
  }

  highlightManager.updateCurrentOrNextEventHighlight();

  const originalDestroy = cal.destroy.bind(cal);
  cal.destroy = () => {
    if (blankViewTimer !== null) {
      window.clearTimeout(blankViewTimer);
      blankViewTimer = null;
    }
    resizeObserver.disconnect();
    gestures.teardown();
    highlightManager.destroy();
    mobileAgendaManager.destroy();
    originalDestroy();
  };

  dateNavigation = createDateNavigation(cal, containerEl);

  const navigateButton = containerEl.querySelector('.fc-navigate-button') as HTMLButtonElement;
  if (navigateButton) {
    navigateButton.addEventListener('click', (ev: MouseEvent) => {
      dateNavigation.showNavigationMenu(ev);
    });
  }

  if (viewRightClick) {
    containerEl.addEventListener('contextmenu', (event: MouseEvent) => {
      if (!event.defaultPrevented) {
        event.preventDefault();
        viewRightClick(event, cal);
      }
    });
  }

  (
    cal as unknown as { updateCurrentOrNextEventHighlight?: () => void }
  ).updateCurrentOrNextEventHighlight = highlightManager.updateCurrentOrNextEventHighlight;

  return cal;
}
