import { showNotice } from '../../utils/showNotice';
// src/providers/tasks/TasksPluginProvider.ts

/**
 * @file TasksPluginProvider.ts
 * @brief Obsidian Tasks integration as a calendar source.
 *
 * @description
 * This provider integrates with the Obsidian Tasks plugin by subscribing to its
 * cache. It displays tasks with due dates on the Full Calendar and supports
 * full CUD (Create, Update, Delete) operations by surgically modifying the
 * underlying markdown files.
 *
 * @license See LICENSE.md
 */

import { PluginState } from '../../core/PluginState';
import { EventRef, MarkdownView, TFile } from 'obsidian';
import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { OFCEvent, EventLocation } from '../../types';
import {
  CalendarProvider,
  CalendarProviderCapabilities,
  RecoverableProviderLoadError,
  SyncKeyProvider,
  TaskBacklogInfo,
  TaskBacklogItem,
  TaskBacklogProvider
} from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import { TasksProviderConfig } from './typesTask';
import { TasksConfigComponent, TasksConfigComponentProps } from './TasksConfigComponent';
import React from 'react';
import { ParsedUndatedTask } from './typesTask';
import { DateTime } from 'luxon';
import { t } from '../../features/i18n/i18n';
import {
  CalendarTask,
  TasksCacheData,
  TasksPluginTask,
  tasksToCalendarTasks
} from './taskPayloadAdapter';
import { TasksDateTarget, TasksDisplayFormat } from '../../types/settings';
import { TasksQueryFilter } from './TasksQueryFilter';

export { extractTimeFromTitle } from './taskPayloadAdapter';

// CHANGE: Define Scheduled emoji instead of Due
const getScheduledDateEmoji = (): string => '⏳';
const getStartDateEmoji = (): string => '🛫';
const getDueDateEmoji = (): string => '📅';
const TASKS_CACHE_TIMEOUT_MS = 5000;
const TASKS_CACHE_RETRY_DELAY_MS = 10000;
const DEFAULT_TIMED_TASK_DURATION_MINUTES = 30;

/**
 * Updates or removes the time block `(H:MM)` / `(H:MM AM)` or their range forms
 * embedded in a task's markdown line (i.e. inside the description, before metadata emojis).
 *
 * Pass `startTime = null` to strip the time block entirely (all-day).
 * Pass `startTime` equal to `endTime` (or `endTime = null`) to write a
 * single-time block.  Otherwise a range is written.
 *
 * @param line          The full task markdown line (after date update).
 * @param startTime     New start time in `HH:mm` (24h) format, or null to remove.
 * @param endTime       New end time in `HH:mm` (24h) format, or null for a single-time block.
 * @param timeFormat24h When true (default), write `H:MM`; when false write `H:MM AM/PM`.
 * @returns The modified line.
 */
export function updateTimeInLine(
  line: string,
  startTime: string | null,
  endTime: string | null,
  timeFormat24h = true,
  dateSymbol = getScheduledDateEmoji(),
  displayFormat: TasksDisplayFormat = 'standard'
): string {
  // Strip any existing time block (24h or 12h) from the line.
  const timeBlockPattern =
    /\s*\(\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?(?:-\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?)?\)/g;
  const dayPlannerPrefixPattern = /^(\s*-\s\[[ xX]\]\s+)\d{1,2}:\d{2}(?:\s*-\s*\d{1,2}:\d{2})?\s+/;
  let result = line.replace(timeBlockPattern, '').replace(dayPlannerPrefixPattern, '$1');

  if (startTime) {
    const isDayPlanner = displayFormat === 'dayPlanner';
    const fmt = (t: string) => formatTimeToken(t, isDayPlanner ? true : timeFormat24h);
    const fmtStart = fmt(startTime);
    const fmtEnd = endTime && endTime !== startTime ? fmt(endTime) : null;
    if (isDayPlanner) {
      const dayPlannerPrefix = fmtEnd ? `${fmtStart} - ${fmtEnd}` : fmtStart;
      const taskPrefixMatch = result.match(/^(\s*-\s\[[ xX]\]\s+)/);
      if (taskPrefixMatch) {
        result = `${taskPrefixMatch[1]}${dayPlannerPrefix} ${result.slice(taskPrefixMatch[1].length)}`;
      } else {
        result = `${dayPlannerPrefix} ${result}`;
      }
      return result.trimEnd();
    }

    const timeBlock = fmtEnd ? `(${fmtStart}-${fmtEnd})` : `(${fmtStart})`;

    // Insert before the configured date marker (guaranteed present after updateTaskLine).
    const scheduledEmojiIdx = result.indexOf(dateSymbol);
    if (scheduledEmojiIdx !== -1) {
      const before = result.slice(0, scheduledEmojiIdx).trimEnd();
      const after = result.slice(scheduledEmojiIdx);
      result = `${before} ${timeBlock} ${after}`;
    } else {
      // Fallback: insert before any block link, or append to end.
      const blockLinkRegex = /(\s*\^[a-zA-Z0-9-]+)$/;
      const blockLinkMatch = result.match(blockLinkRegex);
      if (blockLinkMatch) {
        const withoutBlockLink = result.replace(blockLinkRegex, '');
        result = `${withoutBlockLink.trimEnd()} ${timeBlock}${blockLinkMatch[1]}`;
      } else {
        result = `${result.trimEnd()} ${timeBlock}`;
      }
    }
  }

  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Formats a time string token for embedding in a task title.
 * Input is expected to be in `HH:mm` (24h) format as produced by `getTime()`.
 * When `timeFormat24h` is false the output is formatted as `h:mm AM/PM`.
 */
function formatTimeToken(time: string, timeFormat24h: boolean): string {
  if (timeFormat24h) {
    // Normalise to H:MM (drop leading zero) for a clean, compact appearance.
    const parsed = DateTime.fromFormat(time, 'HH:mm');
    return parsed.isValid ? parsed.toFormat('H:mm') : time;
  }
  // 12h: "9:00 AM", "12:30 PM", etc.
  const parsed = DateTime.fromFormat(time, 'HH:mm').isValid
    ? DateTime.fromFormat(time, 'HH:mm')
    : DateTime.fromFormat(time, 'H:mm');
  return parsed.isValid ? parsed.toFormat('h:mm a').toUpperCase() : time;
}

function summarizeDebugValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const valueWithMethods = value as {
    constructor?: { name?: string };
    toDate?: () => Date;
    toString?: () => string;
  };
  const summary: Record<string, unknown> = {
    type: valueWithMethods.constructor?.name,
    keys: Object.keys(value)
  };

  if (typeof valueWithMethods.toDate === 'function') {
    try {
      summary.toDate = valueWithMethods.toDate().toISOString();
    } catch (e) {
      summary.toDateError = e instanceof Error ? e.message : String(e);
    }
  }

  if (typeof valueWithMethods.toString === 'function') {
    try {
      summary.stringValue = valueWithMethods.toString();
    } catch (e) {
      summary.toStringError = e instanceof Error ? e.message : String(e);
    }
  }

  return summary;
}

