import { PluginState } from '../../core/PluginState';
import { TFile, TFolder, normalizePath } from 'obsidian';
import * as React from 'react';
import { DateTime } from 'luxon';

import { OFCEvent, EventLocation, validateEvent } from '../../types';
import FullCalendarPlugin from '../../main';
import {
  newFrontmatter,
  modifyFrontmatterString,
  replaceFrontmatter,
  parseFrontmatterWithFallback
} from './frontmatter';
import { CalendarProvider, CalendarProviderCapabilities, SyncKeyProvider } from '../Provider';
import { EventHandle, FCReactComponent, ProviderConfigContext } from '../typesProvider';
import { FullNoteProviderConfig } from './typesLocal';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { FullNoteConfigComponent } from './FullNoteConfigComponent';
import {
  basenameFromEvent,
  filenameForEvent,
  findUniquePath,
  waitForFileAtPath,
  waitForMetadataWithTimeout
} from '../utils/noteUtils';
import { FrontmatterCardDecorator } from './codemirror/FrontmatterCardDecorator';
import { LivePreviewDecorator } from '../../features/livepreview/LivePreviewDecorator';
import { TemplateEngine } from '../../features/linked-notes/TemplateEngine';
import { yieldToMainThread } from '../../utils/async';
import { LoadDebugProfiler } from '../../utils/LoadDebugProfiler';

export type EditableEventResponse = [OFCEvent, EventLocation | null];

// Settings row component for Full Note Provider
const FullNoteDirectorySetting: React.FC<{
  source: Partial<import('../../types').CalendarInfo>;
}> = ({ source }) => {
  // Handle both flat and nested config structures for directory
  const getDirectory = (): string => {
    const flat = (source as { directory?: unknown }).directory;
    const nested = (source as { config?: { directory?: unknown } }).config?.directory;
    return typeof flat === 'string' ? flat : typeof nested === 'string' ? nested : '';
  };

  return React.createElement(
    'div',
    { className: 'setting-item-control' },
    React.createElement('input', {
      disabled: true,
      type: 'text',
      value: getDirectory(),
      className: 'ofc-setting-input'
    })
  );
};

// Helper Functions
// =================================================================================================

const areFieldValuesEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) {
    return true;
  }

  if (a === null || b === null || a === undefined || b === undefined) {
    return false;
  }

  if (typeof a === 'object' && typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }

  return false;
};

const getChangedFrontmatterFields = (
  oldEventData: OFCEvent,
  newEventData: OFCEvent
): Partial<OFCEvent> => {
  const changed: Record<string, unknown> = {};
  const keys = new Set<keyof OFCEvent>([
    ...(Object.keys(oldEventData) as (keyof OFCEvent)[]),
    ...(Object.keys(newEventData) as (keyof OFCEvent)[])
  ]);

  keys.forEach(key => {
    if (key === 'uid') {
      return;
    }

    const oldValue = oldEventData[key];
    const newValue = newEventData[key];
    if (!areFieldValuesEqual(oldValue, newValue)) {
      changed[key as string] = newValue;
    }
  });

  return changed;
};

type FullNoteConfigProps = {
  plugin: FullCalendarPlugin;
  config: Partial<FullNoteProviderConfig>;
  onConfigChange: (newConfig: Partial<FullNoteProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: FullNoteProviderConfig | FullNoteProviderConfig[]) => void;
  onClose: () => void;
};

const FullNoteConfigWrapper: React.FC<FullNoteConfigProps> = props => {
  const { onSave, ...rest } = props;
  const handleSave = (finalConfig: FullNoteProviderConfig) => onSave(finalConfig);

  return React.createElement(FullNoteConfigComponent, {
    ...rest,
    onSave: handleSave
  });
};

// Provider Implementation
// =================================================================================================

export class FullNoteProvider implements CalendarProvider<FullNoteProviderConfig>, SyncKeyProvider {
  // Static metadata for registry
  static readonly type = 'local';
  static readonly displayName = 'Local Notes';

