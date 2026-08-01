import { PluginState } from '../PluginState';
import { OFCEvent, EventLocation } from '../../types';
import EventStore from '../EventStore';
import { EventEnhancer } from '../EventEnhancer';
import { TimeEngine } from '../TimeEngine';
import { CacheEntry } from './types';
import { LoadDebugProfiler } from '../../utils/LoadDebugProfiler';
import { areEventsEqual } from './areEventsEqual';

export interface CacheContext {
  store: EventStore;
  enhancer: EventEnhancer;
  timeEngine: TimeEngine;
  isBulkUpdating: boolean;
  setBulkUpdating: (val: boolean) => void;
  flushUpdateQueue: (toRemove: string[], toAdd: CacheEntry[], affectedCalendars?: string[]) => void;
  generateId: () => string;
  updateQueue: { toRemove: Set<string>; toAdd: Map<string, CacheEntry> };
}

import { yieldIfFrameBudgetExceeded } from '../../utils/async';

export class CacheSyncHandler {
  constructor(private ctx: CacheContext) {}

  public async syncCalendar(
    calendarId: string,
    newRawEvents: [OFCEvent, EventLocation | null][]
  ): Promise<void> {
    if (this.ctx.isBulkUpdating) {
      return;
    }
    LoadDebugProfiler.startPhase('Cache Delta Sync & Indexing');
    try {
      // 1. Get OLD state from the store for this calendar.
      const oldEventsInCalendar = this.ctx.store.getEventsInCalendar(calendarId);

      // 2. ENHANCE the new raw events with 5ms frame budget yielding.
      const newEnhancedEvents: {
        event: OFCEvent;
        location: EventLocation | null;
        calendarId: string;
      }[] = [];

      let frameStart = performance.now();
      for (const [rawEvent, location] of newRawEvents) {
        newEnhancedEvents.push({
          event: this.ctx.enhancer.enhance(rawEvent),
          location,
          calendarId
        });
        if (performance.now() - frameStart >= 6) {
          frameStart = await yieldIfFrameBudgetExceeded(frameStart, 6);
        }
      }

      // 3. Build keyed maps for old and new events using cheap sync keys (O(N), no I/O).
      const oldByKey = new Map<string, { event: OFCEvent; id: string; calendarId: string }>();
      for (const oldEvent of oldEventsInCalendar) {
        const key = PluginState.getProviderRegistry().computeSyncKeyForEvent(
          oldEvent.event,
          calendarId
        );
        if (key) {
          oldByKey.set(key, oldEvent);
        }
        if (performance.now() - frameStart >= 6) {
          frameStart = await yieldIfFrameBudgetExceeded(frameStart, 6);
        }
      }

      const newByKey = new Map<
        string,
        { event: OFCEvent; location: EventLocation | null; calendarId: string }
      >();
      for (let i = 0; i < newEnhancedEvents.length; i++) {
        const newEvent = newEnhancedEvents[i];
        const key = PluginState.getProviderRegistry().computeSyncKeyForEvent(
          newEvent.event,
          newEvent.calendarId
        );
        if (key) {
          newByKey.set(key, newEvent);
        }
        if (performance.now() - frameStart >= 6) {
          frameStart = await yieldIfFrameBudgetExceeded(frameStart, 6);
        }
      }

      // 4. Compute the delta via three-way set comparison.
      const idsToRemove: string[] = [];
      const eventsToAdd: {
        event: OFCEvent;
        id: string;
        location: EventLocation | null;
        calendarId: string;
      }[] = [];
      let hasChanges = false;

      // 4a. Removed events: old keys not present in new set.
      for (const [key, oldEvent] of oldByKey) {
        if (!newByKey.has(key)) {
          idsToRemove.push(oldEvent.id);
          PluginState.getProviderRegistry().removeMapping(oldEvent.id);
          this.ctx.store.delete(oldEvent.id);
          hasChanges = true;
        }
        if (performance.now() - frameStart >= 6) {
          frameStart = await yieldIfFrameBudgetExceeded(frameStart, 6);
        }
      }

      // 4b. Added events: new keys not present in old set.
      for (const [key, newEvent] of newByKey) {
        if (!oldByKey.has(key)) {
          const newSessionId = PluginState.getProviderRegistry().generateId();
          PluginState.getProviderRegistry().addMapping(
            newEvent.event,
            newEvent.calendarId,
            newSessionId
          );
          this.ctx.store.add({
            calendarId: newEvent.calendarId,
            location: newEvent.location,
            id: newSessionId,
            event: newEvent.event
          });
          eventsToAdd.push({
            event: newEvent.event,
            location: newEvent.location,
            calendarId: newEvent.calendarId,
            id: newSessionId
          });
          hasChanges = true;
        }
        if (performance.now() - frameStart >= 6) {
          frameStart = await yieldIfFrameBudgetExceeded(frameStart, 6);
        }
      }

      // 4c. Unchanged keys: reuse session IDs. Check for data changes within same identity.
      for (const [key, oldEvent] of oldByKey) {
        const newEvent = newByKey.get(key);
        if (newEvent) {
          if (!areEventsEqual(oldEvent.event, newEvent.event)) {
            // Data changed but identity is the same — update in-place, reuse session ID.
            this.ctx.store.delete(oldEvent.id);
            this.ctx.store.add({
              calendarId: newEvent.calendarId,
              location: newEvent.location,
              id: oldEvent.id,
              event: newEvent.event
            });
            // Re-map in case the global identifier changed (e.g. title changed).
            PluginState.getProviderRegistry().removeMapping(oldEvent.id);
            PluginState.getProviderRegistry().addMapping(
              newEvent.event,
              newEvent.calendarId,
              oldEvent.id
            );
            // Queue UI update for this event (remove old rendering, add new).
            idsToRemove.push(oldEvent.id);
            eventsToAdd.push({
              event: newEvent.event,
              location: newEvent.location,
              calendarId: newEvent.calendarId,
              id: oldEvent.id
            });
            hasChanges = true;
          }
        }
        if (performance.now() - frameStart >= 6) {
          frameStart = await yieldIfFrameBudgetExceeded(frameStart, 6);
        }
      }

      if (!hasChanges) {
        return;
      }

      // 5. Notify the UI with only the delta.
      const cacheEntriesToAdd = eventsToAdd.map(({ event, id, calendarId }) => ({
        event,
        id,
        calendarId
      }));
      this.ctx.flushUpdateQueue(idsToRemove, cacheEntriesToAdd, [calendarId]);
      this.ctx.timeEngine.scheduleCacheRebuild();
    } finally {
      LoadDebugProfiler.endPhase('Cache Delta Sync & Indexing');
    }
  }

