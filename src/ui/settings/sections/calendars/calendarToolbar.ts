/**
 * @file calendarToolbar.ts
 * @brief Toolbar layout, view specifications, custom buttons, and search control for the calendar.
 *
 * @license See LICENSE.md
 */

import { Menu, Platform } from 'obsidian';
import type { Calendar } from '@fullcalendar/core';
import type { createDateNavigation } from '../../../../features/navigation/DateNavigation';
import type { ExtraRenderProps } from './calendar';

export const MOBILE_BREAKPOINT = 500;
export const COMPACT_DESKTOP_BREAKPOINT = 910;

export type ToolbarMode = 'narrow' | 'compact-desktop' | 'desktop';

export type ToolbarLayout = {
  mode: ToolbarMode;
  headerToolbar: { left: string; center: string; right: string } | false;
  footerToolbar: { left: string; right: string } | false;
};

export type TimeGridDayHeaderFormat =
  'ddmm-day' | 'mmdd-day' | 'day-ddmm' | 'day-mmdd' | 'ddmmyyyy-day' | 'mmddyyyy-day';

export type ViewSpec = {
  type: string;
  duration?: { days?: number; weeks?: number };
  buttonText: string;
  slotMinWidth?: number;
  dayHeaderContent?: (arg: { date: Date }) => string;
};

export const formatTimeGridDayHeader = (date: Date, timeGridDayHeaderFormat?: string): string => {
  const format = (timeGridDayHeaderFormat as TimeGridDayHeaderFormat | undefined) || 'day-mmdd';
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

export function buildCalendarViews(options: {
  isNarrow: boolean;
  showResourceViews: boolean;
  timeGridDayHeaderFormat?: string;
}): Record<string, ViewSpec> {
  const { isNarrow, showResourceViews, timeGridDayHeaderFormat } = options;

  const views: Record<string, ViewSpec> = {
    timeGridWeek: {
      type: 'timeGrid',
      duration: { weeks: 1 },
      buttonText: 'week',
      dayHeaderContent: arg => formatTimeGridDayHeader(arg.date, timeGridDayHeaderFormat)
    },
    timeGridDay: {
      type: 'timeGrid',
      duration: { days: 1 },
      buttonText: isNarrow ? '1' : 'day',
      dayHeaderContent: arg => formatTimeGridDayHeader(arg.date, timeGridDayHeaderFormat)
    },
    timeGrid3Days: {
      type: 'timeGrid',
      duration: { days: 3 },
      buttonText: '3',
      dayHeaderContent: arg => formatTimeGridDayHeader(arg.date, timeGridDayHeaderFormat)
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

  return views;
}

export function getToolbarLayout(
  windowWidth: number,
  options: {
    forceNarrow?: boolean;
    customButtons?: ExtraRenderProps['customButtons'];
    showResourceViews: boolean;
  }
): ToolbarLayout {
  const { forceNarrow, customButtons, showResourceViews } = options;
  const narrow = !!forceNarrow || Platform.isPhone || windowWidth < MOBILE_BREAKPOINT;

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
}

export function addViewOptionsToMenu(
  menu: Menu,
  mode: ToolbarMode,
  getCalendar: () => Calendar | null
): void {
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
        getCalendar()?.changeView(viewName);
      })
    );
  }
}

export function buildCustomButtons(options: {
  customButtons?: ExtraRenderProps['customButtons'];
  showResourceViews: boolean;
  getToolbarMode: () => ToolbarMode;
  getCalendar: () => Calendar | null;
  getDateNavigation: () => ReturnType<typeof createDateNavigation> | null;
  containerEl: HTMLElement;
}): Record<string, { text: string; click: (ev: MouseEvent) => void }> {
  const {
    customButtons,
    showResourceViews,
    getToolbarMode,
    getCalendar,
    getDateNavigation,
    containerEl
  } = options;

  const customButtonConfig: Record<string, { text: string; click: (ev: MouseEvent) => void }> = {
    ...customButtons
  };

  // Always add the "Views" dropdown
  customButtonConfig.views = {
    text: 'View ▾',
    click: (ev: MouseEvent) => {
      const menu = new Menu();
      addViewOptionsToMenu(menu, getToolbarMode(), getCalendar);
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
      getDateNavigation()?.showNavigationMenu(ev);
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
          getDateNavigation()?.showNavigationMenu(ev);
        });
      });

      const mode = getToolbarMode();
      if (mode === 'compact-desktop' || mode === 'narrow') {
        menu.addSeparator();
        addViewOptionsToMenu(menu, mode, getCalendar);
      }

      if (showResourceViews) {
        menu.addSeparator();
        menu.addItem(item =>
          item.setTitle('Timeline week').onClick(() => {
            getCalendar()?.changeView('resourceTimelineWeek');
          })
        );
        menu.addItem(item =>
          item.setTitle('Timeline day').onClick(() => {
            getCalendar()?.changeView('resourceTimelineDay');
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
            getCalendar()?.changeView('resourceTimelineWeek');
          })
        );
        menu.addItem(item =>
          item.setTitle('Timeline day').onClick(() => {
            getCalendar()?.changeView('resourceTimelineDay');
          })
        );
        menu.showAtMouseEvent(ev);
      }
    };
  }

  return customButtonConfig;
}

export function createToolbarSearchController(options: {
  containerEl: HTMLElement;
  initialSearchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
}): {
  ensureToolbarSearchControl: () => void;
  getSearchQuery: () => string;
} {
  const { containerEl, initialSearchQuery, onSearchQueryChange } = options;

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

  return {
    ensureToolbarSearchControl,
    getSearchQuery: () => searchQuery
  };
}
