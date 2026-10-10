import { PluginState } from '../../core/PluginState';
import {
  CalendarProvider,
  CalendarProviderCapabilities,
  DelegatedProviderActionError,
  RecurringInstanceState,
  RecurringInstanceStateProvider,
  RecoverableProviderLoadError,
  SyncKeyProvider
} from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { OFCEvent, EventLocation } from '../../types';
import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { TaskNotesProviderConfig, TaskNotesTask, TaskNotesPluginApi } from './typesTaskNotes';
import {
  TaskNotesConfigComponent,
  TaskNotesConfigComponentProps,
  TaskNotesSettingsRow
} from './TaskNotesConfigComponent';
import { t } from '../../features/i18n/i18n';
import { yieldIfFrameBudgetExceeded } from '../../utils/async';
import {
  getRecurringStateForDate,
  getTaskVersion,
  normalizePersistentId,
  taskToEvent,
  toTaskNotesNLPQuery
} from './TaskNotesMapper';
import {
  createTaskNotesOverride,
  dispatchTaskNotesModal,
  fetchTaskInfoByUid,
  getTaskNotesPlugin,
  rescheduleTaskAndSyncCompanions,
  resolveTaskWithFallback,
  subscribeToTaskNotes,
  syncRecurringSkipDates,
  TaskNotesSubscription,
  toggleRecurringInstanceState,
  toggleTaskStatus
} from './TaskNotesInterop';

export type EditableEventResponse = [OFCEvent, EventLocation | null];

const TASK_UPDATE_COALESCE_MS = 80;

