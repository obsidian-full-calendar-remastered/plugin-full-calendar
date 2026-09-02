import { App, TFile } from 'obsidian';
import { getJournalsApi, type ExistingJournalNote, type JournalsApi } from 'obsidian-journals-api';

export const JOURNALS_PLUGIN_ID = 'journals';

export type MaybePromise<T> = T | Promise<T>;

export type JournalsJournalDescriptor = {
  name: string;
};

export type JournalsNoteDescriptor = {
  journal: string;
  date: string;
  path: string | null;
  file: TFile | null;
};

export type JournalsDateRange = {
  start: Date;
  end: Date;
};

export type JournalsBridgeEvents = {
  noteAdded?: (note: { journal: string; date: string; path: string }) => void;
  noteRemoved?: (note: { journal: string; date: string; path: string }) => void;
  journalRenamed?: (event: { from: string; to: string }) => void;
};

export interface JournalsBridge {
  readonly kind: 'official' | 'legacy';

  listDayJournals(): MaybePromise<readonly JournalsJournalDescriptor[]>;
  getNotes(
    journalName: string,
    range?: JournalsDateRange
  ): MaybePromise<readonly JournalsNoteDescriptor[]>;
  getNoteForDate(journalName: string, date: string): MaybePromise<JournalsNoteDescriptor | null>;
  ensureNote(journalName: string, date: string): Promise<JournalsNoteDescriptor>;
  journalOf(file: TFile): MaybePromise<JournalsNoteDescriptor | null>;
  getSuggestedHeadings(journalName: string): MaybePromise<readonly string[]>;
  subscribe(events: JournalsBridgeEvents): () => void;
}

export type JournalsBridgeResolution =
  { state: 'available'; bridge: JournalsBridge } | { state: 'missing' | 'unsupported' };

export type JournalsCatalogResult =
  | { state: 'missing' | 'unsupported' }
  | {
      state: 'ready';
      bridge: JournalsBridge;
      journals: readonly JournalsJournalDescriptor[];
    }
  | { state: 'error'; error: unknown };

export type LegacyJournalEntry = {
  date: string;
  journal: string;
  path?: string;
};

export type LegacyDayJournal = {
  name: string;
  type: string;
  get(date: string): LegacyJournalEntry | null;
  getNotePath(entry: LegacyJournalEntry): string;
  open(entry: LegacyJournalEntry): Promise<void>;
};

type LegacyJournalsIndex = {
  getAllPaths(journalName: string): string[];
  getForPath(path: string): LegacyJournalEntry | null;
};

export type LegacyJournalsPluginApi = {
  journals: LegacyDayJournal[];
  getJournal(name: string): LegacyDayJournal | undefined;
  getJournalConfig?(name: string): { templates?: string[] } | undefined;
  index: LegacyJournalsIndex;
};

type AppWithPlugins = App & {
  plugins?: {
    getPlugin?(id: string): unknown;
    plugins?: Record<string, unknown>;
  };
};

type SupportedJournalsApi = Pick<
  JournalsApi,
  'apiVersion' | 'listJournals' | 'notesFor' | 'journalOf' | 'ensureNote' | 'on'
>;

const isLegacyJournalEntry = (value: unknown): value is LegacyJournalEntry => {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.date === 'string' && typeof entry.journal === 'string';
};

export const isLegacyDayJournal = (value: unknown): value is LegacyDayJournal => {
  if (!value || typeof value !== 'object') return false;
  const journal = value as Record<string, unknown>;
  return (
    journal.type === 'day' &&
    typeof journal.name === 'string' &&
    typeof journal.get === 'function' &&
    typeof journal.getNotePath === 'function' &&
    typeof journal.open === 'function'
  );
};

const isLegacyJournalsPluginApi = (value: unknown): value is LegacyJournalsPluginApi => {
  if (!value || typeof value !== 'object') return false;
  const plugin = value as Record<string, unknown>;
  if (!Array.isArray(plugin.journals) || typeof plugin.getJournal !== 'function') return false;
  if (plugin.getJournalConfig !== undefined && typeof plugin.getJournalConfig !== 'function') {
    return false;
  }
  if (!plugin.index || typeof plugin.index !== 'object') return false;
  const index = plugin.index as Record<string, unknown>;
  return typeof index.getAllPaths === 'function' && typeof index.getForPath === 'function';
};

const getPluginCandidate = (app: App): unknown => {
  const plugins = (app as AppWithPlugins).plugins;
  return plugins?.getPlugin?.(JOURNALS_PLUGIN_ID) ?? plugins?.plugins?.[JOURNALS_PLUGIN_ID];
};

