import ical from 'ical.js';
import { TFile } from 'obsidian';
import { OFCEvent, EventLocation } from '../../types';
import { getEventsFromICS } from '../ics/ics';
import { eventToIcs } from '../ics/formatter';
import {
  CalendarProvider,
  CalendarProviderCapabilities,
  SyncKeyProvider,
  TaskBacklogInfo,
  TaskBacklogItem,
  TaskBacklogProvider
} from '../Provider';
import { EventHandle, FCReactComponent } from '../typesProvider';
import {
  CalDAVProviderConfig,
  CalDAVTaskCalendarInfo,
  CalDAVTaskInboxItem
} from './types/typesCalDAV';
import FullCalendarPlugin from '../../main';
import { createBasicAuthHeader } from './auth/auth_caldav';
import { LinkedNoteIndex } from '../utils/LinkedNoteIndex';
import { CredentialStore } from '../../features/credentials/CredentialStore';
import { createLinkedNoteForProvider } from '../../features/linked-notes/linkedNotes';
import { isTask } from '../../types/tasks';
import { canonCollection, fetchCalendarInfo } from './client/helper_caldav';
import {
  doRequest,
  fetchCalendarObjects,
  fetchVCalendar,
  getUidFromHref,
  putVCalendar,
  resolveEventObjectUrl
} from './client/caldavClient';
import { obsidianFetch } from './obsidian-fetch_caldav';
import {
  createRandomUid,
  encodeCalDAVTaskId,
  parseCalDAVTaskId,
  taskToLinkedNoteEvent
} from './parser/taskParser';
import {
  buildOverrideEventData,
  deleteRecurrenceOverrideInVCalendar,
  updateRecurrenceOverrideInVCalendar
} from './parser/recurrenceOverrides';
import { updateLinkedTaskNoteDates } from './services/caldavLinkedNoteService';
import { CalDAVTaskService } from './services/CalDAVTaskService';
import { CalDAVConfigProps, CalDAVConfigWrapper, CalDAVSettingRow } from './ui/CalDAVSettingRow';

export { encodeCalDAVTaskId, parseCalDAVTaskId };
export type { CalDAVTaskCalendarInfo, CalDAVTaskInboxItem };

