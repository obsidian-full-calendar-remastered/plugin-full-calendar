import { PluginState } from '../../core/PluginState';
import { request, TFile } from 'obsidian';
import { OFCEvent, EventLocation } from '../../types';
import { getEventsFromICSAsync } from './ics';
import * as React from 'react';

import { CalendarProvider, CalendarProviderCapabilities, SyncKeyProvider } from '../Provider';
import { EventHandle, FCReactComponent, ProviderConfigContext } from '../typesProvider';
import { ICSProviderConfig } from './typesICS';
import { ICSConfigComponent } from './ui/ICSConfigComponent';
import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { LinkedNoteIndex } from '../utils/LinkedNoteIndex';
import { createLinkedNoteForProvider } from '../../features/linked-notes/linkedNotes';

const WEBCAL = 'webcal';

// Settings row component for ICS Provider
const ICSUrlSetting: React.FC<{ source: Partial<import('../../types').CalendarInfo> }> = ({
  source
}) => {
  // Handle both flat and nested config structures for URL
  const getUrl = (): string => {
    const flat = (source as { url?: unknown }).url;
    const nested = (source as { config?: { url?: unknown } }).config?.url;
    return typeof flat === 'string' ? flat : typeof nested === 'string' ? nested : '';
  };

  return React.createElement(
    'div',
    { className: 'setting-item-control' },
    React.createElement('input', {
      disabled: true,
      type: 'text',
      value: getUrl(),
      className: 'ofc-setting-input'
    })
  );
};

type ICSConfigProps = {
  plugin: FullCalendarPlugin;
  config: Partial<ICSProviderConfig>;
  onConfigChange: (newConfig: Partial<ICSProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: ICSProviderConfig | ICSProviderConfig[]) => void;
  onClose: () => void;
};

const ICSConfigWrapper: React.FC<ICSConfigProps> = props => {
  const { onSave, ...rest } = props;
  const handleSave = (finalConfig: ICSProviderConfig) => onSave(finalConfig);

  return React.createElement(ICSConfigComponent, {
    ...rest,
    onSave: handleSave
  });
};

export class ICSProvider implements CalendarProvider<ICSProviderConfig>, SyncKeyProvider {
  // Static metadata for registry
  static readonly type = 'ical';
  static readonly displayName = 'ICS Calendar';

  static getConfigurationComponent(): FCReactComponent<ICSConfigProps> {
    return ICSConfigWrapper;
  }

  private plugin: FullCalendarPlugin;
  private source: ICSProviderConfig;
  public readonly linkedNoteIndex: LinkedNoteIndex;

  readonly type = 'ical';
  readonly loadPriority = 100;

  /** Dynamic: returns true for remote URLs, false for local file paths */
  get isRemote(): boolean {
    const url = this.source.url;
    if (!url) return true; // Default to remote if not configured
    return url.startsWith('https://') || url.startsWith('http://') || url.startsWith('webcal');
  }

  /** Dynamic display name based on source type */
  get displayName(): string {
    return this.isRemote ? 'Remote Calendar (ICS)' : 'Local Calendar (ICS)';
  }

  constructor(source: ICSProviderConfig, plugin: FullCalendarPlugin, _app?: ObsidianInterface) {
    this.plugin = plugin;
    this.source = source;
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
      calendarName: this.displayName,
      linkedNoteIndex: this.linkedNoteIndex,
      instanceDate,
      templateContentOverride
    });
  }

  getCapabilities(): CalendarProviderCapabilities {
    return { canCreate: false, canEdit: false, canDelete: false };
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    if (event.uid) {
      return { persistentId: event.uid };
    }
    return null;
  }

  computeSyncKey(event: OFCEvent): string {
    // For rrule events, use the unique id field (ics::uid::date::recurring) to prevent
    // collision with RECURRENCE-ID exception instances that share the same uid.
    // This ensures the parent recurring series survives the sync deduplication process.
    if (event.type === 'rrule' && event.id) {
      return event.id;
    }
    if (event.uid && event.recurrenceId) {
      return `${event.uid}::${event.recurrenceId}`;
    }
    return event.uid || JSON.stringify(event);
  }

  async getEvents(_range?: {
    start: Date;
    end: Date;
  }): Promise<[OFCEvent, EventLocation | null][]> {
    const url = this.source.url;

    // Early return if URL is empty
    if (!url) {
      console.warn('ICSProvider: No URL configured.');
      return [];
    }

    // Check if this is a local file path (not a remote URL)
    const isRemoteUrl =
      url.startsWith('https://') || url.startsWith('http://') || url.startsWith(WEBCAL);

    if (!isRemoteUrl) {
      // This is a local file path
      const file = this.plugin.app.vault.getAbstractFileByPath(url);
      if (file instanceof TFile) {
        try {
          const content = await this.plugin.app.vault.read(file);
          const rawEvents = await getEventsFromICSAsync(content);
          return rawEvents.map(event => {
            const linkedFile = this.linkedNoteIndex.getFileForEvent(event.uid || '');
            const location = linkedFile
              ? { file: { path: linkedFile.path }, lineNumber: undefined }
              : null;
            return [event, location];
          });
        } catch (e) {
          console.error(`Error reading local ICS file ${url}`, e);
          return [];
        }
      } else {
        // File not found - don't fall through to network request
        console.error(`Local ICS file not found: ${url}`);
        return [];
      }
    }

    // Remote URL handling
    let remoteUrl = url;
    if (remoteUrl.startsWith(WEBCAL)) {
      remoteUrl = `https${remoteUrl.slice(WEBCAL.length)}`;
    }

    try {
      const response = await request({ url: remoteUrl, method: 'GET' });
      const displayTimezone = PluginState.getSettings().displayTimezone;
      if (!displayTimezone) return [];

      // Remove timezone conversion logic; just return raw events
      const rawEvents = await getEventsFromICSAsync(response);
      return rawEvents.map(event => {
        const linkedFile = this.linkedNoteIndex.getFileForEvent(event.uid || '');
        const location = linkedFile
          ? { file: { path: linkedFile.path }, lineNumber: undefined }
          : null;
        return [event, location];
      });
    } catch (e) {
      console.error(`Error fetching ICS calendar from ${remoteUrl}`, e);
      return [];
    }
  }

  createEvent(_event: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    return Promise.reject(new Error('Cannot create an event on a read-only ICS calendar.'));
  }

  updateEvent(
    _handle: EventHandle,
    _oldEventData: OFCEvent,
    _newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    return Promise.reject(new Error('Cannot update an event on a read-only ICS calendar.'));
  }

  deleteEvent(_handle: EventHandle): Promise<void> {
    return Promise.reject(new Error('Cannot delete an event on a read-only ICS calendar.'));
  }

  createInstanceOverride(
    _masterEvent: OFCEvent,
    _instanceDate: string,
    _newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    return Promise.reject(
      new Error(`Cannot create a recurring event override on a read-only calendar.`)
    );
  }

  revalidate(): Promise<void> {
    // This method's existence signals to the adapter that this is a remote-style provider.
    // The actual fetching is always done in getEvents.
    return Promise.resolve();
  }

  getConfigurationComponent(): FCReactComponent<ICSConfigProps> {
    return ICSConfigWrapper;
  }

  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    return ICSUrlSetting;
  }
}
