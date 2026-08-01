import { CachedMetadata, moment as obsidianMoment, TFile, Vault } from 'obsidian';
import * as React from 'react';
import {
  appHasDailyNotesPluginLoaded,
  createDailyNote,
  getAllDailyNotes,
  getDailyNote,
  getDailyNoteSettings,
  getDateFromFile
} from 'obsidian-daily-notes-interface';

import {
  getAllInlineEventsFromFile,
  getInlineEventFromLine,
  getListsUnderHeading,
  modifyListItem,
  addToHeading
} from './parser_dailyN';

import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { OFCEvent, EventLocation } from '../../types';
import { constructTitle } from '../../features/category/categoryParser';
import { DailyNoteParseCache } from './DailyNoteParseCache';
import { yieldIfFrameBudgetExceeded } from '../../utils/async';
import { LoadDebugProfiler } from '../../utils/LoadDebugProfiler';

import {
  CalendarProvider,
  CalendarProviderCapabilities,
  SyncKeyProvider,
  CanonicalTitleProvider
} from '../Provider';
import { EventHandle, FCReactComponent, ProviderConfigContext } from '../typesProvider';
import { DailyNoteProviderConfig, getDailyNoteEventFormat } from './typesDaily';
import { DailyNoteConfigComponent } from './DailyNoteConfigComponent';
import { DailyNoteDecorator } from './codemirror/DailyNoteDecorator';
import { LivePreviewDecorator } from '../../features/livepreview/LivePreviewDecorator';

type MomentFactory = typeof import('moment');
const moment = obsidianMoment as unknown as MomentFactory;
const METADATA_WAIT_TIMEOUT_MS = 1500;

export type EditableEventResponse = [OFCEvent, EventLocation | null];

const waitForMetadataWithTimeout = async (
  app: ObsidianInterface,
  file: TFile,
  timeoutMs = METADATA_WAIT_TIMEOUT_MS
): Promise<CachedMetadata | null> => {
  const existing = app.getMetadata(file);
  if (existing) {
    return existing;
  }

  try {
    return await Promise.race([
      app.waitForMetadata(file),
      new Promise<null>(resolve => window.setTimeout(() => resolve(null), timeoutMs))
    ]);
  } catch (error) {
    console.warn(
      `Full Calendar: Failed while waiting for metadata for daily note file "${file.path}".`,
      error
    );
    return null;
  }
};

// Settings row component for Daily Note Provider
const DailyNoteHeadingSetting: React.FC<{
  source: Partial<import('../../types').CalendarInfo>;
}> = ({ source }) => {
  // Handle both flat and nested config structures for heading
  const getHeading = (): string => {
    const flat = (source as { heading?: unknown }).heading;
    const nested = (source as { config?: { heading?: unknown } }).config?.heading;
    return typeof flat === 'string' ? flat : typeof nested === 'string' ? nested : '';
  };

  return React.createElement(
    'div',
    { className: 'setting-item-control ofc-heading-setting-control' },
    React.createElement('span', {}, 'Under heading'),
    React.createElement('input', {
      disabled: true,
      type: 'text',
      value: getHeading(),
      className: 'ofc-setting-input is-inline'
    }),
    React.createElement('span', { className: 'ofc-heading-setting-suffix' }, 'in daily notes')
  );
};

type DailyNoteConfigProps = {
  plugin: FullCalendarPlugin;
  config: Partial<DailyNoteProviderConfig>;
  onConfigChange: (newConfig: Partial<DailyNoteProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: DailyNoteProviderConfig | DailyNoteProviderConfig[]) => void;
  onClose: () => void;
};

const DailyNoteConfigWrapper: React.FC<DailyNoteConfigProps> = props => {
  const { onSave, ...rest } = props;
  const handleSave = (finalConfig: DailyNoteProviderConfig) => onSave(finalConfig);

  return React.createElement(DailyNoteConfigComponent, {
    ...rest,
    onSave: handleSave
  });
};

