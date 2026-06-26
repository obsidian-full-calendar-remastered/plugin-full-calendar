import { showNotice } from '../utils/showNotice';
import { PluginState } from '../core/PluginState';
import {
  EventFilterSortEngine,
  QueryableEvent,
  EventFilterCriteria,
  EventSortCriteria
} from '../core/EventFilterSortEngine';
import type { EventSourceInput } from '@fullcalendar/core';
import type { ViewConfig } from '../features/codeblock/CodeBlockProcessor';
import { getEventSources as helperGetEventSources } from '../features/codeblock/CodeBlockQueryHelper';
import type { Calendar } from '@fullcalendar/core';
import type { CalendarView } from '../ui/view';
import { EventLocation, OFCEvent } from '../types';
import { launchCreateModal } from '../ui/modals/event_modal';

export type ApiEventDetails = {
  event: OFCEvent;
  calendarId: string;
  location: EventLocation | null;
} | null;

/**
 * The internal API that actually holds state and performs actions.
 * This is never exposed directly on the plugin object.
 */
export class InternalAPI {
  #activeViews: Set<CalendarView> = new Set();

  public registerView(view: CalendarView) {
    this.#activeViews.add(view);
  }

  public unregisterView(view: CalendarView) {
    this.#activeViews.delete(view);
  }

  #getActiveCalendar(): Calendar | null {
    for (const view of this.#activeViews) {
      if (view.fullCalendarView) {
        return view.fullCalendarView;
      }
    }
    return null;
  }

  public async openCalendar(): Promise<void> {
    const plugin = PluginState.getPlugin();
    const { FULL_CALENDAR_VIEW_TYPE } = await import('../ui/view');
    const leaves = plugin.app.workspace
      .getLeavesOfType(FULL_CALENDAR_VIEW_TYPE)
      .filter(l => (l.view as CalendarView).inSidebar === false);
    if (leaves.length === 0) {
      const leaf = plugin.app.workspace.getLeaf('tab');
      await leaf.setViewState({
        type: FULL_CALENDAR_VIEW_TYPE,
        active: true
      });
    } else {
      await Promise.all(leaves.map(l => (l.view as CalendarView).onOpen()));
    }
  }

  public async openSidebar(): Promise<void> {
    const plugin = PluginState.getPlugin();
    const { FULL_CALENDAR_SIDEBAR_VIEW_TYPE } = await import('../ui/view');
    if (plugin.app.workspace.getLeavesOfType(FULL_CALENDAR_SIDEBAR_VIEW_TYPE).length) {
      return;
    }
    const targetLeaf = plugin.app.workspace.getRightLeaf(false);
    if (targetLeaf) {
      await targetLeaf.setViewState({
        type: FULL_CALENDAR_SIDEBAR_VIEW_TYPE
      });
      await plugin.app.workspace.revealLeaf(targetLeaf);
    } else {
      console.warn('Right leaf not found for calendar view!');
    }
  }

  public async changeView(viewName: string): Promise<void> {
    let calendar = this.#getActiveCalendar();
    if (!calendar) {
      await this.openCalendar();
      await new Promise(resolve => window.setTimeout(resolve, 100));
      calendar = this.#getActiveCalendar();
    }

    if (calendar) {
      calendar.changeView(viewName);
    } else {
      showNotice('Failed to find active calendar view.');
    }
  }

  public openCreateModal(initialData?: Partial<OFCEvent>): void {
    launchCreateModal(PluginState.getPlugin(), initialData || {});
  }

  public getAllEvents() {
    return PluginState.getCache().getAllEvents();
  }

  public getEventById(id: string): OFCEvent | null {
    return PluginState.getCache().getEventById(id);
  }

  public getEventDetails(id: string): ApiEventDetails {
    return PluginState.getCache().store.getEventDetails(id) as ApiEventDetails;
  }

  public getEvents(criteria: EventFilterCriteria, sorts?: EventSortCriteria[]): QueryableEvent[] {
    const allSources = PluginState.getCache().getAllEvents();
    const queryables: QueryableEvent[] = [];

    for (const source of allSources) {
      for (const event of source.events) {
        if (!event.id) continue;
        const details = this.getEventDetails(event.id);

        const q = EventFilterSortEngine.fromStoredEvent({
          id: event.id,
          event: details ? details.event : event.event,
          calendarId: details ? details.calendarId : source.id,
          location:
            details && details.location
              ? {
                  path:
                    'file' in details.location
                      ? (details.location as { file: { path: string } }).file.path
                      : (details.location as { path: string }).path,
                  lineNumber: details.location.lineNumber
                }
              : null
        });
        q.rawEvent = event;
        queryables.push(q);
      }
    }

    return EventFilterSortEngine.query(queryables, criteria, sorts);
  }

  public getEventSources(
    config: ViewConfig,
    sourcePath: string
  ): { sources: EventSourceInput[]; initialDate?: string } {
    return helperGetEventSources(config, sourcePath, this);
  }
}
