import { showNotice } from '../utils/showNotice';
import { PluginState } from '../core/PluginState';
import { TFile } from 'obsidian';
import {
  CalendarProvider,
  CalendarProviderCapabilities,
  ProviderLoadRetryPolicy,
  TaskBacklogProvider
} from '../providers/Provider';
import { CalendarInfo, EventLocation, OFCEvent } from '../types';
import EventCache from '../core/EventCache';
import FullCalendarPlugin from '../main';
import { ObsidianIO, ObsidianInterface } from '../ObsidianAdapter';
import { TaskBacklogManager } from '../features/task-backlogs/TaskBacklogManager';
import { t } from '../features/i18n/i18n';
import { IdentifierMapManager } from './IdentifierMapManager';
import { yieldToMainThread } from '../utils/async';
import { LoadDebugProfiler } from '../utils/LoadDebugProfiler';

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
   * Triggers a refresh of any open task backlog views.
   * This is called by providers when their backlog data changes.
   */
  public refreshBacklogViews(): void {
    if (this.taskBacklogManager.getIsLoaded()) {
      this.taskBacklogManager.refreshViews();
    }
  }

  /**
   * Compatibility shim for the original CalDAV task inbox code path.
   */
  public refreshCalDAVTaskInboxViews(): void {
    this.refreshBacklogViews();
  }
  private providers = new Map<string, ProviderLoader>();
  private instances = new Map<string, CalendarProvider<unknown>>();
  private sources: CalendarInfo[] = [];
  private providerRetryTimers = new Map<string, number>();
  private providerRetryAttempts = new Map<string, number>();

  // Properties from IdentifierManager and for linking singletons
  private plugin: FullCalendarPlugin;
  private cache: EventCache | null = null;
  public identifierMapManager: IdentifierMapManager;

  // Task backlog manager for lifecycle management
  private taskBacklogManager: TaskBacklogManager;

  private resolveSessionIdFromStoreFallback(
    calendarId: string,
    persistentId: string,
    eventHint?: OFCEvent
  ): string | null {
    return this.identifierMapManager.resolveSessionIdFromStoreFallback(
      calendarId,
      persistentId,
      eventHint
    );
  }

  private repairMappingFromStore(calendarId: string, sessionId: string): void {
    this.identifierMapManager.repairMappingFromStore(calendarId, sessionId);
  }

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
    this.taskBacklogManager = new TaskBacklogManager(plugin);
    this.identifierMapManager = new IdentifierMapManager(
      () => this.cache,
      id => this.getInstance(id)
    );
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
    this.register('googletasks', () => import('./googletasks/GoogleTasksProvider'));
    this.register('outlook', () => import('./outlook/OutlookProvider'));
    this.register('tasks', () => import('./tasks/TasksPluginProvider'));
    this.register('tasknotes', () => import('./tasknotes/TaskNotesProvider'));
    this.register('bases', () => import('./bases/BasesProvider'));
    this.register('holidays', () => import('./holidays/HolidayProvider'));
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

  // Methods from IdentifierManager, delegated
  public generateId(): string {
    return this.identifierMapManager.generateId();
  }

  public async getSessionId(globalIdentifier: string): Promise<string | null> {
    return this.identifierMapManager.getSessionId(globalIdentifier);
  }

  public getGlobalIdentifier(event: OFCEvent, calendarId: string): string | null {
    return this.identifierMapManager.getGlobalIdentifier(event, calendarId);
  }

  public computeSyncKeyForEvent(event: OFCEvent, calendarId: string): string | null {
    return this.identifierMapManager.computeSyncKeyForEvent(event, calendarId);
  }

  public getCanonicalTitle(event: OFCEvent, calendarId: string): string {
    return this.identifierMapManager.getCanonicalTitle(event, calendarId);
  }

  public buildMap(store: {
    getAllEvents(): { event: OFCEvent; calendarId: string; id: string }[];
  }): void {
    this.identifierMapManager.buildMap(store);
  }

  public addMapping(event: OFCEvent, calendarId: string, sessionId: string): void {
    this.identifierMapManager.addMapping(event, calendarId, sessionId);
  }

  public removeMapping(sessionId: string): void {
    this.identifierMapManager.removeMapping(sessionId);
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
      if (onProviderComplete) {
        onProviderComplete(settingsId, rawEvents);
      }
    };

    const getProviderName = (settingsId: string, instance: CalendarProvider<unknown>): string => {
      const source = this.getSource(settingsId);
      if (source && 'name' in source && typeof (source as { name?: string }).name === 'string') {
        return (source as { name: string }).name;
      }
      return instance.displayName || instance.type || settingsId;
    };

    // --- STAGE 1: Local Range Loading (+/- 3 months) ---
    const stage1LocalName = 'Stage 1 (Local - Range)';
    LoadDebugProfiler.startStage(stage1LocalName);

    for (const [settingsId, instance] of localProviders) {
      const name = getProviderName(settingsId, instance);
      LoadDebugProfiler.startProvider(stage1LocalName, settingsId, name);
      try {
        const rawEvents = await instance.getEvents(stage1Range);
        processResults(settingsId, rawEvents);
        LoadDebugProfiler.endProvider(stage1LocalName, settingsId, rawEvents.length, true);
      } catch (e) {
        const source = this.getSource(settingsId);
        console.warn(`Full Calendar: Failed to load local calendar source (Stage 1)`, source, e);
        const errorMsg = e instanceof Error ? e.message : String(e);
        LoadDebugProfiler.endProvider(stage1LocalName, settingsId, 0, false, errorMsg);
        this.scheduleProviderReload(settingsId, instance, e);
      }
      await yieldToMainThread();
    }

    LoadDebugProfiler.endStage(stage1LocalName);

    // Call completion callback here so the calendar renders immediately with local data.
    if (onAllComplete) {
      onAllComplete();
    }

    await yieldToMainThread();

    // Start everything else in the background beautifully pipelined so nothing blocks anything else
    void (async () => {
      // --- STAGE 2: Local Full Loading ---
      if (localProviders.length > 0) {
        const stage2LocalName = 'Stage 2 (Local - Full)';
        LoadDebugProfiler.startStage(stage2LocalName);

        for (const [settingsId, instance] of localProviders) {
          const name = getProviderName(settingsId, instance);
          LoadDebugProfiler.startProvider(stage2LocalName, settingsId, name);
          try {
            const rawEvents = await instance.getEvents();
            processResults(settingsId, rawEvents);
            LoadDebugProfiler.endProvider(stage2LocalName, settingsId, rawEvents.length, true);
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            LoadDebugProfiler.endProvider(stage2LocalName, settingsId, 0, false, errorMsg);
            this.scheduleProviderReload(settingsId, instance, e);
          }
          await yieldToMainThread();
        }

        LoadDebugProfiler.endStage(stage2LocalName);
      }

      await yieldToMainThread();

      if (remoteProviders.length > 0) {
        // --- STAGE 1: Remote Range Loading ---
        const stage1RemoteName = 'Stage 1 (Remote - Range)';
        LoadDebugProfiler.startStage(stage1RemoteName);

        const stage1RemoteEvents = new Map<string, [OFCEvent, EventLocation | null][]>();

        for (const [settingsId, instance] of remoteProviders) {
          const name = getProviderName(settingsId, instance);
          LoadDebugProfiler.startProvider(stage1RemoteName, settingsId, name);
          try {
            const rawEventsStage1 = await instance.getEvents(stage1Range);
            stage1RemoteEvents.set(settingsId, rawEventsStage1);
            processResults(settingsId, rawEventsStage1);
            LoadDebugProfiler.endProvider(
              stage1RemoteName,
              settingsId,
              rawEventsStage1.length,
              true
            );
          } catch (e) {
            const source = this.getSource(settingsId);
            console.warn(
              `Full Calendar: Failed to load remote calendar source (Stage 1)`,
              source,
              e
            );
            const errorMsg = e instanceof Error ? e.message : String(e);
            LoadDebugProfiler.endProvider(stage1RemoteName, settingsId, 0, false, errorMsg);
            this.scheduleProviderReload(settingsId, instance, e);
          }
          await yieldToMainThread();
        }

        LoadDebugProfiler.endStage(stage1RemoteName);

        await yieldToMainThread();

        // --- STAGE 2: Remote Full Loading ---
        const stage2RemoteName = 'Stage 2 (Remote - Full)';
        LoadDebugProfiler.startStage(stage2RemoteName);

        for (const [settingsId, instance] of remoteProviders) {
          const name = getProviderName(settingsId, instance);
          LoadDebugProfiler.startProvider(stage2RemoteName, settingsId, name);
          try {
            // Optimization: For ICS calendars, getEvents(range) already downloaded the file and returned all events.
            // Skip redundant 2nd network request.
            if (instance.type === 'ical') {
              const prevEvents = stage1RemoteEvents.get(settingsId) || [];
              LoadDebugProfiler.endProvider(stage2RemoteName, settingsId, prevEvents.length, true);
              await this.refreshProviderAuxiliaryData(settingsId, instance);
              continue;
            }

            const rawEventsStage2 = await instance.getEvents();
            processResults(settingsId, rawEventsStage2);
            await this.refreshProviderAuxiliaryData(settingsId, instance);
            LoadDebugProfiler.endProvider(
              stage2RemoteName,
              settingsId,
              rawEventsStage2.length,
              true
            );
          } catch (e) {
            const source = this.getSource(settingsId);
            console.warn(
              `Full Calendar: Failed to load remote calendar source (Stage 2)`,
              source,
              e
            );
            const errorMsg = e instanceof Error ? e.message : String(e);
            LoadDebugProfiler.endProvider(stage2RemoteName, settingsId, 0, false, errorMsg);
            this.scheduleProviderReload(settingsId, instance, e);
          }
          await yieldToMainThread();
        }

        LoadDebugProfiler.endStage(stage2RemoteName);
      }

      this.cache?.resync();
    })();
  }

  private getRetryPolicy(instance: CalendarProvider<unknown>): ProviderLoadRetryPolicy | null {
    return instance.getLoadRetryPolicy?.() ?? null;
  }

  private async refreshProviderAuxiliaryData(
    settingsId: string,
    instance: CalendarProvider<unknown>
  ): Promise<void> {
    const auxiliaryProvider = instance as unknown as {
      refreshTaskBacklogItems?: () => Promise<unknown>;
      refreshUndatedTasks?: () => Promise<unknown>;
    };

    const refresh =
      auxiliaryProvider.refreshTaskBacklogItems ?? auxiliaryProvider.refreshUndatedTasks;

    if (typeof refresh !== 'function') {
      return;
    }

    try {
      await refresh.call(auxiliaryProvider);
      this.refreshBacklogViews();
    } catch (e) {
      const source = this.getSource(settingsId);
      console.warn('Full Calendar: Failed to refresh provider auxiliary data', source, e);
    }
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
      await this.refreshProviderAuxiliaryData(settingsId, instance);
      this.providerRetryAttempts.delete(settingsId);
      this.refreshBacklogViews();
      this.refreshCalDAVTaskInboxViews();
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
      return Promise.all([
        instance.getEvents().then(events => {
          if (!this.cache) {
            return;
          }
          this.cache.syncCalendar(settingsId, events);
        }),
        this.refreshProviderAuxiliaryData(settingsId, instance)
      ]).catch((err: Error) => {
        const source = this.getSource(settingsId);
        const name = source && 'name' in source ? (source as { name: string }).name : instance.type;
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

      this.refreshBacklogViews();
    })();
  };

  /**
   * Synchronizes the Task Backlog Manager lifecycle based on provider availability.
   * This method centralizes the logic for loading/unloading the backlog based on
   * whether any configured provider exposes the task backlog contract.
   */
  public syncBacklogManagerLifecycle(): void {
    if (this.getTaskBacklogProviders().length > 0) {
      if (!this.taskBacklogManager.getIsLoaded()) {
        this.taskBacklogManager.onload();
      }
    } else if (this.taskBacklogManager.getIsLoaded()) {
      this.taskBacklogManager.onunload();
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

  public getTaskBacklogProviders(): (CalendarProvider<unknown> & TaskBacklogProvider)[] {
    return this.getActiveProviders().filter(
      (provider): provider is CalendarProvider<unknown> & TaskBacklogProvider => {
        const maybeProvider = provider as Partial<TaskBacklogProvider>;
        return (
          typeof maybeProvider.getTaskBacklogInfo === 'function' &&
          typeof maybeProvider.getTaskBacklogItems === 'function'
        );
      }
    );
  }

  public getBacklogProviderForTask(
    taskId: string
  ): (CalendarProvider<unknown> & TaskBacklogProvider) | null {
    const providers = this.getTaskBacklogProviders();
    return providers.find(provider => provider.ownsTaskId(taskId)) ?? null;
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
