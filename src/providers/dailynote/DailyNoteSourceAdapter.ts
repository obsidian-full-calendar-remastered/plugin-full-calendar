import { App, TFile } from 'obsidian';
import {
  appHasDailyNotesPluginLoaded,
  createDailyNote,
  getAllDailyNotes,
  getDailyNote,
  getDailyNoteSettings,
  getDateFromFile
} from 'obsidian-daily-notes-interface';

import type { Moment } from 'moment';
import type { DailyNoteProviderConfig } from './typesDaily';

export const JOURNALS_PLUGIN_ID = 'journals';

type JournalEntry = {
  date: string;
  journal: string;
  path?: string;
};

export type JournalsDayJournal = {
  name: string;
  type: string;
  get(date: string): JournalEntry | null;
  getNotePath(entry: JournalEntry): string;
  open(entry: JournalEntry): Promise<void>;
};

type JournalsIndex = {
  getAllPaths(journalId: string): string[];
  getForPath(path: string): JournalEntry | null;
};

export type JournalsPluginApi = {
  journals: JournalsDayJournal[];
  getJournal(name: string): JournalsDayJournal | undefined;
  getJournalConfig?(name: string): { templates?: string[] } | undefined;
  index: JournalsIndex;
};

type AppWithPlugins = App & {
  plugins?: {
    getPlugin?(id: string): unknown;
    plugins?: Record<string, unknown>;
  };
};

export type DailyNoteSourceAdapter = {
  getAllFiles(): TFile[];
  getExistingFileForDate(date: string, dateMoment: Moment): TFile | null;
  getFileForDate(date: string, dateMoment: Moment, create: boolean): Promise<TFile | null>;
  getDateForFile(file: TFile): string | null;
  isFileRelevant(file: TFile): boolean;
};

function isJournalEntry(value: unknown): value is JournalEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.date === 'string' && typeof entry.journal === 'string';
}

function isDayJournal(value: unknown): value is JournalsDayJournal {
  if (!value || typeof value !== 'object') return false;
  const journal = value as Record<string, unknown>;
  return (
    journal.type === 'day' &&
    typeof journal.name === 'string' &&
    typeof journal.get === 'function' &&
    typeof journal.getNotePath === 'function' &&
    typeof journal.open === 'function'
  );
}

function isJournalsPluginApi(value: unknown): value is JournalsPluginApi {
  if (!value || typeof value !== 'object') return false;
  const plugin = value as Record<string, unknown>;
  if (!Array.isArray(plugin.journals) || typeof plugin.getJournal !== 'function') return false;
  if (!plugin.index || typeof plugin.index !== 'object') return false;
  const index = plugin.index as Record<string, unknown>;
  return typeof index.getAllPaths === 'function' && typeof index.getForPath === 'function';
}

export function getJournalsPlugin(app: App): JournalsPluginApi | null {
  const plugins = (app as AppWithPlugins).plugins;
  const candidate =
    plugins?.getPlugin?.(JOURNALS_PLUGIN_ID) ?? plugins?.plugins?.[JOURNALS_PLUGIN_ID];
  return isJournalsPluginApi(candidate) ? candidate : null;
}

export function getJournalsDayJournals(app: App): JournalsDayJournal[] {
  return getJournalsPlugin(app)?.journals.filter(isDayJournal) ?? [];
}

const getHeadingsFromTemplates = (app: App, templates: string[]): string[] => {
  const headings = templates.flatMap(template => {
    const path = template.endsWith('.md') ? template : `${template}.md`;
    const file = app.vault.getFileByPath(path);
    return file
      ? (app.metadataCache.getFileCache(file)?.headings?.map(item => item.heading) ?? [])
      : [];
  });
  return [...new Set(headings)];
};

export function getJournalsTemplateHeadings(app: App, journalId: string): string[] {
  const templates = getJournalsPlugin(app)?.getJournalConfig?.(journalId)?.templates;
  return Array.isArray(templates) ? getHeadingsFromTemplates(app, templates) : [];
}