  public processProviderUpdates(
    calendarId: string,
    updates: {
      additions: { event: OFCEvent; location: EventLocation | null }[];
      updates: { sessionId: string; event: OFCEvent; location: EventLocation | null }[];
      deletions: string[];
    }
  ): Promise<void> {
    const { additions, updates: updateArr, deletions } = updates;

    // If there are no changes, exit early.
    if (additions.length === 0 && updateArr.length === 0 && deletions.length === 0) {
      return Promise.resolve();
    }

    this.ctx.setBulkUpdating(true);
    try {
      // 1. Handle Deletions
      for (const sessionId of deletions) {
        const event = this.ctx.store.getEventById(sessionId);
        if (event) {
          PluginState.getProviderRegistry().removeMapping(sessionId);
          this.ctx.store.delete(sessionId);
          this.ctx.updateQueue.toRemove.add(sessionId);
        }
      }

      // 2. Handle Additions
      for (const { event: rawEvent, location } of additions) {
        const event = this.ctx.enhancer.enhance(rawEvent);
        const newSessionId = this.ctx.generateId();
        this.ctx.store.add({ calendarId, location, id: newSessionId, event });
        PluginState.getProviderRegistry().addMapping(event, calendarId, newSessionId);
        this.ctx.updateQueue.toAdd.set(newSessionId, { event, id: newSessionId, calendarId });
      }

      // 3. Handle Updates
      for (const { sessionId, event: rawEvent, location } of updateArr) {
        const event = this.ctx.enhancer.enhance(rawEvent);
        const oldEvent = this.ctx.store.getEventById(sessionId);
        if (oldEvent) {
          PluginState.getProviderRegistry().removeMapping(sessionId);
          this.ctx.store.delete(sessionId);
          this.ctx.store.add({ calendarId, location, id: sessionId, event });
          PluginState.getProviderRegistry().addMapping(event, calendarId, sessionId);
        }
        // For FullCalendar's view, an update is a remove + add.
        this.ctx.updateQueue.toRemove.add(sessionId);
        this.ctx.updateQueue.toAdd.set(sessionId, { event, id: sessionId, calendarId });
      }
    } finally {
      this.ctx.setBulkUpdating(false);
      this.ctx.flushUpdateQueue([], [], [calendarId]); // This processes the .toAdd and .toRemove queues.
      this.ctx.timeEngine.scheduleCacheRebuild();
    }
    return Promise.resolve();
  }

