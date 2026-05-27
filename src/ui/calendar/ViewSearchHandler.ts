import { EventApi } from '@fullcalendar/core';
import { PluginState } from '../../core/PluginState';
import { ViewContext } from './ViewContext';
import { EventFilterSortEngine, QueryableEvent } from '../../core/EventFilterSortEngine';

export class ViewSearchHandler {
  public eventSearchQuery = '';
  private eventDisplayById = new Map<string, string>();
  private pendingSearchApplyFrame: number | null = null;

  constructor(private ctx: ViewContext) {}

  public clearCaches(): void {
    this.eventDisplayById.clear();
  }

  public scheduleApplyFilter(): void {
    if (this.pendingSearchApplyFrame !== null) {
      cancelAnimationFrame(this.pendingSearchApplyFrame);
    }

    this.pendingSearchApplyFrame = window.requestAnimationFrame(() => {
      this.pendingSearchApplyFrame = null;
      this.applyEventSearchFilter();
    });
  }

  public applyEventSearchFilter(): void {
    const fullCalendarView = this.ctx.fullCalendarView;
    if (!fullCalendarView) {
      return;
    }

    const trimmedQuery = this.eventSearchQuery.trim();
    const events = fullCalendarView.getEvents();
    if (events.length === 0) {
      return;
    }

    const visibilityById = new Map<string, boolean>();

    if (!trimmedQuery) {
      events.forEach(event => {
        visibilityById.set(event.id, true);
      });
    } else {
      for (const event of events) {
        if (event.extendedProps.isShadow) {
          continue;
        }

        const details = PluginState.getCache().store.getEventDetails(event.id);
        const queryable: QueryableEvent = {
          id: event.id,
          title: details?.event.title || event.title || '',
          category: details?.event.category || '',
          subCategory: details?.event.subCategory || '',
          description: details?.event.description || '',
          filePath: details?.location?.path || ''
        };

        const isMatch = EventFilterSortEngine.matchEvent(queryable, {
          textSearch: { query: this.eventSearchQuery, mode: 'default' }
        });
        visibilityById.set(event.id, isMatch);
      }
    }

    fullCalendarView.batchRendering(() => {
      for (const event of events) {
        if (event.extendedProps.isShadow) {
          const originalId = event.extendedProps.originalEventId as string | undefined;
          const isVisible = originalId ? (visibilityById.get(originalId) ?? true) : true;
          this.setEventVisibility(event, isVisible);
          continue;
        }

        this.setEventVisibility(event, visibilityById.get(event.id) ?? true);
      }
    });
  }

  private setEventVisibility(event: EventApi, shouldShow: boolean): void {
    if (!this.eventDisplayById.has(event.id)) {
      this.eventDisplayById.set(event.id, event.display || 'auto');
    }

    if (!shouldShow) {
      if (event.display !== 'none') {
        event.setProp('display', 'none');
      }
      return;
    }

    const originalDisplay = this.eventDisplayById.get(event.id) || 'auto';
    if (event.display !== originalDisplay) {
      event.setProp('display', originalDisplay);
    }
  }

  public onunload(): void {
    if (this.pendingSearchApplyFrame !== null) {
      cancelAnimationFrame(this.pendingSearchApplyFrame);
      this.pendingSearchApplyFrame = null;
    }
    this.clearCaches();
  }
}
