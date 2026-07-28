/**
 * @file EventCache.ts
 * @brief Centralized state management for all calendar event data.
 *
 * @description
 * The `EventCache` serves as the authoritative source for all calendar events within the plugin.
 * It is responsible for orchestrating the fetching, parsing, storing, and updating of event data
 * from all configured calendar sources (local and remote).
 *
 * @details
 * - Acts as an orchestrator for mutation, synchronization, and subscription management.
 * - Delegates core logic to CacheMutationHandler, CacheSyncHandler, and CacheSubscriptionManager.
 * - Maintains central state for the EventStore, EventEnhancer, and TimeEngine.
 *
 * @license See LICENSE.md
 */

import { PluginState } from './PluginState';
import { FullCalendarSettings } from '../types/settings';

import FullCalendarPlugin from '../main';
import EventStore, { StoredEvent } from './EventStore';
import { OFCEvent, EventLocation } from '../types';
import { CalendarProvider } from '../providers/Provider';
import { EventEnhancer } from './EventEnhancer';
import { TimeEngine, TimeState, EnrichedOFCEvent } from './TimeEngine';
import {
  EventFilterSortEngine,
  EventFilterCriteria,
  EventSortCriteria
} from './EventFilterSortEngine';

// Import refactored handlers
import { CacheSubscriptionManager } from './cache/CacheSubscriptionManager';
import { CacheSyncHandler, CacheContext } from './cache/CacheSyncHandler';
import { CacheMutationHandler, MutationContext } from './cache/CacheMutationHandler';
import { CacheEntry, UpdateViewCallback, OFCEventSource, CachedEvent } from './cache/types';
import type { MilestoneRecordOptions } from '../features/milestones/milestones';
import { LoadDebugProfiler } from '../utils/LoadDebugProfiler';

// Re-export types for backward compatibility with external modules
export type { CacheEntry, UpdateViewCallback, OFCEventSource, CachedEvent };

export default class EventCache {
  private _plugin: FullCalendarPlugin;
  private _store = new EventStore();
  private recurringEventManager:
    import('../features/recur_events/RecurringEventManager').RecurringEventManager | null = null;
  private timeEngine: TimeEngine;

  private viewConfigListener: (() => void) | null = null;
  private workspaceEmitter: import('obsidian').Workspace | null = null;

  calendars = new Map<string, CalendarProvider<unknown>>();
  initialized = false;
  public isBulkUpdating = false;
  public enhancer: EventEnhancer;

  // Internal Handlers
  private subscriptionManager: CacheSubscriptionManager;
  private syncHandler: CacheSyncHandler;
  private mutationHandler: CacheMutationHandler;

  constructor(plugin: FullCalendarPlugin) {
    this._plugin = plugin;
    this.enhancer = new EventEnhancer(PluginState.getSettings());
    this.timeEngine = new TimeEngine(this);

    // Initialize Handlers
    this.subscriptionManager = new CacheSubscriptionManager();

    const context: CacheContext = {
      store: this._store,
      enhancer: this.enhancer,
      timeEngine: this.timeEngine,
      isBulkUpdating: this.isBulkUpdating,
      setBulkUpdating: (val: boolean) => (this.isBulkUpdating = val),
      flushUpdateQueue: this.flushUpdateQueue.bind(this),
      generateId: this.generateId.bind(this),
      updateQueue: this.subscriptionManager.updateQueue
    };

    this.syncHandler = new CacheSyncHandler(context);

    const mutationContext: MutationContext = {
      ...context,
      calendars: this.calendars,
      getRecurringEventManager: this.getRecurringEventManager.bind(this),
      getProviderForEvent: this.getProviderForEvent.bind(this)
    };
    this.mutationHandler = new CacheMutationHandler(mutationContext);
  }

  // ====================================================================
  //                         LIFECYCLE & SETTINGS
  // ====================================================================

  public listenForSettingsChanges(workspace: import('obsidian').Workspace): void {
    this.workspaceEmitter = workspace;
    const emitter = workspace as unknown as {
      on: (name: string, cb: () => void) => void;
    };
    this.viewConfigListener = () => {
      void this.onSettingsChanged();
    };
    emitter.on('full-calendar:view-config-changed', this.viewConfigListener);
  }

  public stopListening(): void {
    if (this.viewConfigListener && this.workspaceEmitter) {
      const emitter = this.workspaceEmitter as unknown as {
        off: (name: string, cb: () => void) => void;
      };
      emitter.off('full-calendar:view-config-changed', this.viewConfigListener);
      this.viewConfigListener = null;
      this.workspaceEmitter = null;
    }
  }

