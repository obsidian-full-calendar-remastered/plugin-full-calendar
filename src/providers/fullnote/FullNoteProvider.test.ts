import { TFile, normalizePath } from 'obsidian';
import { parse } from 'yaml'; // Import 'load' from js-yaml
import { DateTime } from 'luxon';
import { EventApi } from '@fullcalendar/core';

import { ObsidianInterface } from '../../ObsidianAdapter';
import { MockApp, MockAppBuilder } from '../../../test_helpers/AppBuilder';
import { OFCEvent } from '../../types';
import { FileBuilder } from '../../../test_helpers/FileBuilder';
import { parseEvent } from '../../types/schema';
import { DEFAULT_SETTINGS, FullCalendarSettings } from '../../types/settings';
import FullCalendarPlugin from '../../main';

// Import the new provider and its types
import { FullNoteProvider } from './FullNoteProvider';
import { PluginState } from '../../core/PluginState';

// Mock Obsidian module
jest.mock(
  'obsidian',
  () => {
    // Basic mock for TAbstractFile to have a `path` property.
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

    class TFile extends TAbstractFile {}

    class TFolder extends TAbstractFile {
      children: TAbstractFile[] = [];
      isRootVal: boolean = false;

      // The root folder's path is an empty string.
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
      // Use the imported 'load' function as our mock implementation
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      parseYaml: (s: string) => parse(s)
    };
  },
  { virtual: true }
);

// keep assertFailed helper
// function _assertFailed removed because it's unused

const makeApp = (app: MockApp): ObsidianInterface => ({
  getAbstractFileByPath: path => app.vault.getAbstractFileByPath(path),
  getFileByPath(path: string): TFile | null {
    return app.vault.getFileByPath(path);
  },
  getMetadata: jest.fn(file => app.metadataCache.getFileCache(file)),
  waitForMetadata: jest.fn(
    file =>
      new Promise((resolve, reject) => {
        const cache = app.metadataCache.getFileCache(file);
        if (cache) {
          resolve(cache);
        } else {
          reject(new Error(`No metadata cache found for ${file.path}`));
        }
      })
  ),
  read: file => app.vault.read(file),
  create: jest.fn(),
  rewrite: jest.fn(),
  rename: jest.fn(),
  delete: jest.fn(),
  process: jest.fn()
});

interface MockObsidian {
  create: jest.Mock;
  delete: jest.Mock;
  rewrite: jest.Mock;
  read: jest.Mock;
  getAbstractFileByPath: jest.Mock;
}

const dirName = 'events';

const makePlugin = (settings: Partial<FullCalendarSettings> = {}): FullCalendarPlugin => {
  const mergedSettings = { ...DEFAULT_SETTINGS, ...settings };
  PluginState.setSettings(mergedSettings);
  return {
    app: {}, // Mock app if needed, though not used by constructor directly
    settings: mergedSettings,
    nonBlockingProcess: jest.fn(
      async (files: TFile[], processor: (file: TFile) => Promise<void>) => {
        for (const file of files) {
          await processor(file);
        }
      }
    )
  } as unknown as FullCalendarPlugin;
};

