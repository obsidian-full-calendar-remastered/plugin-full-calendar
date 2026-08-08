import { PluginState } from '../../core/PluginState';
import { DateTime } from 'luxon';
import { OFCEvent, EventLocation, validateEvent } from '../../types';
import FullCalendarPlugin from '../../main';
import { fromGoogleEvent, toGoogleEvent, GoogleEventLike } from './parser/parser_gcal';
import { makeAuthenticatedRequest, GoogleApiError } from './auth/request';

import { CalendarProvider, CalendarProviderCapabilities, SyncKeyProvider } from '../Provider';
import { EventHandle, FCReactComponent, ProviderConfigContext } from '../typesProvider';
import { GoogleProviderConfig } from './typesGCal';

import { GoogleConfigComponent } from './ui/GoogleConfigComponent';
import * as React from 'react';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { GoogleAuthManager } from './auth/GoogleAuthManager';
import { LinkedNoteIndex } from '../utils/LinkedNoteIndex';
import { TFile } from 'obsidian';
import { createLinkedNoteForProvider } from '../../features/linked-notes/linkedNotes';

// Settings row component for Google Provider
const GoogleNameSetting: React.FC<{ source: Partial<import('../../types').CalendarInfo> }> = ({
  source
}) => {
  const calendarId = (source as unknown as { calendarId?: string })?.calendarId || '';

  return React.createElement(
    'div',
    { className: 'setting-item-control' },
    React.createElement('input', {
      disabled: true,
      type: 'text',
      value: calendarId,
      className: 'ofc-setting-input'
    })
  );
};

type GoogleConfigProps = {
  plugin: FullCalendarPlugin;
  config: Partial<GoogleProviderConfig>;
  onConfigChange: (newConfig: Partial<GoogleProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: GoogleProviderConfig | GoogleProviderConfig[], accountId?: string) => void;
  onClose: () => void;
};

const createGoogleConfigWrapper = (
  pluginFromInstance?: FullCalendarPlugin
): React.FC<GoogleConfigProps> => {
  return props => {
    const plugin =
      pluginFromInstance || (props as GoogleConfigProps & { plugin?: FullCalendarPlugin }).plugin;

    const forwardOnSave = props.onSave;

    const handleSave = (
      selectedConfigs: { id: string; name: string; color: string }[],
      accountId: string
    ) => {
      forwardOnSave(selectedConfigs as unknown as GoogleProviderConfig[], accountId);
    };

    if (!plugin) {
      throw new Error('Google configuration requires plugin context.');
    }

    return React.createElement(GoogleConfigComponent, {
      plugin,
      onSave: handleSave,
      onClose: props.onClose
    });
  };
};

export class GoogleProvider implements CalendarProvider<GoogleProviderConfig>, SyncKeyProvider {
  // Static metadata for registry
  static readonly type = 'google';
  static readonly displayName = 'Google Calendar';

  static getConfigurationComponent(): FCReactComponent<GoogleConfigProps> {
    return createGoogleConfigWrapper();
  }

  private plugin: FullCalendarPlugin;
  private source: GoogleProviderConfig;
  private authManager: GoogleAuthManager;
  public readonly linkedNoteIndex: LinkedNoteIndex;

  // Instance properties remain
  readonly type = 'google';
  readonly displayName = 'Google Calendar';
  readonly isRemote = true;
  readonly loadPriority = 120;