  private async onSettingsChanged(): Promise<void> {
    await this.populate();
    this.resync();
  }

  public updateSettings(newSettings: FullCalendarSettings): void {
    this.enhancer.updateSettings(newSettings);
  }

  // ====================================================================
  //                         CACHE INITIALIZATION
  // ====================================================================

  reset(): void {
    this.initialized = false;
    this.timeEngine.stop();
    const infos = PluginState.getProviderRegistry().getAllSources();
    this.calendars.clear();
    this._store.clear();
    this.subscriptionManager.clearUpdateQueue();

    infos.forEach(info => {
      const settingsId = info.id;
      if (!settingsId) {
        console.warn('Full Calendar: Calendar source is missing an ID.', info);
        return;
      }
      // CORRECTED: Get the pre-initialized INSTANCE for this source ID.
      const instance = PluginState.getProviderRegistry().getInstance(settingsId);
      if (instance) {
        this.calendars.set(settingsId, instance);
      } else {
        console.warn(
          `Full Calendar: Provider instance for source ID "${settingsId}" not found during cache reset.`
        );
      }
    });
  }

  /**
   * Populate the cache with events from all sources.
   */
  async populate(): Promise<void> {
    LoadDebugProfiler.startPopulate();
    try {
      await PluginState.getProviderRegistry().fetchAllByPriority(
        async (calendarId, eventsForSync) => {
          await this.syncCalendar(calendarId, eventsForSync);
        },
        async () => {
          // This callback runs when STAGE 1 is complete.
          // Trigger initial sync/render and map building.
          LoadDebugProfiler.startPhase('TimeEngine Setup & Map Building');
          try {
            this.initialized = true;
            PluginState.getProviderRegistry().buildMap(this._store);
            this.resync();
            await this.timeEngine.start();
          } finally {
            LoadDebugProfiler.endPhase('TimeEngine Setup & Map Building');
          }
        }
      );
    } finally {
      LoadDebugProfiler.endPopulate();
    }
  }

  // ====================================================================
  //                         IDENTIFIER MANAGEMENT
  // ====================================================================

  generateId(): string {
    return PluginState.getProviderRegistry().generateId();
  }

  public getGlobalIdentifier(event: OFCEvent, calendarId: string): string | null {
    return PluginState.getProviderRegistry().getGlobalIdentifier(event, calendarId);
  }

  public async getSessionId(globalIdentifier: string): Promise<string | null> {
    return PluginState.getProviderRegistry().getSessionId(globalIdentifier);
  }

  // ====================================================================
  //                         PUBLIC API - EVENT QUERIES
  // ====================================================================

  /**
   * Scans the event store and returns a list of all unique category names.
   * This is used to populate autocomplete suggestions in the UI.
   */
  getAllCategories(): string[] {
    const categories = new Set<string>();
    // Note: We need a way to iterate all events in the store.
    // Let's add a simple iterator to EventStore for this.
    for (const storedEvent of this._store.getAllEvents()) {
      if (storedEvent.event.category) {
        categories.add(storedEvent.event.category);
      }
    }
    return Array.from(categories).sort();
  }

  /**
   * Get all events from the cache in a FullCalendar-friendly format.
   * @returns EventSourceInputs for FullCalendar.
   */
  getAllEvents(): OFCEventSource[] {
    const result: OFCEventSource[] = [];
    const eventsByCalendar = this._store.eventsByCalendar;
    for (const [calId, provider] of this.calendars.entries()) {
      const events = eventsByCalendar.get(calId) || [];
      const calendarInfo = PluginState.getProviderRegistry().getSource(calId);
      if (!calendarInfo) continue;
      const capabilities = provider.getCapabilities();
      const editable = capabilities.canCreate || capabilities.canEdit || capabilities.canDelete;
      result.push({
        editable,
        events: events.map(({ event, id }) => ({ event, id })),
        color: calendarInfo.color,
        id: calId
      });
    }
    return result;
  }

  /**
   * Check if an event is part of an editable calendar.
   * @param id ID of event to check
   * @returns
   */
  isEventEditable(id: string): boolean {
    const details = this._store.getEventDetails(id);
    if (!details) return false;
    const provider = this.calendars.get(details.calendarId);
    if (!provider) return false;
    const calendarInfo = PluginState.getProviderRegistry().getSource(details.calendarId);
    if (!calendarInfo) return false;
    const capabilities = provider.getCapabilities();
    return capabilities.canCreate || capabilities.canEdit || capabilities.canDelete;
  }

