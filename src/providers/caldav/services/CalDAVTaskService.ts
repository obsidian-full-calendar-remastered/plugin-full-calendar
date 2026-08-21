import ical from 'ical.js';
import { DateTime } from 'luxon';
import FullCalendarPlugin from '../../../main';
import { PluginState } from '../../../core/PluginState';
import { OFCEvent } from '../../../types';
import { TasksDateTarget } from '../../../types/settings';
import { TaskBacklogInfo, TaskBacklogItem } from '../../Provider';
import { LinkedNoteIndex } from '../../utils/LinkedNoteIndex';
import { openOrCreateLinkedNote } from '../../../features/linked-notes/linkedNotes';
import { parseTimezoneAwareString } from '../../../features/timezone/Timezone';
import {
  CalDAVProviderConfig,
  CalDAVTaskCalendarInfo,
  CalDAVTaskInboxItem
} from '../types/typesCalDAV';
import { createBasicAuthHeader } from '../auth/auth_caldav';
import { canonCollection, fetchCalendarInfo } from '../client/helper_caldav';
import {
  doRequest,
  fetchAllVTodoObjects,
  fetchCalendarObjectsViaPropfindFallback,
  resolveCollectionObjectUrl
} from '../client/caldavClient';
import {
  createRandomUid,
  createUnscheduledTaskIcs,
  encodeCalDAVTaskId,
  findTodoByUid,
  getTextProperty,
  hasValidTaskDate,
  isCompletedTodo,
  isUnscheduledTodo,
  mapTargetToVTodoProperty,
  parseCalDAVTaskId,
  parseUnscheduledTasksFromObject,
  parseVCalendar,
  replaceAllDayTaskDate,
  replaceTimedTaskDate,
  taskToLinkedNoteEvent
} from '../parser/taskParser';
import { clearLinkedTaskNoteDates, updateLinkedTaskNoteDates } from './caldavLinkedNoteService';

export class CalDAVTaskService {
  private undatedTaskCache: CalDAVTaskInboxItem[] = [];
  private undatedTaskLoadPromise: Promise<CalDAVTaskInboxItem[]> | null = null;
  private hasLoadedUndatedTasks = false;

  constructor(
    private source: CalDAVProviderConfig,
    private plugin: FullCalendarPlugin,
    private linkedNoteIndex: LinkedNoteIndex,
    private getPassword: () => string | null
  ) {}

  getTaskInboxCalendarInfo(): CalDAVTaskCalendarInfo {
    return {
      id: this.source.id,
      name: this.source.name
    };
  }

  getTaskBacklogInfo(): TaskBacklogInfo {
    return {
      id: this.source.id,
      name: this.source.name,
      title: 'CalDAV task inbox',
      supportsCreate: true
    };
  }

  private async loadUndatedTasksFromRemote(): Promise<CalDAVTaskInboxItem[]> {
    const { isCalendar: isValid } = await fetchCalendarInfo(this.source.homeUrl, {
      username: this.source.username,
      password: this.getPassword() ?? undefined
    });

    if (!isValid) {
      throw new Error(
        `[CalDAVProvider] Invalid collection URL or not a calendar: ${this.source.homeUrl}`
      );
    }

    const authHeader = createBasicAuthHeader(this.source.username, this.getPassword() ?? undefined);
    const objects = await fetchAllVTodoObjects(this.source.homeUrl, authHeader);
    return objects.flatMap(object =>
      parseUnscheduledTasksFromObject(object, this.source.id, this.source.name)
    );
  }

  async refreshUndatedTasks(): Promise<CalDAVTaskInboxItem[]> {
    if (this.undatedTaskLoadPromise) {
      return this.undatedTaskLoadPromise;
    }

    this.undatedTaskLoadPromise = this.loadUndatedTasksFromRemote()
      .then(tasks => {
        this.undatedTaskCache = tasks;
        this.hasLoadedUndatedTasks = true;
        return [...this.undatedTaskCache];
      })
      .finally(() => {
        this.undatedTaskLoadPromise = null;
      });

    return this.undatedTaskLoadPromise;
  }

  async refreshTaskBacklogItems(): Promise<TaskBacklogItem[]> {
    const tasks = await this.refreshUndatedTasks();
    return tasks.map(task => this.toTaskBacklogItem(task));
  }

  async getUndatedTasks(): Promise<CalDAVTaskInboxItem[]> {
    if (!this.hasLoadedUndatedTasks) {
      return this.refreshUndatedTasks();
    }

    return Promise.resolve([...this.undatedTaskCache]);
  }