  constructor(source: GoogleProviderConfig, plugin: FullCalendarPlugin, _app?: ObsidianInterface) {
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
    return {
      canCreate: true,
      canEdit: true,
      canDelete: true,
      supportsAlarms: true,
      ownsRecurringInstanceOverrides: true
    };
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

  async getEvents(range?: { start: Date; end: Date }): Promise<[OFCEvent, EventLocation | null][]> {
    const token = await this.authManager.getTokenForSource({
      type: 'google',
      id: this.source.id,
      name: this.source.name,
      calendarId: this.source.calendarId,
      googleAccountId: this.source.googleAccountId,
      color: ''
    }); // Provide exact subtype
    if (!token) return [];

    const displayTimezone = PluginState.getSettings().displayTimezone;
    if (!displayTimezone) return [];

    try {
      let timeMin: Date;
      let timeMax: Date;

      if (range && range.start && range.end) {
        timeMin = new Date(range.start);
        timeMax = new Date(range.end);
      } else {
        timeMin = new Date();
        timeMin.setFullYear(timeMin.getFullYear() - 1);
        timeMax = new Date();
        timeMax.setFullYear(timeMax.getFullYear() + 1);
      }

      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.source.calendarId)}/events`
      );
      url.searchParams.set('timeMin', timeMin.toISOString());
      url.searchParams.set('timeMax', timeMax.toISOString());
      url.searchParams.set('singleEvents', 'false');
      url.searchParams.set('showDeleted', 'true');
      url.searchParams.set('maxResults', '2500');
      url.searchParams.set('conferenceDataVersion', '1');

      const data = await makeAuthenticatedRequest<{ items?: GoogleEventLike[] }>(
        token,
        url.toString()
      );
      if (!Array.isArray(data.items)) return [];

      const skipDatesMap = new Map<string, Set<string>>();
      for (const gEvent of data.items) {
        if (
          gEvent.recurringEventId &&
          gEvent.originalStartTime &&
          (gEvent.originalStartTime.dateTime || gEvent.originalStartTime.date)
        ) {
          const parentId = gEvent.recurringEventId;
          if (!skipDatesMap.has(parentId)) {
            skipDatesMap.set(parentId, new Set());
          }
          let skipDate: string | null = null;
          if (gEvent.originalStartTime.dateTime) {
            skipDate = DateTime.fromISO(gEvent.originalStartTime.dateTime, {
              zone: gEvent.originalStartTime.timeZone || 'utc'
            }).toISODate();
          } else if (gEvent.originalStartTime.date) {
            skipDate = gEvent.originalStartTime.date;
          }
          if (skipDate) {
            const parentSkipDates = skipDatesMap.get(parentId);
            if (parentSkipDates) {
              parentSkipDates.add(skipDate);
            }
          }
        }
      }

      // Remove convertEvent logic; just validate and return events
      const tuples: ([OFCEvent, EventLocation | null] | null)[] = data.items.map(
        (gEvent: GoogleEventLike) => {
          const rawEvent = fromGoogleEvent(gEvent);
          if (!rawEvent) return null;

          if (
            (rawEvent.type === 'rrule' || rawEvent.type === 'recurring') &&
            rawEvent.uid &&
            skipDatesMap.has(rawEvent.uid)
          ) {
            const datesToSkip = skipDatesMap.get(rawEvent.uid);
            if (!datesToSkip) {
              return null;
            }
            rawEvent.skipDates = [...new Set([...(rawEvent.skipDates || []), ...datesToSkip])];
          }

          const validated = validateEvent(rawEvent);
          if (!validated) return null;

          const linkedFile = this.linkedNoteIndex.getFileForEvent(validated.uid || '');
          const location = linkedFile
            ? { file: { path: linkedFile.path }, lineNumber: undefined }
            : null;
          return [validated, location];
        }
      );
      return tuples.filter((e): e is [OFCEvent, EventLocation | null] => e !== null);
    } catch (e) {
      console.error(`Error fetching events for Google Calendar "${this.source.name}":`, e);
      return [];
    }
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    const token = await this.authManager.getTokenForSource({
      type: 'google',
      id: this.source.id,
      name: this.source.name,
      calendarId: this.source.calendarId,
      googleAccountId: this.source.googleAccountId,
      color: ''
    });
    if (!token) throw new GoogleApiError('Cannot create event: not authenticated.');

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      this.source.calendarId
    )}/events?conferenceDataVersion=1`;
    const body = toGoogleEvent(event);
    const createdGEvent = await makeAuthenticatedRequest<GoogleEventLike>(token, url, 'POST', body);

    const rawEvent = fromGoogleEvent(createdGEvent);
    if (!rawEvent) throw new Error('Could not parse event from Google API after creation.');

    return [rawEvent, null];
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    const token = await this.authManager.getTokenForSource({
      type: 'google',
      id: this.source.id,
      name: this.source.name,
      calendarId: this.source.calendarId,
      googleAccountId: this.source.googleAccountId,
      color: ''
    });
    if (!token) throw new GoogleApiError('Cannot update event: not authenticated.');

    const newSkipDates = new Set(
      newEventData.type === 'rrule' || newEventData.type === 'recurring'
        ? newEventData.skipDates
        : []
    );
    const oldSkipDates = new Set(
      oldEventData.type === 'rrule' || oldEventData.type === 'recurring'
        ? oldEventData.skipDates
        : []
    );
    let cancelledDate: string | undefined;
    if (newSkipDates.size > oldSkipDates.size) {
      for (const date of newSkipDates) {
        if (!oldSkipDates.has(date)) {
          cancelledDate = date;
          break;
        }
      }
    }

    if (cancelledDate) {
      await this.cancelInstance(oldEventData, cancelledDate);
    } else {
      const eventId = handle.persistentId;
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        this.source.calendarId
      )}/events/${encodeURIComponent(eventId)}`;
      const body = toGoogleEvent(newEventData);
      await makeAuthenticatedRequest(token, url, 'PUT', body);
    }
    return null;
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    const token = await this.authManager.getTokenForSource({
      type: 'google',
      id: this.source.id,
      name: this.source.name,
      calendarId: this.source.calendarId,
      googleAccountId: this.source.googleAccountId,
      color: ''
    });
    if (!token) throw new GoogleApiError('Cannot delete event: not authenticated.');

    const eventId = handle.persistentId;
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      this.source.calendarId
    )}/events/${encodeURIComponent(eventId)}`;
    await makeAuthenticatedRequest(token, url, 'DELETE');
  }

  private async cancelInstance(parentEvent: OFCEvent, instanceDate: string): Promise<void> {
    const token = await this.authManager.getTokenForSource({
      type: 'google',
      id: this.source.id,
      name: this.source.name,
      calendarId: this.source.calendarId,
      googleAccountId: this.source.googleAccountId,
      color: ''
    });
    if (!token) throw new GoogleApiError('Cannot cancel instance: not authenticated.');

    if (!parentEvent.uid) {
      throw new Error('Cannot cancel an instance of a recurring event that has no master UID.');
    }
    const body: Record<string, unknown> = {
      recurringEventId: parentEvent.uid,
      status: 'cancelled'
    };
    // Google API expects either a date (all-day) or dateTime/timeZone pair.
    // `toISO()` can theoretically return null, so allow null and guard.
    let startTimeObject: { date?: string; dateTime?: string; timeZone?: string };
    if (parentEvent.allDay) {
      startTimeObject = { date: instanceDate };
    } else {
      const timeZone = parentEvent.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const startTime =
        !parentEvent.allDay && 'startTime' in parentEvent ? parentEvent.startTime : '00:00';
      const isoDateTime = DateTime.fromISO(`${instanceDate}T${startTime}`, {
        zone: timeZone
      }).toISO();
      startTimeObject = isoDateTime
        ? { dateTime: isoDateTime, timeZone: timeZone }
        : { date: instanceDate };
    }
    body.originalStartTime = startTimeObject;
    body.start = startTimeObject;
    body.end = startTimeObject;

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      this.source.calendarId
    )}/events`;
    await makeAuthenticatedRequest(token, url, 'POST', body);
  }

  async createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    const token = await this.authManager.getTokenForSource({
      type: 'google',
      id: this.source.id,
      name: this.source.name,
      calendarId: this.source.calendarId,
      googleAccountId: this.source.googleAccountId,
      color: ''
    });
    if (!token) throw new GoogleApiError('Cannot create instance override: not authenticated.');

    if (newEventData.allDay === false && masterEvent.allDay === false) {
      const originalStartTime = {
        dateTime: DateTime.fromISO(`${instanceDate}T${masterEvent.startTime}`).toISO(),
        timeZone: masterEvent.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
      };

      const body = {
        ...toGoogleEvent(newEventData),
        recurringEventId: masterEvent.uid,
        originalStartTime: originalStartTime
      };

      const newGEvent = await makeAuthenticatedRequest<GoogleEventLike>(
        token,
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.source.calendarId)}/events?conferenceDataVersion=1`,
        'POST',
        body
      );

      const rawEvent = fromGoogleEvent(newGEvent);
      if (!rawEvent) {
        throw new Error('Could not parse Google API response after creating instance override.');
      }
      return [rawEvent, null];
    }
    throw new Error(
      'Modifying a single instance of an all-day recurring event is not yet supported for Google Calendars.'
    );
  }

  getConfigurationComponent(): FCReactComponent<GoogleConfigProps> {
    return createGoogleConfigWrapper(this.plugin);
  }

  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    return GoogleNameSetting;
  }

  revalidate(): Promise<void> {
    // This method's existence signals to the adapter that this is a remote-style provider.
    // The actual fetching is always done in getEvents.
    return Promise.resolve();
  }

  async createLinkedNote(
    event: OFCEvent,
    instanceDate?: string,
    templateContentOverride?: string
  ): Promise<TFile | null> {
    return createLinkedNoteForProvider({
      app: this.plugin.app,
      event,
      calendarId: this.source.id,
      calendarName: this.source.name,
      linkedNoteIndex: this.linkedNoteIndex,
      instanceDate,
      templateContentOverride
    });
  }
}