  getEventById(s: string): OFCEvent | null {
    return this._store.getEventById(s);
  }

  getCalendarById(c: string): CalendarProvider<unknown> | undefined {
    return this.calendars.get(c);
  }

  // ====================================================================
  //                         PUBLIC API - EVENT MUTATIONS
  // ====================================================================

  /**
   * Add an event to a given calendar.
   * @param calendarId ID of calendar to add event to.
   * @param event Event details
   * @returns Returns true if successful, false otherwise.
   */
  addEvent(
    calendarId: string,
    event: OFCEvent,
    options?: MilestoneRecordOptions
  ): Promise<boolean> {
    return this.mutationHandler.addEvent(calendarId, event, options);
  }

  deleteEvent(
    eventId: string,
    options?: MilestoneRecordOptions & { instanceDate?: string }
  ): Promise<void> {
    return this.mutationHandler.deleteEvent(eventId, options);
  }

  updateEventWithId(
    eventId: string,
    newEvent: OFCEvent,
    options?: MilestoneRecordOptions
  ): Promise<boolean> {
    return this.mutationHandler.updateEventWithId(eventId, newEvent, options);
  }

  processEvent(
    id: string,
    process: (e: OFCEvent) => OFCEvent,
    options?: { silent: boolean }
  ): Promise<boolean> {
    const event = this._store.getEventById(id);
    if (!event) throw new Error('Event does not exist');
    return this.updateEventWithId(id, process(event), options);
  }

  toggleRecurringInstance(eventId: string, instanceDate: string, isDone: boolean): Promise<void> {
    return this.mutationHandler.toggleRecurringInstance(eventId, instanceDate, isDone);
  }

