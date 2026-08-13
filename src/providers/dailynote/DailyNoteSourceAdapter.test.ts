import { App, TFile } from 'obsidian';
import {
  createDailyNote,
  getAllDailyNotes,
  getDailyNote,
  getDailyNoteSettings,
  getDateFromFile
} from 'obsidian-daily-notes-interface';

import {
  getJournalsDayJournals,
  getJournalsTemplateHeadings,
  JournalsDailyNoteSourceAdapter,
  ObsidianDailyNoteSourceAdapter,
  type JournalsDayJournal,
  type JournalsPluginApi
} from './DailyNoteSourceAdapter';
import { parseCalendarInfo } from '../../types/calendar_settings';

jest.mock('obsidian', () => ({
  TFile: class TFile {
    path = '';
  },
  App: class App {}
}));

jest.mock('obsidian-daily-notes-interface', () => ({
  appHasDailyNotesPluginLoaded: jest.fn(),
  createDailyNote: jest.fn(),
  getAllDailyNotes: jest.fn(),
  getDailyNote: jest.fn(),
  getDailyNoteSettings: jest.fn(),
  getDateFromFile: jest.fn()
}));

const makeFile = (path: string): TFile => {
  const file = new TFile();
  file.path = path;
  return file;
};

type TestApp = App & {
  vault: { getFileByPath(path: string): TFile | null };
  metadataCache: { getFileCache(file: TFile): { headings?: { heading: string }[] } | null };
  plugins: { getPlugin(id: string): unknown };
};

type TestJournalEntry = { date: string; journal: string; path?: string };

type MockJournal = Omit<JournalsDayJournal, 'get' | 'getNotePath' | 'open'> & {
  get: jest.Mock<TestJournalEntry | null, [string]>;
  getNotePath: jest.Mock<string, [TestJournalEntry]>;
  open: jest.Mock<Promise<void>, [TestJournalEntry]>;
};

const makeJournal = (
  name: string,
  files: Map<string, TFile>,
  entries: Map<string, TestJournalEntry>
): MockJournal => ({
  name,
  type: 'day',
  get: jest.fn<TestJournalEntry | null, [string]>(
    (date: string): TestJournalEntry => entries.get(date) ?? { date, journal: name }
  ),
  getNotePath: jest.fn<string, [TestJournalEntry]>(
    (entry: TestJournalEntry): string => `Journal/${name}/${entry.date}.md`
  ),
  open: jest.fn<Promise<void>, [TestJournalEntry]>(async (entry: TestJournalEntry) => {
    const path = `Journal/${name}/${entry.date}.md`;
    files.set(path, makeFile(path));
    entries.set(entry.date, { ...entry, path });
  })
});

const makeApp = (
  plugin: JournalsPluginApi | null,
  files = new Map<string, TFile>(),
  headingsByPath = new Map<string, string[]>()
): TestApp =>
  ({
    vault: { getFileByPath: (path: string) => files.get(path) ?? null },
    metadataCache: {
      getFileCache: (file: TFile) => ({
        headings: (headingsByPath.get(file.path) ?? []).map(heading => ({ heading }))
      })
    },
    plugins: { getPlugin: (id: string) => (id === 'journals' ? plugin : null) }
  }) as TestApp;

const makePluginApi = (
  journals: JournalsDayJournal[],
  entriesByPath = new Map<string, { date: string; journal: string; path?: string }>()
): JournalsPluginApi => ({
  journals,
  getJournal: name => journals.find(journal => journal.name === name),
  index: {
    getAllPaths: journalId =>
      [...entriesByPath.entries()]
        .filter(([, entry]) => entry.journal === journalId)
        .map(([path]) => path),
    getForPath: path => entriesByPath.get(path) ?? null
  }
});

