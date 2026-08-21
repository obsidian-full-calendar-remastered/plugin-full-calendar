import * as React from 'react';
import { DateTime } from 'luxon';
import { PluginState } from '../../core/PluginState';
import { t } from '../../features/i18n/i18n';
import FullCalendarPlugin from '../../main';
import { EventLocation, OFCEvent } from '../../types';
import { isTask } from '../../types/tasks';
import { CalendarProviderCapabilities, TaskBacklogInfo } from '../Provider';
import { EventHandle, FCReactComponent, ProviderConfigContext } from '../typesProvider';
import { createBasicAuthHeader } from './auth_caldav';
import { CalDAVConfigComponent } from './CalDAVConfigComponent';
import {
  CalDAVProvider,
  canonCollection,
  createRandomUid,
  fetchAllVTodoObjects
} from './CalDAVProvider';
import { fetchCalendarInfo } from './helper_caldav';
import { CalDAVTaskProviderConfig } from './typesCalDAV';
import { createVTodoCalendar, parseVTodoCalendar, updateVTodoCalendar } from './vtodo';

type CalDAVTaskConfigProps = {
  plugin: FullCalendarPlugin;
  config: Partial<CalDAVTaskProviderConfig>;
  onConfigChange: (newConfig: Partial<CalDAVTaskProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: CalDAVTaskProviderConfig | CalDAVTaskProviderConfig[]) => void;
  onClose: () => void;
};

const CalDAVTaskConfigWrapper: React.FC<CalDAVTaskConfigProps> = props =>
  React.createElement(CalDAVConfigComponent, {
    config: props.config,
    onSave: configs => props.onSave(configs),
    onClose: props.onClose,
    mode: 'tasks'
  });

function quotedEtag(etag: string): string {
  return etag.startsWith('"') ? etag : `"${etag}"`;
}

export class CalDAVTaskProvider extends CalDAVProvider {
  static readonly type = 'caldavtasks';

  static get displayName(): string {
    return t('settings.calendars.caldavTasks.title');
  }

  static getConfigurationComponent(): FCReactComponent<CalDAVTaskConfigProps> {
    return CalDAVTaskConfigWrapper;
  }

  readonly type: string = 'caldavtasks';
  readonly displayName: string = t('settings.calendars.caldavTasks.title');
  readonly loadPriority = 115;

  getCapabilities(): CalendarProviderCapabilities {
    return {
      canCreate: true,
      canEdit: true,
      canDelete: true,
      ownsRecurringInstanceOverrides: false,
      contextMenu: {
        allowGenericTaskActions: false,
        providesNativeTaskSemantics: true
      }
    };
  }

  getTaskBacklogInfo(): TaskBacklogInfo {
    return {
      id: this.source.id,
      name: this.source.name,
      title: t('settings.calendars.caldavTasks.backlogTitle'),
      supportsCreate: true
    };
  }

