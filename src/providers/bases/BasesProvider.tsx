import { TFile, parseYaml, getAllTags } from 'obsidian';
import * as React from 'react';
import { CalendarProvider, CalendarProviderCapabilities, SyncKeyProvider } from '../Provider';
import { OFCEvent, EventLocation, CalendarInfo, validateEvent } from '../../types';
import { FCReactComponent, EventHandle } from '../typesProvider';
import FullCalendarPlugin from '../../main';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { BasesConfigComponent, BasesConfigComponentProps } from './BasesConfigComponent';

export interface BasesProviderConfig {
  type: 'bases';
  basePath: string;
  color: string;
  name: string;
}

interface BaseFilter {
  or?: (BaseFilter | string)[];
  and?: (BaseFilter | string)[];
  not?: (BaseFilter | string)[];
}

interface BaseFile {
  filters?: BaseFilter;
  views?: unknown[];
  properties?: unknown;
}

export class BasesProvider implements CalendarProvider<BasesProviderConfig>, SyncKeyProvider {
  static type = 'bases';
  static displayName = 'Obsidian Bases';
  static getConfigurationComponent(): FCReactComponent<BasesConfigComponentProps> {
    return BasesConfigComponent;
  }

  type = 'bases';
  displayName = 'Obsidian Bases';
  isRemote = false;
  loadPriority = 10; // Local priority

  config: BasesProviderConfig;
  plugin: FullCalendarPlugin;
  app: ObsidianInterface;

  constructor(config: BasesProviderConfig, plugin: FullCalendarPlugin, app?: ObsidianInterface) {
    if (!app) {
      throw new Error('BasesProvider requires an Obsidian app interface.');
    }
    this.config = config;
    this.plugin = plugin;
    this.app = app;
  }

  getCapabilities(): CalendarProviderCapabilities {
    return {
      canCreate: false, // Read-only for now
      canEdit: false,
      canDelete: false
    };
  }

  // --- Filter Evaluation Logic ---

  evaluateFilter(filter: BaseFilter | string, file: TFile): boolean {
    if (typeof filter === 'string') {
      return this.evaluateFilterString(filter, file);
    }

    if (filter.or) {
      return filter.or.some(f => this.evaluateFilter(f, file));
    }
    if (filter.and) {
      return filter.and.every(f => this.evaluateFilter(f, file));
    }
    if (filter.not) {
      return !filter.not.some(f => this.evaluateFilter(f, file));
    }
    return true; // Default to true if empty object
  }

  evaluateFilterString(statement: string, file: TFile): boolean {
    // Very basic implementation of filter string evaluation
    // Supports: file.hasTag("tag"), file.inFolder("folder"), file.ext == "md"

    const cache = this.plugin.app.metadataCache.getFileCache(file);
    const tags = getAllTags(cache || {}) || [];

    if (statement.includes('file.hasTag')) {
      const match = statement.match(/file\.hasTag\("([^"]+)"\)/);
      if (match) {
        const tag = match[1];
        // Handle #tag format in cache vs tag format in filter
        return tags.some(t => t === tag || t === `#${tag}`);
      }
    }

    if (statement.includes('file.inFolder')) {
      const match = statement.match(/file\.inFolder\("([^"]+)"\)/);
      if (match) {
        const folder = match[1];
        return file.path.startsWith(folder);
      }
    }

    if (statement.includes('file.ext')) {
      // Simple check for markdown files
      if (statement.includes('"md"')) {
        return file.extension === 'md';
      }
    }

    return true;
  }

  // --- Event Extraction Logic ---

