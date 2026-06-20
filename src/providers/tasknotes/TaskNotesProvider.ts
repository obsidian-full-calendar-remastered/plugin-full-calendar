import { PluginState } from '../../core/PluginState';
import React from 'react';
import { DateTime } from 'luxon';
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
import { TaskNotesProviderConfig } from './typesTaskNotes';
import {
  TaskNotesConfigComponent,
  TaskNotesConfigComponentProps
} from './TaskNotesConfigComponent';
import { t } from '../../features/i18n/i18n';
import { modifyFrontmatterString } from '../fullnote/frontmatter';

export type EditableEventResponse = [OFCEvent, EventLocation | null];

type TaskNotesTask = {
  path: string;
  title: string;
  status: string;
  dateModified?: string;
  due?: string;
  scheduled?: string;
  recurrence?: string;
  recurrence_anchor?: 'scheduled' | 'completion';
  complete_instances?: string[];
  skipped_instances?: string[];
  timeEstimate?: number;
  completedDate?: string;
  customProperties?: Record<string, unknown>;
  recurringEventId?: string;
};

type TaskNotesTaskCreationData = {
  title: string;
  scheduled?: string;
  timeEstimate?: number | null;
  customFrontmatter?: Record<string, unknown>;
};

const TASK_UPDATE_COALESCE_MS = 80;
const TASKNOTES_COMPANION_LINK_PROPERTIES = ['due-link', 'deadline-link'] as const;

