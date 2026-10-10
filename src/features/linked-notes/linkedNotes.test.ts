import { App, TFile, TFolder } from 'obsidian';
import { OFCEvent } from '../../types';
import { PluginState } from '../../core/PluginState';
import { LinkedNoteIndex } from '../../providers/utils/LinkedNoteIndex';
import { createLinkedNoteForProvider, openOrCreateLinkedNote } from './linkedNotes';
import FullCalendarPlugin from '../../main';

describe('linkedNotes: single event identity and rescheduling', () => {
  let mockApp: App;
  let vaultFiles: Map<
    string,
    { file: TFile; content: string; frontmatter: Record<string, unknown> }
  >;
  let mockLinkedNoteIndex: LinkedNoteIndex;
  const calendarId = 'google_1';

  const buildMockFolder = (folderPath: string): TFolder => {
    const parts = folderPath.split('/').filter(Boolean);
    let current: TFolder | null = null;
    for (const part of parts) {
      const folder = new TFolder();
      folder.name = part;
      folder.parent = current;
      current = folder;
    }
    return current || new TFolder();
  };

  beforeEach(() => {
    vaultFiles = new Map();

    const mockVault = {
      getMarkdownFiles: jest
        .fn()
        .mockImplementation(() => Array.from(vaultFiles.values()).map(v => v.file)),
      getFileByPath: jest
        .fn()
        .mockImplementation((path: string) => vaultFiles.get(path)?.file ?? null),
      getAbstractFileByPath: jest
        .fn()
        .mockImplementation((path: string) => vaultFiles.get(path)?.file ?? null),
      read: jest
        .fn()
        .mockImplementation((file: TFile) =>
          Promise.resolve(vaultFiles.get(file.path)?.content ?? '')
        ),
      modify: jest.fn().mockImplementation((file: TFile, content: string) => {
        const item = vaultFiles.get(file.path);
        if (item) {
          item.content = content;
          // Re-parse mock frontmatter
          const fm: Record<string, unknown> = {};
          const matchUid = content.match(/fc-event-uid:\s*"([^"]+)"/);
          if (matchUid) fm['fc-event-uid'] = matchUid[1];
          const matchCal = content.match(/fc-calendar-id:\s*"([^"]+)"/);
          if (matchCal) fm['fc-calendar-id'] = matchCal[1];
          const matchRecur = content.match(/fc-event-recurrence-id:\s*"([^"]+)"/);
          if (matchRecur) fm['fc-event-recurrence-id'] = matchRecur[1];
          item.frontmatter = fm;
        }
        return Promise.resolve();
      }),
      create: jest.fn().mockImplementation((path: string, content: string) => {
        const file = new TFile();
        const parts = path.split('/');
        file.name = parts.pop() || '';
        file.parent = buildMockFolder(parts.join('/'));

        const fm: Record<string, unknown> = {};
        const matchUid = content.match(/fc-event-uid:\s*"([^"]+)"/);
        if (matchUid) fm['fc-event-uid'] = matchUid[1];
        const matchCal = content.match(/fc-calendar-id:\s*"([^"]+)"/);
        if (matchCal) fm['fc-calendar-id'] = matchCal[1];
        const matchRecur = content.match(/fc-event-recurrence-id:\s*"([^"]+)"/);
        if (matchRecur) fm['fc-event-recurrence-id'] = matchRecur[1];

        vaultFiles.set(path, { file, content, frontmatter: fm });
        return Promise.resolve(file);
      }),
      on: jest.fn().mockReturnValue({ name: 'mock' }),
      offref: jest.fn()
    };

    const mockMetadataCache = {
      getFileCache: jest.fn().mockImplementation((file: TFile) => {
        const item = vaultFiles.get(file.path);
        return item ? { frontmatter: item.frontmatter } : null;
      }),
      on: jest.fn().mockReturnValue({ name: 'mock' }),
      offref: jest.fn()
    };

    mockApp = {
      vault: mockVault,
      metadataCache: mockMetadataCache,
      workspace: {
        getLeavesOfType: jest.fn().mockReturnValue([]),
        getLeaf: jest.fn().mockReturnValue({ openFile: jest.fn() }),
        onLayoutReady: jest.fn().mockImplementation((cb: () => void) => cb())
      }
    } as unknown as App;

    PluginState.getSettings = jest.fn().mockReturnValue({
      linkedNotesDirectory: 'Calendar/Notes',
      linkedNoteTemplate: '',
      linkedNoteLinkStrategy: 'deadline',
      enableLinkedNoteTemplatesPreset: false
    });

    mockLinkedNoteIndex = new LinkedNoteIndex(mockApp, calendarId);
    mockLinkedNoteIndex.initialize();

    const mockProvider = {
      linkedNoteIndex: mockLinkedNoteIndex,
      createLinkedNote: async (ev: OFCEvent, instanceDate?: string, tpl?: string) => {
        const created = await createLinkedNoteForProvider({
          app: mockApp,
          event: ev,
          calendarId,
          calendarName: 'Personal',
          linkedNoteIndex: mockLinkedNoteIndex,
          instanceDate,
          templateContentOverride: tpl
        });
        if (created) {
          mockLinkedNoteIndex.initialize();
        }
        return created;
      }
    };

    PluginState.getProviderRegistry = jest.fn().mockReturnValue({
      getInstance: (id: string) => (id === calendarId ? mockProvider : null),
      reloadProviderNow: jest.fn()
    });
  });

  it('creates clean master note without recurrence id for single events', async () => {
    const singleEvent: OFCEvent = {
      title: 'Test Meeting',
      type: 'single',
      date: '2026-09-19',
      endDate: null,
      allDay: false,
      startTime: '10:00',
      endTime: '10:30',
      uid: 'single-uid-100'
    };

    const file = await createLinkedNoteForProvider({
      app: mockApp,
      event: singleEvent,
      calendarId,
      calendarName: 'Personal',
      linkedNoteIndex: mockLinkedNoteIndex,
      instanceDate: '2026-09-19'
    });

    expect(file).toBeDefined();
    expect(file!.path).toBe('Calendar/Notes/Test Meeting.md');
    const stored = vaultFiles.get(file!.path);
    expect(stored?.frontmatter['fc-event-uid']).toBe('single-uid-100');
    expect(stored?.frontmatter['fc-calendar-id']).toBe(calendarId);
    expect(stored?.frontmatter['fc-event-recurrence-id']).toBeUndefined();
    expect(stored?.content).not.toContain('fc-event-recurrence-id');
  });

  it('maintains connection when a single event is rescheduled to a new day', async () => {
    const eventDay1: OFCEvent = {
      title: 'Project Kickoff',
      type: 'single',
      date: '2026-09-19',
      endDate: null,
      allDay: false,
      startTime: '10:00',
      endTime: '11:00',
      uid: 'single-reschedule-uid'
    };

    // 1. Initial creation on Day 1
    await openOrCreateLinkedNote(
      { app: mockApp } as unknown as FullCalendarPlugin,
      calendarId,
      eventDay1,
      true,
      '2026-09-19'
    );

    expect(vaultFiles.size).toBe(1);
    expect(vaultFiles.has('Calendar/Notes/Project Kickoff.md')).toBe(true);

    // 2. Rescheduled to Day 2
    const eventDay2: OFCEvent = {
      title: 'Project Kickoff',
      type: 'single',
      date: '2026-09-20',
      endDate: null,
      allDay: false,
      startTime: '14:00',
      endTime: '15:00',
      uid: 'single-reschedule-uid'
    };

    await openOrCreateLinkedNote(
      { app: mockApp } as unknown as FullCalendarPlugin,
      calendarId,
      eventDay2,
      true,
      '2026-09-20'
    );

    // Should NOT create duplicate note
    expect(vaultFiles.size).toBe(1);

    // 3. Rescheduled to an earlier day
    const eventDayEarlier: OFCEvent = {
      title: 'Project Kickoff',
      type: 'single',
      date: '2026-09-15',
      endDate: null,
      allDay: false,
      startTime: '09:00',
      endTime: '10:00',
      uid: 'single-reschedule-uid'
    };

    await openOrCreateLinkedNote(
      { app: mockApp } as unknown as FullCalendarPlugin,
      calendarId,
      eventDayEarlier,
      true,
      '2026-09-15'
    );

    expect(vaultFiles.size).toBe(1);
  });

  it('self-heals legacy single event note that has fc-event-recurrence-id', async () => {
    // Simulate legacy note created prior to the fix
    const legacyPath = 'Calendar/Notes/Legacy Event 2026-09-19.md';
    const legacyFile = new TFile();
    legacyFile.name = 'Legacy Event 2026-09-19.md';
    legacyFile.parent = buildMockFolder('Calendar/Notes');

    const legacyContent = `---
fc-event-uid: "legacy-uid-999"
fc-calendar-id: "google_1"
fc-event-recurrence-id: "2026-09-19"
---
# Legacy Event
`;
    vaultFiles.set(legacyPath, {
      file: legacyFile,
      content: legacyContent,
      frontmatter: {
        'fc-event-uid': 'legacy-uid-999',
        'fc-calendar-id': 'google_1',
        'fc-event-recurrence-id': '2026-09-19'
      }
    });

    mockLinkedNoteIndex.initialize();

    // The single event is now on 2026-09-20 (rescheduled)
    const rescheduledEvent: OFCEvent = {
      title: 'Legacy Event',
      type: 'single',
      date: '2026-09-20',
      endDate: null,
      allDay: true,
      uid: 'legacy-uid-999'
    };

    await openOrCreateLinkedNote(
      { app: mockApp } as unknown as FullCalendarPlugin,
      calendarId,
      rescheduledEvent,
      true,
      '2026-09-20'
    );

    // Should reuse the legacy note and NOT create a new one
    expect(vaultFiles.size).toBe(1);

    // Should scrub the legacy fc-event-recurrence-id
    const updated = vaultFiles.get(legacyPath);
    expect(updated?.content).not.toContain('fc-event-recurrence-id');
  });

  it('keeps separate occurrence notes for recurring events in deadline mode', async () => {
    const recurringEvent: OFCEvent = {
      title: 'Weekly Standup',
      type: 'recurring',
      daysOfWeek: ['M'],
      endDate: null,
      skipDates: [],
      allDay: true,
      uid: 'recurring-series-1'
    };

    const file1 = await createLinkedNoteForProvider({
      app: mockApp,
      event: recurringEvent,
      calendarId,
      calendarName: 'Personal',
      linkedNoteIndex: mockLinkedNoteIndex,
      instanceDate: '2026-09-21'
    });

    expect(file1).toBeDefined();
    expect(file1!.path).toBe('Calendar/Notes/Weekly Standup 2026-09-21.md');
    const stored1 = vaultFiles.get(file1!.path);
    expect(stored1?.frontmatter['fc-event-recurrence-id']).toBe('2026-09-21');

    mockLinkedNoteIndex.initialize();

    const file2 = await createLinkedNoteForProvider({
      app: mockApp,
      event: recurringEvent,
      calendarId,
      calendarName: 'Personal',
      linkedNoteIndex: mockLinkedNoteIndex,
      instanceDate: '2026-09-28'
    });

    expect(file2).toBeDefined();
    expect(file2!.path).toBe('Calendar/Notes/Weekly Standup 2026-09-28.md');
    expect(vaultFiles.size).toBe(2);
  });

  it('is resilient to I/O failures during legacy scrubbing and still opens note', async () => {
    const legacyPath = 'Calendar/Notes/Legacy Fail Event.md';
    const legacyContent = `---
fc-event-uid: "legacy-fail-uid"
fc-calendar-id: "google_1"
fc-event-recurrence-id: "2026-09-19"
---
# Legacy Fail`;
    const legacyFile = new TFile();
    legacyFile.name = 'Legacy Fail Event.md';
    legacyFile.parent = buildMockFolder('Calendar/Notes');
    vaultFiles.set(legacyPath, {
      file: legacyFile,
      content: legacyContent,
      frontmatter: {
        'fc-event-uid': 'legacy-fail-uid',
        'fc-calendar-id': 'google_1',
        'fc-event-recurrence-id': '2026-09-19'
      }
    });

    mockLinkedNoteIndex.initialize();

    // Force app.vault.modify to throw an error (e.g. read-only file or locked)
    (mockApp.vault.modify as jest.Mock).mockRejectedValueOnce(
      new Error('EACCES: permission denied')
    );
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const singleEvent: OFCEvent = {
      title: 'Legacy Fail Event',
      type: 'single',
      date: '2026-09-20',
      endDate: null,
      allDay: true,
      uid: 'legacy-fail-uid'
    };

    // Should NOT throw, but successfully resolve the note
    await expect(
      openOrCreateLinkedNote(
        { app: mockApp } as unknown as FullCalendarPlugin,
        calendarId,
        singleEvent,
        true,
        '2026-09-20'
      )
    ).resolves.not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to self-heal legacy recurrence ID'),
      expect.anything()
    );
    warnSpy.mockRestore();
  });
});