export class CalDAVProvider
  implements CalendarProvider<CalDAVProviderConfig>, SyncKeyProvider, TaskBacklogProvider
{
  static readonly type = 'caldav';
  static readonly displayName = 'CalDAV';

  static getConfigurationComponent(): FCReactComponent<CalDAVConfigProps> {
    return CalDAVConfigWrapper;
  }

  private plugin: FullCalendarPlugin;
  private source: CalDAVProviderConfig;
  public readonly linkedNoteIndex: LinkedNoteIndex;
  private taskService: CalDAVTaskService;

  readonly type = 'caldav';
  readonly displayName = 'CalDAV';
  readonly isRemote = true;
  readonly loadPriority = 110;

  constructor(source: CalDAVProviderConfig, plugin: FullCalendarPlugin) {
    this.plugin = plugin;
    this.source = source;
    this.linkedNoteIndex = new LinkedNoteIndex(plugin.app, source.id);
    this.taskService = new CalDAVTaskService(source, plugin, this.linkedNoteIndex, () =>
      this.getPassword()
    );
  }

  private getPassword(): string | null {
    return CredentialStore.getCalDAVPassword(this.source.id);
  }

  initialize(): void {
    this.linkedNoteIndex.initialize();
  }

  teardown(): void {
    this.linkedNoteIndex.destroy();
  }

  async createLinkedNote(
    event: OFCEvent,
    instanceDate?: string,
    templateContentOverride?: string
  ): Promise<TFile | null> {
    const file = await createLinkedNoteForProvider({
      app: this.plugin.app,
      event,
      calendarId: this.source.id,
      calendarName: this.source.name,
      linkedNoteIndex: this.linkedNoteIndex,
      instanceDate,
      templateContentOverride
    });
    if (file && isTask(event)) {
      await updateLinkedTaskNoteDates(this.plugin.app, this.linkedNoteIndex, event, file);
    }
    return file;
  }

  async createLinkedNoteForTask(task: CalDAVTaskInboxItem): Promise<TFile | null> {
    return this.createLinkedNote(taskToLinkedNoteEvent(task));
  }

  getTaskInboxCalendarInfo(): CalDAVTaskCalendarInfo {
    return this.taskService.getTaskInboxCalendarInfo();
  }

  getTaskBacklogInfo(): TaskBacklogInfo {
    return this.taskService.getTaskBacklogInfo();
  }

  getCapabilities(): CalendarProviderCapabilities {
    return {
      canCreate: true,
      canEdit: true,
      canDelete: true,
      supportsAlarms: true,
      ownsRecurringInstanceOverrides: true
    };
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    const context = {
      uid: event.uid,
      recurrenceId: event.recurrenceId
    };
    if (event.caldavHref) {
      return { persistentId: event.caldavHref, ...context };
    }
    return event.uid ? { persistentId: event.uid, ...context } : null;
  }

  computeSyncKey(event: OFCEvent): string {
    if (event.type === 'rrule' && event.id) {
      return event.id;
    }
    if (event.uid && event.recurrenceId) {
      return `${event.uid}::${event.recurrenceId}`;
    }
    return event.uid || JSON.stringify(event);
  }

  async getEvents(range?: { start: Date; end: Date }): Promise<[OFCEvent, EventLocation | null][]> {
    // Validate collection URL using PROPFIND instead of regex
    const { isCalendar: isValid } = await fetchCalendarInfo(this.source.homeUrl, {
      username: this.source.username,
      password: this.getPassword() ?? undefined
    });

    if (!isValid) {
      const message = `[CalDAVProvider] Invalid collection URL or not a calendar: ${this.source.homeUrl}`;
      console.error(message);
      throw new Error(message);
    }

    let start: Date;
    let end: Date;

    if (range && range.start && range.end) {
      start = new Date(range.start);
      end = new Date(range.end);
    } else {
      const now = new Date();
      start = new Date(now);
      start.setFullYear(now.getFullYear() - 1);
      end = new Date(now);
      end.setFullYear(now.getFullYear() + 1);
    }

    try {
      const icsList = await fetchCalendarObjects(
        this.source.homeUrl,
        start,
        end,
        this.source.username,
        this.getPassword() ?? undefined
      );
      const parsedEvents: OFCEvent[] = [];
      let parseFailures = 0;

      for (const { ics, etag, href } of icsList) {
        try {
          const events = getEventsFromICS(ics).map(ev => {
            if (etag) ev.etag = etag.replace(/"/g, ''); // standard ETag usually has quotes
            if (href) {
              ev.caldavHref = href;
            }
            return ev;
          });
          parsedEvents.push(...events);
        } catch {
          parseFailures += 1;
        }
      }

      if (parseFailures > 0) {
        console.warn(`[CalDAVProvider] Skipped ${parseFailures} malformed ICS payload(s).`);
      }

      await Promise.all(
        parsedEvents
          .filter(isTask)
          .map(event => updateLinkedTaskNoteDates(this.plugin.app, this.linkedNoteIndex, event))
      );

      return parsedEvents.map(ev => {
        const linkedFile = this.linkedNoteIndex.getFileForEvent(ev.uid || '');
        const location = linkedFile
          ? { file: { path: linkedFile.path }, lineNumber: undefined }
          : null;
        return [ev, location];
      });
    } catch (err) {
      console.error('[CalDAVProvider] Failed to fetch events.', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to fetch events from CalDAV server: ${errorMessage}`, { cause: err });
    }
  }

  async refreshUndatedTasks(): Promise<CalDAVTaskInboxItem[]> {
    return this.taskService.refreshUndatedTasks();
  }

  async refreshTaskBacklogItems(): Promise<TaskBacklogItem[]> {
    return this.taskService.refreshTaskBacklogItems();
  }

  async getUndatedTasks(): Promise<CalDAVTaskInboxItem[]> {
    return this.taskService.getUndatedTasks();
  }

  async getTaskBacklogItems(): Promise<TaskBacklogItem[]> {
    return this.taskService.getTaskBacklogItems();
  }

  async createTaskBacklogItem(title: string): Promise<TaskBacklogItem> {
    return this.taskService.createTaskBacklogItem(title);
  }

  async deleteTaskBacklogItem(taskId: string): Promise<void> {
    return this.taskService.deleteTaskBacklogItem(taskId);
  }

  async setTaskBacklogItemComplete(taskId: string, isDone: boolean): Promise<boolean> {
    return this.taskService.setTaskBacklogItemComplete(taskId, isDone);
  }

  async openTaskBacklogItem(taskId: string): Promise<void> {
    return this.taskService.openTaskBacklogItem(taskId);
  }

  async createTask(title: string): Promise<CalDAVTaskInboxItem> {
    return this.taskService.createTask(title);
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    // 1. Ensure event has a UID
    if (!event.uid) {
      event.uid = createRandomUid();
    }
    const uid = event.uid;

    // 2. Convert to ICS
    const icsContent = eventToIcs(event);

    // 3. PUT to server
    const url = `${canonCollection(this.source.homeUrl)}${uid}.ics`;

    await doRequest(
      url,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'If-None-Match': '*' // Prevent overwriting if it somehow exists
        },
        body: icsContent
      },
      this.source.username,
      this.getPassword() ?? undefined
    );

    return [event, null];
  }

  async updateEvent(
    handle: EventHandle,
    oldEvent: OFCEvent,
    newEvent: OFCEvent
  ): Promise<EventLocation | null> {
    const href = handle.persistentId;
    if (!newEvent.uid) {
      newEvent.uid = oldEvent.uid || getUidFromHref(href);
    }

    const url = resolveEventObjectUrl(this.source.homeUrl, href);
    if (oldEvent.recurrenceId && oldEvent.uid) {
      const vcalendar = await fetchVCalendar(
        url,
        this.source.username,
        this.getPassword() ?? undefined
      );
      updateRecurrenceOverrideInVCalendar(vcalendar, oldEvent, newEvent);
      await putVCalendar(url, vcalendar, this.source.username, this.getPassword() ?? undefined);
      if (isTask(newEvent)) {
        await updateLinkedTaskNoteDates(this.plugin.app, this.linkedNoteIndex, newEvent);
      }
      return null;
    }

    // Convert to ICS
    const icsContent = eventToIcs(newEvent);

    // PUT to update
    await doRequest(
      url,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          ...(oldEvent.etag ? { 'If-Match': `"${oldEvent.etag}"` } : {})
        },
        body: icsContent
      },
      this.source.username,
      this.getPassword() ?? undefined
    );

    if (isTask(newEvent)) {
      await updateLinkedTaskNoteDates(this.plugin.app, this.linkedNoteIndex, newEvent);
    }

    return null;
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    const url = resolveEventObjectUrl(this.source.homeUrl, handle.persistentId);

    if (handle.uid && handle.recurrenceId) {
      const vcalendar = await fetchVCalendar(
        url,
        this.source.username,
        this.getPassword() ?? undefined
      );
      deleteRecurrenceOverrideInVCalendar(vcalendar, handle.uid, handle.recurrenceId);
      await putVCalendar(url, vcalendar, this.source.username, this.getPassword() ?? undefined);
      return;
    }

    await doRequest(
      url,
      {
        method: 'DELETE'
      },
      this.source.username,
      this.getPassword() ?? undefined
    );
  }

  public ownsTaskId(taskId: string): boolean {
    return this.taskService.ownsTaskId(taskId);
  }

  async validateTaskSchedule(
    taskId: string,
    date: Date
  ): Promise<{ isValid: boolean; reason?: string }> {
    const provider = this as CalendarProvider<CalDAVProviderConfig>;
    return this.taskService.validateTaskSchedule(
      taskId,
      date,
      provider.canBeScheduledAt?.bind(this)
    );
  }

  async scheduleTask(taskId: string, date: Date, allDay = true): Promise<void> {
    return this.taskService.scheduleTask(taskId, date, allDay);
  }

  async unscheduleTask(taskId: string): Promise<void> {
    return this.taskService.unscheduleTask(taskId);
  }

  async createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    if (!masterEvent.uid) {
      throw new Error('Cannot create override: Master event has no UID.');
    }
    const handle = this.getEventHandle(masterEvent);
    if (!handle) {
      throw new Error('Cannot create override: Master event has no CalDAV object reference.');
    }
    const url = resolveEventObjectUrl(this.source.homeUrl, handle.persistentId);

    const headers: Record<string, string> = {};
    const authHeader = createBasicAuthHeader(this.source.username, this.getPassword() ?? undefined);
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const res = await obsidianFetch(url, { method: 'GET', headers });
    if (res.status >= 300) {
      throw new Error(`Failed to fetch original event for override: ${res.status}`);
    }
    const originalIcs = await res.text();

    const jcal = ical.parse(originalIcs);
    const vcalendar = new ical.Component(jcal);

    const { overrideEventData, overrideVEvent } = buildOverrideEventData(
      masterEvent,
      instanceDate,
      newEventData
    );

    vcalendar.addSubcomponent(overrideVEvent);

    const newIcsContent = (vcalendar as unknown as { toString(): string }).toString();

    await doRequest(
      url,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8'
        },
        body: newIcsContent
      },
      this.source.username,
      this.getPassword() ?? undefined
    );

    return [overrideEventData, null];
  }

  // Boilerplate methods for the provider interface.
  revalidate(): Promise<void> {
    return Promise.resolve();
  }

  getConfigurationComponent(): FCReactComponent<CalDAVConfigProps> {
    return CalDAVConfigWrapper;
  }
  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    return CalDAVSettingRow;
  }
}
