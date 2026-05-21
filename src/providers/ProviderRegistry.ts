import { showNotice } from '../utils/showNotice';
import { PluginState } from '../core/PluginState';
import { TFile } from 'obsidian';
import {
  CalendarProvider,
  CalendarProviderCapabilities,
  SyncKeyProvider,
  CanonicalTitleProvider,
  ProviderLoadRetryPolicy
} from '../providers/Provider';
import { CalendarInfo, EventLocation, OFCEvent } from '../types';
import EventCache from '../core/EventCache';
import FullCalendarPlugin from '../main';
import { ObsidianIO, ObsidianInterface } from '../ObsidianAdapter';
import { TasksBacklogManager } from './tasks/TasksBacklogManager';
import { t } from '../features/i18n/i18n';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const MILLICONDS_BETWEEN_REVALIDATIONS = 5 * MINUTE;

// Keep the constructor signature broad: each provider has its own config
// shape, but all concrete configs extend the validated CalendarInfo payload
// loaded from settings. Using CalendarInfo here preserves flexibility for
// dynamic imports without resorting to `any`.
export type CalendarProviderClass = new (
  config: CalendarInfo,
  plugin: FullCalendarPlugin,
  app?: ObsidianInterface
) => CalendarProvider<unknown>;

type ProviderLoader = () => Promise<Record<string, unknown>>;

export class ProviderRegistry {
  /**
   * Triggers a refresh of any open Tasks Backlog views.
   * This is called by the Tasks provider when its internal data changes.
   */
  public refreshBacklogViews(): void {
    if (this.tasksBacklogManager.getIsLoaded()) {
      this.tasksBacklogManager.refreshViews();
    }
  }
  private providers = new Map<string, ProviderLoader>();
  private instances = new Map<string, CalendarProvider<unknown>>();
  private sources: CalendarInfo[] = [];
  private providerRetryTimers = new Map<string, number>();
  private providerRetryAttempts = new Map<string, number>();

  // Properties from IdentifierManager and for linking singletons
  private plugin: FullCalendarPlugin;
  private cache: EventCache | null = null;
  private pkCounter = 0;
  private identifierToSessionIdMap: Map<string, string> = new Map();
  private sessionIdToIdentifierMap: Map<string, string> = new Map();
  private identifierMapPromise: Promise<void> | null = null;

  // Tasks backlog manager for lifecycle management
  private tasksBacklogManager: TasksBacklogManager;

  private normalizePersistentId(id: string): string {
    return id.replace(/\\/g, '/');
  }

  private resolveSessionIdFromStoreFallback(
    calendarId: string,
    persistentId: string,
    eventHint?: OFCEvent
  ): string | null {
    if (!this.cache) {
      return null;
    }

    const normalizedPersistentId = this.normalizePersistentId(persistentId);
    const normalizedEventUid = eventHint?.uid ? this.normalizePersistentId(eventHint.uid) : null;

    const eventsInCalendar = this.cache.store.getEventsInCalendar(calendarId);

    const byPersistentId = eventsInCalendar.find(stored => {
      const uid = stored.event.uid ? this.normalizePersistentId(stored.event.uid) : null;
      const locationPath = stored.location?.path
        ? this.normalizePersistentId(stored.location.path)
        : null;
      return uid === normalizedPersistentId || locationPath === normalizedPersistentId;
    });

    if (byPersistentId) {
      return byPersistentId.id;
    }

    if (normalizedEventUid) {
      const byEventUid = eventsInCalendar.find(stored => {
        const uid = stored.event.uid ? this.normalizePersistentId(stored.event.uid) : null;
        return uid === normalizedEventUid;
      });
      if (byEventUid) {
        return byEventUid.id;
      }
    }

    return null;
  }

