import { PluginState } from '../../core/PluginState';
import { DateTime } from 'luxon';
import { OFCEvent, EventLocation, validateEvent } from '../../types';
import FullCalendarPlugin from '../../main';
import { makeAuthenticatedRequest, GoogleApiError } from '../google/auth/request';

import {
  CalendarProvider,
  CalendarProviderCapabilities,
  SyncKeyProvider,
  TaskBacklogProvider,
  TaskBacklogInfo,
  TaskBacklogItem
} from '../Provider';
import { EventHandle, FCReactComponent, ProviderConfigContext } from '../typesProvider';
import { GoogleTasksProviderConfig, GoogleTaskApiItem } from './typesGoogleTasks';
import { GoogleTasksConfigComponent } from './ui/GoogleTasksConfigComponent';

import * as React from 'react';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { GoogleAuthManager } from '../google/auth/GoogleAuthManager';
import { LinkedNoteIndex } from '../utils/LinkedNoteIndex';
import { TFile } from 'obsidian';
import { createLinkedNoteForProvider } from '../../features/linked-notes/linkedNotes';

// Settings row component for Google Tasks Provider
const GoogleTasksNameSetting: React.FC<{ source: Partial<import('../../types').CalendarInfo> }> = ({
  source
}) => {
  const listId = (source as unknown as { listId?: string })?.listId || '';

  return React.createElement(
    'div',
    { className: 'setting-item-control' },
    React.createElement('input', {
      disabled: true,
      type: 'text',
      value: listId,
      className: 'fc-setting-input'
    })
  );
};

