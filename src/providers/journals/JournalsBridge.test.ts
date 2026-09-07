import { App, TFile } from 'obsidian';
import type { JournalsApi, JournalsApiEvents } from 'obsidian-journals-api';

import {
  loadJournalsCatalog,
  resolveJournalsBridge,
  type LegacyDayJournal,
  type LegacyJournalEntry,
  type LegacyJournalsPluginApi
} from './JournalsBridge';

jest.mock('obsidian', () => ({
  TFile: class TFile {
    path = '';
  },
  App: class App {}
}));

const makeFile = (path: string): TFile => {
  const file = new TFile();
  file.path = path;
  return file;
};

type TestApp = App & {
  vault: {
    getFileByPath(path: string): TFile | null;
    getMarkdownFiles(): TFile[];
  };
  metadataCache: {
    getFileCache(file: TFile): { headings?: { heading: string }[] } | null;
  };
  plugins: {
    getPlugin(id: string): unknown;
    plugins: Record<string, unknown>;
  };
};

const makeApp = (
  journalsPlugin: unknown,
  files: TFile[] = [],
  headings = new Map<string, string[]>()
): TestApp =>
  ({
    vault: {
      getFileByPath: (path: string) => files.find(file => file.path === path) ?? null,
      getMarkdownFiles: () => files
    },
    metadataCache: {
      getFileCache: (file: TFile) => ({
        headings: (headings.get(file.path) ?? []).map(heading => ({ heading }))
      })
    },
    plugins: {
      getPlugin: (id: string) => (id === 'journals' ? journalsPlugin : null),
      plugins: journalsPlugin ? { journals: journalsPlugin } : {}
    }
  }) as TestApp;

const existingNote = (journal: string, date: string, file: TFile) => ({
  journal,
  date,
  displayDate: date,
  endDate: date,
  path: file.path,
  file
});

type ApiMocks = {
  api: JournalsApi;
  listJournals: jest.Mock;
  notesFor: jest.Mock;
  journalOf: jest.Mock;
  ensureNote: jest.Mock;
  on: jest.Mock;
  handlers: Partial<{ [K in keyof JournalsApiEvents]: JournalsApiEvents[K] }>;
  disposers: jest.Mock[];
};

const makeOfficialApi = (): ApiMocks => {
  const handlers: ApiMocks['handlers'] = {};
  const disposers: jest.Mock[] = [];
  const listJournals = jest.fn().mockResolvedValue([]);
  const notesFor = jest.fn().mockResolvedValue([]);
  const journalOf = jest.fn().mockResolvedValue(null);
  const ensureNote = jest.fn();
  const on = jest.fn((event: keyof JournalsApiEvents, handler: JournalsApiEvents[typeof event]) => {
    handlers[event] = handler as never;
    const dispose = jest.fn();
    disposers.push(dispose);
    return dispose;
  });
  const api = {
    apiVersion: 1,
    listJournals,
    notesFor,
    journalOf,
    ensureNote,
    on
  } as unknown as JournalsApi;
  return {
    api,
    listJournals,
    notesFor,
    journalOf,
    ensureNote,
    on,
    handlers,
    disposers
  };
};

const makeLegacyJournal = (name: string, type = 'day'): LegacyDayJournal => ({
  name,
  type,
  get: jest.fn((date: string): LegacyJournalEntry => ({ date, journal: name })),
  getNotePath: jest.fn(entry => `${name}/${entry.date}.md`),
  open: jest.fn().mockResolvedValue(undefined)
});

const makeLegacyPlugin = (journals: LegacyDayJournal[]): LegacyJournalsPluginApi => ({
  journals,
  getJournal: name => journals.find(journal => journal.name === name),
  index: {
    getAllPaths: () => [],
    getForPath: () => null
  }
});