  async getEvents(_range?: {
    start: Date;
    end: Date;
  }): Promise<[OFCEvent, EventLocation | null][]> {
    const events: [OFCEvent, EventLocation | null][] = [];

    // Check if Bases plugin is enabled
    const app = this.plugin.app as unknown as {
      internalPlugins?: { getPluginById: (id: string) => unknown };
      plugins?: { getPlugin: (id: string) => unknown };
    };
    const basesPlugin =
      app.internalPlugins?.getPluginById('bases') || app.plugins?.getPlugin('bases');
    if (!basesPlugin) {
      console.warn('Bases plugin not found or disabled.');
      return [];
    }

    const baseFile = this.plugin.app.vault.getAbstractFileByPath(this.config.basePath);
    if (!(baseFile instanceof TFile)) {
      return [];
    }

    try {
      const content = await this.plugin.app.vault.read(baseFile);
      let baseData: BaseFile;
      try {
        baseData = parseYaml(content) as BaseFile;
      } catch (e) {
        console.warn('Failed to parse Base file as YAML', e);
        return [];
      }

      const allFiles = this.plugin.app.vault.getFiles();
      const filteredFiles = allFiles.filter(file => {
        if (!baseData.filters) return true; // No filters = all files
        return this.evaluateFilter(baseData.filters, file);
      });

      for (const file of filteredFiles) {
        const eventData = this.getEventFromFile(file);
        if (eventData) {
          events.push(eventData);
        }
      }
    } catch (e) {
      console.error('Error processing Base file', e);
    }

    return events;
  }

  getEventFromFile(file: TFile): [OFCEvent, EventLocation | null] | null {
    const metadata = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!metadata) return null;

    // Heuristic to find date fields
    const date: unknown = metadata.date || metadata.start || metadata.startTime || metadata.due;
    if (!date) return null;

    const title: string = typeof metadata.title === 'string' ? metadata.title : file.basename;
    const category: string | undefined =
      typeof metadata.category === 'string'
        ? metadata.category
        : typeof metadata.Category === 'string'
          ? metadata.Category
          : undefined;
    const subCategory: string | undefined =
      typeof metadata['sub category'] === 'string'
        ? metadata['sub category']
        : typeof metadata.SubCategory === 'string'
          ? metadata.SubCategory
          : typeof metadata.subCategory === 'string'
            ? metadata.subCategory
            : undefined;

    let finalTitle: string = title;
    if (category && subCategory) {
      finalTitle = `${category} - ${subCategory} - ${title}`;
    } else if (category) {
      finalTitle = `${category} - ${title}`;
    } else if (subCategory) {
      finalTitle = `${subCategory} - ${title}`;
    }

    // Construct a raw object to pass to validateEvent for standard processing
    const metadataType = typeof metadata.type === 'string' ? metadata.type : 'single';
    const metadataAllDay = typeof metadata.allDay === 'boolean' ? metadata.allDay : true;
    const rawEvent: Record<string, unknown> = {
      ...metadata,
      title: finalTitle,
      date: date,
      type: metadataType, // Default to single if not specified
      allDay: metadataAllDay, // Default to all day
      category: category,
      subCategory: subCategory
    };

    const validatedEvent = validateEvent(rawEvent);
    if (!validatedEvent) return null;

    // Ensure UID is set to file path for navigation/identification
    validatedEvent.uid = file.path;

    return [validatedEvent, { file: { path: file.path }, lineNumber: undefined }];
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    // Return the file path as the persistent ID so we can navigate to it
    if (event.uid) {
      return { persistentId: event.uid };
    }
    return null;
  }

  computeSyncKey(event: OFCEvent): string {
    return event.uid || JSON.stringify(event);
  }

  createEvent(_event: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    return Promise.reject(new Error('Not implemented'));
  }

  updateEvent(
    _handle: EventHandle,
    _oldEvent: OFCEvent,
    _newEvent: OFCEvent
  ): Promise<EventLocation | null> {
    return Promise.reject(new Error('Not implemented'));
  }

  deleteEvent(_handle: EventHandle): Promise<void> {
    return Promise.reject(new Error('Not implemented'));
  }

  createInstanceOverride(
    _masterEvent: OFCEvent,
    _instanceDate: string,
    _newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    return Promise.reject(new Error('Not implemented'));
  }

  getConfigurationComponent(): FCReactComponent<BasesConfigComponentProps> {
    return BasesConfigComponent;
  }

  getSettingsRowComponent(): FCReactComponent<{ source: Partial<CalendarInfo> }> {
    return ({ source }) => (
      <div className="setting-item-control">
        <span>
          {source.name} ({source.type})
        </span>
        <span className="ofc-setting-desc">
          {(source as Partial<BasesProviderConfig>).basePath}
        </span>
      </div>
    );
  }
}