  modifyRecurringInstance(
    masterEventId: string,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<void> {
    return this.mutationHandler.modifyRecurringInstance(masterEventId, instanceDate, newEventData);
  }

  moveEventToCalendar(
    eventId: string,
    newCalendarId: string,
    newEventData?: OFCEvent
  ): Promise<void> {
    return this.mutationHandler.moveEventToCalendar(eventId, newCalendarId, newEventData);
  }

  scheduleTask(taskId: string, date: Date, allDay = true): Promise<void> {
    return this.mutationHandler.scheduleTask(taskId, date, allDay);
  }

  unscheduleTaskEvent(eventId: string): Promise<void> {
    return this.mutationHandler.unscheduleTaskEvent(eventId);
  }

  validateTaskSchedule(taskId: string, date: Date): Promise<{ isValid: boolean; reason?: string }> {
    return this.mutationHandler.validateTaskSchedule(taskId, date);
  }

  // ====================================================================
  //                         VIEW SYNCHRONIZATION
  // ====================================================================

  /**
   * Register a callback.
   * Added overloads for better type inference (update vs time-tick).
   */
  on(eventType: 'update', callback: UpdateViewCallback): UpdateViewCallback;
  on(eventType: 'time-tick', callback: (state: TimeState) => void): (state: TimeState) => void;
  on(
    eventType: 'update' | 'time-tick',
    callback: UpdateViewCallback | ((state: TimeState) => void)
  ): UpdateViewCallback | ((state: TimeState) => void) {
    if (eventType === 'update') {
      return this.subscriptionManager.on(eventType, callback as UpdateViewCallback);
    }
    return this.subscriptionManager.on(eventType, callback as (state: TimeState) => void);
  }

  off(eventType: 'update', callback: UpdateViewCallback): void;
  off(eventType: 'time-tick', callback: (state: TimeState) => void): void;
  off(
    eventType: 'update' | 'time-tick',
    callback: UpdateViewCallback | ((state: TimeState) => void)
  ): void {
    if (eventType === 'update') {
      this.subscriptionManager.off(eventType, callback as UpdateViewCallback);
    } else {
      this.subscriptionManager.off(eventType, callback as (state: TimeState) => void);
    }
  }

  resync(): void {
    this.subscriptionManager.resync();
  }

  /**
   * Broadcast TimeEngine state to subscribers.
   */
  public broadcastTimeTick(state: TimeState): void {
    this.subscriptionManager.broadcastTimeTick(state);
  }

  public flushUpdateQueue(
    toRemove: string[],
    toAdd: CacheEntry[],
    affectedCalendars: string[] = []
  ): void {
    this.subscriptionManager.flushUpdateQueue(toRemove, toAdd, affectedCalendars, () => {
      this.isBulkUpdating = false;
    });
  }

  // VIEW SYNCHRONIZATION
  public updateCalendar(calendar: OFCEventSource): void {
    this.subscriptionManager.updateCalendar(calendar);
  }

  // ====================================================================
  //                         FILESYSTEM & REMOTE HOOKS
  // ====================================================================

  public async syncCalendar(
    calendarId: string,
    newRawEvents: [OFCEvent, EventLocation | null][]
  ): Promise<void> {
    await this.syncHandler.syncCalendar(calendarId, newRawEvents);
  }

  /**
   * Processes a pre-computed set of updates from a provider.
   * This is the primary method for providers to sync their state with the cache
   * in a granular, flicker-free way.
   * @param calendarId The ID of the calendar source these updates belong to.
   * @param updates A payload containing arrays of additions, updates, and deletions.
   */
  public processProviderUpdates(
    calendarId: string,
    updates: {
      additions: { event: OFCEvent; location: EventLocation | null }[];
      updates: { sessionId: string; event: OFCEvent; location: EventLocation | null }[];
      deletions: string[];
    }
  ): Promise<void> {
    return this.syncHandler.processProviderUpdates(calendarId, updates);
  }

  public syncFile(
    file: { path: string },
    newEventsWithDetails: { event: OFCEvent; location: EventLocation | null; calendarId: string }[]
  ): Promise<void> {
    return this.syncHandler.syncFile(file, newEventsWithDetails);
  }

  // ====================================================================
  //                         INTERNAL HELPERS
  // ====================================================================

  private async getRecurringEventManager(): Promise<
    import('../features/recur_events/RecurringEventManager').RecurringEventManager
  > {
    if (!this.recurringEventManager) {
      const { RecurringEventManager } =
        await import('../features/recur_events/RecurringEventManager');
      this.recurringEventManager = new RecurringEventManager(this, this._plugin);
    }
    return this.recurringEventManager;
  }

  private getProviderForEvent(eventId: string) {
    const details = this._store.getEventDetails(eventId);
    if (!details) throw new Error(`Event ID ${eventId} not present in event store.`);
    const { calendarId, location, event } = details;
    const provider = this.calendars.get(calendarId);
    if (!provider) {
      throw new Error(`Provider for calendar ID ${calendarId} not found in cache map.`);
    }
    const calendarInfo = PluginState.getProviderRegistry().getSource(calendarId);
    if (!calendarInfo) throw new Error(`CalendarInfo for calendar ID ${calendarId} not found.`);
    return { provider, location, event };
  }

  // ====================================================================
  //                         GETTERS & SETTERS
  // ====================================================================

  /**
   * Centralized filtering and sorting of stored events.
   */
  public queryEvents(criteria: EventFilterCriteria, sorts?: EventSortCriteria[]): StoredEvent[] {
    const allQueryable = this._store.getAllEvents().map(stored =>
      EventFilterSortEngine.fromStoredEvent(stored, calId => {
        const source = PluginState.getProviderRegistry().getSource(calId);
        return source?.name || '';
      })
    );
    const queryResults = EventFilterSortEngine.query(allQueryable, criteria, sorts);
    const resultMap = new Map(queryResults.map(q => [q.id, q]));
    return this._store.getAllEvents().filter(stored => resultMap.has(stored.id));
  }

  /**
   * Centralized filtering and sorting of event occurrences.
   */
  public queryOccurrences(
    criteria: EventFilterCriteria,
    sorts?: EventSortCriteria[]
  ): EnrichedOFCEvent[] {
    const occurrences = this.getOccurrenceCache();
    const allQueryable = occurrences.map(occ =>
      EventFilterSortEngine.fromEnrichedEvent(occ, calId => {
        const source = PluginState.getProviderRegistry().getSource(calId);
        return source?.name || '';
      })
    );
    const queryResults = EventFilterSortEngine.query(allQueryable, criteria, sorts);
    const resultMap = new Map(queryResults.map(q => [q.id, q]));
    return occurrences.filter(occ => resultMap.has(occ.id));
  }

  public getOccurrenceCache(): EnrichedOFCEvent[] {
    return this.timeEngine.getOccurrenceCache();
  }

  get plugin(): FullCalendarPlugin {
    return this._plugin;
  }

  get store(): EventStore {
    return this._store;
  }

  get updateQueue() {
    return this.subscriptionManager.updateQueue;
  }

  set updateQueue(val) {
    this.subscriptionManager.updateQueue = val;
  }

  get _storeForTest() {
    return this._store;
  }
}
