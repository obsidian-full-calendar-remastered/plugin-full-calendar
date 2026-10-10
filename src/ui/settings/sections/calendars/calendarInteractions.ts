/**
 * @file calendarInteractions.ts
 * @brief Mobile agenda drawer, event glow highlighting, task checkbox DOM binding,
 * and swipe/keyboard navigation for the calendar.
 *
 * @license See LICENSE.md
 */

import type { Calendar, EventApi, EventClickArg } from '@fullcalendar/core';
import type { RecurringInstanceState } from '../../../../providers/Provider';
import { isLightColor } from '../../../calendar/utils';
import type { ExtraRenderProps } from './calendar';

export function createMobileAgendaManager(
  containerEl: HTMLElement,
  isNarrow: boolean,
  settings?: ExtraRenderProps
): {
  updateMobileAgenda: (
    date: Date,
    cal: Calendar | null,
    wrappedEventClick?: (info: EventClickArg) => void
  ) => void;
  hideMobileAgenda: (cal: Calendar | null) => void;
  destroy: () => void;
} {
  const parentEl = containerEl.parentElement;
  let agendaEl: HTMLElement | null = null;

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

  const hideMobileAgenda = (cal: Calendar | null) => {
    const el = getOrCreateAgendaEl();
    if (el) {
      el.setCssProps({ display: 'none' });
    }
    containerEl.setCssProps({ height: '100%' });
    if (cal) {
      cal.updateSize();
    }
  };

  const updateMobileAgenda = (
    date: Date,
    cal: Calendar | null,
    wrappedEventClick?: (info: EventClickArg) => void
  ) => {
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

  const destroy = () => {
    if (agendaEl) {
      agendaEl.remove();
      agendaEl = null;
    }
  };

  return {
    updateMobileAgenda,
    hideMobileAgenda,
    destroy
  };
}

export function createEventHighlightManager(
  containerEl: HTMLElement,
  settings: ExtraRenderProps | undefined,
  getCalendar: () => Calendar | null,
  interactionDocument: Document
): {
  updateCurrentOrNextEventHighlight: (providedEvents?: EventApi[]) => void;
  destroy: () => void;
} {
  let currentUpcomingEventIds = new Set<string>();

  const toggleEventHighlightById = (eventId: string, add: boolean) => {
    const escapedId = CSS.escape(eventId);
    const elements = containerEl.querySelectorAll<HTMLElement>(`[data-event-id="${escapedId}"]`);
    elements.forEach(el => {
      el.toggleClass('ofc-event-current-or-next', add);

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
      if (rawEndMs < nowMs) {
        continue;
      }
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

  const updateCurrentOrNextEventHighlight = (providedEvents?: EventApi[]) => {
    const events = providedEvents ?? getCalendar()?.getEvents() ?? [];
    const nextUpcomingEventIds = findCurrentOrNextEventIds(events);

    for (const oldId of currentUpcomingEventIds) {
      if (!nextUpcomingEventIds.has(oldId)) {
        toggleEventHighlightById(oldId, false);
      }
    }

    for (const newId of nextUpcomingEventIds) {
      toggleEventHighlightById(newId, true);
    }

    currentUpcomingEventIds = nextUpcomingEventIds;
  };

  const activeHighlightInterval = window.setInterval(updateCurrentOrNextEventHighlight, 60_000);
  const onVisibilityChange = () => {
    if (interactionDocument.visibilityState === 'visible') {
      updateCurrentOrNextEventHighlight();
    }
  };
  interactionDocument.addEventListener('visibilitychange', onVisibilityChange);

  const destroy = () => {
    window.clearInterval(activeHighlightInterval);
    interactionDocument.removeEventListener('visibilitychange', onVisibilityChange);
  };

  return {
    updateCurrentOrNextEventHighlight,
    destroy
  };
}

export function attachTaskCheckbox(options: {
  event: EventApi;
  el: HTMLElement;
  eventColor: string;
  toggleTask?: (event: EventApi, isComplete: boolean) => Promise<boolean>;
  getRecurringInstanceState?: (event: EventApi) => Promise<RecurringInstanceState | null>;
}): void {
  const { event, el, eventColor, toggleTask, getRecurringInstanceState } = options;
  if (!toggleTask || !event.extendedProps.isTask) {
    return;
  }

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

  const effectiveTextColor =
    event.textColor || (eventColor && isLightColor(eventColor) ? 'black' : 'white');
  if (effectiveTextColor === 'black') {
    checkbox.addClass('ofc-checkbox-black');
  } else {
    checkbox.addClass('ofc-checkbox-white');
  }

  if (checkbox.checked) {
    el.addClass('ofc-task-completed');
  }

  const container =
    el.querySelector('.fc-event-time') ||
    el.querySelector('.fc-event-title') ||
    el.querySelector('.fc-list-event-title');

  container?.addClass('ofc-has-checkbox');
  container?.prepend(checkbox);
}

export function setupCalendarNavigationGestures(options: {
  containerEl: HTMLElement;
  getCalendar: () => Calendar | null;
  interactionDocument: Document;
}): {
  cancelSwipeGesture: () => void;
  teardown: () => void;
} {
  const { containerEl, getCalendar, interactionDocument } = options;

  const SWIPE_MIN_DISTANCE = 60;
  const SWIPE_DIRECTION_RATIO = 1.2;
  const SWIPE_EDGE_MARGIN = 30;

  let touchStartX: number | null = null;
  let touchStartY: number | null = null;
  let swipeEnabled = false;

  const cancelSwipeGesture = () => {
    touchStartX = null;
    touchStartY = null;
    swipeEnabled = false;
  };

  const isEditableTarget = (target: EventTarget | null): boolean => {
    let element: Element | null = null;
    if (target instanceof Element) {
      element = target;
    } else if (target instanceof Node && target.nodeType === Node.ELEMENT_NODE) {
      element = target as Element;
    } else if (
      target &&
      typeof (target as unknown as { instanceOf?: (cls: unknown) => boolean }).instanceOf ===
        'function'
    ) {
      element = (target as unknown as { instanceOf: (cls: unknown) => boolean }).instanceOf(Element)
        ? (target as Element)
        : null;
    }

    if (!element || typeof element.closest !== 'function') {
      return false;
    }

    return !!element.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], .cm-content, .cm-editor, .markdown-source-view, .markdown-preview-view'
    );
  };

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
    const cal = getCalendar();
    if (event.key === 'ArrowLeft') {
      cal?.prev();
      return;
    }

    cal?.next();
  };

  const onTouchStartNavigate = (event: TouchEvent) => {
    if (event.touches.length !== 1 || isEditableTarget(event.target)) {
      cancelSwipeGesture();
      return;
    }

    const touch = event.touches[0];
    const screenWidth = interactionDocument.defaultView?.innerWidth ?? window.innerWidth;
    if (
      touch.clientX <= SWIPE_EDGE_MARGIN ||
      (screenWidth > 0 && touch.clientX >= screenWidth - SWIPE_EDGE_MARGIN)
    ) {
      cancelSwipeGesture();
      return;
    }

    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    swipeEnabled = true;
  };

  const onTouchEndNavigate = (event: TouchEvent) => {
    if (!swipeEnabled || touchStartX === null || touchStartY === null || !event.changedTouches[0]) {
      cancelSwipeGesture();
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;

    cancelSwipeGesture();

    if (Math.abs(deltaX) < SWIPE_MIN_DISTANCE) {
      return;
    }

    if (Math.abs(deltaX) < Math.abs(deltaY) * SWIPE_DIRECTION_RATIO) {
      return;
    }

    const cal = getCalendar();
    if (deltaX < 0) {
      cal?.next();
      return;
    }

    cal?.prev();
  };

  const onTouchCancelNavigate = () => {
    cancelSwipeGesture();
  };

  containerEl.addEventListener('pointerdown', onPointerDownFocus);
  containerEl.addEventListener('keydown', onKeyDownNavigate);
  containerEl.addEventListener('touchstart', onTouchStartNavigate, { passive: true });
  containerEl.addEventListener('touchend', onTouchEndNavigate, { passive: true });
  containerEl.addEventListener('touchcancel', onTouchCancelNavigate, { passive: true });

  const teardown = () => {
    containerEl.removeEventListener('pointerdown', onPointerDownFocus);
    containerEl.removeEventListener('keydown', onKeyDownNavigate);
    containerEl.removeEventListener('touchstart', onTouchStartNavigate);
    containerEl.removeEventListener('touchend', onTouchEndNavigate);
    containerEl.removeEventListener('touchcancel', onTouchCancelNavigate);
  };

  return {
    cancelSwipeGesture,
    teardown
  };
}