  public syncFile(
    file: { path: string },
    newEventsWithDetails: { event: OFCEvent; location: EventLocation | null; calendarId: string }[]
  ): Promise<void> {
    if (this.ctx.isBulkUpdating) {
      return Promise.resolve();
    }

    // 1. Get OLD state from the store for this specific file.
    const oldEventsInFile = this.ctx.store.getEventsInFile(file);

    // 2. ENHANCE the new raw events from the provider.
    const newEnhancedEvents = newEventsWithDetails.map(({ event, location, calendarId }) => ({
      event: this.ctx.enhancer.enhance(event),
      location,
      calendarId
    }));

    // 3. Build keyed maps for old and new events using cheap sync keys.
    const oldByKey = new Map<string, { event: OFCEvent; id: string; calendarId: string }>();
    for (const oldEvent of oldEventsInFile) {
      const key = PluginState.getProviderRegistry().computeSyncKeyForEvent(
        oldEvent.event,
        oldEvent.calendarId
      );
      if (key) {
        oldByKey.set(key, oldEvent);
      }
    }

    const newByKey = new Map<
      string,
      { event: OFCEvent; location: EventLocation | null; calendarId: string }
    >();
    for (const newEvent of newEnhancedEvents) {
      const key = PluginState.getProviderRegistry().computeSyncKeyForEvent(
        newEvent.event,
        newEvent.calendarId
      );
      if (key) {
        newByKey.set(key, newEvent);
      }
    }

    // 4. Compute the delta via three-way set comparison.
    const idsToRemove: string[] = [];
    const eventsToAdd: {
      event: OFCEvent;
      id: string;
      location: EventLocation | null;
      calendarId: string;
    }[] = [];
    let hasChanges = false;

    // 4a. Removed events.
    for (const [key, oldEvent] of oldByKey) {
      if (!newByKey.has(key)) {
        idsToRemove.push(oldEvent.id);
        PluginState.getProviderRegistry().removeMapping(oldEvent.id);
        this.ctx.store.delete(oldEvent.id);
        hasChanges = true;
      }
    }

    // 4b. Added events.
    for (const [key, newEvent] of newByKey) {
      if (!oldByKey.has(key)) {
        const newSessionId = PluginState.getProviderRegistry().generateId();
        PluginState.getProviderRegistry().addMapping(
          newEvent.event,
          newEvent.calendarId,
          newSessionId
        );
        this.ctx.store.add({
          calendarId: newEvent.calendarId,
          location: newEvent.location,
          id: newSessionId,
          event: newEvent.event
        });
        eventsToAdd.push({
          event: newEvent.event,
          location: newEvent.location,
          calendarId: newEvent.calendarId,
          id: newSessionId
        });
        hasChanges = true;
      }
    }

    // 4c. Unchanged keys: reuse session IDs, check for data changes.
    for (const [key, oldEvent] of oldByKey) {
      const newEvent = newByKey.get(key);
      if (newEvent) {
        if (JSON.stringify(oldEvent.event) !== JSON.stringify(newEvent.event)) {
          this.ctx.store.delete(oldEvent.id);
          this.ctx.store.add({
            calendarId: newEvent.calendarId,
            location: newEvent.location,
            id: oldEvent.id,
            event: newEvent.event
          });
          PluginState.getProviderRegistry().removeMapping(oldEvent.id);
          PluginState.getProviderRegistry().addMapping(
            newEvent.event,
            newEvent.calendarId,
            oldEvent.id
          );
          idsToRemove.push(oldEvent.id);
          eventsToAdd.push({
            event: newEvent.event,
            location: newEvent.location,
            calendarId: newEvent.calendarId,
            id: oldEvent.id
          });
          hasChanges = true;
        }
      }
    }

    if (!hasChanges) {
      return Promise.resolve();
    }

    const affectedCalendars = new Set<string>();
    for (const oldEvent of oldEventsInFile) {
      affectedCalendars.add(oldEvent.calendarId);
    }
    for (const newEvent of newEventsWithDetails) {
      affectedCalendars.add(newEvent.calendarId);
    }

    // 5. Notify the UI with only the delta.
    const cacheEntriesToAdd = eventsToAdd.map(({ event, id, calendarId }) => ({
      event,
      id,
      calendarId
    }));
    this.ctx.flushUpdateQueue(idsToRemove, cacheEntriesToAdd, Array.from(affectedCalendars));
    this.ctx.timeEngine.scheduleCacheRebuild();
    return Promise.resolve();
  }
}
