import * as React from 'react';
import { DateTime } from 'luxon';
import FullCalendarPlugin from '../../main';
import { PluginState } from '../../core/PluginState';
import { EventLocation, OFCEvent, validateEvent } from '../../types';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { CalendarProvider, CalendarProviderCapabilities, SyncKeyProvider } from '../Provider';
import { EventHandle, FCReactComponent, ProviderConfigContext } from '../typesProvider';
import { OutlookProviderConfig } from './typesOutlook';
import { OutlookConfigComponent } from './ui/OutlookConfigComponent';
import { OutlookAuthManager } from './auth/OutlookAuthManager';
import { makeAuthenticatedRequest, OutlookApiError } from './auth/request';
import { fromOutlookEvent, OutlookEventLike, toOutlookEvent } from './parser/parser_outlook';
import { LinkedNoteIndex } from '../utils/LinkedNoteIndex';
import { TFile } from 'obsidian';
import { createLinkedNoteForProvider } from '../../features/linked-notes/linkedNotes';

const OutlookNameSetting: React.FC<{ source: Partial<import('../../types').CalendarInfo> }> = ({
  source
}) => {
  const microsoftAccountId = (source as unknown as { microsoftAccountId?: string })
    ?.microsoftAccountId;
  const accountEmail = PluginState.getSettings().microsoftAccounts.find(
    account => account.id === microsoftAccountId
  )?.email;
  const displayValue = accountEmail || '';

  return React.createElement(
    'div',
    { className: 'setting-item-control' },
    React.createElement('input', {
      disabled: true,
      type: 'text',
      value: displayValue,
      className: 'ofc-setting-input'
    })
  );
};