export function getObsidianDailyNoteTemplateHeadings(app: App): string[] {
  const { template } = getDailyNoteSettings();
  return template ? getHeadingsFromTemplates(app, [template]) : [];
}

export class ObsidianDailyNoteSourceAdapter implements DailyNoteSourceAdapter {
  constructor() {
    appHasDailyNotesPluginLoaded();
  }

  getAllFiles(): TFile[] {
    return Object.values(getAllDailyNotes());
  }

  getExistingFileForDate(_date: string, dateMoment: Moment): TFile | null {
    return getDailyNote(dateMoment, getAllDailyNotes()) ?? null;
  }

  async getFileForDate(_date: string, dateMoment: Moment, create: boolean): Promise<TFile | null> {
    const existing = this.getExistingFileForDate(_date, dateMoment);
    if (existing instanceof TFile || !create) return existing ?? null;
    return (await createDailyNote(dateMoment)) ?? null;
  }

  getDateForFile(file: TFile): string | null {
    return getDateFromFile(file, 'day')?.format('YYYY-MM-DD') ?? null;
  }

  isFileRelevant(file: TFile): boolean {
    const { folder } = getDailyNoteSettings();
    return folder ? file.path.startsWith(`${folder}/`) : true;
  }
}

export class JournalsDailyNoteSourceAdapter implements DailyNoteSourceAdapter {
  private readonly plugin: JournalsPluginApi | null;
  private readonly journalId: string | undefined;

  constructor(
    private readonly app: App,
    config: DailyNoteProviderConfig
  ) {
    this.plugin = getJournalsPlugin(app);
    this.journalId = config.journalId;
  }

  private getJournal(): JournalsDayJournal {
    if (!this.plugin) {
      throw new Error('Journals is not installed/enabled, or its runtime API is incompatible.');
    }
    if (!this.journalId) {
      throw new Error('No Journals Day journal is selected.');
    }
    const journal = this.plugin.getJournal(this.journalId);
    if (!isDayJournal(journal)) {
      throw new Error(
        `The selected Journals Day journal "${this.journalId}" is unavailable. It may have been renamed or deleted.`
      );
    }
    return journal;
  }

  getAllFiles(): TFile[] {
    const journal = this.getJournal();
    const plugin = this.plugin;
    if (!plugin) return [];
    return plugin.index
      .getAllPaths(journal.name)
      .map(path => this.app.vault.getFileByPath(path))
      .filter((file): file is TFile => file instanceof TFile);
  }

  getExistingFileForDate(date: string, _dateMoment: Moment): TFile | null {
    if (!this.plugin) return null;
    const journal = this.getJournal();
    const entry = journal.get(date);
    if (!isJournalEntry(entry) || !entry.path) return null;
    return this.app.vault.getFileByPath(entry.path);
  }

  async getFileForDate(date: string, _dateMoment: Moment, create: boolean): Promise<TFile | null> {
    const journal = this.getJournal();
    const entry = journal.get(date);
    if (!isJournalEntry(entry)) {
      throw new Error(`Journals could not resolve an entry for ${date}.`);
    }

    if (entry.path) {
      const existing = this.app.vault.getFileByPath(entry.path);
      if (existing) return existing;
      throw new Error(`Journals resolved ${date} to a missing file: ${entry.path}.`);
    }
    if (!create) return null;

    await journal.open(entry);
    const path = journal.getNotePath(entry);
    const created = this.app.vault.getFileByPath(path);
    if (!created) {
      throw new Error(`Journals did not create the expected entry for ${date} at ${path}.`);
    }
    return created;
  }

  getDateForFile(file: TFile): string | null {
    return this.plugin?.index.getForPath(file.path)?.date ?? null;
  }

  isFileRelevant(file: TFile): boolean {
    if (!this.plugin) return false;
    return this.plugin.index.getForPath(file.path)?.journal === this.getJournal().name;
  }
}
