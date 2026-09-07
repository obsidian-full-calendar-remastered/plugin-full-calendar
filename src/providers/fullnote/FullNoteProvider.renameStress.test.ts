import { CachedMetadata, TFile } from 'obsidian';
import { parse } from 'yaml';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { MockApp, MockAppBuilder } from '../../../test_helpers/AppBuilder';
import { FileBuilder } from '../../../test_helpers/FileBuilder';
import { FullNoteProvider } from './FullNoteProvider';
import { PluginState } from '../../core/PluginState';
import EventStore from '../../core/EventStore';
import { DEFAULT_SETTINGS } from '../../types/settings';

// Mock Obsidian module
jest.mock(
  'obsidian',
  () => {
    class TAbstractFile {
      name: string = '';
      parent: TFolder | null = null;
      get path(): string {
        if (this.parent && this.parent.path) {
          return `${this.parent.path}/${this.name}`;
        }
        return this.name;
      }
    }

    class TFile extends TAbstractFile {
      get basename(): string {
        const dotIndex = this.name.lastIndexOf('.');
        return dotIndex >= 0 ? this.name.slice(0, dotIndex) : this.name;
      }
    }

    class TFolder extends TAbstractFile {
      children: TAbstractFile[] = [];
      isRootVal: boolean = false;

      get path(): string {
        if (this.isRootVal) return '';
        return super.path;
      }

      isRoot(): boolean {
        return this.isRootVal;
      }
    }

    return {
      normalizePath: (path: string) => path.replace(/\\/g, '/'),
      TFile,
      TFolder,
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
      App: class {},
      parseYaml: (s: string): Record<string, unknown> => {
        const parsed: unknown = parse(s);
        return typeof parsed === 'object' && parsed !== null
          ? (parsed as Record<string, unknown>)
          : {};
      }
    };
  },
  { virtual: true }
);

let activeMockApp: MockApp;

const getAbstractFileSpy = jest.fn((path: string) =>
  activeMockApp.vault.getAbstractFileByPath(path)
);
const getFileByPathSpy = jest.fn((path: string): TFile | null =>
  activeMockApp.vault.getFileByPath(path)
);
const getMetadataSpy = jest.fn((file: TFile) => activeMockApp.metadataCache.getFileCache(file));
const waitForMetadataSpy = jest.fn((file: TFile): Promise<CachedMetadata> =>
  Promise.resolve(activeMockApp.metadataCache.getFileCache(file) || {})
);
const readSpy = jest.fn((file: TFile) => activeMockApp.vault.read(file));
const createSpy = jest.fn((path: string, content: string) =>
  activeMockApp.vault.create(path, content)
);
const renameSpy = jest.fn((file: TFile, newPath: string) =>
  activeMockApp.vault.rename(file, newPath)
);
const rewriteSpy: ObsidianInterface['rewrite'] = jest.fn();
const deleteSpy = jest.fn((file: TFile) => activeMockApp.vault.delete(file));
const processSpy: ObsidianInterface['process'] = jest.fn();

const makeDynamicObsidian = (): ObsidianInterface => ({
  getAbstractFileByPath: getAbstractFileSpy,
  getFileByPath: getFileByPathSpy,
  getMetadata: getMetadataSpy,
  waitForMetadata: waitForMetadataSpy,
  read: readSpy,
  create: createSpy,
  rename: renameSpy,
  rewrite: rewriteSpy,
  delete: deleteSpy,
  process: processSpy
});

const makePlugin = () =>
  ({
    app: {
      vault: {
        getAbstractFileByPath: jest.fn()
      }
    }
  }) as unknown as import('../../main').default;