  static getConfigurationComponent(): FCReactComponent<FullNoteConfigProps> {
    return FullNoteConfigWrapper;
  }

  private app: ObsidianInterface;
  private plugin: FullCalendarPlugin;
  private source: FullNoteProviderConfig;

  readonly type = 'local';
  readonly displayName = 'Local Notes';
  readonly isRemote = false;
  readonly loadPriority = 10;

  constructor(source: FullNoteProviderConfig, plugin: FullCalendarPlugin, app?: ObsidianInterface) {
    if (!app) {
      throw new Error('FullNoteProvider requires an Obsidian app interface.');
    }
    this.app = app;
    this.plugin = plugin;
    this.source = source;
  }

  get taskCompletionStyle(): 'datetime' | 'boolean' {
    return this.source.taskCompletionStyle || 'datetime';
  }

  async toggleComplete(eventId: string, isDone: boolean): Promise<boolean> {
    const event = PluginState.getCache().getEventById(eventId);
    if (!event || event.type !== 'single') return false;

    let completed: string | boolean;
    if (isDone) {
      completed = this.taskCompletionStyle === 'boolean' ? true : (DateTime.now().toISO() ?? '');
    } else {
      completed = false;
    }

    const updatedEvent: OFCEvent = {
      ...event,
      completed
    };

    await PluginState.getCache().updateEventWithId(eventId, updatedEvent);
    return true;
  }

  getCapabilities(): CalendarProviderCapabilities {
    return { canCreate: true, canEdit: true, canDelete: true };
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    // Prioritize the UID if it exists. This is the new, robust path.
    if (event.uid) {
      return { persistentId: event.uid };
    }

    // Fallback for legacy events or events created in-memory that haven't been saved yet.
    const filename = filenameForEvent(event, PluginState.getSettings());
    const path = normalizePath(`${this.source.directory}/${filename}`);
    return { persistentId: path };
  }

  computeSyncKey(event: OFCEvent): string {
    if (event.uid) return event.uid;
    const filename = filenameForEvent(event, PluginState.getSettings());
    return normalizePath(`${this.source.directory}/${filename}`);
  }

  public isFileRelevant(file: TFile): boolean {
    const directory = this.source.directory;
    return !!directory && file.path.startsWith(`${directory}/`);
  }

  public async getEventsInFile(file: TFile): Promise<EditableEventResponse[]> {
    const metadata = await waitForMetadataWithTimeout(this.app, file);
    let frontmatter: Record<string, unknown> | null =
      (metadata?.frontmatter as Record<string, unknown>) || null;

    if (!frontmatter || !frontmatter.title) {
      const page = await this.app.read(file);
      const fallbackFm = parseFrontmatterWithFallback(page);
      if (fallbackFm) {
        frontmatter = {
          ...(frontmatter || {}),
          ...fallbackFm
        };
      }
    }

    if (!frontmatter) {
      return [];
    }
    const frontmatterType = frontmatter.type;
    const eventType =
      frontmatterType === 'recurring' || frontmatterType === 'rrule' ? frontmatterType : 'single';

    const rawEventData = {
      ...frontmatter,
      type: eventType,
      title: frontmatter.title || file.basename
    } as Record<string, unknown>;

    const event = validateEvent(rawEventData);
    if (!event) {
      return [];
    }

    // Populate UID from the file path.
    event.uid = file.path;

    // The raw event is returned as-is. The EventEnhancer will handle timezone conversion.
    return [[event, { file, lineNumber: undefined }]];
  }