export const getLegacyJournalsPlugin = (app: App): LegacyJournalsPluginApi | null => {
  const candidate = getPluginCandidate(app);
  return isLegacyJournalsPluginApi(candidate) ? candidate : null;
};

const isOfficialJournalsApi = (value: unknown): value is SupportedJournalsApi => {
  if (!value || typeof value !== 'object') return false;
  const api = value as Record<string, unknown>;
  return (
    typeof api.apiVersion === 'number' &&
    typeof api.listJournals === 'function' &&
    typeof api.notesFor === 'function' &&
    typeof api.journalOf === 'function' &&
    typeof api.ensureNote === 'function' &&
    typeof api.on === 'function'
  );
};

const getOfficialJournalsApi = (app: App): SupportedJournalsApi | null => {
  const api = getJournalsApi(app);
  return isOfficialJournalsApi(api) ? api : null;
};

const headingsFromFiles = (app: App, files: readonly TFile[]): string[] => {
  const headings = files.flatMap(
    file => app.metadataCache.getFileCache(file)?.headings?.map(item => item.heading) ?? []
  );
  return [...new Set(headings)];
};

const headingsFromTemplates = (app: App, templates: readonly string[]): string[] => {
  const files = templates
    .map(template => (template.endsWith('.md') ? template : `${template}.md`))
    .map(path => app.vault.getFileByPath(path))
    .filter((file): file is TFile => file instanceof TFile);
  return headingsFromFiles(app, files);
};

const toIsoDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const datesInRange = ({ start, end }: JournalsDateRange): string[] => {
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const dates: string[] = [];
  while (cursor <= last) {
    dates.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const inRange = (date: string, range?: JournalsDateRange): boolean => {
  if (!range) return true;
  return date >= toIsoDate(range.start) && date <= toIsoDate(range.end);
};

const officialNote = (note: ExistingJournalNote): JournalsNoteDescriptor => ({
  journal: note.journal,
  date: note.date,
  path: note.path,
  file: note.file
});

class OfficialJournalsBridge implements JournalsBridge {
  readonly kind = 'official' as const;

  constructor(private readonly app: App) {}

  private api(): SupportedJournalsApi {
    const api = getOfficialJournalsApi(this.app);
    if (!api) {
      throw new Error('The Journals official API is no longer available.');
    }
    return api;
  }

  async listDayJournals(): Promise<readonly JournalsJournalDescriptor[]> {
    const journals = await this.api().listJournals({ writeType: 'day' });
    return journals.map(({ name }) => ({ name }));
  }

  async getNotes(
    journalName: string,
    range?: JournalsDateRange
  ): Promise<readonly JournalsNoteDescriptor[]> {
    const api = this.api();
    if (range) {
      const notes = await Promise.all(
        datesInRange(range).map(date => api.notesFor(journalName, date))
      );
      const unique = new Map<string, JournalsNoteDescriptor>();
      for (const note of notes.flat()) {
        if (note.journal !== journalName || !note.file || !note.path) continue;
        unique.set(note.path, officialNote(note as ExistingJournalNote));
      }
      return [...unique.values()];
    }

    const files = this.app.vault.getMarkdownFiles();
    const notes: JournalsNoteDescriptor[] = [];
    const batchSize = 50;
    for (let index = 0; index < files.length; index += batchSize) {
      const batch = files.slice(index, index + batchSize);
      const matches = await Promise.all(batch.map(file => api.journalOf(file)));
      for (const match of matches) {
        if (match?.journal === journalName) notes.push(officialNote(match));
      }
    }
    return notes;
  }

  async getNoteForDate(journalName: string, date: string): Promise<JournalsNoteDescriptor | null> {
    const notes = await this.api().notesFor(journalName, date);
    const note = notes.find(item => item.journal === journalName);
    return note
      ? {
          journal: note.journal,
          date: note.date,
          path: note.path,
          file: note.file
        }
      : null;
  }

  async ensureNote(journalName: string, date: string): Promise<JournalsNoteDescriptor> {
    const { note } = await this.api().ensureNote(journalName, date);
    return officialNote(note);
  }

  async journalOf(file: TFile): Promise<JournalsNoteDescriptor | null> {
    const note = await this.api().journalOf(file);
    return note ? officialNote(note) : null;
  }

  async getSuggestedHeadings(journalName: string): Promise<readonly string[]> {
    const notes = await this.getNotes(journalName);
    const files = notes.flatMap(note => (note.file ? [note.file] : []));
    return headingsFromFiles(this.app, files);
  }

  subscribe(events: JournalsBridgeEvents): () => void {
    const api = this.api();
    const disposers = [
      events.noteAdded ? api.on('noteAdded', events.noteAdded) : null,
      events.noteRemoved ? api.on('noteRemoved', events.noteRemoved) : null,
      events.journalRenamed ? api.on('journalRenamed', events.journalRenamed) : null
    ].filter((dispose): dispose is () => void => dispose !== null);

    return () => {
      for (const dispose of disposers) dispose();
    };
  }
}

class LegacyJournalsBridge implements JournalsBridge {
  readonly kind = 'legacy' as const;

  constructor(private readonly app: App) {}

  private plugin(): LegacyJournalsPluginApi {
    const plugin = getLegacyJournalsPlugin(this.app);
    if (!plugin) {
      throw new Error('The Journals legacy runtime API is no longer available.');
    }
    return plugin;
  }

  private journal(journalName: string): LegacyDayJournal {
    const journal = this.plugin().getJournal(journalName);
    if (!isLegacyDayJournal(journal)) {
      throw new Error(
        `The selected Journals Day journal "${journalName}" is unavailable. It may have been renamed or deleted.`
      );
    }
    return journal;
  }

  listDayJournals(): readonly JournalsJournalDescriptor[] {
    return this.plugin()
      .journals.filter(isLegacyDayJournal)
      .map(({ name }) => ({ name }));
  }

  getNotes(journalName: string, range?: JournalsDateRange): readonly JournalsNoteDescriptor[] {
    const plugin = this.plugin();
    this.journal(journalName);
    return plugin.index.getAllPaths(journalName).flatMap(path => {
      const entry = plugin.index.getForPath(path);
      const file = this.app.vault.getFileByPath(path);
      if (
        !isLegacyJournalEntry(entry) ||
        entry.journal !== journalName ||
        !inRange(entry.date, range) ||
        !(file instanceof TFile)
      ) {
        return [];
      }
      return [{ journal: entry.journal, date: entry.date, path, file }];
    });
  }

  getNoteForDate(journalName: string, date: string): JournalsNoteDescriptor | null {
    const entry = this.journal(journalName).get(date);
    if (!isLegacyJournalEntry(entry)) return null;
    const file = entry.path ? this.app.vault.getFileByPath(entry.path) : null;
    return {
      journal: entry.journal,
      date: entry.date,
      path: entry.path ?? null,
      file: file instanceof TFile ? file : null
    };
  }

  async ensureNote(journalName: string, date: string): Promise<JournalsNoteDescriptor> {
    const journal = this.journal(journalName);
    const entry = journal.get(date);
    if (!isLegacyJournalEntry(entry)) {
      throw new Error(`Journals could not resolve an entry for ${date}.`);
    }
    if (!entry.path) await journal.open(entry);
    const path = entry.path ?? journal.getNotePath(entry);
    const file = this.app.vault.getFileByPath(path);
    if (!(file instanceof TFile)) {
      throw new Error(`Journals did not create the expected entry for ${date} at ${path}.`);
    }
    return { journal: entry.journal, date: entry.date, path, file };
  }

  journalOf(file: TFile): JournalsNoteDescriptor | null {
    const entry = this.plugin().index.getForPath(file.path);
    return isLegacyJournalEntry(entry)
      ? { journal: entry.journal, date: entry.date, path: file.path, file }
      : null;
  }

  getSuggestedHeadings(journalName: string): readonly string[] {
    const templates = this.plugin().getJournalConfig?.(journalName)?.templates;
    return Array.isArray(templates) ? headingsFromTemplates(this.app, templates) : [];
  }

  subscribe(_events: JournalsBridgeEvents): () => void {
    return () => undefined;
  }
}

/**
 * Journals 3.2+ exposes a stable public API; Journals 2.x exposed only its plugin runtime.
 * Keep both capability checks here so the rest of Full Calendar never depends on either
 * plugin implementation shape.
 */
export const resolveJournalsBridge = (app: App): JournalsBridgeResolution => {
  if (getOfficialJournalsApi(app)) {
    return { state: 'available', bridge: new OfficialJournalsBridge(app) };
  }
  if (getLegacyJournalsPlugin(app)) {
    return { state: 'available', bridge: new LegacyJournalsBridge(app) };
  }
  return getPluginCandidate(app) ? { state: 'unsupported' } : { state: 'missing' };
};

export const loadJournalsCatalog = async (app: App): Promise<JournalsCatalogResult> => {
  const resolution = resolveJournalsBridge(app);
  if (resolution.state !== 'available') return resolution;
  try {
    return {
      state: 'ready',
      bridge: resolution.bridge,
      journals: await resolution.bridge.listDayJournals()
    };
  } catch (error) {
    return { state: 'error', error };
  }
};
