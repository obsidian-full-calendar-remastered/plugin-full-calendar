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
import {
  getLegacyJournalsPlugin,
  isLegacyDayJournal,
  resolveJournalsBridge,
  type JournalsBridge,
  type JournalsDateRange,
  type JournalsNoteDescriptor,
  type LegacyDayJournal,
  type LegacyJournalsPluginApi,
  type MaybePromise
} from '../journals/JournalsBridge';

export type JournalsDayJournal = LegacyDayJournal;
export type JournalsPluginApi = LegacyJournalsPluginApi;

export type DailyNoteSourceAdapter = {
  getAllFiles(range?: JournalsDateRange): MaybePromise<TFile[]>;
  getExistingFileForDate(date: string, dateMoment: Moment): TFile | null;
  resolveExistingFileForDate(date: string, dateMoment: Moment): MaybePromise<TFile | null>;
  getFileForDate(date: string, dateMoment: Moment, create: boolean): Promise<TFile | null>;
  getDateForFile(file: TFile): MaybePromise<string | null>;
  isFileRelevant(file: TFile): boolean;
};

export function getJournalsPlugin(app: App): JournalsPluginApi | null {
  return getLegacyJournalsPlugin(app);
}

export function getJournalsDayJournals(app: App): JournalsDayJournal[] {
  return getJournalsPlugin(app)?.journals.filter(isLegacyDayJournal) ?? [];
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

  resolveExistingFileForDate(date: string, dateMoment: Moment): TFile | null {
    return this.getExistingFileForDate(date, dateMoment);
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
    if (folder && !file.path.startsWith(`${folder}/`)) {
      return false;
    }
    try {
      return getDateFromFile(file, 'day') !== null;
    } catch {
      return false;
    }
  }
}

export class JournalsDailyNoteSourceAdapter implements DailyNoteSourceAdapter {
  private journalId: string | undefined;
  private readonly filesByDate = new Map<string, TFile>();
  private readonly datesByPath = new Map<string, string>();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly app: App,
    config: DailyNoteProviderConfig
  ) {
    this.journalId = config.journalId;
  }

  private getJournalId(): string {
    if (!this.journalId) {
      throw new Error('No Journals Day journal is selected.');
    }
    return this.journalId;
  }

  private getBridge(): JournalsBridge {
    const resolution = resolveJournalsBridge(this.app);
    if (resolution.state === 'available') return resolution.bridge;
    if (resolution.state === 'missing') {
      throw new Error('Journals is not installed/enabled.');
    }
    throw new Error('Journals is enabled, but its API is unsupported by Full Calendar.');
  }

  private remember(note: JournalsNoteDescriptor): TFile | null {
    if (note.journal !== this.getJournalId() || !note.file) return null;
    this.filesByDate.set(note.date, note.file);
    this.datesByPath.set(note.file.path, note.date);
    return note.file;
  }

  private forget(path: string, date?: string): void {
    const knownDate = date ?? this.datesByPath.get(path);
    this.datesByPath.delete(path);
    if (knownDate && this.filesByDate.get(knownDate)?.path === path) {
      this.filesByDate.delete(knownDate);
    }
  }

  private rememberNotes(notes: readonly JournalsNoteDescriptor[]): TFile[] {
    return notes.flatMap(note => {
      const file = this.remember(note);
      return file ? [file] : [];
    });
  }

  private mapMaybePromise<T, U>(value: MaybePromise<T>, map: (item: T) => U): MaybePromise<U> {
    return value instanceof Promise ? value.then(map) : map(value);
  }

  initialize(events: {
    noteAdded?: (path: string) => void;
    noteRemoved?: (path: string) => void;
    journalRenamed?: (from: string, to: string) => void;
  }): void {
    this.teardown();
    const resolution = resolveJournalsBridge(this.app);
    if (resolution.state !== 'available' || resolution.bridge.kind !== 'official') return;
    this.unsubscribe = resolution.bridge.subscribe({
      noteAdded: note => {
        if (note.journal !== this.journalId) return;
        const file = this.app.vault.getFileByPath(note.path);
        if (file instanceof TFile) this.remember({ ...note, file });
        events.noteAdded?.(note.path);
      },
      noteRemoved: note => {
        if (note.journal !== this.journalId) return;
        this.forget(note.path, note.date);
        events.noteRemoved?.(note.path);
      },
      journalRenamed: ({ from, to }) => {
        if (from !== this.journalId) return;
        this.journalId = to;
        events.journalRenamed?.(from, to);
      }
    });
  }

  teardown(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  getAllFiles(range?: JournalsDateRange): MaybePromise<TFile[]> {
    const notes = this.getBridge().getNotes(this.getJournalId(), range);
    return this.mapMaybePromise(notes, value => this.rememberNotes(value));
  }

  resolveExistingFileForDate(date: string, _dateMoment: Moment): MaybePromise<TFile | null> {
    const note = this.getBridge().getNoteForDate(this.getJournalId(), date);
    return this.mapMaybePromise(note, value => (value ? this.remember(value) : null));
  }

  getExistingFileForDate(date: string, _dateMoment: Moment): TFile | null {
    const bridge = this.getBridge();
    if (bridge.kind === 'legacy') {
      const note = bridge.getNoteForDate(this.getJournalId(), date);
      if (!(note instanceof Promise)) return note ? this.remember(note) : null;
    }
    return this.filesByDate.get(date) ?? null;
  }

  async getFileForDate(date: string, _dateMoment: Moment, create: boolean): Promise<TFile | null> {
    const existing = await this.resolveExistingFileForDate(date, _dateMoment);
    if (existing || !create) return existing;

    const note = await this.getBridge().ensureNote(this.getJournalId(), date);
    const created = this.remember(note);
    if (!created) {
      throw new Error(`Journals did not create the expected entry for ${date}.`);
    }
    return created;
  }

  getDateForFile(file: TFile): MaybePromise<string | null> {
    const known = this.datesByPath.get(file.path);
    if (known) return known;
    const note = this.getBridge().journalOf(file);
    return this.mapMaybePromise(note, value => {
      if (!value || value.journal !== this.getJournalId()) return null;
      this.remember(value);
      return value.date;
    });
  }

  isFileRelevant(file: TFile): boolean {
    return this.datesByPath.has(file.path);
  }
}