export class DailyNoteProvider
  implements CalendarProvider<DailyNoteProviderConfig>, SyncKeyProvider, CanonicalTitleProvider
{
  // Static metadata for registry
  static readonly type = 'dailynote';
  static readonly displayName = 'Daily Note';

  static getConfigurationComponent(): FCReactComponent<DailyNoteConfigProps> {
    return DailyNoteConfigWrapper;
  }

  private app: ObsidianInterface;
  private plugin: FullCalendarPlugin;
  private source: DailyNoteProviderConfig;
  private parseCache: DailyNoteParseCache;

  readonly type = 'dailynote';
  readonly displayName = 'Daily Note';
  readonly isRemote = false;
  readonly loadPriority = 20;

  constructor(
    source: DailyNoteProviderConfig,
    plugin: FullCalendarPlugin,
    app?: ObsidianInterface
  ) {
    if (!app) {
      throw new Error('DailyNoteProvider requires an Obsidian app interface.');
    }
    appHasDailyNotesPluginLoaded();
    this.app = app;
    this.plugin = plugin;
    this.source = { ...source, format: getDailyNoteEventFormat(source) };
    const vault = plugin?.app?.vault || (app as unknown as { app?: { vault?: Vault } })?.app?.vault;
    this.parseCache = new DailyNoteParseCache(vault);
  }

  getCapabilities(): CalendarProviderCapabilities {
    return { canCreate: true, canEdit: true, canDelete: true };
  }

  private _fullTitleForEvent(event: OFCEvent): string {
    return constructTitle(event.category, event.subCategory, event.title);
  }

  private _persistentIdForEvent(event: OFCEvent): string | null {
    if (event.type !== 'single' || !event.date) {
      return null;
    }

    if (event.uid) {
      return `${event.date}::uid:${event.uid}`;
    }

    const timeSuffix = event.allDay
      ? '::allday'
      : `::time:${event.startTime || ''}-${event.endTime || ''}`;

    return `${event.date}::${this._fullTitleForEvent(event)}${timeSuffix}`;
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    if (event.type === 'single' && event.date) {
      const persistentId = this._persistentIdForEvent(event);
      if (!persistentId) return null;
      const m = moment(event.date);
      const file = getDailyNote(m, getAllDailyNotes());
      if (!file || !(file instanceof TFile)) return null;
      return { persistentId, location: { path: file.path } };
    }
    return null;
  }

  /**
   * Pure-string sync key — identical to the persistentId from getEventHandle,
   * but WITHOUT the expensive moment() + getAllDailyNotes() vault scan.
   * This makes bulk sync diffing O(N) instead of O(N×V).
   */
  computeSyncKey(event: OFCEvent): string {
    if (event.type === 'single' && event.date) {
      return this._persistentIdForEvent(event) || '';
    }
    // Fallback for non-standard event types (should not occur in practice)
    return `${event.type || 'unknown'}::${event.title || ''}::${JSON.stringify(event)}`;
  }

  public isFileRelevant(file: TFile): boolean {
    // Encapsulates the logic of checking the daily note folder.
    const { folder } = getDailyNoteSettings();
    return folder ? file.path.startsWith(`${folder}/`) : true;
  }

  getCanonicalTitle(event: OFCEvent): string {
    return event.title;
  }

  private async _assignLocalUid(file: TFile, event: OFCEvent): Promise<OFCEvent> {
    if (event.uid) return event;

    const content = await this.app.read(file);
    const lines = content.split('\n');
    const date = getDateFromFile(file, 'day')?.format('YYYY-MM-DD');

    const usedUids = new Set<number>();

    for (const line of lines) {
      if (!date) continue;
      const parsed = getInlineEventFromLine(line, { date });
      if (parsed && parsed.uid && !isNaN(Number(parsed.uid))) {
        usedUids.add(Number(parsed.uid));
      }
    }

    let localUid = 1;
    while (usedUids.has(localUid)) {
      localUid++;
    }

    return { ...event, uid: localUid.toString() };
  }

  private async _findEventLineNumber(
    file: TFile,
    persistentId: string,
    hint?: number
  ): Promise<number> {
    const content = await this.app.read(file);
    const lines = content.split('\n');
    const date = getDateFromFile(file, 'day')?.format('YYYY-MM-DD');

    // It's possible for a daily note file to not have a date in its title.
    // In that case, we cannot reliably parse events from it.
    if (!date) {
      throw new Error(`Could not determine date from file: ${file.path}`);
    }

    let isV2 = false;
    let targetUid = '';
    const match = persistentId.match(/^(\d{4}-\d{2}-\d{2})::uid:(\d+)$/);
    if (match) {
      isV2 = true;
      targetUid = match[2];
    }

    const checkLine = (line: string): boolean => {
      const parsed = getInlineEventFromLine(line, { date });
      if (parsed && parsed.type === 'single') {
        if (isV2 && parsed.uid === targetUid) return true;

        const currentId = this._persistentIdForEvent(parsed);
        if (!isV2 && currentId === persistentId) return true;
      }
      return false;
    };

    if (hint !== undefined && hint >= 0 && hint < lines.length) {
      if (checkLine(lines[hint])) return hint;
    }

    for (let i = 0; i < lines.length; i++) {
      if (checkLine(lines[i])) return i;
    }

    throw new Error(`Could not find event with ID "${persistentId}" in file "${file.path}".`);
  }

  public async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
    const cached = this.parseCache.get(file);
    if (cached) {
      LoadDebugProfiler.recordDailyNotesStats({ cacheHits: 1 });
      return cached;
    }

    const cache = this.app.getMetadata(file) || (await waitForMetadataWithTimeout(this.app, file));
    if (!cache) {
      return [];
    }

    // PRE-FILTER: If the user configured a specific heading for Daily Notes (e.g. "Calendar"),
    // check if this file's metadata contains that heading. If not, skip reading the file!
    if (this.source.heading && this.source.heading.trim()) {
      const headingText = this.source.heading.trim();
      const hasHeading = cache.headings?.some(h => h.heading === headingText);
      if (!hasHeading) {
        LoadDebugProfiler.recordDailyNotesStats({ preFiltered: 1 });
        this.parseCache.set(file, []);
        return [];
      }
    }

    const listItems = getListsUnderHeading(this.source.heading, cache);
    if (listItems.length === 0) {
      LoadDebugProfiler.recordDailyNotesStats({ preFiltered: 1 });
      this.parseCache.set(file, []);
      return [];
    }

    LoadDebugProfiler.recordDailyNotesStats({ readFromDisk: 1 });
    const date = getDateFromFile(file, 'day')?.format('YYYY-MM-DD');
    const inlineEvents = await this.app.process(file, text =>
      getAllInlineEventsFromFile(text, listItems, { date })
    );

    // The raw events are returned as-is. The EventEnhancer handles timezone conversion.
    const result: EditableEventResponse[] = inlineEvents.map(({ event, lineNumber }) => {
      return [event, { file, lineNumber }];
    });

    this.parseCache.set(file, result);
    return result;
  }

  async getEvents(range?: { start: Date; end: Date }): Promise<EditableEventResponse[]> {
    return LoadDebugProfiler.withContext('Daily Note Sync', async () => {
      const notes = getAllDailyNotes();
      let files = Object.values(notes);

      // OPTIMIZATION: If a range is provided, only process daily notes within that range.
      if (range) {
        const startMoment = moment(range.start);
        const endMoment = moment(range.end);
        files = files.filter(file => {
          const fileDate = getDateFromFile(file, 'day');
          return (
            fileDate && fileDate.isSameOrAfter(startMoment) && fileDate.isSameOrBefore(endMoment)
          );
        });
      }

      LoadDebugProfiler.recordDailyNotesStats({ totalScanned: files.length });

      const allEvents: EditableEventResponse[][] = [];
      let frameStart = performance.now();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const res = await LoadDebugProfiler.withContext(
          'Parse Daily Note File',
          () => this.getEventsInFile(file),
          file.path
        );
        allEvents.push(res);
        frameStart = await yieldIfFrameBudgetExceeded(frameStart, 5);
      }
      return allEvents.flat();
    });
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation]> {
    if (event.type !== 'single') {
      throw new Error('Daily Note provider can only create single events.');
    }

    const m = moment(event.date);
    let file = getDailyNote(m, getAllDailyNotes());
    if (!file) {
      const createdFile = await createDailyNote(m);
      if (!createdFile) {
        throw new Error(`Failed to create daily note for date ${event.date}.`);
      }
      file = createdFile;
    }

    const eventToStore = await this._assignLocalUid(file, event);

    const metadata = await this.app.waitForMetadata(file);
    const headingInfo = metadata.headings?.find(h => h.heading === this.source.heading);

    const lineNumber = await this.app.rewrite(file, (contents: string) => {
      const { page, lineNumber } = addToHeading(
        contents,
        { heading: headingInfo, item: eventToStore, headingText: this.source.heading },
        this.source
      );
      return [page, lineNumber] as [string, number];
    });

    return [eventToStore, { file, lineNumber }];
  }

  async updateEvent(
    handle: EventHandle,
    _oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    if (newEventData.type !== 'single') {
      throw new Error('Daily Note provider can only update events to be single events.');
    }

    if (!handle.location?.path) {
      throw new Error('DailyNoteProvider updateEvent requires a file path in the event handle.');
    }
    const { path } = handle.location;
    const file = this.app.getFileByPath(path);
    if (!file) throw new Error(`File not found at path: ${path}`);

    const lineNumber = await this._findEventLineNumber(
      file,
      handle.persistentId,
      handle.location.lineNumber
    );

    const oldDate = getDateFromFile(file, 'day')?.format('YYYY-MM-DD');
    if (!oldDate) throw new Error(`Could not get date from file at path ${file.path}`);

    if (newEventData.date !== oldDate) {
      const m = moment(newEventData.date);
      let newFile = getDailyNote(m, getAllDailyNotes());
      if (!newFile) {
        const createdFile = await createDailyNote(m);
        if (!createdFile) {
          throw new Error(`Failed to create daily note for date ${newEventData.date}.`);
        }
        newFile = createdFile;
      }
      const eventToStore = await this._assignLocalUid(newFile, { ...newEventData, uid: undefined });

      Object.assign(newEventData, eventToStore);

      // First, delete the line from the old file.
      await this.app.rewrite(file, oldFileContents => {
        const lines = oldFileContents.split('\n');
        lines.splice(lineNumber, 1);
        return lines.join('\n');
      });

      // Second, add the event to the new file and get its line number.
      const metadata = await this.app.waitForMetadata(newFile);
      const headingInfo = metadata.headings?.find(h => h.heading === this.source.heading);
      // if (!headingInfo) {
      //   throw new Error(
      //     `Could not find heading ${this.source.heading} in daily note ${newFile.path}.`
      //   );
      // }

      const newLn = await this.app.rewrite(newFile, newFileContents => {
        const { page, lineNumber } = addToHeading(
          newFileContents,
          { heading: headingInfo, item: eventToStore, headingText: this.source.heading },
          this.source
        );
        return [page, lineNumber] as [string, number];
      });

      // Finally, return the authoritative new location to the cache.
      return { file: newFile, lineNumber: newLn };
    }
    // It's in the same file, keep existing uid or generate one.
    const eventToStore = await this._assignLocalUid(file, newEventData);

    Object.assign(newEventData, eventToStore);
    await this.app.rewrite(file, (contents: string) => {
      const lines = contents.split('\n');
      const newLine = modifyListItem(lines[lineNumber], eventToStore, this.source);
      if (!newLine) throw new Error('Did not successfully update line.');
      lines[lineNumber] = newLine;
      return lines.join('\n');
    });
    return { file, lineNumber };
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    if (!handle.location?.path) {
      throw new Error('DailyNoteProvider deleteEvent requires a file path.');
    }
    const { path } = handle.location;
    const file = this.app.getFileByPath(path);
    if (!file) throw new Error(`File not found at path: ${path}`);

    const lineNumber = await this._findEventLineNumber(
      file,
      handle.persistentId,
      handle.location?.lineNumber
    );

    await this.app.rewrite(file, (contents: string) => {
      const lines = contents.split('\n');
      lines.splice(lineNumber, 1);
      return lines.join('\n');
    });
  }

  getConfigurationComponent(): FCReactComponent<DailyNoteConfigProps> {
    return DailyNoteConfigWrapper;
  }

  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    return DailyNoteHeadingSetting;
  }

  #editorDecorator: DailyNoteDecorator | null = null;

  getEditorDecorator(): LivePreviewDecorator {
    if (!this.#editorDecorator) {
      this.#editorDecorator = new DailyNoteDecorator();
    }
    return this.#editorDecorator;
  }

  createInstanceOverride(
    masterEvent: OFCEvent,
    _instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    const masterLocalId = this.getEventHandle(masterEvent)?.persistentId;
    if (!masterLocalId) {
      throw new Error('Could not get persistent ID for master event.');
    }

    const overrideEventData: OFCEvent = {
      ...newEventData,
      recurringEventId: masterLocalId
    };

    return this.createEvent(overrideEventData);
  }
}