export class TaskNotesProvider
  implements
    CalendarProvider<TaskNotesProviderConfig>,
    SyncKeyProvider,
    RecurringInstanceStateProvider
{
  static readonly type = 'tasknotes';
  static readonly displayName = 'TaskNotes';

  static getConfigurationComponent(): FCReactComponent<TaskNotesConfigComponentProps> {
    return TaskNotesConfigComponent;
  }

  private plugin: FullCalendarPlugin;
  private source: TaskNotesProviderConfig;
  private isSubscribed = false;
  private tasksById: Map<string, TaskNotesTask> = new Map();
  private subscriptionTimer: number | null = null;
  private subscriptionAttempts = 0;
  private reloadTimer: number | null = null;
  private subscription: TaskNotesSubscription | null = null;
  private lastTaskVersionByPath: Map<string, number> = new Map();
  private pendingTaskUpdateTimers: Map<string, number> = new Map();
  private pendingTaskUpdatePayloads: Map<string, TaskNotesTask | undefined> = new Map();
  readonly type = 'tasknotes';
  readonly displayName = 'TaskNotes';
  readonly isRemote = false;
  readonly loadPriority = 40;
  readonly supportsSecondStage = false;

  constructor(
    source: TaskNotesProviderConfig,
    plugin: FullCalendarPlugin,
    _app?: ObsidianInterface
  ) {
    this.plugin = plugin;
    this.source = source;
  }

  private getTaskNotesPlugin(): TaskNotesPluginApi | null {
    return getTaskNotesPlugin(this.plugin.app);
  }

  private normalizePersistentId(path: string): string {
    return normalizePersistentId(path);
  }

  private scheduleSubscriptionRetry(): void {
    if (this.subscriptionTimer) return;
    this.subscriptionTimer = window.setTimeout(() => {
      this.subscriptionTimer = null;
      this.subscriptionAttempts += 1;
      this.initialize();
    }, 5000);
  }

  private scheduleReload(delayMs = 500): void {
    if (this.reloadTimer) window.clearTimeout(this.reloadTimer);
    try {
      PluginState.getProviderRegistry();
    } catch {
      return;
    }
    this.reloadTimer = window.setTimeout(() => {
      this.reloadTimer = null;
      try {
        PluginState.getProviderRegistry().reloadProviderNow(this.source.id);
      } catch {
        // Provider registry may already be gone during unload/reload.
      }
    }, delayMs);
  }

  private enqueueTaskUpdated(path: string, payloadTask?: TaskNotesTask): void {
    const normalizedPath = this.normalizePersistentId(path);
    this.pendingTaskUpdatePayloads.set(normalizedPath, payloadTask);

    const existingTimer = this.pendingTaskUpdateTimers.get(normalizedPath);
    if (existingTimer) window.clearTimeout(existingTimer);

    const timer = window.setTimeout(() => {
      this.pendingTaskUpdateTimers.delete(normalizedPath);
      const latestPayload = this.pendingTaskUpdatePayloads.get(normalizedPath);
      this.pendingTaskUpdatePayloads.delete(normalizedPath);
      void this.handleTaskUpdated(normalizedPath, latestPayload);
    }, TASK_UPDATE_COALESCE_MS);

    this.pendingTaskUpdateTimers.set(normalizedPath, timer);
  }

  private isTaskNotesSourceId(): boolean {
    return /^tasknotes_\d+$/i.test(this.source.id);
  }

  private getDispatchMode(): 'search' | 'create' {
    return this.source.dispatchMode || 'search';
  }

  private async getTaskForEvent(event: OFCEvent): Promise<TaskNotesTask | null> {
    if (!event.uid) return null;
    const normalizedUid = this.normalizePersistentId(event.uid);
    const cached = this.tasksById.get(normalizedUid);
    if (cached) return cached;

    const taskNotes = this.getTaskNotesPlugin();
    if (!taskNotes) return null;

    const fetched = await fetchTaskInfoByUid(taskNotes, normalizedUid);
    if (fetched) {
      this.tasksById.set(this.normalizePersistentId(fetched.path), fetched);
    }
    return fetched;
  }

  private async dispatchUpdates(payload: {
    additions: { event: OFCEvent; location: EventLocation | null }[];
    updates: { persistentId: string; event: OFCEvent; location: EventLocation | null }[];
    deletions: string[];
  }): Promise<void> {
    try {
      if (!PluginState.getCache()) return;
      await PluginState.getProviderRegistry().processProviderUpdates(this.source.id, payload);
    } catch {
      // PluginState may already be torn down while external callbacks are still draining.
    }
  }

  private async handleTaskUpdated(path: string, payloadTask?: TaskNotesTask): Promise<void> {
    try {
      const normalizedPath = this.normalizePersistentId(path);
      const taskNotes = this.getTaskNotesPlugin();
      if (!taskNotes) return;

      let task = await resolveTaskWithFallback(taskNotes, path, normalizedPath, payloadTask);
      let providerRegistry;
      try {
        providerRegistry = PluginState.getProviderRegistry();
      } catch {
        return;
      }

      const globalIdentifier = `${this.source.id}::${normalizedPath}`;
      const existingSessionId = await providerRegistry.getSessionId(globalIdentifier);
      if (!task) {
        if (existingSessionId) this.scheduleReload();
        return;
      }

      const incomingVersion = getTaskVersion(task);
      const lastVersion = this.lastTaskVersionByPath.get(normalizedPath);
      if (incomingVersion !== null && lastVersion !== undefined && incomingVersion < lastVersion) {
        return;
      }

      this.tasksById.set(normalizedPath, task);
      const isCompleted = taskNotes?.statusManager?.isCompletedStatus(task.status) ?? false;
      let eventEntry = taskToEvent(task, isCompleted);
      if (!eventEntry) {
        const fallbackCanonical = await taskNotes.cacheManager.getTaskInfo(path);
        if (fallbackCanonical) {
          task = fallbackCanonical;
          this.tasksById.set(normalizedPath, fallbackCanonical);
          const isFallbackCompleted =
            taskNotes?.statusManager?.isCompletedStatus(fallbackCanonical.status) ?? false;
          eventEntry = taskToEvent(fallbackCanonical, isFallbackCompleted);
        }
      }

      if (incomingVersion !== null) {
        this.lastTaskVersionByPath.set(normalizedPath, incomingVersion);
      }

      if (!eventEntry) {
        if (existingSessionId) {
          await this.dispatchUpdates({ additions: [], updates: [], deletions: [normalizedPath] });
        }
        return;
      }

      if (!existingSessionId) {
        this.scheduleReload();
      } else {
        await this.dispatchUpdates({
          additions: [],
          updates: [
            { persistentId: normalizedPath, event: eventEntry[0], location: eventEntry[1] }
          ],
          deletions: []
        });
      }
    } catch (e) {
      console.error('[TaskNotesProvider] Error in handleTaskUpdated:', e);
    }
  }

  private async handleTaskDeleted(path: string): Promise<void> {
    const normalizedPath = this.normalizePersistentId(path);
    try {
      if (!PluginState.getCache()) return;
      const providerRegistry = PluginState.getProviderRegistry();
      const globalIdentifier = `${this.source.id}::${normalizedPath}`;
      const existingSessionId = await providerRegistry.getSessionId(globalIdentifier);
      if (!existingSessionId) return;

      this.tasksById.delete(normalizedPath);
      await this.dispatchUpdates({ additions: [], updates: [], deletions: [normalizedPath] });
    } catch {
      return;
    }
  }

  private async handleTaskRenamed(oldPath: string, newPath: string): Promise<void> {
    await this.handleTaskDeleted(oldPath);
    await this.handleTaskUpdated(newPath);
  }

  public initialize(): void {
    if (this.isSubscribed) return;
    const taskNotes = this.getTaskNotesPlugin();
    if (!taskNotes) {
      this.scheduleSubscriptionRetry();
      return;
    }

    this.isSubscribed = true;
    this.subscriptionAttempts = 0;
    this.subscription = subscribeToTaskNotes(taskNotes, {
      onTaskUpdated: (path, updatedTask) => this.enqueueTaskUpdated(path, updatedTask),
      onTaskDeleted: path => {
        void this.handleTaskDeleted(path).catch(e => {
          console.error('[TaskNotesProvider] task-deleted handler failed:', e);
        });
      },
      onTaskRenamed: (oldPath, newPath) => {
        void this.handleTaskRenamed(oldPath, newPath).catch(e => {
          console.error('[TaskNotesProvider] file-renamed handler failed:', e);
        });
      },
      onDataChanged: () => {
        if (!this.subscription?.useEmitterEvents) {
          this.scheduleReload();
        }
      }
    });

    this.scheduleReload(0);
  }

  public teardown(): void {
    if (this.subscriptionTimer) {
      window.clearTimeout(this.subscriptionTimer);
      this.subscriptionTimer = null;
    }
    if (this.reloadTimer) {
      window.clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
    for (const timer of this.pendingTaskUpdateTimers.values()) {
      window.clearTimeout(timer);
    }
    this.pendingTaskUpdateTimers.clear();
    this.pendingTaskUpdatePayloads.clear();
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.isSubscribed = false;
  }

  public getLoadRetryPolicy(): { retryDelayMs: number } {
    return { retryDelayMs: 10000 };
  }

  async getEvents(): Promise<[OFCEvent, EventLocation | null][]> {
    const taskNotes = this.getTaskNotesPlugin();
    if (!taskNotes) {
      throw new RecoverableProviderLoadError('TaskNotes plugin is not available.');
    }
    if (!this.isSubscribed) {
      this.initialize();
    }

    const tasks = await taskNotes.cacheManager.getAllTasks();
    this.tasksById = new Map(tasks.map(task => [this.normalizePersistentId(task.path), task]));
    this.lastTaskVersionByPath = new Map(
      tasks
        .map(task => {
          const normalizedPath = this.normalizePersistentId(task.path);
          const version = getTaskVersion(task);
          return version === null ? null : ([normalizedPath, version] as const);
        })
        .filter((entry): entry is readonly [string, number] => entry !== null)
    );

    const results: [OFCEvent, EventLocation | null][] = [];
    let frameStart = performance.now();
    for (let i = 0; i < tasks.length; i++) {
      const isCompleted = taskNotes?.statusManager?.isCompletedStatus(tasks[i].status) ?? false;
      const entry = taskToEvent(tasks[i], isCompleted);
      if (entry) results.push(entry);
      frameStart = await yieldIfFrameBudgetExceeded(frameStart, 6);
    }
    return results;
  }

  getCapabilities(): CalendarProviderCapabilities {
    return {
      canCreate: true,
      canEdit: true,
      canDelete: false,
      hasCustomEditUI: true,
      contextMenu: {
        allowGenericTaskActions: false,
        providesNativeTaskSemantics: true
      }
    };
  }

  getConfigurationComponent(): FCReactComponent<TaskNotesConfigComponentProps> {
    return TaskNotesConfigComponent;
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    if (event.uid) {
      const persistentId = this.normalizePersistentId(event.uid);
      return { persistentId, location: { path: persistentId } };
    }
    return null;
  }

  computeSyncKey(event: OFCEvent): string {
    return event.uid ? this.normalizePersistentId(event.uid) : JSON.stringify(event);
  }

  public async getRecurringInstanceState(
    event: OFCEvent,
    instanceDate: string
  ): Promise<RecurringInstanceState | null> {
    if (!instanceDate) return null;
    if (event.type === 'single' && event.recurringEventId) {
      const completed =
        event.completed !== undefined && event.completed !== null && !!event.completed;
      return { completed, skipped: false };
    }
    if (event.type !== 'rrule' && event.type !== 'recurring') {
      return null;
    }
    const task = await this.getTaskForEvent(event);
    if (!task || !task.recurrence) return null;

    return getRecurringStateForDate(task, instanceDate);
  }

  public async setRecurringInstanceState(
    event: OFCEvent,
    instanceDate: string,
    nextState: RecurringInstanceState
  ): Promise<boolean> {
    if ((event.type !== 'rrule' && event.type !== 'recurring') || !event.uid) {
      return false;
    }
    const taskNotes = this.getTaskNotesPlugin();
    if (!taskNotes) return false;

    const task = await this.getTaskForEvent(event);
    if (!task || !task.recurrence) return false;

    const result = await toggleRecurringInstanceState(taskNotes, task, instanceDate, nextState);
    if (!result.success) return false;

    this.tasksById.set(this.normalizePersistentId(result.task.path), result.task);
    return true;
  }

  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    return TaskNotesSettingsRow;
  }

  async createEvent(event: OFCEvent): Promise<EditableEventResponse> {
    if (!this.isTaskNotesSourceId()) {
      throw new Error(t('notices.tasknotes.invalidSourceId', { sourceId: this.source.id }));
    }
    const taskNotes = this.getTaskNotesPlugin();
    const nlpQuery = toTaskNotesNLPQuery(event);
    const dispatchMode = this.getDispatchMode();

    await dispatchTaskNotesModal(taskNotes, this.plugin.app.workspace, dispatchMode, nlpQuery);
    throw new DelegatedProviderActionError('TaskNotes delegated creation to provider UI.');
  }

  async updateEvent(
    handle: EventHandle,
    oldEvent: OFCEvent,
    newEvent: OFCEvent
  ): Promise<EventLocation | null> {
    const taskNotes = this.getTaskNotesPlugin();
    if (!taskNotes) {
      throw new Error('TaskNotes plugin is not available.');
    }
    const task = await taskNotes.cacheManager.getTaskInfo(handle.persistentId);
    if (!task) {
      throw new Error(`TaskNotes task not found for ${handle.persistentId}.`);
    }

    if (newEvent.type === 'rrule' || newEvent.type === 'recurring') {
      if (oldEvent.type !== 'rrule' && oldEvent.type !== 'recurring') {
        throw new Error('TaskNotes provider cannot convert single events into recurring events.');
      }
      const updatedTask = await syncRecurringSkipDates(taskNotes, task, oldEvent, newEvent);
      this.tasksById.set(updatedTask.path, updatedTask);
      return { file: { path: updatedTask.path }, lineNumber: undefined };
    }

    if (newEvent.type !== 'single' || !newEvent.date) {
      throw new Error('TaskNotes provider can only update single, dated events.');
    }

    const updatedTask = await rescheduleTaskAndSyncCompanions(
      taskNotes,
      this.plugin.app.vault,
      task,
      oldEvent,
      newEvent
    );
    this.tasksById.set(updatedTask.path, updatedTask);
    return { file: { path: updatedTask.path }, lineNumber: undefined };
  }

  deleteEvent(): Promise<void> {
    return Promise.reject(
      new Error('TaskNotes provider does not support deleting tasks from Full Calendar.')
    );
  }

  async createInstanceOverride(
    masterEvent: OFCEvent,
    _instanceDate: string,
    newEventData: OFCEvent
  ): Promise<EditableEventResponse> {
    if (newEventData.type !== 'single' || !newEventData.date) {
      throw new Error(
        'TaskNotes provider can only create single overrides for recurring instances.'
      );
    }
    const taskNotes = this.getTaskNotesPlugin();
    if (!taskNotes) {
      throw new Error('TaskNotes createTask API is not available.');
    }
    const masterPersistentId = this.getEventHandle(masterEvent)?.persistentId || masterEvent.uid;
    if (!masterPersistentId) {
      throw new Error('TaskNotes provider could not resolve recurring master ID.');
    }

    const createdTask = await createTaskNotesOverride(taskNotes, masterPersistentId, newEventData);
    this.tasksById.set(createdTask.path, createdTask);

    const isCompleted = taskNotes?.statusManager?.isCompletedStatus(createdTask.status) ?? false;
    const mapped = taskToEvent(createdTask, isCompleted);
    if (!mapped) {
      throw new Error('TaskNotes override task could not be mapped to a calendar event.');
    }

    const [createdEvent, location] = mapped;
    return [{ ...createdEvent, recurringEventId: masterPersistentId }, location];
  }

  public async toggleComplete(eventId: string, isDone: boolean): Promise<boolean> {
    try {
      const taskNotes = this.getTaskNotesPlugin();
      if (!taskNotes) return false;

      const event = PluginState.getCache()?.getEventById(eventId);
      if (!event?.uid) return false;

      const task = await taskNotes.cacheManager.getTaskInfo(event.uid);
      if (!task) return false;

      const { updatedTask, isCompleted, completedValue } = await toggleTaskStatus(taskNotes, task);
      const normalizedPath = this.normalizePersistentId(updatedTask.path || event.uid);
      this.tasksById.set(normalizedPath, updatedTask);

      const optimisticEvent: OFCEvent =
        event.type === 'single' ? { ...event, completed: completedValue } : event;

      await this.dispatchUpdates({
        additions: [],
        updates: [
          {
            persistentId: normalizedPath,
            event: optimisticEvent,
            location: { file: { path: normalizedPath }, lineNumber: undefined }
          }
        ],
        deletions: []
      });

      return isCompleted === isDone;
    } catch (e) {
      console.error('TaskNotes toggleComplete failed', e);
      return false;
    }
  }

  public async editInProviderUI(eventId: string): Promise<void> {
    const taskNotes = this.getTaskNotesPlugin();
    if (!taskNotes?.openTaskEditModal) return;

    const event = PluginState.getCache()?.getEventById(eventId);
    if (!event?.uid) return;

    const task = await taskNotes.cacheManager.getTaskInfo(event.uid);
    if (!task) return;

    await taskNotes.openTaskEditModal(task);
  }
}