  async getTaskBacklogItems(): Promise<TaskBacklogItem[]> {
    const tasks = await this.getUndatedTasks();
    return tasks.map(task => this.toTaskBacklogItem(task));
  }

  async createTaskBacklogItem(title: string): Promise<TaskBacklogItem> {
    const task = await this.createTask(title);
    return this.toTaskBacklogItem(task);
  }

  async deleteTaskBacklogItem(taskId: string): Promise<void> {
    const parsed = parseCalDAVTaskId(taskId);
    let taskUid = taskId;
    if (parsed) {
      if (parsed.calendarId !== this.source.id) {
        throw new Error(`CalDAV task ID ${taskId} does not belong to this provider.`);
      }
      taskUid = parsed.uid;
    }

    const url = `${canonCollection(this.source.homeUrl)}${taskUid}.ics`;
    await doRequest(
      url,
      { method: 'DELETE' },
      this.source.username,
      this.getPassword() ?? undefined
    );
    this.undatedTaskCache = this.undatedTaskCache.filter(task => task.uid !== taskUid);
    this.hasLoadedUndatedTasks = true;
  }

  async setTaskBacklogItemComplete(taskId: string, isDone: boolean): Promise<boolean> {
    const parsed = parseCalDAVTaskId(taskId);
    let taskUid = taskId;
    if (parsed) {
      if (parsed.calendarId !== this.source.id) {
        return false;
      }
      taskUid = parsed.uid;
    }

    const authHeader = createBasicAuthHeader(this.source.username, this.getPassword() ?? undefined);
    const objects = await fetchCalendarObjectsViaPropfindFallback(this.source.homeUrl, authHeader);

    for (const object of objects) {
      const vcalendar = parseVCalendar(object.ics);
      const todo = findTodoByUid(vcalendar, taskUid);
      if (!todo || !isUnscheduledTodo(todo)) {
        continue;
      }

      todo.updatePropertyWithValue('status', isDone ? 'COMPLETED' : 'NEEDS-ACTION');
      if (isDone) {
        todo.updatePropertyWithValue('completed', ical.Time.now());
      } else {
        todo.removeAllProperties('completed');
      }
      todo.updatePropertyWithValue('last-modified', ical.Time.now());

      const url = resolveCollectionObjectUrl(this.source.homeUrl, object.href);
      await doRequest(
        url,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            ...(object.etag ? { 'If-Match': object.etag } : {})
          },
          body: (vcalendar as unknown as { toString(): string }).toString()
        },
        this.source.username,
        this.getPassword() ?? undefined
      );

