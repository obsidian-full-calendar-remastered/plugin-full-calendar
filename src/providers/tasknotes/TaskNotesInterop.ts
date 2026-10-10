import type { App, Vault, Workspace } from 'obsidian';
import { DateTime } from 'luxon';
import { OFCEvent } from '../../types';
import { RecurringInstanceState } from '../Provider';
import { modifyFrontmatterString } from '../fullnote/frontmatter';
import { t } from '../../features/i18n/i18n';
import { TaskNotesPluginApi, TaskNotesTask } from './typesTaskNotes';
import {
  computeMinutes,
  getRecurringStateForDate,
  normalizeTime,
  scheduledDateFromValue
} from './TaskNotesMapper';

export const TASKNOTES_COMPANION_LINK_PROPERTIES = ['due-link', 'deadline-link'] as const;

export type TaskNotesSubscriptionCallbacks = {
  onTaskUpdated: (path: string, updatedTask?: TaskNotesTask) => void;
  onTaskDeleted: (path: string) => void;
  onTaskRenamed: (oldPath: string, newPath: string) => void;
  onDataChanged: () => void;
};

export type TaskNotesSubscription = {
  unsubscribe: () => void;
  useEmitterEvents: boolean;
};

export function getTaskNotesPlugin(app: App): TaskNotesPluginApi | null {
  const rawApp = app as unknown as {
    plugins?: { plugins?: Record<string, unknown> };
  };
  const taskNotes = rawApp.plugins?.plugins?.tasknotes;
  return taskNotes ? (taskNotes as TaskNotesPluginApi) : null;
}

export function taskNotesDailyNoteLink(date: string | null): string | null {
  return date ? `"[[${date}]]"` : null;
}