export type EditableEventResponse = [OFCEvent, EventLocation | null];

export class TasksPluginProvider
  implements CalendarProvider<TasksProviderConfig>, SyncKeyProvider, TaskBacklogProvider
{
  // Static metadata for registry
  static readonly type = 'tasks';
  static readonly displayName = 'Obsidian Tasks';
  static getConfigurationComponent(): FCReactComponent<TasksConfigComponentProps> {
    return TasksConfigComponent;
  }
  /**
   * Adds or removes the done date (✅) from a task's markdown line.
   * @param originalMarkdown The original line of the task.
   * @param isDone The desired completion state.
   * @returns The modified task line.
   */
  private setDoneState(originalMarkdown: string, isDone: boolean): string {
    const doneDateRegex = /\s*✅\s*\d{4}-\d{2}-\d{2}/;
    const blockLinkRegex = /(\s*\^[a-zA-Z0-9-]+)$/;
    let updated = originalMarkdown;

    if (isDone) {
      // Change '- [ ]' to '- [x]'
      updated = updated.replace(/^- \[ \]/, '- [x]');
      // Add done date if not present
      if (!doneDateRegex.test(updated)) {
        const doneDate = DateTime.now().toFormat('yyyy-MM-dd');
        const doneComponent = ` ✅ ${doneDate}`;
        const blockLinkMatch = updated.match(blockLinkRegex);
        if (blockLinkMatch) {
          const contentWithoutBlockLink = updated.replace(blockLinkRegex, '');
          updated = `${contentWithoutBlockLink.trim()}${doneComponent}${blockLinkMatch[1]}`;
        } else {
          updated = `${updated.trim()}${doneComponent}`;
        }
      }
    } else {
      // Change '- [x]' to '- [ ]'
      updated = updated.replace(/^- \[x\]/, '- [ ]');
      // Remove done date if present
      updated = updated.replace(doneDateRegex, '').trim();
      // Preserve block link if present
      const blockLinkMatch = originalMarkdown.match(blockLinkRegex);
      if (blockLinkMatch && !updated.endsWith(blockLinkMatch[1])) {
        updated += blockLinkMatch[1];
      }
    }
    return updated;
  }

  public async toggleComplete(eventId: string, isDone: boolean): Promise<boolean> {
    try {
      const event = PluginState.getCache()?.getEventById(eventId);
      if (!event || !event.uid || event.type !== 'single') {
        throw new Error(
          `Event with session ID ${eventId} not found, has no UID, or is not a single event.`
        );
      }

      const task = this.allTasks.find(t => t.id === event.uid);
      if (!task) {
        throw new Error(`Task with persistent ID ${event.uid} not found in provider cache.`);
      }

      const newLine = this.setDoneState(task.originalMarkdown, isDone);

      // If the line didn't change, we don't need to do anything.
      if (newLine === task.originalMarkdown) {
        return true;
      }

      // 1. Perform the I/O to update the file.
      // The line number on the task object is 1-based, which is what replaceTaskInFile expects.
      await this.replaceTaskInFile(task.filePath, task.lineNumber, [newLine]);

      // 2. Optimistically update the cache.
      // The file watcher will eventually confirm this, but we want immediate UI feedback.
      const completedStatus = isDone ? DateTime.now().toISO() : false; // MODIFIED

      // Construct a new event object that is explicitly a 'single' type event.
      const optimisticEvent: OFCEvent = {
        ...event, // Spread the original single event
        completed: completedStatus // Now this property is valid.
      };

      // Update our internal task model to match the optimistic state.
      task.originalMarkdown = newLine;
      task.isDone = isDone;

      // Push the update to the EventCache.
      // We use the persistentId (event.uid) for the update payload.
      await PluginState.getProviderRegistry().processProviderUpdates(this.source.id, {
        additions: [],
        updates: [
          {
            persistentId: event.uid,
            event: optimisticEvent,
            location: { file: { path: task.filePath }, lineNumber: task.lineNumber }
          }
        ],
        deletions: []
      });

      return true;
    } catch (e) {
      if (e instanceof Error) {
        console.error('Error toggling task completion:', e);
        showNotice(e.message);
      }
      // If an error occurs, we return false. The CalendarView will revert the checkbox.
      return false;
    }
  }

  private app: ObsidianInterface;
  private plugin: FullCalendarPlugin;
  private source: TasksProviderConfig;

  // Live array of all tasks from the Tasks plugin.
  private allTasks: CalendarTask[] = [];
  private isSubscribed = false;
  private isTasksCacheWarm = false;
  private tasksPromise: Promise<void> | null = null;
  private tasksPromiseResolve: (() => void) | null = null;
  private tasksCacheTimeoutId: number | null = null;
  private isProcessingUpdate = false; // Singleton guard for live update

  readonly type = 'tasks';
  readonly displayName = 'Obsidian Tasks';
  readonly isRemote = false;
  readonly loadPriority = 130;

  // Keep constructor broadly typed to align with ProviderRegistry's dynamic loading signature.

  constructor(source: TasksProviderConfig, plugin: FullCalendarPlugin, app?: ObsidianInterface) {
    if (!app) {
      throw new Error('TasksPluginProvider requires an Obsidian app interface.');
    }
    this.app = app;
    this.plugin = plugin;
    this.source = source;
    // No parser instantiation needed anymore.
  }

  private debugTasksCachePayload(origin: string, cacheData: TasksCacheData): void {
    const tasks = Array.isArray(cacheData.tasks) ? cacheData.tasks : [];
    const taskKeyUnion = Array.from(
      tasks.reduce((keys, task) => {
        Object.keys(task as unknown as Record<string, unknown>).forEach(key => keys.add(key));
        return keys;
      }, new Set<string>())
    ).sort();

    console.debug('[Full Calendar][Tasks] cache payload received', {
      origin,
      sourceId: this.source.id,
      state: cacheData.state,
      taskCount: tasks.length,
      taskKeyUnion,
      sampleTasks: tasks.slice(0, 5).map((task, index) => {
        const rawTask = task as unknown as Record<string, unknown>;
        return {
          index,
          keys: Object.keys(rawTask).sort(),
          values: Object.fromEntries(
            Object.entries(rawTask).map(([key, value]) => [key, summarizeDebugValue(value)])
          )
        };
      }),
      rawPayload: cacheData
    });
  }

  /**
   * On-demand cache warming: requests initial data from the Tasks plugin and waits for response.
   */
  private isWarmTasksCacheData(
    cacheData: TasksCacheData
  ): cacheData is TasksCacheData & { tasks: TasksPluginTask[] } {
    return (
      !!cacheData &&
      ((typeof cacheData.state === 'string' && cacheData.state === 'Warm') ||
        (typeof cacheData.state === 'object' && cacheData.state?.name === 'Warm')) &&
      Array.isArray(cacheData.tasks)
    );
  }

  private clearTasksCacheTimeout(): void {
    if (this.tasksCacheTimeoutId) {
      window.clearTimeout(this.tasksCacheTimeoutId);
      this.tasksCacheTimeoutId = null;
    }
  }

  private resolveTasksCacheWarm(cacheData: TasksCacheData): boolean {
    if (!this.isWarmTasksCacheData(cacheData)) {
      return false;
    }

    this.clearTasksCacheTimeout();
    this.allTasks = this.parseTasksForCalendar(cacheData.tasks);
    this.isTasksCacheWarm = true;

    const resolve = this.tasksPromiseResolve;
    this.tasksPromise = null;
    this.tasksPromiseResolve = null;
    resolve?.();

    return true;
  }

  private _ensureTasksCacheIsWarm(): Promise<void> {
    if (this.isTasksCacheWarm) {
      return Promise.resolve();
    }
    if (this.tasksPromise) {
      return this.tasksPromise;
    }
    let didTimeout = false;
    this.tasksPromise = new Promise((resolve, reject) => {
      this.tasksPromiseResolve = resolve;

      const callback = (cacheData: TasksCacheData) => {
        // this.debugTasksCachePayload('request-cache-update', cacheData);
        if (this.resolveTasksCacheWarm(cacheData)) {
          if (didTimeout) {
            PluginState.getProviderRegistry().reloadProviderNow(this.source.id);
          }
        }
      };
      const workspace = this.plugin.app.workspace as unknown as {
        trigger: (event: string, callback: (data: TasksCacheData) => void) => void;
      };

      this.tasksCacheTimeoutId = window.setTimeout(() => {
        if (!this.isTasksCacheWarm) {
          didTimeout = true;
          console.error(
            "Full Calendar: Timed out waiting for Tasks plugin's cache. The Tasks plugin may not be enabled or may have failed to load."
          );
          this.clearTasksCacheTimeout();
          this.tasksPromise = null;
          this.tasksPromiseResolve = null;
          reject(new RecoverableProviderLoadError("Timed out waiting for Tasks plugin's cache."));
        }
      }, TASKS_CACHE_TIMEOUT_MS);
      workspace.trigger('obsidian-tasks-plugin:request-cache-update', callback);
    });
    return this.tasksPromise;
  }

  public getLoadRetryPolicy(): { retryDelayMs: number } {
    return { retryDelayMs: TASKS_CACHE_RETRY_DELAY_MS };
  }

  private getDefaultEndTime(startTime: string): string {
    const formats = ['H:mm', 'HH:mm', 'h:mm a'];
    for (const format of formats) {
      const parsed = DateTime.fromFormat(startTime, format);
      if (parsed.isValid) {
        return parsed.plus({ minutes: DEFAULT_TIMED_TASK_DURATION_MINUTES }).toFormat('HH:mm');
      }
    }
    return startTime;
  }

  /**
   * Helper to convert a CalendarTask to an OFCEvent and EventLocation.
   * Uses the configured Tasks calendar display date field with no fallback.
   */
  private _taskToOFCEvent(task: CalendarTask): [OFCEvent, EventLocation | null] | null {
    const displayDate = this.getTaskDateValue(
      task,
      PluginState.getSettings().tasksIntegration.calendarDisplayDateTarget
    );

    if (!displayDate) {
      return null;
    }

    const ofcEvent: OFCEvent = task.startTime
      ? {
          type: 'single',
          title: task.title,
          allDay: false,
          date: DateTime.fromJSDate(displayDate).toFormat('yyyy-MM-dd'),
          endDate: null,
          startTime: task.startTime,
          endTime: task.endTime ?? this.getDefaultEndTime(task.startTime),
          completed: task.isDone ? DateTime.now().toISO() : false,
          uid: task.id
        }
      : {
          type: 'single',
          title: task.title,
          allDay: true,
          date: DateTime.fromJSDate(displayDate).toFormat('yyyy-MM-dd'),
          endDate: null,
          completed: task.isDone ? DateTime.now().toISO() : false,
          uid: task.id
        };

    const location: EventLocation = {
      file: { path: task.filePath },
      lineNumber: task.lineNumber
    };

    return [ofcEvent, location];
  }

  /**
   * Initializes the provider by subscribing to live updates from the Tasks plugin.
   * Now performs granular diff and sync with EventCache.
   */
  public initialize(): void {
    if (this.isSubscribed) {
      return;
    }
    // The handler is now async to await cache operations.
    const handleLiveCacheUpdate = async (cacheData: TasksCacheData) => {
      if (
        this.isProcessingUpdate ||
        !cacheData ||
        !(
          (typeof cacheData.state === 'string' && cacheData.state === 'Warm') ||
          (typeof cacheData.state === 'object' && cacheData.state?.name === 'Warm')
        ) ||
        !cacheData.tasks
      ) {
        return;
      }

      if (!this.isTasksCacheWarm) {
        this.resolveTasksCacheWarm(cacheData);
        PluginState.getProviderRegistry().reloadProviderNow(this.source.id);
        return;
      }

      if (!PluginState.getCache()) {
        return;
      }

      this.isProcessingUpdate = true;
      try {
        const oldTasksMap = new Map(this.allTasks.map(task => [task.id, task]));
        const newTasks = this.parseTasksForCalendar(cacheData.tasks);
        const newTasksMap = new Map(newTasks.map(task => [task.id, task]));

        const providerPayload = {
          additions: [] as { event: OFCEvent; location: EventLocation | null }[],
          updates: [] as {
            persistentId: string;
            event: OFCEvent;
            location: EventLocation | null;
          }[],
          deletions: [] as string[]
        };

        // Find deletions
        for (const [id, oldTask] of oldTasksMap.entries()) {
          if (!newTasksMap.has(id)) {
            if (
              this.getTaskDateValue(
                oldTask,
                PluginState.getSettings().tasksIntegration.calendarDisplayDateTarget
              )
            ) {
              providerPayload.deletions.push(id);
            }
          }
        }

        // Find additions and modifications
        for (const [id, newTask] of newTasksMap.entries()) {
          const oldTask = oldTasksMap.get(id);
          const transformed = this._taskToOFCEvent(newTask);
          const wasDated = oldTask
            ? !!this.getTaskDateValue(
                oldTask,
                PluginState.getSettings().tasksIntegration.calendarDisplayDateTarget
              )
            : false;
          const isDated = transformed !== null;

          if (!oldTask && isDated) {
            // Addition
            const [ofcEvent, location] = transformed;
            providerPayload.additions.push({ event: ofcEvent, location });
          } else if (oldTask && oldTask.originalMarkdown !== newTask.originalMarkdown) {
            // Modification
            if (wasDated && isDated) {
              // Update
              const [ofcEvent, location] = transformed;
              providerPayload.updates.push({ persistentId: id, event: ofcEvent, location });
            } else if (!wasDated && isDated) {
              // Addition to calendar
              const [ofcEvent, location] = transformed;
              providerPayload.additions.push({ event: ofcEvent, location });
            } else if (wasDated && !isDated) {
              // Deletion from calendar
              providerPayload.deletions.push(id);
            }
          }
        }

        // Update the provider's internal state for the next diff.
        this.allTasks = newTasks;

        // Send the entire batch of changes to the ProviderRegistry for translation and execution.
        if (
          providerPayload.additions.length > 0 ||
          providerPayload.updates.length > 0 ||
          providerPayload.deletions.length > 0
        ) {
          await PluginState.getProviderRegistry().processProviderUpdates(
            this.source.id,
            providerPayload
          );
        }

        // Refresh the backlog view.
        PluginState.getProviderRegistry().refreshBacklogViews();
      } finally {
        this.isProcessingUpdate = false;
      }
    };

    const workspace = this.plugin.app.workspace as unknown as {
      on: (event: string, callback: (data: TasksCacheData) => void) => EventRef;
    };

    this.plugin.registerEvent(
      workspace.on('obsidian-tasks-plugin:cache-update', data => {
        // this.debugTasksCachePayload('cache-update', data);
        void handleLiveCacheUpdate(data);
      })
    );
    this.isSubscribed = true;
  }

  /**
   * Parses the raw task data from the Tasks plugin into our internal, simplified CalendarTask format.
   */
  private parseTasksForCalendar(tasks: TasksPluginTask[]): CalendarTask[] {
    return tasksToCalendarTasks(tasks);
  }

  // ====================================================================
  // DATA-SERVING METHODS (READ)
  // ====================================================================

  async getEvents(_range?: { start: Date; end: Date }): Promise<EditableEventResponse[]> {
    await this._ensureTasksCacheIsWarm();
    return this.allTasks
      .map(task => this._taskToOFCEvent(task))
      .filter((e): e is [OFCEvent, EventLocation | null] => e !== null);
  }

  public async filterTasksByGlobalQuery(tasks: CalendarTask[]): Promise<CalendarTask[]> {
    const tasksPlugin = (
      this.plugin.app as unknown as {
        plugins?: {
          plugins?: Record<
            string,
            {
              settings?: { globalQuery?: string };
              loadData?: () => Promise<{ globalQuery?: string } | null>;
            }
          >;
        };
      }
    ).plugins?.plugins?.['obsidian-tasks-plugin'];
    const persistedData = tasksPlugin?.settings?.globalQuery
      ? null
      : await tasksPlugin?.loadData?.();
    const globalQuery = tasksPlugin?.settings?.globalQuery ?? persistedData?.globalQuery;

    if (!globalQuery) {
      return tasks;
    }
    const filter = new TasksQueryFilter(globalQuery);
    return filter.filter(tasks);
  }

  public async getUndatedTasks(): Promise<ParsedUndatedTask[]> {
    await this._ensureTasksCacheIsWarm();
    let tasks = this.allTasks.filter(t => !this.hasBacklogTargetDate(t) && !t.isDone);

    const settings = PluginState.getSettings();
    const backlogQuery = settings.tasksIntegration.backlogQuery?.trim();
    if (backlogQuery) {
      tasks = new TasksQueryFilter(backlogQuery).filter(tasks);
    }

    if (settings.tasksIntegration.includeGlobalQueryInBacklog) {
      tasks = await this.filterTasksByGlobalQuery(tasks);
    }

    return tasks.map(t => ({
      title: t.title,
      isDone: t.isDone,
      location: {
        path: t.filePath,
        // FIX: The task ID used by the backlog MUST match the canonical 0-indexed ID.
        // Our internal lineNumber is 1-based, so subtract 1 to get the 0-based index for the ID.
        lineNumber: t.lineNumber - 1
      }
    }));
  }

  public getTaskBacklogInfo(): TaskBacklogInfo {
    return {
      id: this.source.id,
      name: this.source.name || 'Tasks',
      title: 'Tasks backlog'
    };
  }

  public async getTaskBacklogItems(): Promise<TaskBacklogItem[]> {
    const tasks = await this.getUndatedTasks();
    return tasks.map(task => ({
      id: `${task.location.path}::${task.location.lineNumber}`,
      title: task.title,
      completed: task.isDone,
      subtitle: `${task.location.path}:${task.location.lineNumber}`
    }));
  }

  public async setTaskBacklogItemComplete(taskId: string, isDone: boolean): Promise<boolean> {
    try {
      const task = this.allTasks.find(t => t.id === taskId);
      if (!task) {
        throw new Error(`Task with persistent ID ${taskId} not found in provider cache.`);
      }

      const newLine = this.setDoneState(task.originalMarkdown, isDone);
      if (newLine === task.originalMarkdown) {
        return true;
      }

      await this.replaceTaskInFile(task.filePath, task.lineNumber, [newLine]);
      task.originalMarkdown = newLine;
      task.isDone = isDone;
      PluginState.getProviderRegistry().refreshBacklogViews();
      return true;
    } catch (e) {
      if (e instanceof Error) {
        console.error('Error toggling backlog task completion:', e);
        showNotice(e.message);
      }
      return false;
    }
  }

  public async openTaskBacklogItem(taskId: string): Promise<void> {
    const [filePath, lineNumberStr] = taskId.split('::');
    const lineNumber = Number.parseInt(lineNumberStr, 10);
    if (!filePath || !Number.isFinite(lineNumber)) {
      throw new Error('Invalid task handle format. Expected "filePath::lineNumber".');
    }

    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      throw new Error(`Task file not found: ${filePath}`);
    }

    const leaf = this.plugin.app.workspace.getLeaf(true);
    await leaf.openFile(file);
    if (leaf.view instanceof MarkdownView) {
      leaf.view.editor.setCursor({ line: lineNumber, ch: 0 });
    }
  }

  public async deleteTaskBacklogItem(taskId: string): Promise<void> {
    await this.deleteEvent({ persistentId: taskId });
    this.allTasks = this.allTasks.filter(task => task.id !== taskId);
    PluginState.getProviderRegistry().refreshBacklogViews();
  }

  public getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
    const events: EditableEventResponse[] = [];
    // Filter the live cache for tasks in the specified file. This is very fast.
    const tasksInFile = this.allTasks.filter(task => task.filePath === file.path);

    // REPLACE the for-loop with corrected date priority and single-day logic
    for (const task of tasksInFile) {
      const result = this._taskToOFCEvent(task);
      if (result) events.push(result);
    }
    return Promise.resolve(events);
  }

  // ====================================================================
  // FILE-WRITING METHODS (CUD)
  // ====================================================================

  /**
   * Surgically replaces a line in a file.
   */
  private async replaceTaskInFile(filePath: string, lineNumber: number, newLines: string[]) {
    const file = this.app.getFileByPath(filePath);
    if (!file) throw new Error(`File not found: ${filePath}`);

    await this.app.rewrite(file, content => {
      const lines = content.split('\n');
      // line number is 1-based, convert to 0-based index.
      lines.splice(lineNumber - 1, 1, ...newLines);
      return lines.join('\n');
    });
  }

  /**
   * Updates the date component of a task's original markdown line.
   * Changed to use Scheduled Date (⏳) instead of Due Date (📅).
   */
  private getDateTargetEmoji(target: TasksDateTarget): string {
    switch (target) {
      case 'startDate':
        return getStartDateEmoji();
      case 'dueDate':
        return getDueDateEmoji();
      case 'scheduledDate':
      default:
        return getScheduledDateEmoji();
    }
  }

  private setTaskDate(task: CalendarTask, target: TasksDateTarget, date: Date | null): void {
    switch (target) {
      case 'startDate':
        task.startDate = date;
        break;
      case 'dueDate':
        task.dueDate = date;
        break;
      case 'scheduledDate':
        task.scheduledDate = date;
        break;
    }
  }

  private getTaskDateValue(task: CalendarTask, target: TasksDateTarget): Date | null {
    switch (target) {
      case 'startDate':
        return task.startDate;
      case 'dueDate':
        return task.dueDate;
      case 'scheduledDate':
      default:
        return task.scheduledDate;
    }
  }

  private hasBacklogTargetDate(task: CalendarTask): boolean {
    return !!this.getTaskDateValue(
      task,
      PluginState.getSettings().tasksIntegration.backlogDateTarget
    );
  }

  private getTaskPlanningDateTargets(): TasksDateTarget[] {
    const {
      backlogDateTarget,
      calendarDisplayDateTarget
    } = PluginState.getSettings().tasksIntegration;
    return Array.from(new Set<TasksDateTarget>([calendarDisplayDateTarget, backlogDateTarget]));
  }

  private updateTaskLine(
    originalMarkdown: string,
    newDate: Date,
    target: TasksDateTarget = 'scheduledDate'
  ): string {
    const dateSymbol = this.getDateTargetEmoji(target);
    const newDateString = DateTime.fromJSDate(newDate).toFormat('yyyy-MM-dd'); // MODIFIED
    const newDateComponent = `${dateSymbol} ${newDateString}`;
    const dateRegex = new RegExp(`${dateSymbol}\\s*\\d{4}-\\d{2}-\\d{2}`, 'u');

    if (originalMarkdown.match(dateRegex)) {
      return originalMarkdown.replace(dateRegex, newDateComponent);
    }
    // Otherwise, append it, being careful to preserve any block links (^uuid).
    const blockLinkRegex = /(\s*\^[a-zA-Z0-9-]+)$/;
    const blockLinkMatch = originalMarkdown.match(blockLinkRegex);
    if (blockLinkMatch) {
      const contentWithoutBlockLink = originalMarkdown.replace(blockLinkRegex, '');
      return `${contentWithoutBlockLink.trim()} ${newDateComponent}${blockLinkMatch[1]}`;
    }
    return `${originalMarkdown.trim()} ${newDateComponent}`;
  }

  private clearTaskDateLine(
    originalMarkdown: string,
    target: TasksDateTarget = 'scheduledDate'
  ): string {
    const dateSymbol = this.getDateTargetEmoji(target);
    const dateRegex = new RegExp(`\\s*${escapeRegExp(dateSymbol)}\\s*\\d{4}-\\d{2}-\\d{2}`, 'u');
    const withoutTime = updateTimeInLine(
      originalMarkdown,
      null,
      null,
      PluginState.getSettings().timeFormat24h,
      dateSymbol,
      PluginState.getSettings().tasksIntegration.taskDisplayFormat ?? 'dayPlanner'
    );
    return withoutTime.replace(dateRegex, '').trimEnd();
  }

  // --- REPLACE createEvent and updateEvent with new versions ---
  createEvent(_event: OFCEvent): Promise<EditableEventResponse> {
    showNotice(t('notices.tasks.createViaPlugin'));
    return Promise.reject(
      new Error(
        'Full Calendar cannot create tasks directly. Please use the Tasks plugin modal or commands.'
      )
    );
  }

  async updateEvent(
    handle: EventHandle,
    _oldEvent: OFCEvent,
    newEvent: OFCEvent
  ): Promise<EventLocation | null> {
    if (newEvent.type !== 'single' || !newEvent.date) {
      throw new Error('Tasks provider can only update single, dated events.');
    }

    const newDate = DateTime.fromISO(newEvent.date).toJSDate();
    const validation = await this.canBeScheduledAt(newEvent, newDate);
    if (!validation.isValid) {
      showNotice(validation.reason || t('notices.tasks.defaultValidation'));
      throw new Error(validation.reason || 'This task cannot be scheduled on this date.');
    }

    const taskId = handle.persistentId;

    // Extract time from the dropped event.  allDay → clear time block; timed → update it.
    const startTime = newEvent.allDay ? null : newEvent.startTime;
    const endTime = newEvent.allDay ? null : (newEvent.endTime ?? null);
    const timeFormat24h = PluginState.getSettings().timeFormat24h;
    const taskDisplayFormat = PluginState.getSettings().tasksIntegration.taskDisplayFormat;

    await this._surgicallyUpdateTask(
      taskId,
      newDate,
      startTime,
      endTime,
      timeFormat24h,
      taskDisplayFormat ?? 'dayPlanner'
    );
    const [filePath, lineNumberStr] = taskId.split('::');
    return {
      file: { path: filePath },
      lineNumber: parseInt(lineNumberStr, 10)
    };
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    const [filePath, lineNumberStr] = handle.persistentId.split('::');
    if (!filePath || !lineNumberStr) {
      throw new Error('Invalid task handle format. Expected "filePath::lineNumber".');
    }
    // To delete a task, we replace its line with an empty string.
    // The line number in the handle is 0-indexed, but replaceTaskInFile expects a 1-based index.
    await this.replaceTaskInFile(filePath, parseInt(lineNumberStr, 10) + 1, []);
  }

  /**
   * Centralized helper for surgically updating a task line in a file.
   * This is called by both updateEvent (for drags) and scheduleTask (for backlog drops).
   * @param taskId        The persistent ID of the task (filePath::lineNumber).
   * @param newDate       The new date to apply to the task.
   * @param startTime     New start time in HH:mm, null to clear, or undefined to leave unchanged.
   * @param endTime       New end time in HH:mm, null to clear, or undefined to leave unchanged.
   * @param timeFormat24h Whether to write times in 24h format (default true).
   */
  private async _surgicallyUpdateTask(
    taskId: string,
    newDate: Date,
    startTime?: string | null,
    endTime?: string | null,
    timeFormat24h = true,
    taskDisplayFormat: TasksDisplayFormat = 'dayPlanner'
  ): Promise<void> {
    const task = this.allTasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error(`Cannot find original task with ID ${taskId} to update.`);
    }
    const dateTarget = PluginState.getSettings().tasksIntegration.calendarDisplayDateTarget;
    let newLine = this.updateTaskLine(task.originalMarkdown, newDate, dateTarget);
    // Only update the time block when explicitly provided (undefined = no change).
    if (startTime !== undefined) {
      newLine = updateTimeInLine(
        newLine,
        startTime,
        endTime ?? null,
        timeFormat24h,
        this.getDateTargetEmoji(dateTarget),
        taskDisplayFormat
      );
    }
    await this.replaceTaskInFile(task.filePath, task.lineNumber, [newLine]);
    task.originalMarkdown = newLine;
    this.setTaskDate(task, dateTarget, newDate);
    if (startTime !== undefined) {
      task.startTime = startTime;
      task.endTime = startTime ? (endTime ?? null) : null;
    }
  }

  public ownsTaskId(taskId: string): boolean {
    const parts = taskId.split('::');
    return (
      parts.length === 2 && !taskId.startsWith('caldav::') && !taskId.startsWith('googletasks_')
    );
  }

  public async validateTaskSchedule(
    taskId: string,
    date: Date
  ): Promise<{ isValid: boolean; reason?: string }> {
    const task = this.allTasks.find(t => t.id === taskId);
    if (!task) {
      return { isValid: true };
    }
    return this.canBeScheduledAt(
      {
        uid: taskId,
        title: '',
        type: 'single',
        allDay: true,
        date: '',
        endDate: null,
        completed: false
      },
      date
    );
  }

  public async scheduleTask(taskId: string, date: Date, _allDay = true): Promise<void> {
    const task = this.allTasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error(`Cannot find original task to schedule at ${taskId}`);
    }
    const dateTargets = this.getTaskPlanningDateTargets();
    const newLine = dateTargets.reduce(
      (line, dateTarget) => this.updateTaskLine(line, date, dateTarget),
      task.originalMarkdown
    );
    await this.replaceTaskInFile(task.filePath, task.lineNumber, [newLine]);
    task.originalMarkdown = newLine;
    for (const dateTarget of dateTargets) {
      this.setTaskDate(task, dateTarget, date);
    }
    const tasksApi = (
      this.plugin.app as unknown as {
        plugins?: {
          plugins?: Record<
            string,
            { apiV1?: { editTaskLineModal: (line: string) => Promise<string | undefined> } }
          >;
        };
      }
    ).plugins?.plugins?.['obsidian-tasks-plugin']?.apiV1;
    if (tasksApi && PluginState.getSettings().tasksIntegration.openEditModalAfterBacklogDrop) {
      const editedTaskLine = await tasksApi.editTaskLineModal(newLine);
      if (editedTaskLine !== undefined && editedTaskLine !== newLine) {
        await this.replaceTaskInFile(task.filePath, task.lineNumber, [editedTaskLine]);
        task.originalMarkdown = editedTaskLine;
      }
    } else if (
      !tasksApi &&
      PluginState.getSettings().tasksIntegration.openEditModalAfterBacklogDrop
    ) {
      showNotice(t('notices.tasks.scheduledNoModal'));
    }
  }

  public async unscheduleTask(taskId: string): Promise<void> {
    const task = this.allTasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error(`Cannot find original task to unschedule at ${taskId}`);
    }

    const dateTargets = this.getTaskPlanningDateTargets();
    const newLine = dateTargets.reduce(
      (line, dateTarget) => this.clearTaskDateLine(line, dateTarget),
      task.originalMarkdown
    );
    await this.replaceTaskInFile(task.filePath, task.lineNumber, [newLine]);
    task.originalMarkdown = newLine;
    for (const dateTarget of dateTargets) {
      this.setTaskDate(task, dateTarget, null);
    }
    task.startTime = null;
    task.endTime = null;
  }

  public async editInProviderUI(eventId: string): Promise<void> {
    const tasksApi = (
      this.plugin.app as unknown as {
        plugins?: {
          plugins?: Record<
            string,
            { apiV1?: { editTaskLineModal: (line: string) => Promise<string | undefined> } }
          >;
        };
      }
    ).plugins?.plugins?.['obsidian-tasks-plugin']?.apiV1;
    if (!tasksApi) {
      showNotice(t('notices.tasks.apiUnavailable'));
      return;
    }

    // Step 1: Use the eventId (Session ID) to look up the full OFCEvent from the main cache.
    const eventFromCache = PluginState.getCache()?.getEventById(eventId);
    if (!eventFromCache || !eventFromCache.uid) {
      throw new Error(
        `Could not find event or its persistent UID in the main cache for session ID ${eventId}.`
      );
    }
    const persistentId = eventFromCache.uid; // This is the "filePath::lineNumber" ID.

    // Step 2: Use the persistentId to find the corresponding task in the provider's internal cache.
    const task = this.allTasks.find(t => t.id === persistentId);
    if (!task) {
      // This error is more specific and helpful for debugging.
      throw new Error(`Task with persistent ID ${persistentId} not found in the provider's cache.`);
    }

    // Step 3: Proceed with the rest of the logic, which is now guaranteed to have the correct data.
    const originalMarkdown = task.originalMarkdown;
    const editedTaskLine = await tasksApi.editTaskLineModal(originalMarkdown);

    if (editedTaskLine && editedTaskLine !== originalMarkdown) {
      // The lineNumber on the task object is 1-based, which is what replaceTaskInFile expects.
      await this.replaceTaskInFile(task.filePath, task.lineNumber, [editedTaskLine]);
    }
  }

  /**
   * Determines if an event can be scheduled at the given date.
   * This implements guardrail logic to prevent scheduling conflicts.
   */
  public canBeScheduledAt(
    event: OFCEvent,
    date: Date
  ): Promise<{ isValid: boolean; reason?: string }> {
    if (!event.uid) {
      // If there's no UID, we can't look up the task. Default to allowing it.
      return Promise.resolve({ isValid: true });
    }

    // The event UID is the persistent handle (e.g., "path/to/file.md::0").
    const task = this.allTasks.find(t => t.id === event.uid);
    if (!task) {
      // Task not found in the provider's cache. Allow the drop but log a warning.
      console.warn(`[Tasks Provider] Could not find task with ID ${event.uid} for validation.`);
      return Promise.resolve({ isValid: true });
    }

    // Use Luxon to perform a clean, time-zone-agnostic comparison of dates.
    const dropDate = DateTime.fromJSDate(date).startOf('day');

    // Rule 1: Cannot schedule before the start date.
    if (task.startDate) {
      const startDate = DateTime.fromJSDate(task.startDate).startOf('day');
      if (dropDate < startDate) {
        return Promise.resolve({
          isValid: false,
          reason: `Cannot schedule before the start date (${startDate.toFormat('yyyy-MM-dd')}).`
        });
      }
    }

    // Rule 2: Cannot schedule after the due date.
    if (task.dueDate) {
      const dueDate = DateTime.fromJSDate(task.dueDate).startOf('day');
      if (dropDate > dueDate) {
        return Promise.resolve({
          isValid: false,
          reason: `Cannot schedule after the due date (${dueDate.toFormat('yyyy-MM-dd')}).`
        });
      }
    }

    // If all checks pass, the drop is valid.
    return Promise.resolve({ isValid: true });
  }

  // ====================================================================
  // PROVIDER METADATA & CONFIG
  // ====================================================================

  getCapabilities(): CalendarProviderCapabilities {
    return {
      canCreate: false, // Prevents UI creation and standard addEvent pathway.
      canEdit: true,
      canDelete: true,
      hasCustomEditUI: true,
      contextMenu: {
        allowGenericTaskActions: false,
        providesNativeTaskSemantics: true
      }
    };
  }

  getConfigurationComponent(): FCReactComponent<TasksConfigComponentProps> {
    return TasksConfigComponent;
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    if (event.uid) {
      return { persistentId: event.uid };
    }
    return null;
  }

  computeSyncKey(event: OFCEvent): string {
    return event.uid || JSON.stringify(event);
  }

  public isFileRelevant(file: TFile): boolean {
    return file.extension === 'md';
  }

  createInstanceOverride(
    _masterEvent: OFCEvent,
    _instanceDate: string,
    _newEventData: OFCEvent
  ): Promise<EditableEventResponse> {
    return Promise.reject(new Error('Tasks provider does not support recurring event overrides.'));
  }

  // UI Components for settings remain the same.
  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    const Row: React.FC<{ source: Partial<import('../../types').CalendarInfo> }> = ({ source }) => {
      const name = source.name ?? this.displayName;
      return React.createElement(
        'div',
        { className: 'setting-item-control ofc-settings-row-tasks-provider' },
        React.createElement('input', {
          disabled: true,
          type: 'text',
          value: name,
          className: 'ofc-setting-input'
        })
      );
    };
    return Row;
  }
}