  async getEvents(_range?: {
    start: Date;
    end: Date;
  }): Promise<[OFCEvent, EventLocation | null][]> {
    const password = this.getPassword() ?? undefined;
    const info = await fetchCalendarInfo(this.source.homeUrl, {
      username: this.source.username,
      password
    });
    if (!info.isCalendar) {
      throw new Error(info.error || t('settings.calendars.caldav.errors.invalidCollection'));
    }
    if (
      info.supportedComponents &&
      info.supportedComponents.length > 0 &&
      !info.supportedComponents.includes('VTODO')
    ) {
      throw new Error(t('settings.calendars.caldavTasks.errors.noVtodoCapability'));
    }

    const authHeader = createBasicAuthHeader(this.source.username, password);
    const icsList = await fetchAllVTodoObjects(this.source.homeUrl, authHeader);

    const results: [OFCEvent, EventLocation | null][] = [];
    let malformedResources = 0;
    for (const object of icsList) {
      try {
        const tasks = parseVTodoCalendar(object.ics);
        for (const task of tasks) {
          if (!task.event || task.cancelled || !isTask(task.event)) continue;
          const event: OFCEvent = {
            ...task.event,
            caldavHref: object.href,
            ...(object.etag ? { etag: object.etag.replace(/"/g, '') } : {})
          };
          const linkedFile = this.linkedNoteIndex.getFileForEvent(event.uid || '');
          results.push([
            event,
            linkedFile ? { file: { path: linkedFile.path }, lineNumber: undefined } : null
          ]);
        }
      } catch {
        malformedResources += 1;
      }
    }

    if (malformedResources > 0) {
      console.warn(
        t('settings.calendars.caldavTasks.errors.skippedMalformed', {
          count: malformedResources
        })
      );
    }
    return results;
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    if (event.type === 'recurring') {
      throw new Error(t('settings.calendars.caldavTasks.errors.recurringCreation'));
    }

    const uid = event.uid || createRandomUid();
    const taskEvent: OFCEvent =
      event.type === 'single'
        ? { ...event, uid, completed: event.completed ?? false }
        : { ...event, uid, isTask: true };
    const url = `${canonCollection(this.source.homeUrl)}${encodeURIComponent(uid)}.ics`;
    const body = createVTodoCalendar(taskEvent, uid);

    const response = await this.doRequest(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'If-None-Match': '*'
      },
      body
    });
    const parsed = parseVTodoCalendar(body)[0]?.event || taskEvent;
    const etag = response.headers?.get?.('etag')?.replace(/"/g, '');
    const created = {
      ...parsed,
      uid,
      caldavHref: url,
      ...(etag ? { etag } : {})
    } as OFCEvent;
    return [created, null];
  }

  async updateEvent(
    handle: EventHandle,
    oldEvent: OFCEvent,
    newEvent: OFCEvent
  ): Promise<EventLocation | null> {
    if (oldEvent.type !== 'single' && oldEvent.type !== 'rrule') {
      throw new Error(t('settings.calendars.caldavTasks.errors.unsupportedType'));
    }
    const uid = oldEvent.uid || newEvent.uid;
    if (!uid) throw new Error(t('settings.calendars.caldavTasks.errors.missingUid'));

    const url = this.resolveEventObjectUrl(handle.persistentId);
    const response = await this.doRequest(url, { method: 'GET' });
    const originalIcs = await response.text();
    const taskEvent: OFCEvent =
      newEvent.type === 'single'
        ? { ...newEvent, uid, completed: newEvent.completed ?? false }
        : { ...newEvent, uid, isTask: true };
    const updatedIcs = updateVTodoCalendar(originalIcs, uid, oldEvent, taskEvent);

    const putResponse = await this.doRequest(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        ...(oldEvent.etag ? { 'If-Match': quotedEtag(oldEvent.etag) } : {})
      },
      body: updatedIcs
    });
    const authoritative = parseVTodoCalendar(updatedIcs)[0]?.event;
    if (authoritative) {
      Object.assign(newEvent, authoritative, {
        uid,
        caldavHref: handle.persistentId,
        etag: putResponse.headers?.get?.('etag')?.replace(/"/g, '') || oldEvent.etag
      });
    }
    return null;
  }

  async toggleComplete(eventId: string, isDone: boolean): Promise<boolean> {
    try {
      const details = PluginState.getCache().store.getEventDetails(eventId);
      if (!details || details.event.type !== 'single') return false;
      const event = details.event;
      const handle = this.getEventHandle(event);
      if (!handle) return false;

      const completed = isDone ? DateTime.utc().toISO() || true : false;
      const updatedEvent: OFCEvent = { ...event, completed };
      await this.updateEvent(handle, event, updatedEvent);
      await PluginState.getProviderRegistry().processProviderUpdates(this.source.id, {
        additions: [],
        updates: [
          {
            persistentId: handle.persistentId,
            event: updatedEvent,
            location: details.location
              ? {
                  file: { path: details.location.path },
                  lineNumber: details.location.lineNumber
                }
              : null
          }
        ],
        deletions: []
      });
      return true;
    } catch (error) {
      console.error(t('settings.calendars.caldavTasks.errors.completionUpdate'), error);
      return false;
    }
  }

  async createInstanceOverride(): Promise<[OFCEvent, EventLocation | null]> {
    throw new Error(t('settings.calendars.caldavTasks.errors.recurringInstance'));
  }

  getConfigurationComponent(): FCReactComponent<CalDAVTaskConfigProps> {
    return CalDAVTaskConfigWrapper;
  }
}
