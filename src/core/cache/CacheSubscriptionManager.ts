import { TimeState } from '../TimeEngine';
import { CacheEntry, UpdateViewCallback, OFCEventSource } from './types';

export class CacheSubscriptionManager {
  private updateViewCallbacks: UpdateViewCallback[] = [];
  private timeTickCallbacks: ((state: TimeState) => void)[] = [];

  public updateQueue: { toRemove: Set<string>; toAdd: Map<string, CacheEntry> } = {
    toRemove: new Set(),
    toAdd: new Map()
  };

  public clearUpdateQueue(): void {
    this.updateQueue.toRemove.clear();
    this.updateQueue.toAdd.clear();
  }

  /**
   * Register a callback.
   */
  on(eventType: 'update', callback: UpdateViewCallback): UpdateViewCallback;
  on(eventType: 'time-tick', callback: (state: TimeState) => void): (state: TimeState) => void;
  on(
    eventType: 'update' | 'time-tick',
    callback: UpdateViewCallback | ((state: TimeState) => void)
  ): UpdateViewCallback | ((state: TimeState) => void) {
    switch (eventType) {
      case 'update':
        this.updateViewCallbacks.push(callback as UpdateViewCallback);
        break;
      case 'time-tick':
        this.timeTickCallbacks.push(callback as (state: TimeState) => void);
        break;
    }
    return callback;
  }

  /**
   * De-register a callback.
   */
  off(eventType: 'update', callback: UpdateViewCallback): void;
  off(eventType: 'time-tick', callback: (state: TimeState) => void): void;
  off(
    eventType: 'update' | 'time-tick',
    callback: UpdateViewCallback | ((state: TimeState) => void)
  ): void {
    switch (eventType) {
      case 'update': {
        const index = this.updateViewCallbacks.indexOf(callback as UpdateViewCallback);
        if (index > -1) {
          this.updateViewCallbacks.splice(index, 1);
        }
        break;
      }
      case 'time-tick': {
        const index = this.timeTickCallbacks.indexOf(callback as (state: TimeState) => void);
        if (index > -1) {
          this.timeTickCallbacks.splice(index, 1);
        }
        break;
      }
    }
  }

  resync(): void {
    for (const callback of this.updateViewCallbacks) {
      callback({ type: 'resync' });
    }
  }

  /**
   * Push updates to all subscribers.
   */
  private updateViews(toRemove: string[], toAdd: CacheEntry[], affectedCalendars: string[]) {
    const payload = {
      toRemove,
      toAdd,
      affectedCalendars
    };

    for (const callback of this.updateViewCallbacks) {
      callback({ type: 'events', ...payload });
    }
  }

  /**
   * Broadcast TimeEngine state to subscribers.
   */
  public broadcastTimeTick(state: TimeState): void {
    for (const cb of this.timeTickCallbacks) {
      try {
        cb(state);
      } catch (e) {
        console.error('Full Calendar: time-tick callback error', e);
      }
    }
  }

  public flushUpdateQueue(
    toRemove: string[],
    toAdd: CacheEntry[],
    affectedCalendars: string[] = [],
    onFlushStart?: () => void
  ): void {
    const combinedToRemove = new Set(toRemove);
    const combinedToAdd = new Map<string, CacheEntry>();
    const allAffectedCalendars = new Set<string>(affectedCalendars);

    for (const entry of toAdd) {
      combinedToAdd.set(entry.id, entry);
      allAffectedCalendars.add(entry.calendarId);
    }

    // Add accumulated queue items
    for (const id of this.updateQueue.toRemove) {
      combinedToRemove.add(id);
    }
    for (const [id, entry] of this.updateQueue.toAdd) {
      combinedToAdd.set(id, entry);
      allAffectedCalendars.add(entry.calendarId);
    }

    if (onFlushStart) {
      onFlushStart();
    }
    this.clearUpdateQueue();

    if (combinedToRemove.size > 0 || combinedToAdd.size > 0 || allAffectedCalendars.size > 0) {
      this.updateViews(
        [...combinedToRemove],
        [...combinedToAdd.values()],
        Array.from(allAffectedCalendars)
      );
    }
  }

  public updateCalendar(calendar: OFCEventSource) {
    for (const callback of this.updateViewCallbacks) {
      callback({ type: 'calendar', calendar });
    }
  }
}