describe('FullNoteCalendar Tests', () => {
  it.each([
    [
      'One event with category',
      [
        {
          filename: '2022-01-01 Work - Test Event.md',
          frontmatter: {
            title: 'Work - Test Event',
            allDay: true,
            date: '2022-01-01'
          },
          expected: {
            title: 'Work - Test Event',
            allDay: true,
            date: '2022-01-01'
          }
        }
      ]
    ],
    [
      'Two events, one with category',
      [
        {
          filename: '2022-01-01 Work - Test Event.md',
          frontmatter: {
            title: 'Work - Test Event',
            allDay: true,
            date: '2022-01-01'
          },
          expected: {
            title: 'Work - Test Event',
            allDay: true,
            date: '2022-01-01'
          }
        },
        {
          filename: '2022-01-02 Another Test Event.md',
          frontmatter: {
            title: 'Another Test Event',
            date: '2022-01-02',
            startTime: '11:00',
            endTime: '12:00'
          },
          expected: {
            title: 'Another Test Event',
            date: '2022-01-02',
            startTime: '11:00',
            endTime: '12:00'
          }
        }
      ]
    ]
  ])(
    '%p',
    async (
      _,
      inputs: { filename: string; frontmatter: Partial<OFCEvent>; expected: Partial<OFCEvent> }[]
    ) => {
      const obsidian = makeApp(
        MockAppBuilder.make()
          .folder(
            inputs.reduce(
              (builder, { filename, frontmatter }) =>
                builder.file(filename, new FileBuilder().frontmatter(frontmatter)),
              new MockAppBuilder(dirName)
            )
          )
          .done()
      );
      // CORRECTED CONSTRUCTOR CALL

      const calendar = new FullNoteProvider(
        { directory: dirName, id: 'local_1' },
        makePlugin({ enableAdvancedCategorization: true }),
        obsidian
      );
      const res = await calendar.getEvents();
      expect(res.length).toBe(inputs.length);

      const receivedEvents = res.map(e => e[0]);

      for (const { expected } of inputs) {
        // The parsed event should be structurally similar to our expected event.
        // We use expect.objectContaining because the parser adds default fields.
        expect(receivedEvents).toContainEqual(expect.objectContaining(expected));
      }
    }
  );

  it('creates an event with a category', async () => {
    const obsidian = makeApp(MockAppBuilder.make().done());
    // CORRECTED CONSTRUCTOR CALL

    const calendar = new FullNoteProvider(
      { directory: dirName, id: 'local_1' },
      makePlugin({ enableAdvancedCategorization: true }),
      obsidian
    );
    const event = {
      title: 'Test Event',
      category: 'Work',
      date: '2022-01-01',
      allDay: false,
      startTime: '11:00',
      endTime: '12:30'
    };

    const mockObsidian = obsidian as unknown as MockObsidian;

    mockObsidian.create.mockReturnValue({
      path: `${dirName}/2022-01-01 Work - Test Event.md`
    });
    await calendar.createEvent(parseEvent(event));
    expect(mockObsidian.create).toHaveBeenCalledTimes(1);
    const mockCreate = mockObsidian.create;
    const [path, content] = mockCreate.mock.calls[0] as [string, string];

    expect(path).toBe('events/2022-01-01 Work - Test Event.md');
    // The frontmatter content will now have separate fields.
    expect(content).toContain('title: "Test Event"');
    expect(content).toContain('category: "Work"');
  });

  it('creates an event using a custom template', async () => {
    const obsidian = makeApp(MockAppBuilder.make().done());

    const calendar = new FullNoteProvider(
      {
        directory: dirName,
        id: 'local_1',
        name: 'Work Calendar',
        template: '# {{title}}\n\nLocation: {{location}}\nDescription: {{description}}'
      },
      makePlugin(),
      obsidian
    );

    const event = {
      title: 'Interview Candidate',
      date: '2026-06-02',
      allDay: true,
      location: 'Zoom',
      description: 'Discussing role expectations.'
    };

    const mockObsidian = obsidian as unknown as MockObsidian;

    mockObsidian.create.mockReturnValue({
      path: `${dirName}/2026-06-02 Interview Candidate.md`
    });

    await calendar.createEvent(parseEvent(event));

    expect(mockObsidian.create).toHaveBeenCalledTimes(1);
    const mockCreate = mockObsidian.create;
    const [path, content] = mockCreate.mock.calls[0] as [string, string];

    expect(path).toBe('events/2026-06-02 Interview Candidate.md');
    expect(content).toContain('title: "Interview Candidate"');
    expect(content).toContain('location: "Zoom"');

    // Check that the template was rendered into the body of the note
    expect(content).toContain('# Interview Candidate');
    expect(content).toContain('Location: Zoom');
    expect(content).toContain('Description: Discussing role expectations.');
  });

  it('waits for metadata before skipping a local note during startup scan', async () => {
    const startupFilePath = 'events/2022-01-01 Startup Event.md';
    const app = MockAppBuilder.make()
      .folder(
        new MockAppBuilder(dirName).file(
          '2022-01-01 Startup Event.md',
          new FileBuilder().frontmatter({
            title: 'Startup Event',
            allDay: true,
            date: '2022-01-01'
          })
        )
      )
      .done();
    const file = app.vault.getFileByPath(startupFilePath);
    if (!(file instanceof TFile)) {
      throw new Error(`Expected TFile at path ${startupFilePath}`);
    }

    const metadata = {
      frontmatter: {
        title: 'Startup Event',
        allDay: true,
        date: '2022-01-01'
      }
    };

    const waitForMetadataMock = jest
      .fn<Promise<typeof metadata>, [TFile]>()
      .mockResolvedValue(metadata);
    const obsidian: ObsidianInterface = {
      getAbstractFileByPath: jest.fn(),
      getFileByPath: jest.fn(),
      getMetadata: jest.fn().mockReturnValue(null),
      waitForMetadata: waitForMetadataMock,
      read: jest.fn(),
      create: jest.fn(),
      rewrite: jest.fn(),
      rename: jest.fn(),
      delete: jest.fn(),
      process: jest.fn()
    };

    const calendar = new FullNoteProvider(
      { directory: dirName, id: 'local_1' },
      makePlugin(),
      obsidian
    );
    const events = await calendar.getEventsInFile(file);

    expect(waitForMetadataMock).toHaveBeenCalledWith(file);
    expect(events).toHaveLength(1);
    expect(events[0][0]).toEqual(
      expect.objectContaining({
        title: 'Startup Event',
        date: '2022-01-01',
        uid: 'events/2022-01-01 Startup Event.md'
      })
    );
  });

  it.each([null, 'meeting'])(
    'loads a single event when frontmatter type is %p',
    async customType => {
      const filename = '2026-06-23 Custom Type.md';
      const obsidian = makeApp(
        MockAppBuilder.make()
          .folder(
            new MockAppBuilder(dirName).file(
              filename,
              new FileBuilder().frontmatter({
                title: 'Custom Type',
                date: '2026-06-23',
                type: customType
              })
            )
          )
          .done()
      );
      const calendar = new FullNoteProvider(
        { directory: dirName, id: 'local_1' },
        makePlugin(),
        obsidian
      );

      const events = await calendar.getEvents();

      expect(events).toHaveLength(1);
      expect(events[0][0]).toEqual(
        expect.objectContaining({
          title: 'Custom Type',
          date: '2026-06-23',
          type: 'single'
        })
      );
    }
  );

  it.each([
    [
      'recurring',
      {
        title: 'Recurring Event',
        type: 'recurring',
        daysOfWeek: ['M'],
        startRecur: '2026-06-23'
      }
    ],
    [
      'rrule',
      {
        title: 'RRULE Event',
        type: 'rrule',
        startDate: '2026-06-23',
        rrule: 'FREQ=WEEKLY'
      }
    ]
  ])('preserves the internal %s event type', async (expectedType, frontmatter) => {
    const filename = `2026-06-23 ${expectedType}.md`;
    const obsidian = makeApp(
      MockAppBuilder.make()
        .folder(
          new MockAppBuilder(dirName).file(filename, new FileBuilder().frontmatter(frontmatter))
        )
        .done()
    );
    const calendar = new FullNoteProvider(
      { directory: dirName, id: 'local_1' },
      makePlugin(),
      obsidian
    );

    const events = await calendar.getEvents();

    expect(events).toHaveLength(1);
    expect(events[0][0].type).toBe(expectedType);
  });

  it('create and delete workflow succeeds end-to-end', async () => {
    const app = MockAppBuilder.make().folder(new MockAppBuilder(dirName)).done();
    const obsidian = makeApp(app);

    (obsidian.create as jest.Mock).mockImplementation((path: string, data: string) =>
      app.vault.create(path, data)
    );
    (obsidian.delete as jest.Mock).mockImplementation((file: TFile) => {
      if (file.parent) {
        file.parent.children = file.parent.children.filter(child => child !== file);
      }
      return Promise.resolve();
    });

    const calendar = new FullNoteProvider(
      { directory: dirName, id: 'local_1' },
      makePlugin(),
      obsidian
    );

    const inputEvent = parseEvent({
      title: 'Workflow Event',
      allDay: true,
      date: '2022-02-01'
    });

    const [createdEvent] = await calendar.createEvent(inputEvent);
    const handle = calendar.getEventHandle(createdEvent);

    expect(handle).not.toBeNull();
    expect(createdEvent.uid).toBeDefined();
    expect(handle!.persistentId).toBe(createdEvent.uid);

    await calendar.deleteEvent(handle!);

    expect((obsidian.delete as jest.Mock).mock.calls).toHaveLength(1);
    expect(app.vault.getFileByPath(createdEvent.uid!)).toBeNull();
  });

  it('add, rename, move date, and delete workflow stays intact', async () => {
    const app = MockAppBuilder.make().folder(new MockAppBuilder(dirName)).done();
    const obsidian = makeApp(app);

    (obsidian.create as jest.Mock).mockImplementation((path: string, data: string) =>
      app.vault.create(path, data)
    );
    (obsidian.rename as jest.Mock).mockImplementation((file: TFile, newPath: string) => {
      file.name = newPath.split('/').pop() || file.name;
      return Promise.resolve();
    });
    (obsidian.delete as jest.Mock).mockImplementation((file: TFile) => {
      if (file.parent) {
        file.parent.children = file.parent.children.filter(child => child !== file);
      }
      return Promise.resolve();
    });

    const calendar = new FullNoteProvider(
      { directory: dirName, id: 'local_1' },
      makePlugin({ enableAdvancedCategorization: false }),
      obsidian
    );

    const initialEvent = parseEvent({
      title: 'Workflow Base',
      type: 'single',
      allDay: true,
      date: '2026-03-25',
      endDate: null
    });

    const [createdEvent] = await calendar.createEvent(initialEvent);
    expect(createdEvent.uid).toBeDefined();

    const renamedEvent = parseEvent({
      ...createdEvent,
      title: 'Workflow Renamed'
    });

    const renameLocation = await calendar.updateEvent(
      { persistentId: createdEvent.uid! },
      createdEvent,
      renamedEvent
    );
    expect(renameLocation?.file.path).toContain('Workflow Renamed');

    const movedEvent = parseEvent({
      ...renamedEvent,
      uid: renameLocation?.file.path,
      date: '2026-03-26'
    });

    const moveLocation = await calendar.updateEvent(
      { persistentId: renameLocation!.file.path },
      renamedEvent,
      movedEvent
    );
    expect(moveLocation?.file.path).toContain('2026-03-26 Workflow Renamed');

    await calendar.deleteEvent({ persistentId: moveLocation!.file.path });
    expect((obsidian.delete as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('modify an existing event to add a category', async () => {
    const initialEvent = {
      title: 'Test Event',
      allDay: false,
      date: '2022-01-01',
      startTime: '11:00',
      endTime: '12:30'
    };
    const filename = '2022-01-01 Test Event.md';
    const app = MockAppBuilder.make()
      .folder(
        new MockAppBuilder('events').file(filename, new FileBuilder().frontmatter(initialEvent))
      )
      .done();
    const obsidian = makeApp(app);
    (obsidian.rename as jest.Mock).mockImplementation((file: TFile, newPath: string) => {
      file.name = newPath.split('/').pop() || file.name;
      return Promise.resolve();
    });
    // CORRECTED CONSTRUCTOR CALL

    const calendar = new FullNoteProvider(
      { directory: dirName, id: 'local_1' },
      makePlugin({ enableAdvancedCategorization: true }),
      obsidian
    );

    const path = normalizePath(`events/${filename}`); // Use forward slash instead of join
    const abstractFile = obsidian.getAbstractFileByPath(path);
    if (!(abstractFile instanceof TFile)) {
      throw new Error(
        `Expected ${path} to be a file, but got ${abstractFile?.constructor.name || 'null'}`
      );
    }
    const firstFile = abstractFile;

    const contents = await obsidian.read(firstFile);

    // The event we pass to modifyEvent is the *structured* event with separate properties.
    const newEvent = parseEvent({
      ...initialEvent,
      category: 'Work' // Add the category
    });

    const handle = calendar.getEventHandle(initialEvent as OFCEvent);
    if (!handle) throw new Error('Could not get event handle.');

    await calendar.updateEvent(handle, initialEvent as OFCEvent, newEvent);

    const mockObsidian = obsidian as unknown as MockObsidian;
    const mockRewrite = mockObsidian.rewrite;
    expect(mockRewrite).toHaveBeenCalledTimes(1);
    const [, rewriteCallback] = mockRewrite.mock.calls[0] as [string, (content: string) => string];
    const newContent = rewriteCallback(contents);

    // The rewritten content should have the new structured data.
    expect(newContent).toContain('title: Test Event');
    expect(newContent).toContain('category: "Work"');
  });

  it('preserves wikilink frontmatter formatting across consecutive time updates', async () => {
    const filename = '2026-05-14 FullNote event example.md';
    const initialEvent = parseEvent({
      title: 'FullNote event example',
      date: '2026-05-14',
      allDay: false,
      startTime: '10:00',
      endTime: '11:00',
      timezone: 'Europe/Berlin'
    });

    const app = MockAppBuilder.make()
      .folder(
        new MockAppBuilder('events').file(filename, new FileBuilder().frontmatter(initialEvent))
      )
      .done();
    const obsidian = makeApp(app);

    const calendar = new FullNoteProvider(
      { directory: dirName, id: 'local_1' },
      makePlugin({ enableAdvancedCategorization: false }),
      obsidian
    );

    const originalPage = `---
title: FullNote event example
startTime: 10:00
endTime: 11:00
date: 2026-05-14
timezone: Europe/Berlin

list_property:
  - Test1
  - "[[Test2]]"
# preserve-comment
text_property: "[[example]]"
---
`;

    const firstUpdate = parseEvent({
      ...initialEvent,
      startTime: '10:30',
      endTime: '11:30'
    });

    const secondUpdate = parseEvent({
      ...initialEvent,
      startTime: '11:00',
      endTime: '12:00'
    });

    await calendar.updateEvent({ persistentId: `events/${filename}` }, initialEvent, firstUpdate);
    await calendar.updateEvent({ persistentId: `events/${filename}` }, firstUpdate, secondUpdate);

    const mockRewrite = (obsidian as unknown as MockObsidian).rewrite;
    expect(mockRewrite).toHaveBeenCalledTimes(2);

    const [, firstRewrite] = mockRewrite.mock.calls[0] as [TFile, (content: string) => string];
    const [, secondRewrite] = mockRewrite.mock.calls[1] as [TFile, (content: string) => string];

    const afterFirstDrag = firstRewrite(originalPage);
    const afterSecondDrag = secondRewrite(afterFirstDrag);

    expect(afterFirstDrag).toContain('startTime: "10:30"');
    expect(afterFirstDrag).toContain('endTime: "11:30"');
    expect(afterFirstDrag).toContain('timezone: Europe/Berlin\n\nlist_property:');
    expect(afterFirstDrag).toContain('list_property:\n  - Test1\n  - "[[Test2]]"');
    expect(afterFirstDrag).toContain('# preserve-comment');
    expect(afterFirstDrag).toContain('text_property: "[[example]]"');

    expect(afterSecondDrag).toContain('startTime: "11:00"');
    expect(afterSecondDrag).toContain('endTime: "12:00"');
    expect(afterSecondDrag).toContain('timezone: Europe/Berlin\n\nlist_property:');
    expect(afterSecondDrag).toContain('list_property:\n  - Test1\n  - "[[Test2]]"');
    expect(afterSecondDrag).toContain('# preserve-comment');
    expect(afterSecondDrag).toContain('text_property: "[[example]]"');
    expect(afterSecondDrag).not.toContain('list_property: [Test1,[[Test2]]]');
    expect(afterSecondDrag).not.toContain('list_property: [Test1,Test2]');
    expect(afterSecondDrag).not.toContain('text_property: [[example]]');
    expect(afterSecondDrag).not.toContain('text_property: [example]');
  });

  it('should correctly determine file relevance', () => {
    const obsidian = makeApp(MockAppBuilder.make().done());
    const calendar = new FullNoteProvider(
      { directory: 'events', id: 'test_id' },
      makePlugin(),
      obsidian
    );

    // Mock TFile objects
    // Mock TFile objects using TFile prototype to satisfying instanceof check
    const makeMockFile = (path: string): TFile => {
      const file = new TFile();
      Object.defineProperty(file, 'path', { value: path });
      return file;
    };
    const fileInDirectory = makeMockFile('events/test-event.md');
    const fileInSubdirectory = makeMockFile('events/2023/test-event.md');
    const fileOutsideDirectory = makeMockFile('notes/other.md');
    const fileInSimilarPath = makeMockFile('events-archive/old.md');

    // File in the configured directory should be relevant
    expect(calendar.isFileRelevant(fileInDirectory)).toBe(true);

    // File in subdirectory should be relevant
    expect(calendar.isFileRelevant(fileInSubdirectory)).toBe(true);

    // File outside directory should not be relevant
    expect(calendar.isFileRelevant(fileOutsideDirectory)).toBe(false);

    // File in similar but different path should not be relevant
    expect(calendar.isFileRelevant(fileInSimilarPath)).toBe(false);
  });

  it('serializes notify as structured frontmatter instead of object stringification', async () => {
    const app = MockAppBuilder.make().folder(new MockAppBuilder(dirName)).done();
    const obsidian = makeApp(app);
    (obsidian.create as jest.Mock).mockReturnValue({
      path: `${dirName}/2026-05-21 Notify Event.md`
    });

    const calendar = new FullNoteProvider(
      { directory: dirName, id: 'local_1' },
      makePlugin(),
      obsidian
    );

    await calendar.createEvent(
      parseEvent({
        title: 'Notify Event',
        date: '2026-05-21',
        allDay: false,
        startTime: '11:30',
        endTime: '13:30',
        notify: { value: 30 }
      })
    );

    const mockCreate = (obsidian as unknown as MockObsidian).create;
    const [, content] = mockCreate.mock.calls[0] as [string, string];

    expect(content).toContain('notify: {"value":30}');
    expect(content).not.toContain('[object Object]');
  });

  it('creates a recurring event with repeatOn', async () => {
    const obsidian = makeApp(MockAppBuilder.make().done());
    const calendar = new FullNoteProvider(
      { directory: dirName, id: 'local_1' },
      makePlugin({ enableAdvancedCategorization: true }), // Using advanced categorization to ensure we exercise that path too, though not strictly necessary
      obsidian
    );
    const event = {
      title: 'Monthly Meeting',
      type: 'recurring',
      startTime: '10:00',
      endTime: '11:00',
      repeatOn: { week: 2, weekday: 0 }, // 2nd Sunday
      startRecur: '2022-01-01',
      isTask: false
    };

    (obsidian.create as jest.Mock).mockReturnValue({
      path: `${dirName}/Monthly Meeting.md`
    });

    await calendar.createEvent(parseEvent(event));

    const mockObsidian = obsidian as unknown as MockObsidian;
    const mockCreate = mockObsidian.create;
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [, content] = mockCreate.mock.calls[0] as [string, string];

    // This expectation should FAIL currently because it will be [object Object]
    expect(content).toContain('repeatOn: {"week":2,"weekday":0}');
  });

  it('correctly reads and writes on exact DST boundaries', async () => {
    // Berlin DST transition: March 31, 2024 at 02:00 -> 03:00
    const filename = '2024-03-31 Berlin DST Event.md';
    const initialEvent = {
      title: 'Berlin DST Event',
      allDay: false,
      date: '2024-03-31',
      startTime: '10:00',
      endTime: '11:00',
      timezone: 'Europe/Berlin'
    };

    const obsidian = makeApp(
      MockAppBuilder.make()
        .folder(
          new MockAppBuilder('events').file(filename, new FileBuilder().frontmatter(initialEvent))
        )
        .done()
    );

    const calendar = new FullNoteProvider(
      { directory: dirName, id: 'local_1' },
      makePlugin({ enableAdvancedCategorization: false }),
      obsidian
    );

    // Read test
    const events = await calendar.getEvents();
    expect(events.length).toBe(1);
    const parsedEvent = events[0][0];
    expect(parsedEvent).toHaveProperty('startTime', '10:00');
    expect(parsedEvent.timezone).toBe('Europe/Berlin');

    // Write test mimicking a time shift on the DST day
    const updatedEvent = {
      ...parsedEvent,
      startTime: '14:00',
      endTime: '15:00'
    };

    const handle = calendar.getEventHandle(parsedEvent);
    await calendar.updateEvent(handle!, parsedEvent, updatedEvent);

    const mockObsidian = obsidian as unknown as MockObsidian;
    const mockRewrite = mockObsidian.rewrite;
    const [, rewriteCallback] = mockRewrite.mock.calls[0] as [string, (content: string) => string];
    const file = obsidian.getFileByPath(`events/${filename}`);
    if (!file) throw new Error(`Expected file events/${filename} to exist`);
    const existingContent = await obsidian.read(file);
    const newContent = rewriteCallback(existingContent);

    expect(newContent).toContain('startTime: "14:00"');
    expect(newContent).toContain('timezone: Europe/Berlin');
  });

  it('downstream: modifies time in display TZ but provider receives preconvertd source TZ', async () => {
    // 1. Initial Local Provider Event in 'Europe/Berlin' Source TZ
    const sourceZone = 'Europe/Berlin';

    // 2. The User views the calendar in 'America/New_York' (Display TZ).
    // Berlin is UTC+2 in May. NY is UTC-4 in May. A 6-hour difference.
    // So 10:00 Berlin = 04:00 NY.
    // User drags the event in the UI to 09:00 NY time.
    // The UI (FullCalendar) fires an `eventDrop` with `event.start` representing 09:00 NY (which is 15:00 Berlin).

    // Create a mock FullCalendar EventApi object representing the dropped state.
    // Absolute time: 09:00 NY = 13:00 UTC = 15:00 Berlin
    const newStartUTC = new Date(Date.UTC(2024, 4, 15, 13, 0, 0)); // Month is 0-indexed in JS Dates
    const newEndUTC = new Date(Date.UTC(2024, 4, 15, 14, 0, 0));

    const mockEventApi: Partial<EventApi> = {
      title: 'Downstream TZ Test',
      start: newStartUTC,
      end: newEndUTC,
      allDay: false,
      extendedProps: {
        sourceTimezone: sourceZone, // Interop layers preserve source TZ in extended props
        uid: 'test-tz-UID-123',
        cleanTitle: 'Downstream TZ Test'
      }
    };

    // 3. System Interop converts FC's UI event back to an internal OFCEvent using the source TZ
    // We explicitly mock the downstream interop extraction utilizing explicit Luxon boundaries:
    const startLux = DateTime.fromJSDate(mockEventApi.start as Date, { zone: sourceZone });
    const endLux = DateTime.fromJSDate(mockEventApi.end as Date, { zone: sourceZone });

    const convertedEvent: Partial<OFCEvent> = {
      title: mockEventApi.title as string,
      allDay: false,
      date: startLux.toISODate() as string,
      startTime: startLux.toFormat('HH:mm'),
      endTime: endLux.toFormat('HH:mm'),
      timezone: sourceZone
    };

    // Assert that intermediate conversion exactly targets the source TZ, not display TZ or UTC.
    expect(convertedEvent.startTime).toBe('15:00');
    expect(convertedEvent.timezone).toBe(sourceZone);

    // 4. Finally, verify the Local Provider natively respects and stores this converted source TZ string
    const obsidian = makeApp(MockAppBuilder.make().done());
    const calendar = new FullNoteProvider(
      { directory: dirName, id: 'local_1' },
      makePlugin(),
      obsidian
    );

    (obsidian.create as jest.Mock).mockReturnValue({
      path: `${dirName}/2024-05-15 Downstream TZ Test.md`
    });

    await calendar.createEvent(convertedEvent as OFCEvent);

    const mockObsidian = obsidian as unknown as MockObsidian;
    expect(mockObsidian.create).toHaveBeenCalledTimes(1);
    const [, content] = mockObsidian.create.mock.calls[0] as [string, string];

    // Assert file frontmatter commits the pure source timezone properties and localized HH:mm
    expect(content).toContain('startTime: "15:00"');
    expect(content).toContain('timezone: "Europe/Berlin"');
  });

  describe('toggleComplete tests', () => {
    let mockCache: {
      getEventById: jest.Mock;
      updateEventWithId: jest.Mock;
    };

    beforeEach(() => {
      mockCache = {
        getEventById: jest.fn(),
        updateEventWithId: jest.fn().mockResolvedValue(undefined)
      };

      (PluginState as unknown as { getCache: () => typeof mockCache }).getCache = () => mockCache;
    });

    afterEach(() => {
      PluginState.clear();
    });

    it('should update completed to boolean true when taskCompletionStyle is boolean', async () => {
      const obsidian = makeApp(MockAppBuilder.make().done());
      const calendar = new FullNoteProvider(
        { directory: dirName, id: 'local_1', taskCompletionStyle: 'boolean' },
        makePlugin(),
        obsidian
      );

      const mockEvent = {
        type: 'single',
        title: 'Test Task',
        date: '2024-05-15',
        completed: false
      };
      mockCache.getEventById.mockReturnValue(mockEvent);

      const result = await calendar.toggleComplete('event_1', true);
      expect(result).toBe(true);
      expect(mockCache.getEventById).toHaveBeenCalledWith('event_1');
      expect(mockCache.updateEventWithId).toHaveBeenCalledTimes(1);
      const updatedEvent = (mockCache.updateEventWithId.mock.calls[0] as [string, OFCEvent])[1];
      expect(updatedEvent.type).toBe('single');
      if (updatedEvent.type === 'single') {
        expect(updatedEvent.completed).toBe(true);
      }
    });

    it('should update completed to ISO string when taskCompletionStyle is datetime', async () => {
      const obsidian = makeApp(MockAppBuilder.make().done());
      const calendar = new FullNoteProvider(
        { directory: dirName, id: 'local_1', taskCompletionStyle: 'datetime' },
        makePlugin(),
        obsidian
      );

      const mockEvent = {
        type: 'single',
        title: 'Test Task',
        date: '2024-05-15',
        completed: false
      };
      mockCache.getEventById.mockReturnValue(mockEvent);

      const result = await calendar.toggleComplete('event_1', true);
      expect(result).toBe(true);
      expect(mockCache.getEventById).toHaveBeenCalledWith('event_1');
      expect(mockCache.updateEventWithId).toHaveBeenCalledTimes(1);
      const updatedEvent = (mockCache.updateEventWithId.mock.calls[0] as [string, OFCEvent])[1];
      expect(updatedEvent.type).toBe('single');
      if (updatedEvent.type === 'single') {
        expect(typeof updatedEvent.completed).toBe('string');
        expect(updatedEvent.completed).not.toBe('');
      }
    });

    it('should toggle complete to false when isDone is false regardless of style', async () => {
      const obsidian = makeApp(MockAppBuilder.make().done());
      const calendar = new FullNoteProvider(
        { directory: dirName, id: 'local_1', taskCompletionStyle: 'boolean' },
        makePlugin(),
        obsidian
      );

      const mockEvent = {
        type: 'single',
        title: 'Test Task',
        date: '2024-05-15',
        completed: true
      };
      mockCache.getEventById.mockReturnValue(mockEvent);

      const result = await calendar.toggleComplete('event_1', false);
      expect(result).toBe(true);
      expect(mockCache.getEventById).toHaveBeenCalledWith('event_1');
      expect(mockCache.updateEventWithId).toHaveBeenCalledTimes(1);
      const updatedEvent = (mockCache.updateEventWithId.mock.calls[0] as [string, OFCEvent])[1];
      expect(updatedEvent.type).toBe('single');
      if (updatedEvent.type === 'single') {
        expect(updatedEvent.completed).toBe(false);
      }
    });

    it('loads event from note file even when frontmatter has unquoted colon in title and metadataCache returned null', async () => {
      const filename = '2026-08-11 Super Event.md';

      const app = MockAppBuilder.make()
        .folder(
          new MockAppBuilder(dirName).file(
            filename,
            new FileBuilder()
              .frontmatter({ title: 'Super: Event', date: '2026-08-11', allDay: true })
              .text('Body text')
          )
        )
        .done();

      const obsidian = makeApp(app);
      // Simulate Obsidian metadataCache failing to parse invalid YAML frontmatter
      (obsidian.getMetadata as jest.Mock).mockReturnValue(null);
      (obsidian.waitForMetadata as jest.Mock).mockResolvedValue(null);

      const calendar = new FullNoteProvider(
        { directory: dirName, id: 'local_1' },
        makePlugin(),
        obsidian
      );

      const file = obsidian.getFileByPath(`${dirName}/${filename}`);
      expect(file).not.toBeNull();

      const events = await calendar.getEventsInFile(file!);
      expect(events).toHaveLength(1);
      expect(events[0][0]).toEqual(
        expect.objectContaining({
          title: 'Super: Event',
          date: '2026-08-11',
          allDay: true
        })
      );
    });
  });
});