      this.undatedTaskCache = this.undatedTaskCache.filter(task => task.uid !== taskUid);
      this.hasLoadedUndatedTasks = true;
      PluginState.getProviderRegistry().refreshBacklogViews();
      return true;
    }

    return false;
  }

  async openTaskBacklogItem(taskId: string): Promise<void> {
    const parsed = parseCalDAVTaskId(taskId);
    if (!parsed || parsed.calendarId !== this.source.id) {
      return;
    }

    const task = this.undatedTaskCache.find(candidate => candidate.uid === parsed.uid);
    if (!task) {
      return;
    }

    await openOrCreateLinkedNote(this.plugin, this.source.id, taskToLinkedNoteEvent(task), false);
  }

  toTaskBacklogItem(task: CalDAVTaskInboxItem): TaskBacklogItem {
    return {
      id: encodeCalDAVTaskId(task.calendarId, task.uid),
      title: task.title,
      completed: task.completed,
      subtitle: task.calendarName,
      sourceId: task.calendarId
    };
  }

  async createTask(title: string): Promise<CalDAVTaskInboxItem> {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      throw new Error('CalDAV task title cannot be empty.');
    }

    const uid = createRandomUid();
    const icsContent = createUnscheduledTaskIcs(uid, trimmedTitle);
    const url = `${canonCollection(this.source.homeUrl)}${uid}.ics`;

    await doRequest(
      url,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'If-None-Match': '*'
        },
        body: icsContent
      },
      this.source.username,
      this.getPassword() ?? undefined
    );

    const task: CalDAVTaskInboxItem = {
      id: uid,
      uid,
      title: trimmedTitle,
      calendarId: this.source.id,
      calendarName: this.source.name,
      description: '',
      location: '',
      url: '',
      status: 'NEEDS-ACTION',
      completed: false
    };

    this.undatedTaskCache = [
      task,
      ...this.undatedTaskCache.filter(existingTask => existingTask.uid !== uid)
    ];
    this.hasLoadedUndatedTasks = true;

    return task;
  }

  ownsTaskId(taskId: string): boolean {
    const parsed = parseCalDAVTaskId(taskId);
    return parsed !== null && parsed.calendarId === this.source.id;
  }

  async validateTaskSchedule(
    taskId: string,
    date: Date,
    canBeScheduledAt?: (
      event: OFCEvent,
      date: Date
    ) => Promise<{ isValid: boolean; reason?: string }>
  ): Promise<{ isValid: boolean; reason?: string }> {
    const parsed = parseCalDAVTaskId(taskId);
    let taskUid = taskId;
    if (parsed) {
      if (parsed.calendarId !== this.source.id) {
        return { isValid: false, reason: 'Task does not belong to this calendar source.' };
      }
      taskUid = parsed.uid;
    }

    if (canBeScheduledAt && typeof canBeScheduledAt === 'function') {
      return canBeScheduledAt(
        {
          uid: taskUid,
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
    return { isValid: true };
  }

  async scheduleTask(taskId: string, date: Date, allDay = true): Promise<void> {
    const parsed = parseCalDAVTaskId(taskId);
    let taskUid = taskId;
    if (parsed) {
      if (parsed.calendarId !== this.source.id) {
        throw new Error(`CalDAV task ID ${taskId} does not belong to this provider.`);
      }
      taskUid = parsed.uid;
    }
    const authHeader = createBasicAuthHeader(this.source.username, this.getPassword() ?? undefined);
    const objects = await fetchCalendarObjectsViaPropfindFallback(this.source.homeUrl, authHeader);

    for (const object of objects) {
      const vcalendar = parseVCalendar(object.ics);
      const todo = findTodoByUid(vcalendar, taskUid);
      if (!todo) {
        continue;
      }

      const currentHasStart = hasValidTaskDate(todo, 'dtstart');
      const currentHasDue = hasValidTaskDate(todo, 'due');
      let preservedDurationMs: number | null = null;

      if (currentHasStart && currentHasDue) {
        const startProp = todo.getFirstProperty('dtstart');
        const dueProp = todo.getFirstProperty('due');
        if (startProp && dueProp) {
          const startVal = startProp.getFirstValue();
          const dueVal = dueProp.getFirstValue();
          if (startVal instanceof ical.Time && dueVal instanceof ical.Time) {
            const startLuxon = parseTimezoneAwareString(startVal);
            const dueLuxon = parseTimezoneAwareString(dueVal);
            if (startLuxon.isValid && dueLuxon.isValid) {
              preservedDurationMs = dueLuxon.toMillis() - startLuxon.toMillis();
            }
          }
        }
      }

      const settings = PluginState.getSettings()?.tasksIntegration;
      const backlogDateTarget = settings?.backlogDateTarget ?? 'scheduledDate';
      const calendarDisplayDateTarget = settings?.calendarDisplayDateTarget ?? 'scheduledDate';

      const planningTargets = Array.from(
        new Set<TasksDateTarget>([calendarDisplayDateTarget, backlogDateTarget])
      );
      const targetProps = Array.from(new Set(planningTargets.map(mapTargetToVTodoProperty)));

      const displayTimezone =
        PluginState.getSettings()?.displayTimezone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone;

      if (targetProps.includes('dtstart') && targetProps.includes('due')) {
        if (allDay) {
          replaceAllDayTaskDate(todo, 'dtstart', date);
          const targetDueDate =
            preservedDurationMs !== null && preservedDurationMs > 0
              ? new Date(date.getTime() + preservedDurationMs)
              : date;
          replaceAllDayTaskDate(todo, 'due', targetDueDate);
        } else {
          replaceTimedTaskDate(todo, 'dtstart', date, displayTimezone);
          const targetDueDate =
            preservedDurationMs !== null && preservedDurationMs > 0
              ? new Date(date.getTime() + preservedDurationMs)
              : new Date(date.getTime() + 60 * 60 * 1000);
          replaceTimedTaskDate(todo, 'due', targetDueDate, displayTimezone);
        }
      } else if (targetProps.includes('dtstart')) {
        if (allDay) {
          replaceAllDayTaskDate(todo, 'dtstart', date);
          if (preservedDurationMs !== null && preservedDurationMs > 0) {
            replaceAllDayTaskDate(todo, 'due', new Date(date.getTime() + preservedDurationMs));
          }
        } else {
          replaceTimedTaskDate(todo, 'dtstart', date, displayTimezone);
          if (preservedDurationMs !== null && preservedDurationMs > 0) {
            replaceTimedTaskDate(
              todo,
              'due',
              new Date(date.getTime() + preservedDurationMs),
              displayTimezone
            );
          }
        }
      } else if (targetProps.includes('due')) {
        if (allDay) {
          replaceAllDayTaskDate(todo, 'due', date);
          if (preservedDurationMs !== null && preservedDurationMs > 0) {
            replaceAllDayTaskDate(todo, 'dtstart', new Date(date.getTime() - preservedDurationMs));
          }
        } else {
          replaceTimedTaskDate(todo, 'due', date, displayTimezone);
          if (preservedDurationMs !== null && preservedDurationMs > 0) {
            replaceTimedTaskDate(
              todo,
              'dtstart',
              new Date(date.getTime() - preservedDurationMs),
              displayTimezone
            );
          }
        }
      }

      todo.updatePropertyWithValue('last-modified', ical.Time.now());

      const url = resolveCollectionObjectUrl(this.source.homeUrl, object.href);
      await doRequest(
        url,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            ...(object.etag ? { 'If-Match': object.etag } : {})
          },
          body: (vcalendar as unknown as { toString(): string }).toString()
        },
        this.source.username,
        this.getPassword() ?? undefined
      );

      this.undatedTaskCache = this.undatedTaskCache.filter(task => task.uid !== taskUid);
      this.hasLoadedUndatedTasks = true;
      const scheduledDate = DateTime.fromJSDate(date).toISODate() || '';
      let scheduledEndDate: string | null = null;
      if (hasValidTaskDate(todo, 'due') && hasValidTaskDate(todo, 'dtstart')) {
        const dueProp = todo.getFirstProperty('due');
        const dueVal = dueProp?.getFirstValue();
        if (dueVal instanceof ical.Time) {
          const dueLuxon = parseTimezoneAwareString(dueVal);
          if (dueLuxon.isValid) {
            const dueISODate = dueLuxon.toISODate();
            if (dueISODate && dueISODate !== scheduledDate) {
              scheduledEndDate = dueISODate;
            }
          }
        }
      }

      const scheduledTask: OFCEvent = {
        type: 'single',
        uid: taskUid,
        title: getTextProperty(todo, 'summary') || 'Untitled task',
        date: scheduledDate,
        endDate: scheduledEndDate,
        completed: isCompletedTodo(todo) ? DateTime.now().toISO() : false,
        ...(allDay
          ? { allDay: true }
          : {
              allDay: false,
              startTime: DateTime.fromJSDate(date).toFormat('HH:mm'),
              endTime:
                preservedDurationMs !== null && preservedDurationMs > 0
                  ? DateTime.fromJSDate(new Date(date.getTime() + preservedDurationMs)).toFormat(
                      'HH:mm'
                    )
                  : DateTime.fromJSDate(date).plus({ hours: 1 }).toFormat('HH:mm')
            })
      };
      await updateLinkedTaskNoteDates(this.plugin.app, this.linkedNoteIndex, scheduledTask);
      return;
    }

    throw new Error(`CalDAV task ${taskUid} was not found.`);
  }

  async unscheduleTask(taskId: string): Promise<void> {
    const parsed = parseCalDAVTaskId(taskId);
    let taskUid = taskId;
    if (parsed) {
      if (parsed.calendarId !== this.source.id) {
        throw new Error(`CalDAV task ID ${taskId} does not belong to this provider.`);
      }
      taskUid = parsed.uid;
    }
    const authHeader = createBasicAuthHeader(this.source.username, this.getPassword() ?? undefined);
    const objects = await fetchCalendarObjectsViaPropfindFallback(this.source.homeUrl, authHeader);

    for (const object of objects) {
      const vcalendar = parseVCalendar(object.ics);
      const todo = findTodoByUid(vcalendar, taskUid);
      if (!todo) {
        continue;
      }

      todo.removeAllProperties('dtstart');
      todo.removeAllProperties('due');
      todo.updatePropertyWithValue('last-modified', ical.Time.now());

      const url = resolveCollectionObjectUrl(this.source.homeUrl, object.href);
      await doRequest(
        url,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            ...(object.etag ? { 'If-Match': object.etag } : {})
          },
          body: (vcalendar as unknown as { toString(): string }).toString()
        },
        this.source.username,
        this.getPassword() ?? undefined
      );

      const updatedIcs = (vcalendar as unknown as { toString(): string }).toString();
      const unscheduledTasks = parseUnscheduledTasksFromObject(
        { ...object, ics: updatedIcs },
        this.source.id,
        this.source.name
      );
      this.undatedTaskCache = [
        ...this.undatedTaskCache.filter(task => task.uid !== taskUid),
        ...unscheduledTasks
      ];
      this.hasLoadedUndatedTasks = true;
      await clearLinkedTaskNoteDates(this.plugin.app, this.linkedNoteIndex, taskUid);
      return;
    }

    throw new Error(`CalDAV task ${taskUid} was not found.`);
  }
}
