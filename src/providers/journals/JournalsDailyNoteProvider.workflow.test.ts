import { TFile } from 'obsidian';
import type { CachedMetadata } from 'obsidian';
import type { JournalsApi } from 'obsidian-journals-api';

import { DailyNoteProvider } from '../dailynote/DailyNoteProvider';
import type { ObsidianInterface } from '../../ObsidianAdapter';
import type FullCalendarPlugin from '../../main';
import { DEFAULT_SETTINGS } from '../../types/settings';
import type { OFCEvent } from '../../types';
import { PluginState } from '../../core/PluginState';

jest.mock('obsidian', () => {
  const toIsoDate = (input?: string | Date): string => {
    if (!input) return '1970-01-01';
    if (input instanceof Date) return input.toISOString().slice(0, 10);
    return input.slice(0, 10);
  };
  const moment = (input?: string | Date) => ({
    format: (_pattern?: string) => toIsoDate(input)
  });

  class TFile {
    path = '';
    name = '';
  }

  return {
    moment,
    TFile,
    Notice: class {},
    Modal: class {},
    PluginSettingTab: class {},
    Setting: class {},
    Plugin: class {},
    App: class {}
  };
});

jest.mock('obsidian-daily-notes-interface', () => ({
  appHasDailyNotesPluginLoaded: jest.fn(),
  createDailyNote: jest.fn(),
  getAllDailyNotes: jest.fn(),
  getDailyNote: jest.fn(),
  getDailyNoteSettings: jest.fn().mockReturnValue({ folder: '', template: '' }),
  getDateFromFile: jest.fn()
}));

const makeFile = (path: string): TFile => {
  const file = new TFile();
  file.path = path;
  file.name = path.split('/').pop() ?? '';
  return file;
};

describe('Journals 3.2 Daily Note provider workflow', () => {
  it('creates, edits, moves, and deletes through an exact selected-journal API selector', async () => {
    const files = new Map<string, TFile>();
    const datesByPath = new Map<string, string>();
    const contents = new Map<string, string>();
    const pathFor = (date: string) => `Work/${date}.md`;
    const apiNote = (date: string, file: TFile | null) => ({
      journal: 'Work',
      date,
      displayDate: date,
      endDate: date,
      path: pathFor(date),
      file
    });

    const notesFor = jest.fn(async (selector: string, date: string) => {
      if (selector !== 'Work') return [];
      return [apiNote(date, files.get(pathFor(date)) ?? null)];
    });
    const ensureNote = jest.fn(async (selector: string, date: string) => {
      if (selector !== 'Work') throw new Error('wrong journal');
      const path = pathFor(date);
      const file = files.get(path) ?? makeFile(path);
      files.set(path, file);
      datesByPath.set(path, date);
      if (!contents.has(path)) contents.set(path, '');
      return { note: apiNote(date, file), created: true };
    });
    const journalOf = jest.fn(async (file: TFile) => {
      const date = datesByPath.get(file.path);
      return date ? apiNote(date, file) : null;
    });
    const subscriptionDisposers: jest.Mock[] = [];
    const on = jest.fn(() => {
      const dispose = jest.fn();
      subscriptionDisposers.push(dispose);
      return dispose;
    });
    const api = {
      apiVersion: 1,
      listJournals: jest.fn().mockResolvedValue([
        { name: 'Work', shelf: null, write: { type: 'day' } },
        { name: 'Personal', shelf: null, write: { type: 'day' } }
      ]),
      notesFor,
      journalOf,
      ensureNote,
      on
    } as unknown as JournalsApi;

    const obsidianApp = {
      vault: {
        getFileByPath: (path: string) => files.get(path) ?? null,
        getMarkdownFiles: () => [...files.values()]
      },
      metadataCache: {
        getFileCache: (_file: TFile) => ({ headings: [] })
      },
      plugins: {
        getPlugin: (id: string) => (id === 'journals' ? { api } : null),
        plugins: { journals: { api } }
      }
    };

    const io: ObsidianInterface = {
      getAbstractFileByPath: (path: string) => files.get(path) ?? null,
      getFileByPath: (path: string) => files.get(path) ?? null,
      getMetadata: (_file: TFile) => ({ headings: [] }),
      waitForMetadata: (_file: TFile) => Promise.resolve({ headings: [] } as CachedMetadata),
      read: (file: TFile) => Promise.resolve(contents.get(file.path) ?? ''),
      process: <T>(file: TFile, func: (text: string) => T): Promise<T> =>
        Promise.resolve(func(contents.get(file.path) ?? '')),
      create: () => Promise.reject(new Error('Journals owns note creation')),
      rewrite: async <T>(file: TFile, rewriteFunc: (text: string) => unknown) => {
        const result = await rewriteFunc(contents.get(file.path) ?? '');
        if (Array.isArray(result)) {
          const [text, extra] = result as [string, T];
          contents.set(file.path, text);
          return extra;
        }
        contents.set(file.path, result as string);
        return undefined;
      },
      rename: () => Promise.reject(new Error('Not used')),
      delete: () => Promise.reject(new Error('Not used'))
    };

    const settings = {
      ...DEFAULT_SETTINGS,
      calendarSources: [
        {
          type: 'journals' as const,
          id: 'journals_1',
          name: 'Journals: Work',
          journalId: 'Work',
          heading: 'Calendar',
          format: 'default' as const,
          color: '#123456'
        }
      ]
    };
    PluginState.setSettings(settings);
    const plugin = { app: obsidianApp, settings } as unknown as FullCalendarPlugin;
    const provider = new DailyNoteProvider(settings.calendarSources[0], plugin, io);
    provider.initialize();
    expect(on).toHaveBeenCalledTimes(3);

    const event: OFCEvent = {
      title: 'Official API lifecycle',
      type: 'single',
      allDay: false,
      date: '2026-08-30',
      startTime: '09:00',
      endTime: '10:00',
      endDate: null
    };
    const [created, createdLocation] = await provider.createEvent(event);
    expect(createdLocation.file.path).toBe('Work/2026-08-30.md');
    expect(contents.get(createdLocation.file.path)).toContain('Official API lifecycle');
    expect(ensureNote).toHaveBeenCalledWith('Work', '2026-08-30');

    const renamed: OFCEvent = { ...created, title: 'Official API renamed' };
    const renameHandle = provider.getEventHandle(created);
    expect(renameHandle?.location?.path).toBe('Work/2026-08-30.md');
    await provider.updateEvent(renameHandle!, created, renamed);
    expect(contents.get('Work/2026-08-30.md')).toContain('Official API renamed');

    const moved = { ...renamed, date: '2026-08-31' } as OFCEvent;
    const movedLocation = await provider.updateEvent(
      provider.getEventHandle(renamed)!,
      renamed,
      moved
    );
    expect(movedLocation?.file.path).toBe('Work/2026-08-31.md');
    expect(contents.get('Work/2026-08-30.md')).not.toContain('Official API renamed');
    expect(contents.get('Work/2026-08-31.md')).toContain('Official API renamed');
    expect(ensureNote).toHaveBeenCalledWith('Work', '2026-08-31');

    await provider.deleteEvent(provider.getEventHandle(moved)!);
    expect(contents.get('Work/2026-08-31.md')).not.toContain('Official API renamed');
    expect(notesFor.mock.calls.every(([selector]) => selector === 'Work')).toBe(true);

    provider.teardown();
    subscriptionDisposers.forEach(dispose => expect(dispose).toHaveBeenCalledTimes(1));
  });
});
