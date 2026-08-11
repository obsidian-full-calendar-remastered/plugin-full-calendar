import { moment as obsidianMoment, TFile } from 'obsidian';
import type { CachedMetadata } from 'obsidian';
import {
  appHasDailyNotesPluginLoaded,
  createDailyNote,
  getAllDailyNotes,
  getDailyNote,
  getDailyNoteSettings,
  getDateFromFile
} from 'obsidian-daily-notes-interface';

import { DailyNoteProvider } from './DailyNoteProvider';
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

  const moment = (input?: string | Date) => {
    const iso = toIsoDate(input);
    return {
      format: (_pattern?: string) => iso,
      isSameOrAfter: (other: { format: (pattern?: string) => string }) =>
        iso >= other.format('YYYY-MM-DD'),
      isSameOrBefore: (other: { format: (pattern?: string) => string }) =>
        iso <= other.format('YYYY-MM-DD')
    };
  };

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
    Setting: class {
      setName() {
        return this;
      }
      setDesc() {
        return this;
      }
      addDropdown() {
        return this;
      }
      addToggle() {
        return this;
      }
      addText() {
        return this;
      }
    },
    Plugin: class {},
    App: class {}
  };
});

jest.mock('obsidian-daily-notes-interface', () => ({
  appHasDailyNotesPluginLoaded: jest.fn(),
  createDailyNote: jest.fn(),
  getAllDailyNotes: jest.fn(),
  getDailyNote: jest.fn(),
  getDailyNoteSettings: jest.fn(),
  getDateFromFile: jest.fn()
}));

const makePlugin = (): FullCalendarPlugin => {
  const mergedSettings = { ...DEFAULT_SETTINGS };
  PluginState.setSettings(mergedSettings);
  return {
    settings: mergedSettings
  } as unknown as FullCalendarPlugin;
};

const makeFile = (path: string): TFile => {
  const file = new TFile();
  file.path = path;
  file.name = path.split('/').pop() || '';
  return file;
};