type GoogleTasksConfigProps = {
  plugin: FullCalendarPlugin;
  config: Partial<GoogleTasksProviderConfig>;
  onConfigChange: (newConfig: Partial<GoogleTasksProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (
    finalConfig: GoogleTasksProviderConfig | GoogleTasksProviderConfig[],
    accountId?: string
  ) => void;
  onClose: () => void;
};

const createGoogleTasksConfigWrapper = (
  pluginFromInstance?: FullCalendarPlugin
): React.FC<GoogleTasksConfigProps> => {
  return props => {
    const plugin =
      pluginFromInstance ||
      (props as GoogleTasksConfigProps & { plugin?: FullCalendarPlugin }).plugin;

    const forwardOnSave = props.onSave;

    const handleSave = (
      selectedConfigs: { id: string; name: string; color: string }[],
      accountId: string
    ) => {
      forwardOnSave(selectedConfigs as unknown as GoogleTasksProviderConfig[], accountId);
    };

    if (!plugin) {
      throw new Error('Google Tasks configuration requires plugin context.');
    }

    return React.createElement(GoogleTasksConfigComponent, {
      plugin,
      onSave: handleSave,
      onClose: props.onClose
    });
  };
};

export class GoogleTasksProvider
  implements CalendarProvider<GoogleTasksProviderConfig>, SyncKeyProvider, TaskBacklogProvider
{
  // Static metadata for registry
  static readonly type = 'googletasks';
  static readonly displayName = 'Google Tasks';

  static getConfigurationComponent(): FCReactComponent<GoogleTasksConfigProps> {
    return createGoogleTasksConfigWrapper();
  }

  private plugin: FullCalendarPlugin;
  private source: GoogleTasksProviderConfig;
  private authManager: GoogleAuthManager;
  public readonly linkedNoteIndex: LinkedNoteIndex;

  // Instance properties
  readonly type = 'googletasks';
  readonly displayName = 'Google Tasks';
  readonly isRemote = true;
  readonly loadPriority = 125;

  constructor(
    source: GoogleTasksProviderConfig,
    plugin: FullCalendarPlugin,
    _app?: ObsidianInterface
  ) {
    this.plugin = plugin;
    this.source = source;
    this.authManager = new GoogleAuthManager(plugin);
    this.linkedNoteIndex = new LinkedNoteIndex(plugin.app, source.id);
  }

  initialize(): void {
    this.linkedNoteIndex.initialize();
  }

  teardown(): void {
    this.linkedNoteIndex.destroy();
  }

  getCapabilities(): CalendarProviderCapabilities {
    return { canCreate: true, canEdit: true, canDelete: true };
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

  private async getToken(): Promise<string | null> {
    return this.authManager.getTokenForSource({
      type: 'google',
      id: this.source.id,
      name: this.source.name,
      calendarId: this.source.listId,
      googleAccountId: this.source.googleAccountId,
      color: ''
    });
  }

  // ====================================================================
  // CALENDAR PROVIDER METHODS (DATED EVENTS)
  // ====================================================================

  async getEvents(range?: { start: Date; end: Date }): Promise<[OFCEvent, EventLocation | null][]> {
    const token = await this.getToken();
    if (!token) return [];

    try {
      const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(this.source.listId)}/tasks?showCompleted=true&showHidden=true&maxResults=100`;
      const data = await makeAuthenticatedRequest<{ items?: GoogleTaskApiItem[] }>(token, url);
      if (!data || !Array.isArray(data.items)) return [];

      const parsed = data.items
        .filter(task => !!task.due) // Dated tasks only
        .map((task): [OFCEvent, EventLocation | null] | null => {
          const due = task.due;
          if (!due) return null;
          const dateOnly = due.split('T')[0];
          const completedStatus =
            task.status === 'completed' ? task.completed || DateTime.now().toISO() : false;

          const event: OFCEvent = {
            type: 'single',
            title: task.title || '(No Title)',
            allDay: true,
            date: dateOnly,
            endDate: null,
            completed: completedStatus,
            uid: task.id,
            description: task.notes || ''
          };

          const validated = validateEvent(event);
          if (!validated) return null;

          const linkedFile = this.linkedNoteIndex.getFileForEvent(task.id);
          const location = linkedFile
            ? { file: { path: linkedFile.path }, lineNumber: undefined }
            : null;

          return [validated, location];
        })
        .filter((e): e is [OFCEvent, EventLocation | null] => e !== null);

      return parsed;
    } catch (e) {
      console.error(`Error fetching tasks for Google Tasks list "${this.source.name}":`, e);
      return [];
    }
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    const token = await this.getToken();
    if (!token) throw new GoogleApiError('Cannot create task: not authenticated.');

    if (event.type !== 'single') {
      throw new Error('Google Tasks only supports single events.');
    }

    const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(this.source.listId)}/tasks`;
    const body: Partial<GoogleTaskApiItem> = {
      title: event.title,
      notes: event.description || '',
      status: event.completed ? 'completed' : 'needsAction'
    };

    if (event.date) {
      body.due = `${event.date}T00:00:00.000Z`;
    }

    const created = await makeAuthenticatedRequest<GoogleTaskApiItem>(token, url, 'POST', body);

    const dateOnly = created.due
      ? created.due.split('T')[0]
      : (event.type === 'single' ? event.date : '') || '';
    const completedStatus =
      created.status === 'completed' ? created.completed || DateTime.now().toISO() : false;

    const createdEvent: OFCEvent = {
      type: 'single',
      title: created.title || event.title,
      allDay: true,
      date: dateOnly,
      endDate: null,
      completed: completedStatus,
      uid: created.id,
      description: created.notes || ''
    };

    return [createdEvent, null];
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    const taskUid = handle.persistentId;
    const token = await this.getToken();
    if (!token) throw new GoogleApiError('Cannot update task: not authenticated.');

    if (newEventData.type !== 'single') {
      throw new Error('Google Tasks only supports single events.');
    }
    const newEvent = newEventData;

    // Fetch original to preserve unmapped attributes
    const getUrl = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(this.source.listId)}/tasks/${encodeURIComponent(taskUid)}`;
    const task = await makeAuthenticatedRequest<GoogleTaskApiItem>(token, getUrl);

    task.title = newEvent.title;
    task.notes = newEvent.description || '';
    task.status = newEvent.completed ? 'completed' : 'needsAction';

    if (newEvent.date) {
      task.due = `${newEvent.date}T00:00:00.000Z`;
    } else {
      task.due = undefined;
    }

    if (newEvent.completed) {
      task.completed =
        typeof newEvent.completed === 'string' ? newEvent.completed : DateTime.now().toISO();
    } else {
      task.completed = undefined;
    }

    const putUrl = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(this.source.listId)}/tasks/${encodeURIComponent(taskUid)}`;
    await makeAuthenticatedRequest(token, putUrl, 'PUT', task);
    return null;
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    const taskUid = handle.persistentId;
    const token = await this.getToken();
    if (!token) throw new GoogleApiError('Cannot delete task: not authenticated.');

    const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(this.source.listId)}/tasks/${encodeURIComponent(taskUid)}`;
    await makeAuthenticatedRequest(token, url, 'DELETE');
  }

  createInstanceOverride(
    _masterEvent: OFCEvent,
    _instanceDate: string,
    _newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    throw new Error(
      'Modifying a single instance of a recurring task is not supported for Google Tasks.'
    );
  }

  async toggleComplete(eventId: string, isDone: boolean): Promise<boolean> {
    try {
      const cache = PluginState.getCache();
      const eventDetails = cache?.store.getEventDetails(eventId);
      if (!eventDetails || !eventDetails.event.uid) return false;

      const event = eventDetails.event;
      if (event.type !== 'single') return false;

      const taskUid = event.uid;
      if (!taskUid) return false;

      const token = await this.getToken();
      if (!token) return false;

      const getUrl = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(this.source.listId)}/tasks/${encodeURIComponent(taskUid)}`;
      const task = await makeAuthenticatedRequest<GoogleTaskApiItem>(token, getUrl);

      task.status = isDone ? 'completed' : 'needsAction';
      if (isDone) {
        task.completed = DateTime.now().toISO();
      } else {
        task.completed = undefined;
      }

      const putUrl = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(this.source.listId)}/tasks/${encodeURIComponent(taskUid)}`;
      await makeAuthenticatedRequest(token, putUrl, 'PUT', task);

      const updatedEvent: OFCEvent = {
        ...event,
        type: 'single',
        completed: isDone ? task.completed || DateTime.now().toISO() : false
      };

      await PluginState.getProviderRegistry().processProviderUpdates(this.source.id, {
        additions: [],
        updates: [
          {
            persistentId: taskUid,
            event: updatedEvent,
            location: eventDetails.location
              ? {
                  file: { path: eventDetails.location.path },
                  lineNumber: eventDetails.location.lineNumber
                }
              : null
          }
        ],
        deletions: []
      });

      return true;
    } catch (e) {
      console.error('Error toggling Google Task completion state:', e);
      return false;
    }
  }

  // ====================================================================
  // TASK BACKLOG PROVIDER CONTRACT
  // ====================================================================

  getTaskBacklogInfo(): TaskBacklogInfo {
    return {
      id: this.source.id,
      name: this.source.name,
      title: 'Google Tasks backlog',
      supportsCreate: true
    };
  }

  async getTaskBacklogItems(): Promise<TaskBacklogItem[]> {
    const token = await this.getToken();
    if (!token) return [];

    try {
      const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(this.source.listId)}/tasks?showCompleted=false&showHidden=false&maxResults=100`;
      const data = await makeAuthenticatedRequest<{ items?: GoogleTaskApiItem[] }>(token, url);
      if (!data || !Array.isArray(data.items)) return [];

      // Undated and needsAction tasks
      const undated = data.items.filter(task => !task.due && task.status !== 'completed');
      return undated.map(task => ({
        id: `${this.source.id}::${task.id}`,
        title: task.title || '(No Title)',
        completed: task.status === 'completed',
        subtitle: this.source.name,
        sourceId: this.source.id
      }));
    } catch (e) {
      console.error(`Error fetching Google Tasks backlog items for "${this.source.name}":`, e);
      return [];
    }
  }

  async createTaskBacklogItem(title: string): Promise<TaskBacklogItem> {
    const token = await this.getToken();
    if (!token) throw new Error('Cannot create backlog task: not authenticated.');

    const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(this.source.listId)}/tasks`;
    const body: Partial<GoogleTaskApiItem> = {
      title,
      status: 'needsAction'
    };

    const created = await makeAuthenticatedRequest<GoogleTaskApiItem>(token, url, 'POST', body);
    return {
      id: `${this.source.id}::${created.id}`,
      title: created.title || title,
      completed: false,
      subtitle: this.source.name,
      sourceId: this.source.id
    };
  }

  async deleteTaskBacklogItem(taskId: string): Promise<void> {
    const parts = taskId.split('::');
    const taskUid = parts.length === 2 ? parts[1] : taskId;
    await this.deleteEvent({ persistentId: taskUid });
  }

  async setTaskBacklogItemComplete(taskId: string, isDone: boolean): Promise<boolean> {
    const parts = taskId.split('::');
    const taskUid = parts[1];
    const token = await this.getToken();
    if (!token || !taskUid) return false;

    try {
      const getUrl = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(this.source.listId)}/tasks/${encodeURIComponent(taskUid)}`;
      const task = await makeAuthenticatedRequest<GoogleTaskApiItem>(token, getUrl);

      task.status = isDone ? 'completed' : 'needsAction';
      task.completed = isDone ? DateTime.now().toISO() : undefined;

      const putUrl = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(this.source.listId)}/tasks/${encodeURIComponent(taskUid)}`;
      await makeAuthenticatedRequest(token, putUrl, 'PUT', task);
      PluginState.getProviderRegistry().refreshBacklogViews();
      return true;
    } catch (e) {
      console.error('Error toggling Google Tasks backlog item completion state:', e);
      return false;
    }
  }

  ownsTaskId(taskId: string): boolean {
    const parts = taskId.split('::');
    return parts.length === 2 && parts[0] === this.source.id;
  }

  async scheduleTask(taskId: string, date: Date, _allDay = true): Promise<void> {
    const parts = taskId.split('::');
    const taskUid = parts[1];
    const token = await this.getToken();
    if (!token) throw new Error('Cannot schedule Google Task: not authenticated.');

    // Google Tasks due date requires YYYY-MM-DDThh:mm:ssZ (time is always 00:00:00)
    const dueString = `${DateTime.fromJSDate(date).toFormat('yyyy-MM-dd')}T00:00:00.000Z`;

    const getUrl = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(this.source.listId)}/tasks/${encodeURIComponent(taskUid)}`;
    const task = await makeAuthenticatedRequest<GoogleTaskApiItem>(token, getUrl);

    task.due = dueString;

    const putUrl = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(this.source.listId)}/tasks/${encodeURIComponent(taskUid)}`;
    await makeAuthenticatedRequest(token, putUrl, 'PUT', task);
  }

  async unscheduleTask(taskId: string): Promise<void> {
    const parts = taskId.split('::');
    const taskUid = parts.length === 2 ? parts[1] : taskId;
    const token = await this.getToken();
    if (!token) throw new Error('Cannot unschedule Google Task: not authenticated.');

    const getUrl = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(this.source.listId)}/tasks/${encodeURIComponent(taskUid)}`;
    const task = await makeAuthenticatedRequest<GoogleTaskApiItem>(token, getUrl);
    task.due = undefined;

    const putUrl = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(this.source.listId)}/tasks/${encodeURIComponent(taskUid)}`;
    await makeAuthenticatedRequest(token, putUrl, 'PUT', task);
  }

  async validateTaskSchedule(
    _taskId: string,
    _date: Date
  ): Promise<{ isValid: boolean; reason?: string }> {
    return { isValid: true };
  }

  // ====================================================================
  // REMAINING CONFIG AND UTILITY METHODS
  // ====================================================================

  getConfigurationComponent(): FCReactComponent<GoogleTasksConfigProps> {
    return createGoogleTasksConfigWrapper(this.plugin);
  }

  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    return GoogleTasksNameSetting;
  }

  revalidate(): Promise<void> {
    return Promise.resolve();
  }

  async createLinkedNote(event: OFCEvent, instanceDate?: string): Promise<TFile | null> {
    return createLinkedNoteForProvider({
      app: this.plugin.app,
      event,
      calendarId: this.source.id,
      calendarName: this.source.name,
      linkedNoteIndex: this.linkedNoteIndex,
      instanceDate
    });
  }
}