  async getEvents(_range?: { start: Date; end: Date }): Promise<EditableEventResponse[]> {
    return LoadDebugProfiler.withContext('Full Note Sync', async () => {
      const eventFolder = this.app.getAbstractFileByPath(this.source.directory);
      if (!eventFolder || !(eventFolder instanceof TFolder)) {
        throw new Error(`${this.source.directory} is not a valid directory.`);
      }

      const events: EditableEventResponse[] = [];
      const files = eventFolder.children.filter((file): file is TFile => file instanceof TFile);
      const BATCH_SIZE = 15;

      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batchName = `Full Notes Batch (${i + 1}-${Math.min(i + BATCH_SIZE, files.length)}/${files.length})`;
        await LoadDebugProfiler.withContext(batchName, async () => {
          const startTime = performance.now();
          const batch = files.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.all(batch.map(file => this.getEventsInFile(file)));
          for (const res of batchResults) {
            events.push(...res);
          }
          const duration = performance.now() - startTime;
          if (duration >= 50) {
            LoadDebugProfiler.recordFreeze(batchName, duration);
          }
        });
        if (i + BATCH_SIZE < files.length) {
          await yieldToMainThread();
        }
      }
      return events;
    });
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation]> {
    const baseFilename = basenameFromEvent(event, PluginState.getSettings());
    const path = findUniquePath(this.app, this.source.directory, baseFilename);

    // Render event body using template if defined, otherwise empty body
    const template = this.source.template || '';
    const bodyContent = template
      ? TemplateEngine.render(template, event, this.source.name || this.displayName)
      : '';

    // The frontmatter is generated from the clean `event` object, so the title remains unsuffixed.
    const newPage = replaceFrontmatter(bodyContent, newFrontmatter(event));
    const file = await this.app.create(path, newPage);

    // The authoritative event object returned to the cache must contain the
    // unique path as its UID for future updates and deletions.
    const finalEvent = { ...event, uid: file.path };
    return [finalEvent, { file, lineNumber: undefined }];
  }

  async updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    const oldPath = handle.persistentId;
    const originalFile = this.app.getFileByPath(oldPath);
    if (!originalFile) {
      throw new Error(`File ${oldPath} not found.`);
    }

    // Determine if the event's core identifiers (which make up the filename) have changed.
    const oldBaseFilename = basenameFromEvent(oldEventData, PluginState.getSettings());
    const newBaseFilename = basenameFromEvent(newEventData, PluginState.getSettings());

    let finalPath = oldPath;
    let fileToRewrite = originalFile;

    if (oldBaseFilename !== newBaseFilename) {
      // It's a rename. We must find a new unique path for the new base name.
      finalPath = findUniquePath(this.app, this.source.directory, newBaseFilename);

      await this.app.rename(originalFile, finalPath);

      const renamedFile = await waitForFileAtPath(this.app, finalPath);
      if (!renamedFile) {
        throw new Error(`File ${finalPath} not found after rename.`);
      }
      fileToRewrite = renamedFile;
    }

    const changedFields = getChangedFrontmatterFields(oldEventData, newEventData);

    if (Object.keys(changedFields).length > 0) {
      await this.app.rewrite(fileToRewrite, page => modifyFrontmatterString(page, changedFields));
    }

    // The location returned must have the final, potentially new, path.
    return { file: { path: finalPath }, lineNumber: undefined };
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    const path = handle.persistentId;
    const file = this.app.getFileByPath(path);
    if (!file) {
      throw new Error(`File ${path} not found.`);
    }
    return this.app.delete(file);
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

    const masterFilename = masterLocalId.split('/').pop();
    if (!masterFilename) {
      throw new Error(`Could not extract filename from master event path: ${masterLocalId}`);
    }

    const overrideEventData: OFCEvent = {
      ...newEventData,
      recurringEventId: masterFilename
    };

    // Use the existing createEvent logic to handle file creation and timezone conversion
    return this.createEvent(overrideEventData);
  }

  getConfigurationComponent(): FCReactComponent<FullNoteConfigProps> {
    return FullNoteConfigWrapper;
  }

  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    return FullNoteDirectorySetting;
  }

  #editorDecorator: FrontmatterCardDecorator | null = null;

  getEditorDecorator(): LivePreviewDecorator {
    if (!this.#editorDecorator) {
      this.#editorDecorator = new FrontmatterCardDecorator();
    }
    return this.#editorDecorator;
  }
}