type OutlookConfigProps = {
  plugin: FullCalendarPlugin;
  config: Partial<OutlookProviderConfig>;
  onConfigChange: (newConfig: Partial<OutlookProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (
    finalConfig: OutlookProviderConfig | OutlookProviderConfig[],
    accountId?: string
  ) => void;
  onClose: () => void;
};

const createOutlookConfigWrapper = (
  pluginFromInstance?: FullCalendarPlugin
): React.FC<OutlookConfigProps> => {
  return props => {
    const plugin =
      pluginFromInstance || (props as OutlookConfigProps & { plugin?: FullCalendarPlugin }).plugin;

    const forwardOnSave = props.onSave;

    const handleSave = (
      selectedConfigs: { id: string; name: string; color: string }[],
      accountId: string
    ) => {
      forwardOnSave(selectedConfigs as unknown as OutlookProviderConfig[], accountId);
    };

    if (!plugin) {
      throw new Error('Outlook configuration requires plugin context.');
    }

    return React.createElement(OutlookConfigComponent, {
      plugin,
      onSave: handleSave,
      onClose: props.onClose
    });
  };
};

export class OutlookProvider implements CalendarProvider<OutlookProviderConfig>, SyncKeyProvider {
  static readonly type = 'outlook';
  static readonly displayName = 'Outlook Calendar';

  static getConfigurationComponent(): FCReactComponent<OutlookConfigProps> {
    return createOutlookConfigWrapper();
  }

  private plugin: FullCalendarPlugin;
  private source: OutlookProviderConfig;
  private authManager: OutlookAuthManager;
  public readonly linkedNoteIndex: LinkedNoteIndex;

  readonly type = 'outlook';
  readonly displayName = 'Outlook Calendar';
  readonly isRemote = true;
  readonly loadPriority = 125;

  constructor(source: OutlookProviderConfig, plugin: FullCalendarPlugin, _app?: ObsidianInterface) {
    this.plugin = plugin;
    this.source = source;
    this.authManager = new OutlookAuthManager(plugin);
    this.linkedNoteIndex = new LinkedNoteIndex(plugin.app, source.id);
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
    if (!event.uid) return null;
    return { persistentId: event.uid };
  }

  computeSyncKey(event: OFCEvent): string {
    return event.uid || JSON.stringify(event);
  }

  private async getAccessToken(): Promise<string> {
    const token = await this.authManager.getTokenForSource({
      type: 'outlook',
      id: this.source.id,
      name: this.source.name,
      calendarId: this.source.calendarId,
      microsoftAccountId: this.source.microsoftAccountId,
      color: ''
    });

    if (!token) {
      throw new OutlookApiError('Cannot perform Outlook operation: not authenticated.');
    }

    return token;
  }

  async getEvents(_range?: {
    start: Date;
    end: Date;
  }): Promise<[OFCEvent, EventLocation | null][]> {
    const token = await this.getAccessToken().catch(() => null);
    if (!token) return [];

    try {
      const url = new URL(
        `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(this.source.calendarId)}/events`
      );
      url.searchParams.set('$top', '1000');

      const response = await makeAuthenticatedRequest<{ value?: OutlookEventLike[] }>(
        token,
        url.toString()
      );

      if (!Array.isArray(response.value)) {
        return [];
      }

      const tuples = response.value
        .map(raw => {
          const parsed = fromOutlookEvent(raw);
          if (!parsed) return null;
          const validated = validateEvent(parsed);
          if (!validated) return null;
          const linkedFile = this.linkedNoteIndex.getFileForEvent(validated.uid || '');
          const location = linkedFile
            ? { file: { path: linkedFile.path }, lineNumber: undefined }
            : null;
          return [validated, location] as [OFCEvent, EventLocation | null];
        })
        .filter((item): item is [OFCEvent, EventLocation | null] => item !== null);

      return tuples;
    } catch {
      return [];
    }
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    const token = await this.getAccessToken();

    const created = await makeAuthenticatedRequest<OutlookEventLike>(
      token,
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(this.source.calendarId)}/events`,
      'POST',
      toOutlookEvent(event)
    );

    const parsed = fromOutlookEvent(created);
    if (!parsed) {
      throw new Error('Could not parse event from Outlook API after creation.');
    }

    return [parsed, null];
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    const token = await this.getAccessToken();

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
      return null;
    }

    await makeAuthenticatedRequest(
      token,
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(this.source.calendarId)}/events/${encodeURIComponent(handle.persistentId)}`,
      'PATCH',
      toOutlookEvent(newEventData)
    );

    return null;
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    const token = await this.getAccessToken();

    await makeAuthenticatedRequest(
      token,
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(this.source.calendarId)}/events/${encodeURIComponent(handle.persistentId)}`,
      'DELETE'
    );
  }

  private async findOccurrenceId(
    token: string,
    masterEventId: string,
    instanceDate: string,
    timeZone?: string,
    startTime?: string
  ): Promise<string | null> {
    const zone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const startAt = startTime || '00:00';
    const startDateTime = DateTime.fromISO(`${instanceDate}T${startAt}`, { zone });
    const endDateTime = startDateTime.plus({ days: 1 });

    const url = new URL(
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(this.source.calendarId)}/events/${encodeURIComponent(masterEventId)}/instances`
    );
    url.searchParams.set('startDateTime', startDateTime.toISO() || `${instanceDate}T00:00:00`);
    url.searchParams.set('endDateTime', endDateTime.toISO() || `${instanceDate}T23:59:59`);
    url.searchParams.set('$top', '200');

    const response = await makeAuthenticatedRequest<{ value?: OutlookEventLike[] }>(
      token,
      url.toString()
    );
    if (!Array.isArray(response.value)) {
      return null;
    }

    const match = response.value.find(item => {
      if (!item.id || !item.start?.dateTime) return false;
      const dt = DateTime.fromISO(item.start.dateTime, { setZone: true });
      return dt.isValid && dt.toISODate() === instanceDate;
    });

    return match?.id || null;
  }

  private async cancelInstance(masterEvent: OFCEvent, instanceDate: string): Promise<void> {
    if (!masterEvent.uid) {
      throw new Error('Cannot cancel an instance of a recurring event that has no master UID.');
    }

    const token = await this.getAccessToken();
    const startTime =
      !masterEvent.allDay && 'startTime' in masterEvent ? masterEvent.startTime : undefined;
    const occurrenceId = await this.findOccurrenceId(
      token,
      masterEvent.uid,
      instanceDate,
      masterEvent.timezone,
      startTime
    );

    if (!occurrenceId) {
      throw new Error('Could not locate recurring instance to cancel in Outlook.');
    }

    await makeAuthenticatedRequest(
      token,
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(this.source.calendarId)}/events/${encodeURIComponent(occurrenceId)}`,
      'DELETE'
    );
  }

  async createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    if (!masterEvent.uid) {
      throw new Error('Cannot create instance override without a recurring master UID.');
    }

    const token = await this.getAccessToken();
    const startTime =
      !masterEvent.allDay && 'startTime' in masterEvent ? masterEvent.startTime : undefined;
    const occurrenceId = await this.findOccurrenceId(
      token,
      masterEvent.uid,
      instanceDate,
      masterEvent.timezone,
      startTime
    );

    if (!occurrenceId) {
      throw new Error('Could not locate recurring instance to modify in Outlook.');
    }

    const updated = await makeAuthenticatedRequest<OutlookEventLike>(
      token,
      `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(this.source.calendarId)}/events/${encodeURIComponent(occurrenceId)}`,
      'PATCH',
      toOutlookEvent(newEventData)
    );

    const parsed = fromOutlookEvent(updated);
    if (!parsed) {
      throw new Error('Could not parse Outlook instance override response.');
    }

    return [parsed, null];
  }

  getConfigurationComponent(): FCReactComponent<OutlookConfigProps> {
    return createOutlookConfigWrapper(this.plugin);
  }

  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    return OutlookNameSetting;
  }

  revalidate(): Promise<void> {
    return Promise.resolve();
  }
}