describe('Journals daily note source adapter', () => {
  it('reports Journals as unavailable when the plugin is disabled or absent', () => {
    const app = makeApp(null);
    expect(getJournalsDayJournals(app)).toEqual([]);
    const adapter = new JournalsDailyNoteSourceAdapter(app, {
      id: 'dailynote_1',
      heading: 'Schedule',
      provider: 'journals',
      journalId: 'Daily'
    });
    expect(() => adapter.getAllFiles()).toThrow(/not installed\/enabled/);
  });

  it('rejects an incompatible Journals runtime API', () => {
    const incompatible = {
      ...makePluginApi([]),
      getJournalConfig: 'unexpected'
    };
    const app = makeApp(incompatible as unknown as JournalsPluginApi);

    expect(getJournalsDayJournals(app)).toEqual([]);
  });

  it('enumerates one compatible Day journal and excludes other intervals', () => {
    const files = new Map<string, TFile>();
    const daily = makeJournal('Daily', files, new Map());
    const weekly = { ...makeJournal('Weekly', files, new Map()), type: 'week' };
    const app = makeApp(makePluginApi([daily, weekly]));

    expect(getJournalsDayJournals(app).map(journal => journal.name)).toEqual(['Daily']);
  });

  it('uses the configured journal when multiple Day journals exist', () => {
    const files = new Map<string, TFile>();
    const work = makeJournal('Work', files, new Map());
    const personal = makeJournal('Personal', files, new Map());
    const app = makeApp(makePluginApi([work, personal]));
    const adapter = new JournalsDailyNoteSourceAdapter(app, {
      id: 'dailynote_1',
      heading: 'Schedule',
      provider: 'journals',
      journalId: 'Personal'
    });

    adapter.getExistingFileForDate('2026-08-11', {} as never);
    expect(personal.get).toHaveBeenCalledWith('2026-08-11');
    expect(work.get).not.toHaveBeenCalled();
  });

  it('lists unique headings from every template configured for the selected journal', () => {
    const first = makeFile('Templates/Work.md');
    const second = makeFile('Templates/Tasks.md');
    const files = new Map([
      [first.path, first],
      [second.path, second]
    ]);
    const plugin = {
      ...makePluginApi([]),
      getJournalConfig: (name: string) =>
        name === 'Daily' ? { templates: ['Templates/Work', 'Templates/Tasks.md'] } : undefined
    };
    const headings = new Map([
      [first.path, ['Schedule', 'Notes']],
      [second.path, ['Tasks', 'Notes']]
    ]);

    expect(getJournalsTemplateHeadings(makeApp(plugin, files, headings), 'Daily')).toEqual([
      'Schedule',
      'Notes',
      'Tasks'
    ]);
  });

  it('resolves an existing entry without recreating it', async () => {
    const path = 'Journal/Daily/2026-08-11.md';
    const file = makeFile(path);
    const files = new Map([[path, file]]);
    const entries = new Map([['2026-08-11', { date: '2026-08-11', journal: 'Daily', path }]]);
    const daily = makeJournal('Daily', files, entries);
    const adapter = new JournalsDailyNoteSourceAdapter(makeApp(makePluginApi([daily]), files), {
      id: 'dailynote_1',
      heading: 'Schedule',
      provider: 'journals',
      journalId: 'Daily'
    });

    await expect(adapter.getFileForDate('2026-08-11', {} as never, true)).resolves.toBe(file);
    expect(daily.open).not.toHaveBeenCalled();
  });

  it('creates a missing entry through Journals and preserves the requested local date', async () => {
    const files = new Map<string, TFile>();
    const entries = new Map<string, { date: string; journal: string; path?: string }>();
    const daily = makeJournal('Daily', files, entries);
    const adapter = new JournalsDailyNoteSourceAdapter(makeApp(makePluginApi([daily]), files), {
      id: 'dailynote_1',
      heading: 'Schedule',
      provider: 'journals',
      journalId: 'Daily'
    });

    const file = await adapter.getFileForDate('2026-08-11', {} as never, true);
    expect(daily.get).toHaveBeenCalledWith('2026-08-11');
    expect(daily.open).toHaveBeenCalledWith({ date: '2026-08-11', journal: 'Daily' });
    expect(file?.path).toBe('Journal/Daily/2026-08-11.md');
  });

  it('reports when Journals cannot resolve an entry for the requested date', async () => {
    const files = new Map<string, TFile>();
    const daily = makeJournal('Daily', files, new Map());
    daily.get.mockReturnValue(null);
    const adapter = new JournalsDailyNoteSourceAdapter(makeApp(makePluginApi([daily]), files), {
      id: 'journals_1',
      heading: 'Schedule',
      provider: 'journals',
      journalId: 'Daily'
    });

    await expect(adapter.getFileForDate('2026-08-11', {} as never, true)).rejects.toThrow(
      'Journals could not resolve an entry for 2026-08-11.'
    );
  });

  it('reports when Journals does not create the expected note', async () => {
    const files = new Map<string, TFile>();
    const daily = makeJournal('Daily', files, new Map());
    daily.open.mockResolvedValue(undefined);
    const adapter = new JournalsDailyNoteSourceAdapter(makeApp(makePluginApi([daily]), files), {
      id: 'journals_1',
      heading: 'Schedule',
      provider: 'journals',
      journalId: 'Daily'
    });

    await expect(adapter.getFileForDate('2026-08-11', {} as never, true)).rejects.toThrow(
      'Journals did not create the expected entry for 2026-08-11'
    );
  });

  it('rejects a selected journal that was renamed or deleted', () => {
    const app = makeApp(makePluginApi([]));
    const adapter = new JournalsDailyNoteSourceAdapter(app, {
      id: 'dailynote_1',
      heading: 'Schedule',
      provider: 'journals',
      journalId: 'Old name'
    });
    expect(() => adapter.getAllFiles()).toThrow(/renamed or deleted/);
  });
});

describe('legacy Daily Notes compatibility', () => {
  it('continues to resolve and create through obsidian-daily-notes-interface', async () => {
    const dateMoment = { format: () => '2026-08-11' } as never;
    const created = makeFile('Daily/2026-08-11.md');
    (getAllDailyNotes as jest.Mock).mockReturnValue({});
    (getDailyNote as jest.Mock).mockReturnValue(null);
    (createDailyNote as jest.Mock).mockResolvedValue(created);
    (getDailyNoteSettings as jest.Mock).mockReturnValue({ folder: 'Daily' });
    (getDateFromFile as jest.Mock).mockReturnValue({ format: () => '2026-08-11' });

    const adapter = new ObsidianDailyNoteSourceAdapter();
    await expect(adapter.getFileForDate('2026-08-11', dateMoment, true)).resolves.toBe(created);
    expect(createDailyNote).toHaveBeenCalledWith(dateMoment);
    expect(adapter.getDateForFile(created)).toBe('2026-08-11');
  });

  it('defaults old serialized Daily Note settings to the legacy provider', () => {
    const parsed = parseCalendarInfo({
      type: 'dailynote',
      id: 'dailynote_1',
      name: 'Daily Note',
      heading: 'Schedule',
      color: '#123456'
    });

    expect(parsed).toEqual(expect.objectContaining({ provider: 'daily-notes', format: 'default' }));
    expect('journalId' in parsed).toBe(false);
  });
});