  private repairMappingFromStore(calendarId: string, sessionId: string): void {
    if (!this.cache) {
      return;
    }

    const details = this.cache.store.getEventDetails(sessionId);
    if (!details) {
      return;
    }

    this.addMapping(details.event, calendarId, sessionId);
  }

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
    this.tasksBacklogManager = new TasksBacklogManager(plugin);
    // initializeInstances is now called from main.ts after settings are loaded.
  }

  private teardownInstance(settingsId: string, instance: CalendarProvider<unknown>): void {
    const teardownFn = (instance as unknown as { teardown?: () => void }).teardown;
    if (typeof teardownFn !== 'function') {
      return;
    }

    try {
      teardownFn.call(instance);
    } catch {
      // Ignore teardown errors during provider lifecycle transitions.
    }
  }

  private teardownAllInstances(): void {
    for (const [settingsId, instance] of this.instances.entries()) {
      this.teardownInstance(settingsId, instance);
    }
  }

  // Register all built-in providers in one call
  public registerBuiltInProviders(): void {
    this.register('local', () => import('./fullnote/FullNoteProvider'));
    this.register('dailynote', () => import('./dailynote/DailyNoteProvider'));
    this.register('ical', () => import('./ics/ICSProvider'));
    this.register('caldav', () => import('./caldav/CalDAVProvider'));
    this.register('google', () => import('./google/GoogleProvider'));
    this.register('outlook', () => import('./outlook/OutlookProvider'));
    this.register('tasks', () => import('./tasks/TasksPluginProvider'));
    this.register('tasknotes', () => import('./tasknotes/TaskNotesProvider'));
    this.register('bases', () => import('./bases/BasesProvider'));
  }

  public register(type: string, loader: ProviderLoader): void {
    if (this.providers.has(type)) {
      console.warn(`Provider loader for type "${type}" is already registered. Overwriting.`);
    }
    this.providers.set(type, loader);
  }

  // Method to link cache
  public setCache(cache: EventCache): void {
    this.cache = cache;
  }

  public updateSources(newSources: CalendarInfo[]): void {
    this.sources = [...newSources];
    // Instances will be re-initialized from main.ts
  }

  public getSource(id: string): CalendarInfo | undefined {
    return this.sources.find(s => s.id === id);
  }

  public getAllSources(): CalendarInfo[] {
    return [...this.sources];
  }

  public getConfig(id: string): Record<string, unknown> | undefined {
    const source = this.getSource(id);
    if (!source) return undefined;
    if ('config' in source) {
      const config = (source as Record<string, unknown>).config;
      return typeof config === 'object' && config !== null
        ? (config as Record<string, unknown>)
        : undefined;
    }
    return undefined;
  }

  public async getProviderForType(type: string): Promise<CalendarProviderClass | undefined> {
    const loader = this.providers.get(type);
    if (!loader) {
      console.error(`Full Calendar: No provider loader found for type "${type}".`);
      return undefined;
    }
    try {
      const module = await loader();
      const ProviderClass = Object.values(module).find(
        (exported: unknown): exported is CalendarProviderClass =>
          typeof exported === 'function' && (exported as { type?: string }).type === type
      );

      if (!ProviderClass) {
        console.error(
          `Full Calendar: Could not find a provider class with type "${type}" in the loaded module.`
        );
        return undefined;
      }
      return ProviderClass;
    } catch (err) {
      console.error(`Full Calendar: Error loading provider for type "${type}".`, err);
      return undefined;
    }
  }

  public async addInstance(source: CalendarInfo): Promise<void> {
    const settingsId = source.id;
    if (!settingsId || this.instances.has(settingsId)) {
      return; // Do nothing if ID is missing or instance already exists.
    }

    const ProviderClass = await this.getProviderForType(source.type);
    if (ProviderClass) {
      const app = new ObsidianIO(this.plugin.app);
      const instance = new ProviderClass(source, this.plugin, app);
      this.instances.set(settingsId, instance);
      // Also update the internal sources list to keep it in sync.
      this.sources.push(source);

      // Call initialize() if provider supports it
      if (instance.initialize) {
        instance.initialize();
      }

      // Fetch events from the newly added provider and add them to cache
      if (this.cache && this.cache.initialized) {
        try {
          const rawEvents = await instance.getEvents();

          // Add events to cache
          for (const [rawEvent, location] of rawEvents) {
            const event = this.cache.enhancer.enhance(rawEvent);
            const id = this.generateId();
            this.cache.store.add({
              calendarId: settingsId,
              location,
              id,
              event
            });
            this.addMapping(event, settingsId, id);
          }

          // Add the provider to cache.calendars so getAllEvents() can see it
          this.cache.calendars.set(settingsId, instance);

          // Trigger cache resync to update UI
          this.cache.resync();
        } catch (error) {
          console.error(`Full Calendar: Failed to fetch events from new provider:`, error);
        }
      }
    }
  }

  public async initializeInstances(): Promise<void> {
    for (const timer of this.providerRetryTimers.values()) {
      window.clearTimeout(timer);
    }
    this.providerRetryTimers.clear();
    this.providerRetryAttempts.clear();

    const sources = PluginState.getSettings().calendarSources;
    const newInstances = new Map<string, CalendarProvider<unknown>>();

    for (const source of sources) {
      const settingsId = source.id;
      if (!settingsId) {
        console.warn('Full Calendar: Calendar source is missing an ID.', source);
        continue;
      }

      const ProviderClass = await this.getProviderForType(source.type);

      if (ProviderClass) {
        const app = new ObsidianIO(this.plugin.app);
        // Provider constructor accepts loosely typed config; pass source directly
        const instance = new ProviderClass(source, this.plugin, app);
        newInstances.set(settingsId, instance);
      }
    }

    // Safely teardown old instances and swap to the new ones in one synchronous block
    // after all asynchronous dynamic imports and instantiations have successfully completed.
    this.teardownAllInstances();
    this.instances.clear();
    for (const [key, val] of newInstances.entries()) {
      this.instances.set(key, val);
      // Call initialize() if provider supports it
      if (val.initialize) {
        val.initialize();
      }
    }

    // Trigger workspace event to notify settings and other subscribers that instances are fully initialized
    this.plugin.app.workspace.trigger('full-calendar:instances-initialized');
  }

  // Methods from IdentifierManager, adapted
  public generateId(): string {
    return `${this.pkCounter++}`;
  }

  public async getSessionId(globalIdentifier: string): Promise<string | null> {
    if (this.identifierMapPromise) {
      await this.identifierMapPromise;
    }
    return this.identifierToSessionIdMap.get(globalIdentifier) || null;
  }

  public getGlobalIdentifier(event: OFCEvent, calendarId: string): string | null {
    const instance = this.instances.get(calendarId);
    if (!instance) {
      console.warn(`Could not find provider instance for calendar ID ${calendarId}`);
      return null;
    }
    const handle = instance.getEventHandle(event);
    if (!handle) {
      return null;
    }
    return `${calendarId}::${handle.persistentId}`;
  }

  /**
   * Computes a lightweight sync key for diffing during bulk sync operations.
   * Delegates to the provider's computeSyncKey() if it implements SyncKeyProvider,
   * otherwise falls back to getGlobalIdentifier() (which may be expensive for
   * providers like DailyNote).
   *
   * The key is scoped to the calendarId to ensure global uniqueness.
   */
  public computeSyncKeyForEvent(event: OFCEvent, calendarId: string): string | null {
    const instance = this.instances.get(calendarId);
    if (!instance) return null;

    // Type guard: check if the provider implements SyncKeyProvider
    if (
      'computeSyncKey' in instance &&
      typeof (instance as SyncKeyProvider).computeSyncKey === 'function'
    ) {
      const key = (instance as SyncKeyProvider).computeSyncKey(event);
      return `${calendarId}::${key}`;
    }

    // Fallback: use the existing (potentially expensive) global identifier
    return this.getGlobalIdentifier(event, calendarId);
  }

  public getCanonicalTitle(event: OFCEvent, calendarId: string): string {
    const instance = this.instances.get(calendarId);
    if (
      instance &&
      'getCanonicalTitle' in instance &&
      typeof (instance as CanonicalTitleProvider).getCanonicalTitle === 'function'
    ) {
      return (instance as CanonicalTitleProvider).getCanonicalTitle(event);
    }

    return event.title;
  }

  public buildMap(store: {
    getAllEvents(): { event: OFCEvent; calendarId: string; id: string }[];
  }): void {
    // store is EventStore
    if (!this.cache) return;
    this.identifierMapPromise = (() => {
      this.identifierToSessionIdMap.clear();
      this.sessionIdToIdentifierMap.clear();
      for (const storedEvent of store.getAllEvents()) {
        const globalIdentifier = this.getGlobalIdentifier(
          storedEvent.event,
          storedEvent.calendarId
        );
        if (globalIdentifier) {
          this.identifierToSessionIdMap.set(globalIdentifier, storedEvent.id);
          this.sessionIdToIdentifierMap.set(storedEvent.id, globalIdentifier);
        }
      }
      return Promise.resolve();
    })();
  }

  public addMapping(event: OFCEvent, calendarId: string, sessionId: string): void {
    const globalIdentifier = this.getGlobalIdentifier(event, calendarId);
    if (globalIdentifier) {
      // If this sessionId already has a mapping (e.g. re-mapping after
      // optimistic → authoritative correction), clean up the old forward entry
      // before inserting the new one.
      const existingGlobalId = this.sessionIdToIdentifierMap.get(sessionId);
      if (existingGlobalId && existingGlobalId !== globalIdentifier) {
        this.identifierToSessionIdMap.delete(existingGlobalId);
      }
      this.identifierToSessionIdMap.set(globalIdentifier, sessionId);
      this.sessionIdToIdentifierMap.set(sessionId, globalIdentifier);
    }
  }

  /**
   * Removes the identifier mapping for a given session ID.
   * Uses a reverse-index lookup (O(1)) instead of calling getEventHandle,
   * which is critical for providers like DailyNote where getEventHandle
   * performs expensive vault scans.
   */
  public removeMapping(sessionId: string): void {
    const globalIdentifier = this.sessionIdToIdentifierMap.get(sessionId);
    if (globalIdentifier) {
      this.identifierToSessionIdMap.delete(globalIdentifier);
      this.sessionIdToIdentifierMap.delete(sessionId);
    }
  }

  public async fetchAllEvents(): Promise<
    { calendarId: string; event: OFCEvent; location: EventLocation | null }[]
  > {
    if (!this.cache) {
      throw new Error('Cache not set on ProviderRegistry');
    }

    const results: { calendarId: string; event: OFCEvent; location: EventLocation | null }[] = [];
    const promises = [];

    for (const [settingsId, instance] of this.instances.entries()) {
      const promise = (async () => {
        try {
          if (!this.cache) {
            throw new Error('Cache not set on ProviderRegistry');
          }
          const cache = this.cache;
          const rawEvents = await instance.getEvents();
          rawEvents.forEach(([rawEvent, location]) => {
            const event = cache.enhancer.enhance(rawEvent);
            results.push({
              calendarId: settingsId,
              event,
              location
            });
          });
        } catch (e) {
          const source = this.getSource(settingsId);
          console.warn(`Full Calendar: Failed to load calendar source`, source, e);
          this.scheduleProviderReload(settingsId, instance, e);
        }
      })();
      promises.push(promise);
    }

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * Fetch events from all providers using priority-based ordering.
   * Local providers (loadPriority < 100) load synchronously for immediate display.
   * Remote providers (loadPriority >= 100) load asynchronously and call onProviderComplete.
   */
  public async fetchAllByPriority(
    onProviderComplete?: (calendarId: string, events: [OFCEvent, EventLocation | null][]) => void,
    onAllComplete?: () => void
  ): Promise<void> {
    if (!this.cache) {
      throw new Error('Cache not set on ProviderRegistry');
    }

    // Sort all providers by loadPriority (lower number = higher priority)
    const prioritizedProviders = Array.from(this.instances.entries()).sort(
      ([, a], [, b]) => a.loadPriority - b.loadPriority
    );

    // Split providers into local (priority < 100) and remote (priority >= 100)
    const localProviders = prioritizedProviders.filter(
      ([, provider]) => provider.loadPriority < 100
    );
    const remoteProviders = prioritizedProviders.filter(
      ([, provider]) => provider.loadPriority >= 100
    );

    // --- STAGE 1: Critical Range Loading ---
    // Load events for +/- 3 months to make the calendar interactive quickly.
    const now = new Date();
    const stage1Range = {
      start: new Date(now.getFullYear(), now.getMonth() - 3, 1),
      end: new Date(now.getFullYear(), now.getMonth() + 3, 0)
    };

    // Helper to process results from a provider
    const processResults = (settingsId: string, rawEvents: [OFCEvent, EventLocation | null][]) => {
      // Call completion callback for this provider (updates UI progressively via EventCache)
      if (onProviderComplete) {
        onProviderComplete(settingsId, rawEvents);
      }
    };

    // 1.1 Load Local Providers (Sync) - STAGE 1
    const localPromises1 = localProviders.map(async ([settingsId, instance]) => {
      try {
        const rawEvents = await instance.getEvents(stage1Range);
        processResults(settingsId, rawEvents);
      } catch (e) {
        const source = this.getSource(settingsId);
        console.warn(`Full Calendar: Failed to load local calendar source (Stage 1)`, source, e);
        this.scheduleProviderReload(settingsId, instance, e);
      }
    });

    // We still block UI rendering explicitly until local stage 1 finishes
    await Promise.all(localPromises1);

    // Call completion callback here so the calendar renders immediately with local data.
    if (onAllComplete) {
      onAllComplete();
    }

    // Start everything else in the background beautifully pipelined so nothing blocks anything else
    void (async () => {
      // Background Local Providers (Sync) - STAGE 2
      const localPromises2 = localProviders.map(async ([settingsId, instance]) => {
        try {
          const rawEvents = await instance.getEvents();
          processResults(settingsId, rawEvents);
        } catch {
          // Suppress noisy logs for background re-runs, but still let retryable
          // providers ask the registry for a delayed reload.
          this.scheduleProviderReload(settingsId, instance);
        }
      });
      void Promise.all(localPromises2);

      // Background Remote Providers - Pipelined STAGE 1 -> STAGE 2
      const remotePromises = remoteProviders.map(async ([settingsId, instance]) => {
        try {
          // Stage 1 Fetch
          const rawEventsStage1 = await instance.getEvents(stage1Range);
          processResults(settingsId, rawEventsStage1);

          // Immediately kick off Stage 2 for THIS provider instead of waiting for all Stage 1.
          const rawEventsStage2 = await instance.getEvents();
          processResults(settingsId, rawEventsStage2);
        } catch (e) {
          const source = this.getSource(settingsId);
          console.warn(`Full Calendar: Failed to load remote calendar source pipeline`, source, e);
          this.scheduleProviderReload(settingsId, instance, e);
        }
      });

      await Promise.allSettled(remotePromises);
      this.cache?.resync();
    })();
  }

  private getRetryPolicy(instance: CalendarProvider<unknown>): ProviderLoadRetryPolicy | null {
    return instance.getLoadRetryPolicy?.() ?? null;
  }

  private scheduleProviderReload(
    settingsId: string,
    instance: CalendarProvider<unknown>,
    reason?: unknown
  ): void {
    const policy = this.getRetryPolicy(instance);
    if (!policy || !this.cache) {
      return;
    }

    if (this.providerRetryTimers.has(settingsId)) {
      return;
    }

    const attempts = this.providerRetryAttempts.get(settingsId) ?? 0;
    if (policy.maxAttempts !== undefined && attempts >= policy.maxAttempts) {
      console.warn(`Full Calendar: Provider "${settingsId}" exhausted reload attempts.`, reason);
      return;
    }

    const timer = window.setTimeout(() => {
      this.providerRetryTimers.delete(settingsId);
      this.providerRetryAttempts.set(settingsId, attempts + 1);
      void this.reloadProvider(settingsId);
    }, policy.retryDelayMs);

    this.providerRetryTimers.set(settingsId, timer);
  }

  private async reloadProvider(settingsId: string): Promise<void> {
    if (!this.cache) {
      return;
    }

    const instance = this.instances.get(settingsId);
    if (!instance) {
      return;
    }

    try {
      const rawEvents = await instance.getEvents();
      this.cache.syncCalendar(settingsId, rawEvents);
      this.providerRetryAttempts.delete(settingsId);
      this.refreshBacklogViews();
    } catch (e) {
      const source = this.getSource(settingsId);
      console.warn(`Full Calendar: Delayed provider reload failed`, source, e);
      this.scheduleProviderReload(settingsId, instance, e);
    }
  }

  public reloadProviderNow(settingsId: string): void {
    const timer = this.providerRetryTimers.get(settingsId);
    if (timer) {
      window.clearTimeout(timer);
      this.providerRetryTimers.delete(settingsId);
    }
    this.providerRetryAttempts.delete(settingsId);
    void this.reloadProvider(settingsId);
  }

  public async createEventInProvider(
    settingsId: string,
    event: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    const instance = this.instances.get(settingsId);
    if (!instance) {
      throw new Error(`Provider instance with ID ${settingsId} not found.`);
    }
    return instance.createEvent(event);
  }

  public async updateEventInProvider(
    sessionId: string,
    calendarId: string,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    const instance = this.instances.get(calendarId);
    if (!instance) {
      throw new Error(`Provider instance with ID ${calendarId} not found.`);
    }
    const handle = instance.getEventHandle(oldEventData);
    if (!handle) {
      throw new Error(`Could not generate a persistent handle for the event being modified.`);
    }

    const details = this.cache?.store.getEventDetails(sessionId);
    if (details?.location && !handle.location) {
      handle.location = details.location;
    }

    return instance.updateEvent(handle, oldEventData, newEventData);
  }

  public async deleteEventInProvider(
    sessionId: string,
    event: OFCEvent,
    calendarId: string
  ): Promise<void> {
    const instance = this.instances.get(calendarId);
    if (!instance) {
      throw new Error(`Provider instance with ID ${calendarId} not found.`);
    }
    const handle = instance.getEventHandle(event);

    if (handle) {
      const details = this.cache?.store.getEventDetails(sessionId);
      if (details?.location && !handle.location) {
        handle.location = details.location;
      }
      await instance.deleteEvent(handle);
    } else {
      console.warn(
        `Could not generate a persistent handle for the event being deleted. Proceeding with deletion from cache only.`
      );
    }
  }

  // NOTE: Keep handleFileUpdate and handleFileDelete stubs for now.
  public async handleFileUpdate(file: TFile): Promise<void> {
    if (!this.cache) return;

    // Find all *local* provider instances that might be interested in this file.
    const interestedInstances = [];
    for (const [settingsId, instance] of this.instances.entries()) {
      if (!instance.isRemote && instance.getEventsInFile) {
        const sourceInfo = this.getSource(settingsId);
        if (!sourceInfo) continue;

        // Delegate file relevance check to the provider itself
        const isRelevant = instance.isFileRelevant ? instance.isFileRelevant(file) : false;

        if (isRelevant) {
          interestedInstances.push({ instance, config: sourceInfo, settingsId });
        }
      }
    }

    if (interestedInstances.length === 0) {
      // No providers care about this file, so ignore it.
      // Avoid syncing an empty state here, which can remove events owned by
      // provider-driven integrations that do not participate in file parsing.
      return;
    }

    // Aggregate all events from all interested providers for this one file.
    const allNewEvents: { event: OFCEvent; location: EventLocation | null; calendarId: string }[] =
      [];
    for (const { instance, settingsId } of interestedInstances) {
      if (!instance.getEventsInFile) {
        continue;
      }
      const eventsFromFile = await instance.getEventsInFile(file);
      for (const [event, location] of eventsFromFile) {
        allNewEvents.push({ event, location, calendarId: settingsId });
      }
    }

    // Push the definitive new state of the file to the cache for diffing.
    await this.cache.syncFile(file, allNewEvents);
  }

  public async handleFileDelete(path: string): Promise<void> {
    if (!this.cache) return;
    // For a delete, the new state of the file is "no events".
    // The cache will diff this against its old state and remove everything.
    // Use a minimal file-like object; syncFile only requires the path for diffing.
    // This avoids invoking provider-level delete logic during rename races.
    await this.cache.syncFile({ path }, []);
  }

  // Add these properties for remote revalidation
  private revalidating = false;
  private lastRevalidation = 0;

  public revalidateRemoteCalendars(force = false): void {
    if (!this.cache) return;
    if (this.revalidating) {
      return;
    }
    const now = Date.now();

    if (!force && now - this.lastRevalidation < MILLICONDS_BETWEEN_REVALIDATIONS) {
      return;
    }

    const remoteInstances = Array.from(this.instances.entries()).filter(
      ([_, instance]) => instance.isRemote
    );

    if (remoteInstances.length === 0) {
      return;
    }

    this.revalidating = true;
    showNotice(t('notices.revalidatingRemotes'));

    const promises = remoteInstances.map(([settingsId, instance]) => {
      return instance
        .getEvents()
        .then(events => {
          if (!this.cache) {
            return;
          }
          this.cache.syncCalendar(settingsId, events);
        })
        .catch((err: Error) => {
          const source = this.getSource(settingsId);
          const name =
            source && 'name' in source ? (source as { name: string }).name : instance.type;
          throw new Error(`Failed to revalidate calendar "${name}": ${err.message}`);
        });
    });

    void Promise.allSettled(promises).then(results => {
      this.revalidating = false;
      this.lastRevalidation = Date.now();
      const errors = results.flatMap(result =>
        result.status === 'rejected' ? [result.reason as Error] : []
      );
      if (errors.length > 0) {
        showNotice(t('notices.revalidationFailed'));
        errors.forEach(reason => {
          console.error(`Full Calendar: Revalidation failed.`, reason);
        });
      } else {
        showNotice(t('notices.revalidationSuccess'));
      }
    });
  }

  public getInstance(id: string): CalendarProvider<unknown> | undefined {
    return this.instances.get(id);
  }

  public getCapabilities(id: string): CalendarProviderCapabilities | null {
    const instance = this.instances.get(id);
    if (!instance) {
      return null;
    }
    return instance.getCapabilities();
  }

  public async createInstanceOverrideInProvider(
    calendarId: string,
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    const instance = this.instances.get(calendarId);
    if (!instance) {
      throw new Error(`Provider instance with ID ${calendarId} not found.`);
    }
    return instance.createInstanceOverride(masterEvent, instanceDate, newEventData);
  }

  // Add pub/sub event bus logic for settings changes
  private onSourcesChanged = (): void => {
    void (async () => {
      if (!this.cache) return;

      // This is the "nuclear reset" logic moved from main.ts
      await this.initializeInstances();

      // Use the centralized backlog lifecycle management
      this.syncBacklogManagerLifecycle();

      this.cache.reset();
      await this.cache.populate();
      this.revalidateRemoteCalendars();
      // Note: resync is now triggered automatically by populate's onAllComplete callback
      // when all async providers finish loading, so we don't need to call it here

      // Refresh backlog views if they exist
      if (this.tasksBacklogManager.getIsLoaded()) {
        this.tasksBacklogManager.refreshViews();
      }
    })();
  };

  /**
   * Synchronizes the Tasks Backlog Manager lifecycle based on provider availability.
   * This method centralizes the logic for loading/unloading the backlog based on
   * whether any Tasks providers are currently configured.
   */
  public syncBacklogManagerLifecycle(): void {
    // Manage Tasks Backlog view lifecycle based on provider availability
    if (this.hasProviderOfType('tasks')) {
      if (!this.tasksBacklogManager.getIsLoaded()) {
        this.tasksBacklogManager.onload();
      }
    } else {
      if (this.tasksBacklogManager.getIsLoaded()) {
        this.tasksBacklogManager.onunload();
      }
    }
  }

  public listenForSourceChanges(): void {
    // Obsidian's Workspace interface doesn't declare custom events; cast only the event emitter portion
    (
      this.plugin.app.workspace as unknown as {
        on: (name: string, cb: () => void) => void;
      }
    ).on('full-calendar:sources-changed', this.onSourcesChanged);
  }

  public stopListening(): void {
    (
      this.plugin.app.workspace as unknown as {
        off: (name: string, cb: () => void) => void;
      }
    ).off('full-calendar:sources-changed', this.onSourcesChanged);

    this.teardownAllInstances();

    for (const timer of this.providerRetryTimers.values()) {
      window.clearTimeout(timer);
    }
    this.providerRetryTimers.clear();
    this.providerRetryAttempts.clear();
  }

  /**
   * The provider-facing entry point for syncing state.
   * Accepts a payload with persistent IDs, translates them to session IDs,
   * and forwards the commands to the EventCache for execution.
   */
  public async processProviderUpdates(
    calendarId: string,
    updates: {
      additions: { event: OFCEvent; location: EventLocation | null }[];
      updates: { persistentId: string; event: OFCEvent; location: EventLocation | null }[];
      deletions: string[];
    }
  ): Promise<void> {
    if (!this.cache) return;

    const { additions, updates: updateArr, deletions } = updates;

    const cachePayload = {
      additions: additions, // Additions don't need translation.
      updates: [] as { sessionId: string; event: OFCEvent; location: EventLocation | null }[],
      deletions: [] as string[]
    };

    // Translate Update persistent IDs to session IDs
    for (const update of updateArr) {
      const globalIdentifier = `${calendarId}::${update.persistentId}`;
      let sessionId = await this.getSessionId(globalIdentifier);
      if (!sessionId) {
        sessionId = this.resolveSessionIdFromStoreFallback(
          calendarId,
          update.persistentId,
          update.event
        );
        if (sessionId) {
          this.repairMappingFromStore(calendarId, sessionId);
        }
      }

      if (sessionId) {
        cachePayload.updates.push({
          sessionId: sessionId,
          event: update.event,
          location: update.location
        });
      } else {
        console.warn(
          `[ProviderRegistry] Dropping update for ${globalIdentifier} because no sessionId was found.`
        );
      }
    }

    // Translate Deletion persistent IDs to session IDs
    for (const persistentId of deletions) {
      const globalIdentifier = `${calendarId}::${persistentId}`;
      let sessionId = await this.getSessionId(globalIdentifier);
      if (!sessionId) {
        sessionId = this.resolveSessionIdFromStoreFallback(calendarId, persistentId);
        if (sessionId) {
          this.repairMappingFromStore(calendarId, sessionId);
        }
      }

      if (sessionId) {
        cachePayload.deletions.push(sessionId);
      }
    }

    // Forward the translated payload to the EventCache for execution.
    await this.cache.processProviderUpdates(calendarId, cachePayload);
  }

  public getActiveProviders(): CalendarProvider<unknown>[] {
    return Array.from(this.instances.values());
  }

  public hasProviderOfType(type: string): boolean {
    for (const instance of this.instances.values()) {
      if (instance.type === type) {
        return true;
      }
    }
    return false;
  }
}