describe('Journals compatibility bridge', () => {
  it('reports Journals as missing without crashing when the plugin is absent', () => {
    expect(resolveJournalsBridge(makeApp(null))).toEqual({ state: 'missing' });
  });

  it('detects the Journals 2.x runtime and returns only Day journals', async () => {
    const legacy = makeLegacyPlugin([
      makeLegacyJournal('Work'),
      makeLegacyJournal('Personal'),
      makeLegacyJournal('Weekly', 'week')
    ]);
    const resolution = resolveJournalsBridge(makeApp(legacy));

    expect(resolution.state).toBe('available');
    if (resolution.state !== 'available') return;
    expect(resolution.bridge.kind).toBe('legacy');
    await expect(Promise.resolve(resolution.bridge.listDayJournals())).resolves.toEqual([
      { name: 'Work' },
      { name: 'Personal' }
    ]);
  });

  it('prefers the Journals 3.2 official API and uses the documented day filter', async () => {
    const mocks = makeOfficialApi();
    mocks.listJournals.mockResolvedValue([
      { name: 'Work', shelf: null, write: { type: 'day' } },
      { name: 'Personal', shelf: 'Home', write: { type: 'day' } }
    ]);
    const resolution = resolveJournalsBridge(makeApp({ api: mocks.api }));

    expect(resolution.state).toBe('available');
    if (resolution.state !== 'available') return;
    expect(resolution.bridge.kind).toBe('official');
    await expect(Promise.resolve(resolution.bridge.listDayJournals())).resolves.toEqual([
      { name: 'Work' },
      { name: 'Personal' }
    ]);
    expect(mocks.listJournals).toHaveBeenCalledWith({ writeType: 'day' });
  });

  it('distinguishes an enabled plugin with no supported API from a missing plugin', () => {
    expect(resolveJournalsBridge(makeApp({ api: null }))).toEqual({ state: 'unsupported' });
  });

  it('returns the unsupported catalog state instead of the plugin-missing UI state', async () => {
    await expect(loadJournalsCatalog(makeApp({ api: null }))).resolves.toEqual({
      state: 'unsupported'
    });
  });

  it('keeps an available provider distinct from an empty Day journal list', async () => {
    const mocks = makeOfficialApi();
    const resolution = resolveJournalsBridge(makeApp({ api: mocks.api }));

    expect(resolution.state).toBe('available');
    if (resolution.state !== 'available') return;
    await expect(Promise.resolve(resolution.bridge.listDayJournals())).resolves.toEqual([]);
  });

  it('surfaces listJournals failures as a handled rejection', async () => {
    const mocks = makeOfficialApi();
    mocks.listJournals.mockRejectedValue(new Error('index unavailable'));
    const resolution = resolveJournalsBridge(makeApp({ api: mocks.api }));

    expect(resolution.state).toBe('available');
    if (resolution.state !== 'available') return;
    await expect(Promise.resolve(resolution.bridge.listDayJournals())).rejects.toThrow(
      'index unavailable'
    );
    await expect(loadJournalsCatalog(makeApp({ api: mocks.api }))).resolves.toEqual(
      expect.objectContaining({ state: 'error' })
    );
  });

  it('scopes note lookup and creation to the persisted selected journal name', async () => {
    const work = makeFile('Work/2026-08-30.md');
    const mocks = makeOfficialApi();
    mocks.notesFor.mockResolvedValue([existingNote('Work', '2026-08-30', work)]);
    mocks.ensureNote.mockResolvedValue({
      note: existingNote('Work', '2026-08-31', makeFile('Work/2026-08-31.md')),
      created: true
    });
    const resolution = resolveJournalsBridge(makeApp({ api: mocks.api }, [work]));

    expect(resolution.state).toBe('available');
    if (resolution.state !== 'available') return;
    await expect(
      Promise.resolve(resolution.bridge.getNoteForDate('Work', '2026-08-30'))
    ).resolves.toEqual(expect.objectContaining({ journal: 'Work', file: work }));
    await expect(resolution.bridge.ensureNote('Work', '2026-08-31')).resolves.toEqual(
      expect.objectContaining({ journal: 'Work', path: 'Work/2026-08-31.md' })
    );
    expect(mocks.notesFor).toHaveBeenCalledWith('Work', '2026-08-30');
    expect(mocks.ensureNote).toHaveBeenCalledWith('Work', '2026-08-31');
  });

  it('loads an event date range through exact selected-journal note lookups', async () => {
    const work = makeFile('Work/2026-08-30.md');
    const mocks = makeOfficialApi();
    mocks.notesFor.mockImplementation(async (selector: string, date: string) => {
      if (selector !== 'Work') return [];
      if (date === '2026-08-30') return [existingNote('Work', date, work)];
      return [
        {
          journal: 'Work',
          date,
          displayDate: date,
          endDate: date,
          path: `Work/${date}.md`,
          file: null
        }
      ];
    });
    const resolution = resolveJournalsBridge(makeApp({ api: mocks.api }, [work]));

    expect(resolution.state).toBe('available');
    if (resolution.state !== 'available') return;
    await expect(
      Promise.resolve(
        resolution.bridge.getNotes('Work', {
          start: new Date(2026, 7, 30),
          end: new Date(2026, 7, 31)
        })
      )
    ).resolves.toEqual([expect.objectContaining({ journal: 'Work', date: '2026-08-30' })]);
    expect(mocks.notesFor.mock.calls).toEqual([
      ['Work', '2026-08-30'],
      ['Work', '2026-08-31']
    ]);
  });

  it('enumerates selected-journal files and derives headings through public journalOf', async () => {
    const work = makeFile('Work/2026-08-30.md');
    const personal = makeFile('Personal/2026-08-30.md');
    const mocks = makeOfficialApi();
    mocks.journalOf.mockImplementation(async (file: TFile) =>
      file === work
        ? existingNote('Work', '2026-08-30', work)
        : existingNote('Personal', '2026-08-30', personal)
    );
    const app = makeApp(
      { api: mocks.api },
      [work, personal],
      new Map([[work.path, ['Schedule', 'Notes', 'Schedule']]])
    );
    const resolution = resolveJournalsBridge(app);

    expect(resolution.state).toBe('available');
    if (resolution.state !== 'available') return;
    await expect(Promise.resolve(resolution.bridge.getNotes('Work'))).resolves.toEqual([
      expect.objectContaining({ journal: 'Work', file: work })
    ]);
    await expect(Promise.resolve(resolution.bridge.getSuggestedHeadings('Work'))).resolves.toEqual([
      'Schedule',
      'Notes'
    ]);
  });

  it('subscribes to official note and rename events and disposes every listener', () => {
    const mocks = makeOfficialApi();
    const resolution = resolveJournalsBridge(makeApp({ api: mocks.api }));

    expect(resolution.state).toBe('available');
    if (resolution.state !== 'available') return;
    const noteAdded = jest.fn();
    const noteRemoved = jest.fn();
    const journalRenamed = jest.fn();
    const dispose = resolution.bridge.subscribe({ noteAdded, noteRemoved, journalRenamed });

    mocks.handlers.noteAdded?.({ journal: 'Work', date: '2026-08-30', path: 'Work.md' });
    mocks.handlers.noteRemoved?.({ journal: 'Work', date: '2026-08-30', path: 'Work.md' });
    mocks.handlers.journalRenamed?.({ from: 'Work', to: 'Office' });
    expect(noteAdded).toHaveBeenCalledTimes(1);
    expect(noteRemoved).toHaveBeenCalledTimes(1);
    expect(journalRenamed).toHaveBeenCalledWith({ from: 'Work', to: 'Office' });

    dispose();
    expect(mocks.disposers).toHaveLength(3);
    mocks.disposers.forEach(unsubscribe => expect(unsubscribe).toHaveBeenCalledTimes(1));
  });
});