export function frontmatterLineContainsDate(
  contents: string,
  property: string,
  date: string
): boolean {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escapedProperty}:.*${date}`, 'm').test(contents);
}

export async function getTaskFileScheduleCompanionUpdates(
  vault: Vault,
  task: TaskNotesTask,
  scheduledDate: string,
  previousDate?: string
): Promise<{ modifications: Record<string, unknown>; shouldUpdateDue: boolean }> {
  const file = vault.getFileByPath(task.path);
  if (!file) return { modifications: {}, shouldUpdateDue: false };

  const contents = await vault.read(file);
  const modifications: Record<string, unknown> = {
    'scheduled-link': taskNotesDailyNoteLink(scheduledDate)
  };
  let shouldUpdateDue = false;

  if (previousDate) {
    for (const property of TASKNOTES_COMPANION_LINK_PROPERTIES) {
      if (frontmatterLineContainsDate(contents, property, previousDate)) {
        modifications[property] = taskNotesDailyNoteLink(scheduledDate);
      }
    }

    shouldUpdateDue = frontmatterLineContainsDate(contents, 'due', previousDate);

    if (frontmatterLineContainsDate(contents, 'deadline', previousDate)) {
      modifications.deadline = scheduledDate;
    }
  }

  return { modifications, shouldUpdateDue };
}

export async function updateTaskFileScheduleCompanionProperties(
  vault: Vault,
  task: TaskNotesTask,
  modifications: Record<string, unknown>
): Promise<void> {
  if (Object.keys(modifications).length === 0) return;

  const file = vault.getFileByPath(task.path);
  if (!file) return;

  const contents = await vault.read(file);
  const updatedContents = modifyFrontmatterString(contents, modifications);
  if (updatedContents !== contents) {
    await vault.modify(file, updatedContents);
  }
}

export function prefillTaskSelectorInput(text: string, attempt = 0): void {
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
    window.setTimeout(() => prefillTaskSelectorInput(text, attempt + 1), 50);
  }
}

export function prefillTaskCreationInput(workspace: Workspace, text: string, attempt = 0): void {
  const activeEditor = (workspace as unknown as { activeEditor?: unknown })?.activeEditor as
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
      window.setTimeout(() => prefillTaskCreationInput(workspace, text, attempt + 1), 50);
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
    window.setTimeout(() => prefillTaskCreationInput(workspace, text, attempt + 1), 50);
  }
}

export async function dispatchTaskNotesModal(
  taskNotes: TaskNotesPluginApi | null,
  workspace: Workspace,
  dispatchMode: 'search' | 'create',
  nlpQuery: string
): Promise<void> {
  if (dispatchMode === 'create') {
    if (!taskNotes?.openTaskCreationModal) {
      throw new Error(t('notices.tasknotes.createModalUnavailable'));
    }
    taskNotes.openTaskCreationModal();
    prefillTaskCreationInput(workspace, nlpQuery);
  } else {
    if (!taskNotes?.openTaskSelectorWithCreate) {
      throw new Error(t('notices.tasknotes.selectorUnavailable'));
    }
    const openPromise = taskNotes.openTaskSelectorWithCreate();
    prefillTaskSelectorInput(nlpQuery);
    await openPromise;
  }
}

export async function rescheduleTaskAndSyncCompanions(
  taskNotes: TaskNotesPluginApi,
  vault: Vault,
  task: TaskNotesTask,
  oldEvent: OFCEvent,
  newEvent: Extract<OFCEvent, { type: 'single' }>
): Promise<TaskNotesTask> {
  const startTime = !newEvent.allDay ? normalizeTime(newEvent.startTime) : null;
  const endTime = !newEvent.allDay ? normalizeTime(newEvent.endTime ?? null) : null;

  const scheduledValue =
    newEvent.allDay || !startTime ? newEvent.date : `${newEvent.date}T${startTime}`;

  let timeEstimateValue: number | null = null;
  if (!newEvent.allDay && startTime && endTime) {
    timeEstimateValue = computeMinutes(startTime, endTime);
  }

  const previousDate = oldEvent.type === 'single' ? oldEvent.date : undefined;
  const scheduledDate = scheduledDateFromValue(scheduledValue);
  const { modifications, shouldUpdateDue } = await getTaskFileScheduleCompanionUpdates(
    vault,
    task,
    scheduledDate,
    previousDate
  );

  let updatedTask = await taskNotes.taskService.updateProperty(task, 'scheduled', scheduledValue);
  if (shouldUpdateDue) {
    updatedTask = await taskNotes.taskService.updateProperty(updatedTask, 'due', scheduledDate);
  }
  await updateTaskFileScheduleCompanionProperties(vault, updatedTask, modifications);

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

  return updatedTask;
}

export async function syncRecurringSkipDates(
  taskNotes: TaskNotesPluginApi,
  task: TaskNotesTask,
  oldEvent: Extract<OFCEvent, { type: 'recurring' | 'rrule' }>,
  newEvent: Extract<OFCEvent, { type: 'recurring' | 'rrule' }>
): Promise<TaskNotesTask> {
  if (!taskNotes.taskService.toggleRecurringTaskSkipped) {
    throw new Error('TaskNotes recurring skip API is not available.');
  }

  const oldSkipSet = new Set<string>(
    (oldEvent.skipDates ?? []).filter((d): d is string => Boolean(d))
  );
  const newSkipSet = new Set<string>(
    (newEvent.skipDates ?? []).filter((d): d is string => Boolean(d))
  );

  let currentTask = task;
  for (const date of newSkipSet) {
    if (!oldSkipSet.has(date)) {
      currentTask = await taskNotes.taskService.toggleRecurringTaskSkipped(
        currentTask,
        DateTime.fromISO(date).toJSDate()
      );
    }
  }

  for (const date of oldSkipSet) {
    if (!newSkipSet.has(date)) {
      currentTask = await taskNotes.taskService.toggleRecurringTaskSkipped(
        currentTask,
        DateTime.fromISO(date).toJSDate()
      );
    }
  }

  return currentTask;
}

export async function createTaskNotesOverride(
  taskNotes: TaskNotesPluginApi,
  masterPersistentId: string,
  newEventData: Extract<OFCEvent, { type: 'single' }>
): Promise<TaskNotesTask> {
  if (!taskNotes.taskService.createTask) {
    throw new Error('TaskNotes createTask API is not available.');
  }

  const startTime = !newEventData.allDay ? normalizeTime(newEventData.startTime ?? null) : null;
  const endTime = !newEventData.allDay ? normalizeTime(newEventData.endTime ?? null) : null;
  const scheduledValue =
    newEventData.allDay || !startTime ? newEventData.date : `${newEventData.date}T${startTime}`;

  let timeEstimateValue: number | null = null;
  if (!newEventData.allDay && startTime && endTime) {
    timeEstimateValue = computeMinutes(startTime, endTime);
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

  return created.taskInfo;
}

export async function toggleRecurringInstanceState(
  taskNotes: TaskNotesPluginApi,
  task: TaskNotesTask,
  instanceDate: string,
  nextState: RecurringInstanceState
): Promise<{ success: boolean; task: TaskNotesTask }> {
  const instanceDateObj = DateTime.fromISO(instanceDate).toJSDate();
  const currentState = getRecurringStateForDate(task, instanceDate);
  let updatedTask = task;

  if (nextState.completed !== currentState.completed) {
    if (!taskNotes.taskService.toggleRecurringTaskComplete) {
      return { success: false, task: updatedTask };
    }
    updatedTask = await taskNotes.taskService.toggleRecurringTaskComplete(
      updatedTask,
      instanceDateObj
    );
  }

  const refreshedState = getRecurringStateForDate(updatedTask, instanceDate);
  if (nextState.skipped !== refreshedState.skipped) {
    if (!taskNotes.taskService.toggleRecurringTaskSkipped) {
      return { success: false, task: updatedTask };
    }
    updatedTask = await taskNotes.taskService.toggleRecurringTaskSkipped(
      updatedTask,
      instanceDateObj
    );
  }

  return { success: true, task: updatedTask };
}

export function subscribeToTaskNotes(
  taskNotes: TaskNotesPluginApi,
  callbacks: TaskNotesSubscriptionCallbacks
): TaskNotesSubscription {
  const useEmitterEvents = !!taskNotes.emitter;
  let taskUpdatedHandler: ((data: unknown) => void) | undefined;
  let taskDeletedHandler: ((data: unknown) => void) | undefined;
  let fileUpdatedHandler: ((data: unknown) => void) | undefined;

  if (useEmitterEvents) {
    taskUpdatedHandler = (data: unknown) => {
      const payload = data as {
        path?: string;
        originalTask?: TaskNotesTask;
        updatedTask?: TaskNotesTask;
      };
      if (payload?.path) {
        callbacks.onTaskUpdated(payload.path, payload.updatedTask);
      }
    };
    taskNotes.emitter?.on('task-updated', taskUpdatedHandler);

    taskDeletedHandler = (data: unknown) => {
      const payload = data as { path?: string };
      if (payload?.path) {
        callbacks.onTaskDeleted(payload.path);
      }
    };
    taskNotes.emitter?.on('task-deleted', taskDeletedHandler);
  } else {
    fileUpdatedHandler = (data: unknown) => {
      const payload = data as { path?: string };
      if (payload?.path) {
        callbacks.onTaskUpdated(payload.path);
      }
    };
    taskNotes.cacheManager.on('file-updated', fileUpdatedHandler);
  }

  const fileDeletedHandler = (data: unknown) => {
    const payload = data as { path?: string };
    if (payload?.path) {
      callbacks.onTaskDeleted(payload.path);
    }
  };
  taskNotes.cacheManager.on('file-deleted', fileDeletedHandler);

  const fileRenamedHandler = (data: unknown) => {
    const payload = data as { oldPath?: string; newPath?: string };
    if (payload?.oldPath && payload?.newPath) {
      callbacks.onTaskRenamed(payload.oldPath, payload.newPath);
    }
  };
  taskNotes.cacheManager.on('file-renamed', fileRenamedHandler);

  const dataChangedHandler = () => {
    callbacks.onDataChanged();
  };
  taskNotes.cacheManager.on('data-changed', dataChangedHandler);

  return {
    useEmitterEvents,
    unsubscribe: () => {
      if (taskNotes.emitter) {
        if (taskUpdatedHandler) {
          taskNotes.emitter.off('task-updated', taskUpdatedHandler);
        }
        if (taskDeletedHandler) {
          taskNotes.emitter.off('task-deleted', taskDeletedHandler);
        }
      }
      if (taskNotes.cacheManager.off) {
        if (fileUpdatedHandler) {
          taskNotes.cacheManager.off('file-updated', fileUpdatedHandler);
        }
        if (fileDeletedHandler) {
          taskNotes.cacheManager.off('file-deleted', fileDeletedHandler);
        }
        if (fileRenamedHandler) {
          taskNotes.cacheManager.off('file-renamed', fileRenamedHandler);
        }
        if (dataChangedHandler) {
          taskNotes.cacheManager.off('data-changed', dataChangedHandler);
        }
      }
    }
  };
}

export async function resolveTaskWithFallback(
  taskNotes: TaskNotesPluginApi,
  path: string,
  normalizedPath: string,
  payloadTask?: TaskNotesTask
): Promise<TaskNotesTask | null> {
  let task: TaskNotesTask | null = payloadTask ?? null;
  if (!task || task.scheduled === undefined) {
    task = await taskNotes.cacheManager.getTaskInfo(path);
    if (!task && normalizedPath !== path) {
      task = await taskNotes.cacheManager.getTaskInfo(normalizedPath);
    }
  }

  // Always prefer canonical cache data when available to avoid transient payload regressions.
  const canonicalTask = await taskNotes.cacheManager.getTaskInfo(path);
  return canonicalTask ?? task;
}

export async function fetchTaskInfoByUid(
  taskNotes: TaskNotesPluginApi,
  normalizedUid: string
): Promise<TaskNotesTask | null> {
  let fetched = await taskNotes.cacheManager.getTaskInfo(normalizedUid);
  if (!fetched && normalizedUid.includes('/')) {
    fetched = await taskNotes.cacheManager.getTaskInfo(normalizedUid.replace(/\//g, '\\'));
  }
  return fetched;
}

export async function toggleTaskStatus(
  taskNotes: TaskNotesPluginApi,
  task: TaskNotesTask
): Promise<{ updatedTask: TaskNotesTask; isCompleted: boolean; completedValue: string | false }> {
  if (!taskNotes.taskService.toggleStatus) {
    throw new Error('TaskNotes toggleStatus API is unavailable.');
  }
  const updatedTask = await taskNotes.taskService.toggleStatus(task);
  const isCompleted = taskNotes.statusManager?.isCompletedStatus(updatedTask.status) ?? false;
  const completedValue = isCompleted
    ? updatedTask.completedDate || DateTime.now().toFormat('yyyy-MM-dd')
    : false;
  return { updatedTask, isCompleted, completedValue };
}