describe('DailyNoteProvider workflow', () => {
  const dailyNotesByPath = new Map<string, TFile>();
  const contentsByPath = new Map<string, string>();

  const getAllDailyNotesMock = getAllDailyNotes as jest.MockedFunction<typeof getAllDailyNotes>;
  const getDailyNoteMock = getDailyNote as jest.MockedFunction<typeof getDailyNote>;
  const createDailyNoteMock = createDailyNote as jest.MockedFunction<typeof createDailyNote>;
  const getDailyNoteSettingsMock = getDailyNoteSettings as jest.MockedFunction<
    typeof getDailyNoteSettings
  >;
  const getDateFromFileMock = getDateFromFile as jest.MockedFunction<typeof getDateFromFile>;

  const createMockApp = (): ObsidianInterface => ({
    getAbstractFileByPath: (path: string) => dailyNotesByPath.get(path) ?? null,
    getFileByPath: (path: string) => dailyNotesByPath.get(path) ?? null,
    getMetadata: (_file: TFile) => ({ headings: [] }),
    waitForMetadata: (_file: TFile) => Promise.resolve({ headings: [] } as CachedMetadata),
    read: (file: TFile) => Promise.resolve(contentsByPath.get(file.path) ?? ''),
    process: <T>(file: TFile, func: (text: string) => T): Promise<T> =>
      Promise.resolve(func(contentsByPath.get(file.path) ?? '')),
    create: (_path: string, _contents: string) =>
      Promise.reject(new Error('Not used by DailyNoteProvider')),
    rewrite: async <T>(file: TFile, rewriteFunc: (contents: string) => unknown) => {
      const current = contentsByPath.get(file.path) ?? '';
      const result = await rewriteFunc(current);

      if (Array.isArray(result)) {
        const [page, extra] = result as [string, T];
        contentsByPath.set(file.path, page);
        return extra;
      }

      contentsByPath.set(file.path, result as string);
      return undefined;
    },
    rename: (_file: TFile, _newPath: string) =>
      Promise.reject(new Error('Not used by DailyNoteProvider')),
    delete: (_file: TFile) => Promise.reject(new Error('Not used by DailyNoteProvider'))
  });

  beforeEach(() => {
    jest.clearAllMocks();
    dailyNotesByPath.clear();
    contentsByPath.clear();

    getAllDailyNotesMock.mockImplementation(() => {
      return Object.fromEntries(dailyNotesByPath.entries());
    });

    getDailyNoteMock.mockImplementation(m => {
      const path = `Daily/${m.format('YYYY-MM-DD')}.md`;
      let file = dailyNotesByPath.get(path);
      if (!file) {
        file = makeFile(path);
        dailyNotesByPath.set(path, file);
        if (!contentsByPath.has(path)) {
          contentsByPath.set(path, '');
        }
      }
      return file;
    });

    createDailyNoteMock.mockImplementation(m => {
      const path = `Daily/${m.format('YYYY-MM-DD')}.md`;
      const file = makeFile(path);
      dailyNotesByPath.set(path, file);
      contentsByPath.set(path, '');
      return Promise.resolve(file);
    });

    getDailyNoteSettingsMock.mockReturnValue({ folder: 'Daily', format: 'YYYY-MM-DD' });

    getDateFromFileMock.mockImplementation(file => {
      const m = file.path.match(/(\d{4}-\d{2}-\d{2})/);
      return m ? moment(m[1]) : null;
    });
  });

  it('creates and deletes a daily note event using a handle with file path', async () => {
    const app = createMockApp();

    const provider = new DailyNoteProvider(
      { id: 'dailynote_1', heading: 'Calendar' },
      makePlugin(),
      app
    );

    expect(appHasDailyNotesPluginLoaded).toHaveBeenCalledTimes(1);

    const event: OFCEvent = {
      title: 'Daily workflow event',
      type: 'single',
      allDay: true,
      date: '2026-03-27',
      endDate: null
    };

    const [createdEvent, location] = await provider.createEvent(event);

    expect(location.file.path).toBe('Daily/2026-03-27.md');
    const beforeDelete = contentsByPath.get(location.file.path) || '';
    expect(beforeDelete).toContain('Daily workflow event');

    const handle = provider.getEventHandle(createdEvent);
    expect(handle).not.toBeNull();
    expect(createdEvent.uid).toBe('1');
    expect(handle!.persistentId).toBe('2026-03-27::uid:1');
    expect(handle!.location?.path).toBe('Daily/2026-03-27.md');

    await provider.deleteEvent(handle!);

    const afterDelete = contentsByPath.get(location.file.path) || '';
    expect(afterDelete).not.toContain('Daily workflow event');
  });

  it('serializes notify inline attributes as scalar values', async () => {
    const app = createMockApp();

    const provider = new DailyNoteProvider(
      { id: 'dailynote_1', heading: 'Calendar' },
      makePlugin(),
      app
    );

    const event: OFCEvent = {
      title: 'Daily notify event',
      type: 'single',
      allDay: false,
      date: '2026-03-30',
      startTime: '11:30',
      endTime: '13:30',
      endDate: null,
      timezone: 'Europe/Budapest',
      notify: { value: 30 }
    };

    const [, location] = await provider.createEvent(event);
    const contents = contentsByPath.get(location.file.path) || '';

    expect(contents).toContain('[notify:: 30]');
    expect(contents).not.toContain('[notify:: [object Object]]');
  });

  it('add, rename, move date, and delete workflow stays intact', async () => {
    const app = createMockApp();

    const provider = new DailyNoteProvider(
      { id: 'dailynote_1', heading: 'Calendar' },
      makePlugin(),
      app
    );

    const initialEvent: OFCEvent = {
      title: 'Daily lifecycle base',
      type: 'single',
      allDay: true,
      date: '2026-03-27',
      endDate: null
    };

    const [createdEvent, createdLocation] = await provider.createEvent(initialEvent);
    const createdPath = createdLocation.file.path;
    expect(contentsByPath.get(createdPath)).toContain('Daily lifecycle base');

    const renamedEvent: OFCEvent = {
      ...createdEvent,
      title: 'Daily lifecycle renamed'
    };

    const renameHandle = provider.getEventHandle(createdEvent);
    expect(renameHandle?.location?.path).toBe(createdPath);

    const renamedLocation = await provider.updateEvent(renameHandle!, createdEvent, renamedEvent);
    expect(renamedLocation?.file.path).toBe(createdPath);
    expect(contentsByPath.get(createdPath)).toContain('Daily lifecycle renamed');
    expect(contentsByPath.get(createdPath)).not.toContain('Daily lifecycle base');

    const movedEvent = {
      ...renamedEvent,
      date: '2026-03-28'
    } as OFCEvent;

    const moveHandle = provider.getEventHandle(renamedEvent);
    expect(moveHandle?.location?.path).toBe(createdPath);

    const movedLocation = await provider.updateEvent(moveHandle!, renamedEvent, movedEvent);
    expect(movedLocation?.file.path).toBe('Daily/2026-03-28.md');
    expect(contentsByPath.get(createdPath) || '').not.toContain('Daily lifecycle renamed');
    expect(contentsByPath.get('Daily/2026-03-28.md') || '').toContain('Daily lifecycle renamed');

    const deleteHandle = provider.getEventHandle(movedEvent);
    expect(deleteHandle?.location?.path).toBe('Daily/2026-03-28.md');

    await provider.deleteEvent(deleteHandle!);
    expect(contentsByPath.get('Daily/2026-03-28.md') || '').not.toContain(
      'Daily lifecycle renamed'
    );
  });

  it('waits for metadata before parsing a daily note during startup scan', async () => {
    const file = makeFile('Daily/2026-03-29.md');
    dailyNotesByPath.set(file.path, file);
    contentsByPath.set(
      file.path,
      ['# Calendar', '- [ ] Startup sync event [startTime:: 09:00]'].join('\n')
    );
    const sections = [
      {
        position: {
          end: { line: 1, col: 47, offset: 58 }
        }
      }
    ] as NonNullable<CachedMetadata['sections']>;
    const sectionsWithLast = sections as NonNullable<CachedMetadata['sections']> & {
      last: () => NonNullable<CachedMetadata['sections']>[number];
    };
    sectionsWithLast.last = () => sections[sections.length - 1];

    const startupMetadata = {
      headings: [
        {
          heading: 'Calendar',
          level: 1,
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 0, col: 10, offset: 10 }
          }
        }
      ],
      listItems: [
        {
          position: {
            start: { line: 1, col: 0, offset: 11 },
            end: { line: 1, col: 47, offset: 58 }
          }
        }
      ],
      sections: sectionsWithLast
    } as CachedMetadata;

    let hasMetadata = false;
    const app: ObsidianInterface = {
      getAbstractFileByPath: (path: string) => dailyNotesByPath.get(path) ?? null,
      getFileByPath: (path: string) => dailyNotesByPath.get(path) ?? null,
      getMetadata: (_file: TFile) => (hasMetadata ? startupMetadata : null),
      waitForMetadata: (_file: TFile) => {
        hasMetadata = true;
        return Promise.resolve(startupMetadata);
      },
      read: (target: TFile) => Promise.resolve(contentsByPath.get(target.path) ?? ''),
      process: <T>(target: TFile, func: (text: string) => T): Promise<T> =>
        Promise.resolve(func(contentsByPath.get(target.path) ?? '')),
      create: (_path: string, _contents: string) =>
        Promise.reject(new Error('Not used by DailyNoteProvider')),
      rewrite: () => Promise.resolve(undefined),
      rename: (_file: TFile, _newPath: string) =>
        Promise.reject(new Error('Not used by DailyNoteProvider')),
      delete: (_file: TFile) => Promise.reject(new Error('Not used by DailyNoteProvider'))
    };

    const provider = new DailyNoteProvider(
      { id: 'dailynote_1', heading: 'Calendar' },
      makePlugin(),
      app
    );

    const events = await provider.getEventsInFile(file);

    expect(events).toHaveLength(1);
    expect(events[0][0]).toEqual(
      expect.objectContaining({
        title: 'Startup sync event',
        date: '2026-03-29'
      })
    );
  });

  it('keeps duplicate same-title events by allocating unique uids', async () => {
    const app = createMockApp();

    const provider = new DailyNoteProvider(
      { id: 'dailynote_1', heading: 'Calendar' },
      makePlugin(),
      app
    );

    const firstEvent: OFCEvent = {
      title: 'Wellness - Sleep - Night',
      type: 'single',
      allDay: false,
      date: '2026-04-07',
      startTime: '23:30',
      endTime: '07:30',
      endDate: '2026-04-08',
      timezone: 'Europe/Budapest'
    };

    const secondEvent: OFCEvent = {
      title: 'Wellness - Sleep - Night',
      type: 'single',
      allDay: false,
      date: '2026-04-07',
      startTime: '00:45',
      endTime: '08:00',
      endDate: null,
      timezone: 'Europe/Budapest'
    };

    const [createdFirst] = await provider.createEvent(firstEvent);
    const [createdSecond] = await provider.createEvent(secondEvent);

    const id1 = provider.getEventHandle(createdFirst)?.persistentId;
    const id2 = provider.getEventHandle(createdSecond)?.persistentId;

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(createdFirst.uid).toBe('1');
    expect(id1).toBe('2026-04-07::uid:1');
    expect(createdSecond.uid).toBe('2');
    expect(id2).toBe('2026-04-07::uid:2');
    expect(id1).not.toEqual(id2);

    const content = contentsByPath.get('Daily/2026-04-07.md') || '';
    const eventLines = content
      .split('\n')
      .filter(line => line.trim().startsWith('-') && line.includes('[startTime::'));

    expect(eventLines).toHaveLength(2);
  });

  it('reassigns uid when moving to a date with an existing uid collision', async () => {
    const app = createMockApp();

    const provider = new DailyNoteProvider(
      { id: 'dailynote_1', heading: 'Calendar' },
      makePlugin(),
      app
    );

    const existingTargetDayEvent: OFCEvent = {
      title: 'Already on target date',
      type: 'single',
      allDay: true,
      date: '2026-05-11',
      endDate: null
    };

    const sourceDayEvent: OFCEvent = {
      title: 'Dragged from previous day',
      type: 'single',
      allDay: true,
      date: '2026-05-10',
      endDate: null
    };

    const [targetExisting] = await provider.createEvent(existingTargetDayEvent);
    const [sourceCreated] = await provider.createEvent(sourceDayEvent);

    expect(targetExisting.uid).toBe('1');
    expect(sourceCreated.uid).toBe('1');

    const movedEvent = {
      ...sourceCreated,
      date: '2026-05-11'
    } as OFCEvent;

    const moveHandle = provider.getEventHandle(sourceCreated);
    expect(moveHandle?.persistentId).toBe('2026-05-10::uid:1');

    await provider.updateEvent(moveHandle!, sourceCreated, movedEvent);

    expect(movedEvent.uid).toBe('2');
    expect(provider.getEventHandle(movedEvent)?.persistentId).toBe('2026-05-11::uid:2');
  });

  it('loads legacy event correctly', async () => {
    const file = makeFile('Daily/2026-04-07.md');
    dailyNotesByPath.set(file.path, file);
    contentsByPath.set(
      file.path,
      [
        '## Calendar',
        '-  Wellness - Sleep - Night [startTime:: 23:30]  [endTime:: 07:30]  [endDate:: 2026-04-08]  [timezone:: Europe/Budapest]'
      ].join('\n')
    );

    const sections = [
      {
        position: {
          end: { line: 1, col: 120, offset: 150 }
        }
      }
    ] as NonNullable<CachedMetadata['sections']>;
    const sectionsWithLast = sections as NonNullable<CachedMetadata['sections']> & {
      last: () => NonNullable<CachedMetadata['sections']>[number];
    };
    sectionsWithLast.last = () => sections[sections.length - 1];

    const metadata = {
      headings: [
        {
          heading: 'Calendar',
          level: 2,
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 0, col: 11, offset: 11 }
          }
        }
      ],
      listItems: [
        {
          position: {
            start: { line: 1, col: 0, offset: 12 },
            end: { line: 1, col: 120, offset: 150 }
          }
        }
      ],
      sections: sectionsWithLast
    } as CachedMetadata;

    const app: ObsidianInterface = {
      ...createMockApp(),
      getMetadata: (_file: TFile) => metadata,
      waitForMetadata: (_file: TFile) => Promise.resolve(metadata)
    };

    const provider = new DailyNoteProvider(
      { id: 'dailynote_1', heading: 'Calendar' },
      makePlugin(),
      app
    );

    const events = await provider.getEventsInFile(file);
    expect(events).toHaveLength(1);

    const [first] = events.map(([event]) => event);
    const firstId = provider.getEventHandle(first)?.persistentId;

    expect(firstId).toBeTruthy();
    expect(firstId).toBe('2026-04-07::Wellness - Sleep - Night::time:23:30-07:30');
    expect(provider.getCanonicalTitle(first)).toBe('Wellness - Sleep - Night');
  });

  it('creates timed events in day planner format when configured', async () => {
    const app = createMockApp();

    const provider = new DailyNoteProvider(
      { id: 'dailynote_1', heading: 'Calendar', format: 'dayPlanner' },
      makePlugin(),
      app
    );

    const event: OFCEvent = {
      title: 'Learning - Reading - Grocery Run',
      type: 'single',
      allDay: false,
      date: '2026-05-12',
      startTime: '02:30',
      endTime: '03:30',
      endDate: null,
      timezone: 'Europe/Budapest'
    };

    const [createdEvent, location] = await provider.createEvent(event);

    expect(createdEvent.uid).toBe('1');
    expect(location.file.path).toBe('Daily/2026-05-12.md');
    expect(contentsByPath.get(location.file.path)).toContain(
      '-  02:30 - 03:30 Learning - Reading - Grocery Run [timezone:: Europe/Budapest]  [uid:: 1]'
    );
    expect(contentsByPath.get(location.file.path)).not.toContain('[startTime::');
    expect(contentsByPath.get(location.file.path)).not.toContain('[endTime::');
  });

  it('parses existing day planner lines regardless of provider format setting', async () => {
    const file = makeFile('Daily/2026-05-13.md');
    dailyNotesByPath.set(file.path, file);
    contentsByPath.set(
      file.path,
      [
        '## Calendar',
        '- 02:30 - 03:30 Learning - Reading - Grocery Run [uid:: 2]  [timezone:: Europe/Budapest]'
      ].join('\n')
    );

    const sections = [
      {
        position: {
          end: { line: 1, col: 92, offset: 106 }
        }
      }
    ] as NonNullable<CachedMetadata['sections']>;
    const sectionsWithLast = sections as NonNullable<CachedMetadata['sections']> & {
      last: () => NonNullable<CachedMetadata['sections']>[number];
    };
    sectionsWithLast.last = () => sections[sections.length - 1];

    const metadata = {
      headings: [
        {
          heading: 'Calendar',
          level: 2,
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 0, col: 11, offset: 11 }
          }
        }
      ],
      listItems: [
        {
          position: {
            start: { line: 1, col: 0, offset: 12 },
            end: { line: 1, col: 92, offset: 106 }
          }
        }
      ],
      sections: sectionsWithLast
    } as CachedMetadata;

    const app: ObsidianInterface = {
      ...createMockApp(),
      getMetadata: (_file: TFile) => metadata,
      waitForMetadata: (_file: TFile) => Promise.resolve(metadata)
    };

    const provider = new DailyNoteProvider(
      { id: 'dailynote_1', heading: 'Calendar' },
      makePlugin(),
      app
    );

    const events = await provider.getEventsInFile(file);
    expect(events).toHaveLength(1);
    expect(events[0][0]).toEqual(
      expect.objectContaining({
        title: 'Learning - Reading - Grocery Run',
        startTime: '02:30',
        endTime: '03:30',
        uid: '2',
        timezone: 'Europe/Budapest',
        date: '2026-05-13',
        allDay: false
      })
    );
  });

  describe('isFileRelevant', () => {
    it('returns true if the file is in the daily note folder and has a valid date in its path', () => {
      const app = createMockApp();
      const provider = new DailyNoteProvider(
        { id: 'dailynote_1', heading: 'Calendar' },
        makePlugin(),
        app
      );

      getDailyNoteSettingsMock.mockReturnValue({ folder: 'Daily', format: 'YYYY-MM-DD' });
      const file = makeFile('Daily/2026-08-11.md');
      expect(provider.isFileRelevant(file)).toBe(true);
    });

    it('returns false if the file starts with the folder name but does not have a valid daily note date', () => {
      const app = createMockApp();
      const provider = new DailyNoteProvider(
        { id: 'dailynote_1', heading: 'Calendar' },
        makePlugin(),
        app
      );

      getDailyNoteSettingsMock.mockReturnValue({ folder: 'Daily', format: 'YYYY-MM-DD' });
      const file = makeFile('Daily/NotADate.md');
      expect(provider.isFileRelevant(file)).toBe(false);
    });

    it('returns false if the file is outside the configured daily note folder', () => {
      const app = createMockApp();
      const provider = new DailyNoteProvider(
        { id: 'dailynote_1', heading: 'Calendar' },
        makePlugin(),
        app
      );

      getDailyNoteSettingsMock.mockReturnValue({ folder: 'Daily', format: 'YYYY-MM-DD' });
      const file = makeFile('OtherFolder/2026-08-11.md');
      expect(provider.isFileRelevant(file)).toBe(false);
    });

    it('returns true if folder is empty/not configured but the filename has a valid daily note date', () => {
      const app = createMockApp();
      const provider = new DailyNoteProvider(
        { id: 'dailynote_1', heading: 'Calendar' },
        makePlugin(),
        app
      );

      getDailyNoteSettingsMock.mockReturnValue({ folder: '', format: 'YYYY-MM-DD' });
      const file = makeFile('2026-08-11.md');
      expect(provider.isFileRelevant(file)).toBe(true);
    });

    it('returns false if folder is empty/not configured and the filename does not have a valid daily note date', () => {
      const app = createMockApp();
      const provider = new DailyNoteProvider(
        { id: 'dailynote_1', heading: 'Calendar' },
        makePlugin(),
        app
      );

      getDailyNoteSettingsMock.mockReturnValue({ folder: '', format: 'YYYY-MM-DD' });
      const file = makeFile('Readme.md');
      expect(provider.isFileRelevant(file)).toBe(false);
    });
  });
});
type MomentFactory = typeof import('moment');
const moment = obsidianMoment as unknown as MomentFactory;