type TaskNotesPluginApi = {
  cacheManager: {
    getAllTasks(): Promise<TaskNotesTask[]>;
    getTaskInfo(path: string): Promise<TaskNotesTask | null>;
    on(event: string, cb: (data: unknown) => void): void;
    off?(event: string, cb: (data: unknown) => void): void;
  };
  taskService: {
    updateProperty(
      task: TaskNotesTask,
      property: 'scheduled' | 'due' | 'timeEstimate',
      value: unknown
    ): Promise<TaskNotesTask>;
    toggleStatus?(task: TaskNotesTask): Promise<TaskNotesTask>;
    toggleRecurringTaskComplete?(task: TaskNotesTask, date?: Date): Promise<TaskNotesTask>;
    toggleRecurringTaskSkipped?(task: TaskNotesTask, date?: Date): Promise<TaskNotesTask>;
    createTask?(
      taskData: TaskNotesTaskCreationData,
      options?: { applyDefaults?: boolean }
    ): Promise<{ taskInfo: TaskNotesTask }>;
  };
  statusManager?: {
    isCompletedStatus(status: string): boolean;
  };
  openTaskEditModal?: (
    task: TaskNotesTask,
    onTaskUpdated?: (task: TaskNotesTask) => void
  ) => void | Promise<void>;
  openTaskSelectorWithCreate?: () => Promise<void>;
  openTaskCreationModal?: (prePopulatedValues?: Partial<{ title: string }>) => void;
  emitter?: {
    on(event: string, cb: (data: unknown) => void): void;
    off(event: string, cb: (data: unknown) => void): void;
  };
};

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
  private useEmitterEvents = false;
  private lastTaskVersionByPath: Map<string, number> = new Map();
  private pendingTaskUpdateTimers: Map<string, number> = new Map();
  private pendingTaskUpdatePayloads: Map<string, TaskNotesTask | undefined> = new Map();
  private taskUpdatedHandler?: (data: unknown) => void;
  private taskDeletedHandler?: (data: unknown) => void;
  private fileUpdatedHandler?: (data: unknown) => void;
  private fileDeletedHandler?: (data: unknown) => void;
  private fileRenamedHandler?: (data: unknown) => void;
  private dataChangedHandler?: () => void;
  readonly type = 'tasknotes';
  readonly displayName = 'TaskNotes';
  readonly isRemote = false;
  readonly loadPriority = 135;

  constructor(
    source: TaskNotesProviderConfig,
    plugin: FullCalendarPlugin,
    _app?: ObsidianInterface
  ) {
    this.plugin = plugin;
    this.source = source;
  }

  private getTaskNotesPlugin(): TaskNotesPluginApi | null {
    const app = this.plugin.app as unknown as {
      plugins?: { plugins?: Record<string, unknown> };
    };
    const taskNotes = app.plugins?.plugins?.tasknotes;
    return taskNotes ? (taskNotes as TaskNotesPluginApi) : null;
  }

  private normalizePersistentId(path: string): string {
    return path.replace(/\\/g, '/');
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
    if (this.reloadTimer) {
      window.clearTimeout(this.reloadTimer);
    }

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

  private getTaskVersion(task: TaskNotesTask | null | undefined): number | null {
    const raw = task?.dateModified;
    if (!raw) return null;

    const parsed = DateTime.fromISO(raw);
    if (!parsed.isValid) return null;

    return parsed.toMillis();
  }

  private enqueueTaskUpdated(path: string, payloadTask?: TaskNotesTask): void {
    const normalizedPath = this.normalizePersistentId(path);

    this.pendingTaskUpdatePayloads.set(normalizedPath, payloadTask);

    const existingTimer = this.pendingTaskUpdateTimers.get(normalizedPath);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    const timer = window.setTimeout(() => {
      this.pendingTaskUpdateTimers.delete(normalizedPath);
      const latestPayload = this.pendingTaskUpdatePayloads.get(normalizedPath);
      this.pendingTaskUpdatePayloads.delete(normalizedPath);

      void this.handleTaskUpdated(normalizedPath, latestPayload);
    }, TASK_UPDATE_COALESCE_MS);

    this.pendingTaskUpdateTimers.set(normalizedPath, timer);
  }

  private getScheduledParts(value: unknown): { date: string; time: string | null } {
    if (!value) {
      return { date: '', time: null };
    }

    const toPrimitiveString = (input: unknown): string | null => {
      if (input === null || input === undefined) return null;
      if (typeof input === 'string') return input;
      if (typeof input === 'number' || typeof input === 'boolean' || typeof input === 'bigint') {
        return String(input);
      }
      if (input instanceof Date && !Number.isNaN(input.valueOf())) {
        return input.toISOString();
      }
      return null;
    };

    const toStringOrEmpty = (input: unknown): string => {
      if (input === null || input === undefined) return '';
      return toPrimitiveString(input) ?? '';
    };

    const toStringOrNull = (input: unknown): string | null => {
      if (input === null || input === undefined || input === '') return null;
      return toPrimitiveString(input);
    };

    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        const arrayValue = value as unknown[];
        const rawDate = arrayValue.length > 0 ? arrayValue[0] : undefined;
        const rawTime = arrayValue.length > 1 ? arrayValue[1] : undefined;
        return { date: toStringOrEmpty(rawDate), time: toStringOrNull(rawTime) };
      }
      const record = value as Record<string, unknown>;
      return {
        date: toStringOrEmpty(record.date),
        time: toStringOrNull(record.time)
      };
    }

    let strValue: string;
    if (typeof value === 'string') {
      strValue = value;
    } else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      strValue = String(value);
    } else {
      return { date: '', time: null };
    }
    let datePart = strValue;
    let timePart = null;

    if (strValue.includes('T')) {
      [datePart, timePart] = strValue.split('T');
    } else if (strValue.includes(' ')) {
      const parts = strValue.split(' ');
      datePart = parts[0];
      timePart = parts[1];
    }

    const isoStr = timePart ? `${datePart}T${timePart}` : datePart;
    const parsed = DateTime.fromISO(isoStr);

    if (parsed.isValid) {
      return {
        date: parsed.toFormat('yyyy-MM-dd'),
        time: timePart ? parsed.toFormat('HH:mm') : null
      };
    }

    return { date: datePart, time: timePart ? timePart.slice(0, 5) : null };
  }

  private normalizeTime(value: string | null | undefined): string | null {
    if (!value) return null;

    const formats = ['HH:mm', 'H:mm', 'h:mm a'];
    for (const format of formats) {
      const parsed = DateTime.fromFormat(value, format);
      if (parsed.isValid) {
        return parsed.toFormat('HH:mm');
      }
    }

    return null;
  }

  private computeEndTime(date: string, startTime: string, minutes: number): string | null {
    const start = DateTime.fromISO(`${date}T${startTime}`);
    if (!start.isValid) return null;

    return start.plus({ minutes }).toFormat('HH:mm');
  }

  private computeMinutes(startTime: string, endTime: string): number | null {
    const start = DateTime.fromFormat(startTime, 'HH:mm');
    const end = DateTime.fromFormat(endTime, 'HH:mm');
    if (!start.isValid || !end.isValid) return null;

    let diff = end.diff(start, 'minutes').minutes;
    if (diff <= 0) {
      diff += 24 * 60;
    }
    return Math.round(diff);
  }

  private taskNotesDailyNoteLink(date: string | null): string | null {
    return date ? `"[[${date}]]"` : null;
  }

  private scheduledDateFromValue(value: string): string {
    return value.split('T')[0] || value;
  }

  private frontmatterLineContainsDate(contents: string, property: string, date: string): boolean {
    const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escapedProperty}:.*${date}`, 'm').test(contents);
  }

  private async getTaskFileScheduleCompanionUpdates(
    task: TaskNotesTask,
    scheduledDate: string,
    previousDate?: string
  ): Promise<{ modifications: Record<string, unknown>; shouldUpdateDue: boolean }> {
    const file = this.plugin.app.vault.getFileByPath(task.path);
    if (!file) return { modifications: {}, shouldUpdateDue: false };

    const contents = await this.plugin.app.vault.read(file);
    const modifications: Record<string, unknown> = {
      'scheduled-link': this.taskNotesDailyNoteLink(scheduledDate)
    };
    let shouldUpdateDue = false;

    if (previousDate) {
      for (const property of TASKNOTES_COMPANION_LINK_PROPERTIES) {
        if (this.frontmatterLineContainsDate(contents, property, previousDate)) {
          modifications[property] = this.taskNotesDailyNoteLink(scheduledDate);
        }
      }

      shouldUpdateDue = this.frontmatterLineContainsDate(contents, 'due', previousDate);

      if (this.frontmatterLineContainsDate(contents, 'deadline', previousDate)) {
        modifications.deadline = scheduledDate;
      }
    }

    return { modifications, shouldUpdateDue };
  }

  private async updateTaskFileScheduleCompanionProperties(
    task: TaskNotesTask,
    modifications: Record<string, unknown>
  ): Promise<void> {
    if (Object.keys(modifications).length === 0) return;

    const file = this.plugin.app.vault.getFileByPath(task.path);
    if (!file) return;

    const contents = await this.plugin.app.vault.read(file);
    const updatedContents = modifyFrontmatterString(contents, modifications);
    if (updatedContents !== contents) {
      await this.plugin.app.vault.modify(file, updatedContents);
    }
  }

  private isTaskNotesSourceId(): boolean {
    return /^tasknotes_\d+$/i.test(this.source.id);
  }

  private toTaskNotesNLPQuery(event: OFCEvent): string {
    if (event.type !== 'single' || !event.date) {
      throw new Error(t('notices.tasknotes.handoffSingleOnly'));
    }

    const title = event.title?.trim();
    if (!title) {
      throw new Error(t('notices.tasknotes.handoffTitleRequired'));
    }

    if (event.allDay) {
      return `${title} scheduled ${event.date}`;
    }

    const normalizedStart = this.normalizeTime(event.startTime ?? null);
    if (!normalizedStart) {
      throw new Error(t('notices.tasknotes.handoffStartTimeRequired'));
    }

    const normalizedEnd = this.normalizeTime(event.endTime ?? null);
    let durationToken = '';
    if (normalizedEnd) {
      const minutes = this.computeMinutes(normalizedStart, normalizedEnd);
      if (minutes && minutes > 0) {
        durationToken = ` ${minutes}m`;
      }
    }

    return `${title} scheduled ${event.date} ${normalizedStart}${durationToken}`;
  }

  private prefillTaskSelectorInput(text: string, attempt = 0): void {
    const modal = window.document.querySelector('.task-selector-with-create-modal');
    const input = modal?.querySelector('input.prompt-input') as HTMLInputElement | null;

    if (input) {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
      input.setSelectionRange(text.length, text.length);
      return;
    }

    if (attempt < 20) {
      window.setTimeout(() => this.prefillTaskSelectorInput(text, attempt + 1), 50);
    }
  }

  private prefillTaskCreationInput(text: string, attempt = 0): void {
    const activeEditor = (this.plugin.app.workspace as unknown as { activeEditor?: unknown })
      .activeEditor as
      | {
          editMode?: {
            setValue?: (value: string) => void;
            editor?: { cm?: { focus?: () => void } };
          };
        }
      | undefined;

    const hasCreateModal = !!window.document.querySelector('.mod-tasknotes .nl-markdown-editor');
    if (!hasCreateModal) {
      if (attempt < 20) {
        window.setTimeout(() => this.prefillTaskCreationInput(text, attempt + 1), 50);
      }
      return;
    }

    const editMode = activeEditor?.editMode;
    if (editMode?.setValue) {
      editMode.setValue(text);
      editMode.editor?.cm?.focus?.();
      return;
    }

    const fallbackTextarea: HTMLTextAreaElement | null = window.document.querySelector(
      '.mod-tasknotes .nl-input'
    );
    if (fallbackTextarea) {
      fallbackTextarea.value = text;
      fallbackTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      fallbackTextarea.focus();
      fallbackTextarea.setSelectionRange(text.length, text.length);
      return;
    }

    if (attempt < 20) {
      window.setTimeout(() => this.prefillTaskCreationInput(text, attempt + 1), 50);
    }
  }

  private getDispatchMode(): 'search' | 'create' {
    return this.source.dispatchMode || 'search';
  }

  private parseTaskRecurrence(task: TaskNotesTask): { rrule: string; dtstart?: string } | null {
    if (!task.recurrence || typeof task.recurrence !== 'string') {
      return null;
    }

    const normalized = task.recurrence.replace(/\r\n/g, '\n').trim();
    if (!normalized) {
      return null;
    }

    const lines = normalized
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    const dtstartLine = lines.find(line => line.startsWith('DTSTART'));
    const rruleLineFromLines = lines.find(line => line.startsWith('RRULE:'));

    if (rruleLineFromLines) {
      return {
        rrule: rruleLineFromLines,
        dtstart: dtstartLine
      };
    }

    if (normalized.startsWith('DTSTART:') && normalized.includes(';FREQ=')) {
      const firstSemicolon = normalized.indexOf(';');
      if (firstSemicolon > 0) {
        const dtstart = normalized.slice(0, firstSemicolon);
        const rulePart = normalized.slice(firstSemicolon + 1).trim();
        if (rulePart.includes('FREQ=')) {
          const rrule = rulePart.startsWith('RRULE:') ? rulePart : `RRULE:${rulePart}`;
          return { rrule, dtstart };
        }
      }
    }

    const rulePart = normalized.startsWith('RRULE:') ? normalized : `RRULE:${normalized}`;
    if (!rulePart.includes('FREQ=')) {
      return null;
    }

    return {
      rrule: rulePart,
      dtstart: dtstartLine
    };
  }

  private extractDateAndTimeFromDtstart(
    dtstartLine?: string
  ): { date: string; time: string | null } | null {
    if (!dtstartLine) {
      return null;
    }

    const valuePart = dtstartLine.split(':')[1];
    if (!valuePart) {
      return null;
    }

    const normalized = valuePart.replace(/Z$/, '');
    if (!/^\d{8}(T\d{6})?$/.test(normalized)) {
      return null;
    }

    const dateRaw = normalized.slice(0, 8);
    const date = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;

    if (normalized.length === 8) {
      return { date, time: null };
    }

    const timeRaw = normalized.slice(9, 15);
    const time = `${timeRaw.slice(0, 2)}:${timeRaw.slice(2, 4)}`;
    return { date, time };
  }

  private getTaskRecurringParentId(task: TaskNotesTask): string | undefined {
    if (typeof task.recurringEventId === 'string' && task.recurringEventId.trim().length > 0) {
      return task.recurringEventId;
    }

    const fromCustom = task.customProperties?.recurringEventId;
    if (typeof fromCustom === 'string' && fromCustom.trim().length > 0) {
      return fromCustom;
    }

    return undefined;
  }

  private getRecurringStateForDate(
    task: TaskNotesTask,
    instanceDate: string
  ): RecurringInstanceState {
    const completed = Array.isArray(task.complete_instances)
      ? task.complete_instances.includes(instanceDate)
      : false;
    const skipped = Array.isArray(task.skipped_instances)
      ? task.skipped_instances.includes(instanceDate)
      : false;
    return { completed, skipped };
  }

  private async getTaskForEvent(event: OFCEvent): Promise<TaskNotesTask | null> {
    if (!event.uid) {
      return null;
    }

    const normalizedUid = this.normalizePersistentId(event.uid);
    const cached = this.tasksById.get(normalizedUid);
    if (cached) {
      return cached;
    }

    const taskNotes = this.getTaskNotesPlugin();
    if (!taskNotes) {
      return null;
    }

    let fetched = await taskNotes.cacheManager.getTaskInfo(normalizedUid);
    if (!fetched && normalizedUid.includes('/')) {
      fetched = await taskNotes.cacheManager.getTaskInfo(normalizedUid.replace(/\//g, '\\'));
    }
    if (fetched) {
      this.tasksById.set(this.normalizePersistentId(fetched.path), fetched);
    }
    return fetched;
  }

  private buildRecurringEvent(task: TaskNotesTask): OFCEvent | null {
    const parsedRecurrence = this.parseTaskRecurrence(task);
    if (!parsedRecurrence) {
      return null;
    }

    const scheduledParts = this.getScheduledParts(task.scheduled);
    const dtstartParts = this.extractDateAndTimeFromDtstart(parsedRecurrence.dtstart);

    const startDate = scheduledParts.date || dtstartParts?.date || '';
    if (!startDate) {
      return null;
    }

    const startTime = this.normalizeTime(scheduledParts.time ?? dtstartParts?.time ?? null);

    const uniqueSkipDates = Array.from(
      new Set((task.skipped_instances ?? []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))
    );

    if (!startTime) {
      return {
        type: 'rrule',
        title: task.title,
        allDay: true,
        startDate,
        endDate: null,
        rrule: parsedRecurrence.rrule,
        skipDates: uniqueSkipDates,
        isTask: true,
        uid: this.normalizePersistentId(task.path),
        recurringEventId: this.getTaskRecurringParentId(task)
      };
    }

    const endTime =
      typeof task.timeEstimate === 'number' && task.timeEstimate > 0
        ? (this.computeEndTime(startDate, startTime, task.timeEstimate) ?? startTime)
        : startTime;

    return {
      type: 'rrule',
      title: task.title,
      allDay: false,
      startDate,
      endDate: null,
      startTime,
      endTime,
      rrule: parsedRecurrence.rrule,
      skipDates: uniqueSkipDates,
      isTask: true,
      uid: this.normalizePersistentId(task.path),
      recurringEventId: this.getTaskRecurringParentId(task)
    };
  }

  private taskToEvent(task: TaskNotesTask): [OFCEvent, EventLocation | null] | null {
    if (task.recurrence) {
      const recurringEvent = this.buildRecurringEvent(task);
      if (recurringEvent) {
        return [recurringEvent, { file: { path: task.path }, lineNumber: undefined }];
      }
    }

    if (!task.scheduled) {
      return null;
    }

    const { date, time } = this.getScheduledParts(task.scheduled);
    const hasTimedSlot = !!time;

    const taskNotes = this.getTaskNotesPlugin();
    const isCompleted = taskNotes?.statusManager?.isCompletedStatus(task.status) ?? false;
    const completedDate = task.completedDate || DateTime.now().toFormat('yyyy-MM-dd');

    const event: OFCEvent = hasTimedSlot
      ? (() => {
          const safeTime = time ?? '00:00';
          const endTime =
            typeof task.timeEstimate === 'number' && task.timeEstimate > 0
              ? (this.computeEndTime(date, safeTime, task.timeEstimate) ?? safeTime)
              : safeTime;
          return {
            type: 'single',
            title: task.title,
            allDay: false,
            date,
            endDate: null,
            startTime: safeTime,
            endTime,
            completed: isCompleted ? completedDate : false,
            uid: this.normalizePersistentId(task.path),
            recurringEventId: this.getTaskRecurringParentId(task)
          };
        })()
      : {
          type: 'single',
          title: task.title,
          allDay: true,
          date,
          endDate: null,
          completed: isCompleted ? completedDate : false,
          uid: this.normalizePersistentId(task.path),
          recurringEventId: this.getTaskRecurringParentId(task)
        };

    return [event, { file: { path: task.path }, lineNumber: undefined }];
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

      let task: TaskNotesTask | null = payloadTask ?? null;
      if (!task || task.scheduled === undefined) {
        task = await taskNotes.cacheManager.getTaskInfo(path);
        if (!task && normalizedPath !== path) {
          task = await taskNotes.cacheManager.getTaskInfo(normalizedPath);
        }
      }

      // Always prefer canonical cache data when available to avoid transient payload regressions.
      const canonicalTask = await taskNotes.cacheManager.getTaskInfo(path);
      if (canonicalTask) {
        task = canonicalTask;
      }

      let providerRegistry;
      try {
        providerRegistry = PluginState.getProviderRegistry();
      } catch {
        return;
      }

      const globalIdentifier = `${this.source.id}::${normalizedPath}`;
      const existingSessionId = await providerRegistry.getSessionId(globalIdentifier);
      if (!task) {
        if (existingSessionId) {
          this.scheduleReload();
        }
        return;
      }

      const incomingVersion = this.getTaskVersion(task);
      const lastVersion = this.lastTaskVersionByPath.get(normalizedPath);
      if (incomingVersion !== null && lastVersion !== undefined && incomingVersion < lastVersion) {
        return;
      }

      // Keep local map updated for getEvents fallback.
      this.tasksById.set(normalizedPath, task);

      // TaskNotes update events may contain partial task payloads during toggle flows.
      // If mapping fails, refetch canonical task info before deciding to delete.
      let eventEntry = this.taskToEvent(task);
      if (!eventEntry) {
        const canonicalTask = await taskNotes.cacheManager.getTaskInfo(path);
        if (canonicalTask) {
          task = canonicalTask;
          this.tasksById.set(normalizedPath, canonicalTask);
          eventEntry = this.taskToEvent(canonicalTask);
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
    } catch {
      return;
    }

    let providerRegistry;
    try {
      providerRegistry = PluginState.getProviderRegistry();
    } catch {
      return;
    }

    const globalIdentifier = `${this.source.id}::${normalizedPath}`;
    const existingSessionId = await providerRegistry.getSessionId(globalIdentifier);
    if (!existingSessionId) return;

    this.tasksById.delete(normalizedPath);
    await this.dispatchUpdates({ additions: [], updates: [], deletions: [normalizedPath] });
  }

  private async handleTaskRenamed(oldPath: string, newPath: string): Promise<void> {
    await this.handleTaskDeleted(oldPath);
    await this.handleTaskUpdated(newPath);
  }

  public initialize(): void {
    if (this.isSubscribed) {
      return;
    }

    const taskNotes = this.getTaskNotesPlugin();
    if (!taskNotes) {
      this.scheduleSubscriptionRetry();
      return;
    }

    this.isSubscribed = true;
    this.subscriptionAttempts = 0;

    this.useEmitterEvents = !!taskNotes.emitter;

    if (this.useEmitterEvents) {
      this.taskUpdatedHandler = (data: unknown) => {
        const payload = data as {
          path?: string;
          originalTask?: TaskNotesTask;
          updatedTask?: TaskNotesTask;
        };
        if (payload?.path) {
          this.enqueueTaskUpdated(payload.path, payload.updatedTask);
        }
      };
      taskNotes.emitter?.on('task-updated', this.taskUpdatedHandler);

      this.taskDeletedHandler = (data: unknown) => {
        const payload = data as { path?: string };
        if (payload?.path) {
          void this.handleTaskDeleted(payload.path).catch(e => {
            console.error('[TaskNotesProvider] task-deleted handler failed:', e);
          });
        }
      };
      taskNotes.emitter?.on('task-deleted', this.taskDeletedHandler);
    } else {
      this.fileUpdatedHandler = (data: unknown) => {
        const payload = data as { path?: string };
        if (payload?.path) {
          this.enqueueTaskUpdated(payload.path);
        }
      };
      taskNotes.cacheManager.on('file-updated', this.fileUpdatedHandler);
    }

    // Fallback if emitter is not configured for cache-level events
    this.fileDeletedHandler = (data: unknown) => {
      const payload = data as { path?: string };
      if (payload?.path) {
        void this.handleTaskDeleted(payload.path).catch(e => {
          console.error('[TaskNotesProvider] file-deleted handler failed:', e);
        });
      }
    };
    taskNotes.cacheManager.on('file-deleted', this.fileDeletedHandler);

    this.fileRenamedHandler = (data: unknown) => {
      const payload = data as { oldPath?: string; newPath?: string };
      if (payload?.oldPath && payload?.newPath) {
        void this.handleTaskRenamed(payload.oldPath, payload.newPath).catch(e => {
          console.error('[TaskNotesProvider] file-renamed handler failed:', e);
        });
      }
    };
    taskNotes.cacheManager.on('file-renamed', this.fileRenamedHandler);

    this.dataChangedHandler = () => {
      if (!this.useEmitterEvents) {
        this.scheduleReload();
      }
    };
    taskNotes.cacheManager.on('data-changed', this.dataChangedHandler);

    this.scheduleReload(0);
  }

  public teardown(): void {
    const taskNotes = this.getTaskNotesPlugin();

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

    if (taskNotes?.emitter) {
      if (this.taskUpdatedHandler) {
        taskNotes.emitter.off('task-updated', this.taskUpdatedHandler);
      }
      if (this.taskDeletedHandler) {
        taskNotes.emitter.off('task-deleted', this.taskDeletedHandler);
      }
    }

    if (taskNotes?.cacheManager.off) {
      if (this.fileUpdatedHandler) {
        taskNotes.cacheManager.off('file-updated', this.fileUpdatedHandler);
      }
      if (this.fileDeletedHandler) {
        taskNotes.cacheManager.off('file-deleted', this.fileDeletedHandler);
      }
      if (this.fileRenamedHandler) {
        taskNotes.cacheManager.off('file-renamed', this.fileRenamedHandler);
      }
      if (this.dataChangedHandler) {
        taskNotes.cacheManager.off('data-changed', this.dataChangedHandler);
      }
    }

    this.taskUpdatedHandler = undefined;
    this.taskDeletedHandler = undefined;
    this.fileUpdatedHandler = undefined;
    this.fileDeletedHandler = undefined;
    this.fileRenamedHandler = undefined;
    this.dataChangedHandler = undefined;
    this.isSubscribed = false;
    this.useEmitterEvents = false;
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
          const version = this.getTaskVersion(task);
          return version === null ? null : ([normalizedPath, version] as const);
        })
        .filter((entry): entry is readonly [string, number] => entry !== null)
    );

    return tasks
      .map(task => this.taskToEvent(task))
      .filter((entry): entry is [OFCEvent, EventLocation | null] => !!entry);
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
    if (!instanceDate) {
      return null;
    }

    if (event.type === 'single' && event.recurringEventId) {
      const completed =
        event.completed !== undefined && event.completed !== null && !!event.completed;
      return { completed, skipped: false };
    }

    if (event.type !== 'rrule' && event.type !== 'recurring') {
      return null;
    }

    const task = await this.getTaskForEvent(event);
    if (!task || !task.recurrence) {
      return null;
    }

    return this.getRecurringStateForDate(task, instanceDate);
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
    if (!taskNotes) {
      return false;
    }

    let task = await this.getTaskForEvent(event);
    if (!task || !task.recurrence) {
      return false;
    }

    const instanceDateObj = DateTime.fromISO(instanceDate).toJSDate();
    const currentState = this.getRecurringStateForDate(task, instanceDate);

    if (nextState.completed !== currentState.completed) {
      if (!taskNotes.taskService.toggleRecurringTaskComplete) {
        return false;
      }
      task = await taskNotes.taskService.toggleRecurringTaskComplete(task, instanceDateObj);
    }

    const refreshedState = this.getRecurringStateForDate(task, instanceDate);
    if (nextState.skipped !== refreshedState.skipped) {
      if (!taskNotes.taskService.toggleRecurringTaskSkipped) {
        return false;
      }
      task = await taskNotes.taskService.toggleRecurringTaskSkipped(task, instanceDateObj);
    }

    this.tasksById.set(this.normalizePersistentId(task.path), task);
    return true;
  }

  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    const Row: React.FC<{ source: Partial<import('../../types').CalendarInfo> }> = ({ source }) => {
      const name = source.name ?? this.displayName;
      return React.createElement(
        'div',
        { className: 'setting-item-control ofc-settings-row-tasknotes-provider' },
        React.createElement('input', {
          className: 'ofc-settings-row-text',
          disabled: true,
          value: name
        })
      );
    };
    return Row;
  }

  async createEvent(event: OFCEvent): Promise<EditableEventResponse> {
    if (!this.isTaskNotesSourceId()) {
      throw new Error(t('notices.tasknotes.invalidSourceId', { sourceId: this.source.id }));
    }

    const taskNotes = this.getTaskNotesPlugin();
    const nlpQuery = this.toTaskNotesNLPQuery(event);
    const dispatchMode = this.getDispatchMode();

    if (dispatchMode === 'create') {
      if (!taskNotes?.openTaskCreationModal) {
        throw new Error(t('notices.tasknotes.createModalUnavailable'));
      }
      taskNotes.openTaskCreationModal();
      this.prefillTaskCreationInput(nlpQuery);
    } else {
      if (!taskNotes?.openTaskSelectorWithCreate) {
        throw new Error(t('notices.tasknotes.selectorUnavailable'));
      }
      const openPromise = taskNotes.openTaskSelectorWithCreate();
      this.prefillTaskSelectorInput(nlpQuery);
      await openPromise;
    }

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

    let task = await taskNotes.cacheManager.getTaskInfo(handle.persistentId);
    if (!task) {
      throw new Error(`TaskNotes task not found for ${handle.persistentId}.`);
    }

    if (newEvent.type === 'rrule' || newEvent.type === 'recurring') {
      if (oldEvent.type !== 'rrule' && oldEvent.type !== 'recurring') {
        throw new Error('TaskNotes provider cannot convert single events into recurring events.');
      }

      if (!taskNotes.taskService.toggleRecurringTaskSkipped) {
        throw new Error('TaskNotes recurring skip API is not available.');
      }

      const oldSkipSet = new Set((oldEvent.skipDates ?? []).filter(Boolean));
      const newSkipSet = new Set((newEvent.skipDates ?? []).filter(Boolean));

      for (const date of newSkipSet) {
        if (!oldSkipSet.has(date)) {
          task = await taskNotes.taskService.toggleRecurringTaskSkipped(
            task,
            DateTime.fromISO(date).toJSDate()
          );
        }
      }

      for (const date of oldSkipSet) {
        if (!newSkipSet.has(date)) {
          task = await taskNotes.taskService.toggleRecurringTaskSkipped(
            task,
            DateTime.fromISO(date).toJSDate()
          );
        }
      }

      this.tasksById.set(task.path, task);
      return { file: { path: task.path }, lineNumber: undefined };
    }

    if (newEvent.type !== 'single' || !newEvent.date) {
      throw new Error('TaskNotes provider can only update single, dated events.');
    }

    const startTime = !newEvent.allDay ? this.normalizeTime(newEvent.startTime) : null;
    const endTime = !newEvent.allDay ? this.normalizeTime(newEvent.endTime ?? null) : null;

    const scheduledValue =
      newEvent.allDay || !startTime ? newEvent.date : `${newEvent.date}T${startTime}`;

    let timeEstimateValue: number | null = null;
    if (!newEvent.allDay && startTime && endTime) {
      timeEstimateValue = this.computeMinutes(startTime, endTime);
    }

    const previousDate = oldEvent.type === 'single' ? oldEvent.date : undefined;
    const scheduledDate = this.scheduledDateFromValue(scheduledValue);
    const { modifications, shouldUpdateDue } = await this.getTaskFileScheduleCompanionUpdates(
      task,
      scheduledDate,
      previousDate
    );

    let updatedTask = await taskNotes.taskService.updateProperty(task, 'scheduled', scheduledValue);
    if (shouldUpdateDue) {
      updatedTask = await taskNotes.taskService.updateProperty(updatedTask, 'due', scheduledDate);
    }
    await this.updateTaskFileScheduleCompanionProperties(updatedTask, modifications);

    try {
      updatedTask = await taskNotes.taskService.updateProperty(
        updatedTask,
        'timeEstimate',
        timeEstimateValue
      );
    } catch {
      // Scheduling is the primary source-of-truth for calendar placement.
      // Avoid reverting UI position if optional estimate persistence fails.
    }

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
    if (!taskNotes?.taskService.createTask) {
      throw new Error('TaskNotes createTask API is not available.');
    }

    const masterPersistentId = this.getEventHandle(masterEvent)?.persistentId || masterEvent.uid;
    if (!masterPersistentId) {
      throw new Error('TaskNotes provider could not resolve recurring master ID.');
    }

    const startTime = !newEventData.allDay
      ? this.normalizeTime(newEventData.startTime ?? null)
      : null;
    const endTime = !newEventData.allDay ? this.normalizeTime(newEventData.endTime ?? null) : null;
    const scheduledValue =
      newEventData.allDay || !startTime ? newEventData.date : `${newEventData.date}T${startTime}`;

    let timeEstimateValue: number | null = null;
    if (!newEventData.allDay && startTime && endTime) {
      timeEstimateValue = this.computeMinutes(startTime, endTime);
    }

    const created = await taskNotes.taskService.createTask(
      {
        title: newEventData.title,
        scheduled: scheduledValue,
        timeEstimate: timeEstimateValue,
        customFrontmatter: { recurringEventId: masterPersistentId }
      },
      { applyDefaults: false }
    );

    const createdTask = created.taskInfo;
    this.tasksById.set(createdTask.path, createdTask);

    const mapped = this.taskToEvent(createdTask);
    if (!mapped) {
      throw new Error('TaskNotes override task could not be mapped to a calendar event.');
    }

    const [createdEvent, location] = mapped;
    return [
      {
        ...createdEvent,
        recurringEventId: masterPersistentId
      },
      location
    ];
  }

  public async toggleComplete(eventId: string, isDone: boolean): Promise<boolean> {
    try {
      const taskNotes = this.getTaskNotesPlugin();
      if (!taskNotes) {
        return false;
      }

      const event = PluginState.getCache()?.getEventById(eventId);
      if (!event?.uid) {
        return false;
      }

      const task = await taskNotes.cacheManager.getTaskInfo(event.uid);
      if (!task || !taskNotes.taskService.toggleStatus) {
        return false;
      }

      const updatedTask = await taskNotes.taskService.toggleStatus(task);
      const normalizedPath = this.normalizePersistentId(updatedTask.path || event.uid);
      this.tasksById.set(normalizedPath, updatedTask);

      const currentCompleted =
        taskNotes.statusManager?.isCompletedStatus(updatedTask.status) ?? false;

      const completedValue = currentCompleted
        ? updatedTask.completedDate || DateTime.now().toFormat('yyyy-MM-dd')
        : false;

      const optimisticEvent: OFCEvent =
        event.type === 'single'
          ? {
              ...event,
              completed: completedValue
            }
          : event;

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

      return currentCompleted === isDone;
    } catch (e) {
      console.error('TaskNotes toggleComplete failed', e);
      return false;
    }
  }

  public async editInProviderUI(eventId: string): Promise<void> {
    const taskNotes = this.getTaskNotesPlugin();
    if (!taskNotes?.openTaskEditModal) {
      return;
    }

    const event = PluginState.getCache()?.getEventById(eventId);
    if (!event?.uid) {
      return;
    }

    const task = await taskNotes.cacheManager.getTaskInfo(event.uid);
    if (!task) {
      return;
    }

    await taskNotes.openTaskEditModal(task);
  }
}