describe('FullNoteProvider Rename Stress & Frontmatter Purity', () => {
  const dirName = 'Calendar';

  beforeEach(() => {
    PluginState.setSettings({
      ...DEFAULT_SETTINGS
    });
  });

  describe('Rapid sequential renames of a single event note', () => {
    it('preserves title, date, and task status through 20 rapid renames without event degradation', async () => {
      const initialFilename = 'initial-meeting.md';
      const eventTitle = 'Executive Strategy Session';
      const eventDate = '2026-10-15';

      activeMockApp = MockAppBuilder.make()
        .folder(
          new MockAppBuilder(dirName).file(
            initialFilename,
            new FileBuilder().frontmatter({
              title: eventTitle,
              date: eventDate,
              isTask: true,
              completed: false
            })
          )
        )
        .done();

      const obsidian = makeDynamicObsidian();
      const provider = new FullNoteProvider(
        { directory: dirName, id: 'cal_stress' },
        makePlugin(),
        obsidian
      );

      const store = new EventStore();

      // Initial load
      let currentPath = `${dirName}/${initialFilename}`;
      let file = obsidian.getFileByPath(currentPath);
      expect(file).not.toBeNull();
      if (!file) return;

      const events = await provider.getEventsInFile(file);
      expect(events).toHaveLength(1);
      const [initialEvent, initialLoc] = events[0];
      expect(initialEvent.title).toBe(eventTitle);
      expect(initialEvent.allDay).toBe(true);
      expect(initialEvent.isTask).toBe(true);

      store.add({
        id: 'session-id-1',
        event: initialEvent,
        location: initialLoc,
        calendarId: 'cal_stress'
      });
      expect(store.eventCount).toBe(1);

      // 20 rapid, varied renames simulating user, quick-switcher, plugin, or cloud sync adjustments
      const renameSequence = [
        '2026-10-15 Executive Strategy Session.md',
        '2026-10-15 Meeting.md',
        'random_note_identifier_9812.md',
        'Meeting with VP (High Priority) [Urgent].md',
        '2024-01-01 Contradictory Date in Filename.md',
        'Strategy Session - Draft Notes.md',
        '日本語の会議ノート.md',
        'meeting_v2_final_final.md',
        'Project_Alpha_Milestone.md',
        '123456789.md',
        'Session With Special Characters & Symbols #1.md',
        'Nested Name With Spaces And Dashes - Copy.md',
        'Executive Strategy Session (1).md',
        'Executive Strategy Session (2).md',
        'temp_name_while_typing.md',
        'Sync Oct 15.md',
        'Sprint Review Notes.md',
        'Final Strategy Alignment.md',
        'Board Meeting Sync.md',
        '2026-10-15 Final Approved Title File.md'
      ];

      for (let i = 0; i < renameSequence.length; i++) {
        const nextFilename = renameSequence[i];
        const nextPath = `${dirName}/${nextFilename}`;

        // Rebuild mock app reflecting rename on disk
        activeMockApp = MockAppBuilder.make()
          .folder(
            new MockAppBuilder(dirName).file(
              nextFilename,
              new FileBuilder().frontmatter({
                title: eventTitle,
                date: eventDate,
                isTask: true,
                completed: false
              })
            )
          )
          .done();

        // 1. Simulate old path deletion in EventStore
        const oldEventsInFile = store.getEventsInFile({ path: currentPath });
        expect(oldEventsInFile).toHaveLength(1);
        for (const oldEv of oldEventsInFile) {
          store.delete(oldEv.id);
        }
        expect(store.eventCount).toBe(0);

        // 2. Simulate new path update in FullNoteProvider and EventStore
        const nextFile = obsidian.getFileByPath(nextPath);
        expect(nextFile).not.toBeNull();
        if (!nextFile) return;

        expect(provider.isFileRelevant(nextFile)).toBe(true);

        const updatedEvents = await provider.getEventsInFile(nextFile);
        expect(updatedEvents).toHaveLength(1);

        const [currEvent, currLoc] = updatedEvents[0];

        // CRITICAL ASSERTIONS:
        // Pure frontmatter guarantees title and date are 100% immune to filename adjustments!
        expect(currEvent.title).toBe(eventTitle);
        if (currEvent.type === 'single') {
          expect(currEvent.date).toBe(eventDate);
        }
        expect(currEvent.isTask).toBe(true);
        expect(currEvent.uid).toBe(nextPath);

        // Add to store under the new path
        store.add({
          id: `session-id-${i + 2}`,
          event: currEvent,
          location: currLoc,
          calendarId: 'cal_stress'
        });

        expect(store.eventCount).toBe(1);
        expect(store.getEventsInFile(nextFile)).toHaveLength(1);
        expect(store.getEventsInCalendar('cal_stress')).toHaveLength(1);

        currentPath = nextPath;
      }
    });
  });

  describe('Mass folder rename batch cascade', () => {
    it('correctly re-indexes 30 notes across nested directories when parent folder is renamed', async () => {
      const noteCount = 30;
      const initialFolder = 'OldFolder';
      const newFolder = 'NewFolder';

      let filesBuilder = new MockAppBuilder(initialFolder);
      for (let i = 1; i <= noteCount; i++) {
        const dateDay = (i % 28) + 1;
        const dayStr = dateDay < 10 ? `0${dateDay}` : `${dateDay}`;
        const isTask = i % 2 === 0;

        filesBuilder = filesBuilder.file(
          `task-item-${i}.md`,
          new FileBuilder().frontmatter({
            title: `Event Number ${i}`,
            ...(isTask ? { due: `2026-11-${dayStr}`, isTask: true } : { date: `2026-11-${dayStr}` })
          })
        );
      }

      activeMockApp = MockAppBuilder.make().folder(filesBuilder).done();
      const obsidian = makeDynamicObsidian();
      const provider = new FullNoteProvider(
        { directory: '', id: 'cal_batch' },
        makePlugin(),
        obsidian
      );

      const store = new EventStore();

      for (let i = 1; i <= noteCount; i++) {
        const filePath = `${initialFolder}/task-item-${i}.md`;
        const f = obsidian.getFileByPath(filePath);
        expect(f).not.toBeNull();
        if (f) {
          const res = await provider.getEventsInFile(f);
          expect(res).toHaveLength(1);
          store.add({
            id: `orig-${i}`,
            event: res[0][0],
            location: res[0][1],
            calendarId: 'cal_batch'
          });
        }
      }

      expect(store.eventCount).toBe(noteCount);

      let newFilesBuilder = new MockAppBuilder(newFolder);
      for (let i = 1; i <= noteCount; i++) {
        const dateDay = (i % 28) + 1;
        const dayStr = dateDay < 10 ? `0${dateDay}` : `${dateDay}`;
        const isTask = i % 2 === 0;

        newFilesBuilder = newFilesBuilder.file(
          `task-item-${i}.md`,
          new FileBuilder().frontmatter({
            title: `Event Number ${i}`,
            ...(isTask ? { due: `2026-11-${dayStr}`, isTask: true } : { date: `2026-11-${dayStr}` })
          })
        );
      }

      activeMockApp = MockAppBuilder.make().folder(newFilesBuilder).done();

      for (let i = 1; i <= noteCount; i++) {
        const oldFilePath = `${initialFolder}/task-item-${i}.md`;
        const oldEvents = store.getEventsInFile({ path: oldFilePath });
        expect(oldEvents).toHaveLength(1);
        for (const ev of oldEvents) {
          store.delete(ev.id);
        }

        const newFilePath = `${newFolder}/task-item-${i}.md`;
        const newFile = obsidian.getFileByPath(newFilePath);
        expect(newFile).not.toBeNull();
        if (newFile) {
          const newEvents = await provider.getEventsInFile(newFile);
          expect(newEvents).toHaveLength(1);
          store.add({
            id: `new-${i}`,
            event: newEvents[0][0],
            location: newEvents[0][1],
            calendarId: 'cal_batch'
          });
        }
      }

      expect(store.eventCount).toBe(noteCount);
      const allEvents = store.getAllEvents();
      expect(allEvents).toHaveLength(noteCount);

      for (let i = 1; i <= noteCount; i++) {
        const dateDay = (i % 28) + 1;
        const dayStr = dateDay < 10 ? `0${dateDay}` : `${dateDay}`;
        const matching = allEvents.find(e => e.event.title === `Event Number ${i}`);
        expect(matching).toBeDefined();
        if (matching?.event.type === 'single') {
          expect(matching.event.date).toBe(`2026-11-${dayStr}`);
        }
        expect(matching?.location?.path).toBe(`${newFolder}/task-item-${i}.md`);
        if (i % 2 === 0) {
          expect(matching?.event.isTask).toBe(true);
        }
      }
    });
  });

  describe('Pure Frontmatter Date & Title Priority Across File Renames', () => {
    it('correctly resolves due, scheduled, start, and startDate when renamed to arbitrary names', async () => {
      const testCases = [
        {
          initialFile: 'note-due.md',
          renamedFile: 'random-due-xyz.md',
          frontmatter: { title: 'Due Date Task', due: '2026-12-10', completed: false },
          expectedDate: '2026-12-10',
          expectedTask: true
        },
        {
          initialFile: 'note-scheduled.md',
          renamedFile: 'totally-different-name.md',
          frontmatter: { title: 'Scheduled Meeting', scheduled: '2026-12-11' },
          expectedDate: '2026-12-11',
          expectedTask: true
        },
        {
          initialFile: 'note-start.md',
          renamedFile: 'renamed-start-file.md',
          frontmatter: { title: 'Start Event', start: '2026-12-12' },
          expectedDate: '2026-12-12',
          expectedTask: false
        },
        {
          initialFile: 'note-startDate.md',
          renamedFile: 'renamed-startDate-file.md',
          frontmatter: { title: 'StartDate Event', startDate: '2026-12-13' },
          expectedDate: '2026-12-13',
          expectedTask: false
        }
      ];

      for (const tc of testCases) {
        activeMockApp = MockAppBuilder.make()
          .folder(
            new MockAppBuilder(dirName).file(
              tc.renamedFile,
              new FileBuilder().frontmatter(tc.frontmatter)
            )
          )
          .done();

        const obsidian = makeDynamicObsidian();
        const provider = new FullNoteProvider(
          { directory: dirName, id: 'cal_priority' },
          makePlugin(),
          obsidian
        );

        const file = obsidian.getFileByPath(`${dirName}/${tc.renamedFile}`);
        expect(file).not.toBeNull();
        if (file) {
          const events = await provider.getEventsInFile(file);
          expect(events).toHaveLength(1);
          const [event] = events[0];
          expect(event.title).toBe(tc.frontmatter.title);
          if (event.type === 'single') {
            expect(event.date).toBe(tc.expectedDate);
          }
          if (tc.expectedTask) {
            expect(event.isTask).toBe(true);
          }
        }
      }
    });

    it('falls back to reading from disk immediately when metadata cache is delayed during a rename', async () => {
      const renamedFile = 'UncachedRenamedEvent.md';
      const fileContent = '---\ntitle: Immediate Disk Read Event\ndate: 2026-12-25\n---\nBody';

      activeMockApp = MockAppBuilder.make()
        .folder(new MockAppBuilder(dirName).file(renamedFile, new FileBuilder().text(fileContent)))
        .done();

      const obsidian = makeDynamicObsidian();
      // Simulate metadataCache returning null frontmatter right after rename
      getMetadataSpy.mockReturnValue(null);
      waitForMetadataSpy.mockResolvedValue({});

      const provider = new FullNoteProvider(
        { directory: dirName, id: 'cal_fallback' },
        makePlugin(),
        obsidian
      );

      const file = obsidian.getFileByPath(`${dirName}/${renamedFile}`);
      expect(file).not.toBeNull();
      if (file) {
        const events = await provider.getEventsInFile(file);
        expect(events).toHaveLength(1);
        expect(events[0][0].title).toBe('Immediate Disk Read Event');
        if (events[0][0].type === 'single') {
          expect(events[0][0].date).toBe('2026-12-25');
        }
        expect(readSpy).toHaveBeenCalledWith(file);
      }
    });

    it('strictly upholds frontmatter date and title when filename contains a contradictory date and title', async () => {
      // Filename suggests 2020-01-01 and "Old Archive Note"
      const misleadingFilename = '2020-01-01 Old Archive Note.md';
      // Frontmatter explicitly defines 2026-11-20 and "True Active Project"
      const fm = {
        title: 'True Active Project',
        date: '2026-11-20',
        completed: true
      };

      activeMockApp = MockAppBuilder.make()
        .folder(
          new MockAppBuilder(dirName).file(misleadingFilename, new FileBuilder().frontmatter(fm))
        )
        .done();

      const obsidian = makeDynamicObsidian();
      const provider = new FullNoteProvider(
        { directory: dirName, id: 'cal_contradiction' },
        makePlugin(),
        obsidian
      );

      const file = obsidian.getFileByPath(`${dirName}/${misleadingFilename}`);
      expect(file).not.toBeNull();
      if (file) {
        const events = await provider.getEventsInFile(file);
        expect(events).toHaveLength(1);
        const [event] = events[0];

        // Must take frontmatter, NEVER the filename
        expect(event.title).toBe('True Active Project');
        if (event.type === 'single') {
          expect(event.date).toBe('2026-11-20');
          expect(event.completed).toBe(true);
        }
      }
    });

    it('cleans filename when frontmatter title is omitted without prepending redundant dates', async () => {
      const filename = '2026-08-15 Launch Milestone.md';
      activeMockApp = MockAppBuilder.make()
        .folder(
          new MockAppBuilder(dirName).file(
            filename,
            new FileBuilder().frontmatter({ date: '2026-08-15' })
          )
        )
        .done();

      const obsidian = makeDynamicObsidian();
      const provider = new FullNoteProvider(
        { directory: dirName, id: 'cal_no_title' },
        makePlugin(),
        obsidian
      );

      const file = obsidian.getFileByPath(`${dirName}/${filename}`);
      expect(file).not.toBeNull();
      if (file) {
        const events = await provider.getEventsInFile(file);
        expect(events).toHaveLength(1);
        expect(events[0][0].title).toBe('Launch Milestone');
      }
    });

    it('preserves recurring event definitions across rename', async () => {
      const renamedName = 'company-weekly-sync.md';
      const recurringFm = {
        title: 'Weekly Standup',
        type: 'recurring',
        daysOfWeek: ['M', 'W', 'F'],
        startRecur: '2026-10-01',
        endRecur: '2026-12-31',
        startTime: '09:00',
        endTime: '09:30'
      };

      activeMockApp = MockAppBuilder.make()
        .folder(
          new MockAppBuilder(dirName).file(renamedName, new FileBuilder().frontmatter(recurringFm))
        )
        .done();

      const obsidian = makeDynamicObsidian();
      const provider = new FullNoteProvider(
        { directory: dirName, id: 'cal_recurring' },
        makePlugin(),
        obsidian
      );

      const file = obsidian.getFileByPath(`${dirName}/${renamedName}`);
      expect(file).not.toBeNull();
      if (file) {
        const events = await provider.getEventsInFile(file);
        expect(events).toHaveLength(1);
        const [event] = events[0];
        expect(event.type).toBe('recurring');
        expect(event.title).toBe('Weekly Standup');
        expect(event.uid).toBe(`${dirName}/${renamedName}`);
      }
    });

    it('handles concurrent rename operations asynchronously without dropped events', async () => {
      const concurrentCount = 10;
      let filesBuilder = new MockAppBuilder(dirName);
      for (let i = 0; i < concurrentCount; i++) {
        filesBuilder = filesBuilder.file(
          `renamed-concurrent-${i}.md`,
          new FileBuilder().frontmatter({
            title: `Concurrent Event ${i}`,
            date: '2026-10-10'
          })
        );
      }

      activeMockApp = MockAppBuilder.make().folder(filesBuilder).done();
      const obsidian = makeDynamicObsidian();
      const provider = new FullNoteProvider(
        { directory: dirName, id: 'cal_concurrent' },
        makePlugin(),
        obsidian
      );

      const store = new EventStore();

      // Concurrently parse all 10 renamed files
      const parseTasks = Array.from({ length: concurrentCount }, async (_, i) => {
        const path = `${dirName}/renamed-concurrent-${i}.md`;
        const f = obsidian.getFileByPath(path);
        if (!f) throw new Error(`File ${path} not found`);
        const res = await provider.getEventsInFile(f);
        store.add({
          id: `concurrent-${i}`,
          event: res[0][0],
          location: res[0][1],
          calendarId: 'cal_concurrent'
        });
      });

      await Promise.all(parseTasks);

      expect(store.eventCount).toBe(concurrentCount);
      const allEvents = store.getAllEvents();
      expect(allEvents).toHaveLength(concurrentCount);
      for (let i = 0; i < concurrentCount; i++) {
        const ev = allEvents.find(e => e.event.title === `Concurrent Event ${i}`);
        expect(ev).toBeDefined();
        expect(ev?.location?.path).toBe(`${dirName}/renamed-concurrent-${i}.md`);
      }
    });
  });
});
