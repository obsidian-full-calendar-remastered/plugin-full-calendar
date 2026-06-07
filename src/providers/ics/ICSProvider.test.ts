/**
 * @jest-environment jsdom
 */
import { ICSProvider } from './ICSProvider';
import FullCalendarPlugin from '../../main';
import { PluginState } from '../../core/PluginState';
import { OFCEvent } from '../../types';
import { TFile } from 'obsidian';

jest.mock('../../core/PluginState');
jest.mock('../../utils/showNotice');

interface MockVault {
  getAbstractFileByPath: jest.Mock;
  getFileByPath: jest.Mock;
  create: jest.Mock;
  read: jest.Mock;
  modify: jest.Mock;
}

interface MockMetadataCache {
  getFileCache: jest.Mock;
  on: jest.Mock;
  offref: jest.Mock;
}

interface MockApp {
  vault: MockVault;
  metadataCache: MockMetadataCache;
}

interface MockCreatedFile {
  path: string;
  content: string;
}

describe('ICSProvider Configuration Wrapper', () => {
  it('should propagate settings correctly from the static component wrapper', () => {
    const ConfigComponent = ICSProvider.getConfigurationComponent();
    expect(ConfigComponent).toBeDefined();
  });
});

describe('ICSProvider createLinkedNote', () => {
  let mockPlugin: { app: MockApp };
  let mockApp: MockApp;
  let provider: ICSProvider;
  const mockEvent: OFCEvent = {
    title: 'ICS Linked Note Event',
    type: 'single',
    date: '2026-05-21',
    endDate: null,
    allDay: true,
    uid: 'ics-uid-123',
    description: 'Imported event description',
    location: 'Virtual Room'
  };

  beforeEach(() => {
    mockApp = {
      vault: {
        getAbstractFileByPath: jest.fn().mockReturnValue(null),
        getFileByPath: jest.fn().mockReturnValue(null),
        create: jest.fn().mockImplementation((path: string, content: string): MockCreatedFile => {
          return { path, content };
        }),
        read: jest.fn(),
        modify: jest.fn()
      },
      metadataCache: {
        getFileCache: jest.fn(),
        on: jest.fn(),
        offref: jest.fn()
      }
    };
    mockPlugin = { app: mockApp };
    provider = new ICSProvider(
      {
        id: 'ics_1',
        url: 'https://example.com/calendar.ics'
      },
      mockPlugin as unknown as FullCalendarPlugin
    );
  });

  it('should fall back to DEFAULT_TEMPLATE when linkedNoteTemplate setting is blank', async () => {
    PluginState.getSettings = jest.fn().mockReturnValue({
      linkedNotesDirectory: 'Calendar/Notes',
      linkedNoteTemplate: ''
    });

    const file = (await provider.createLinkedNote(mockEvent)) as MockCreatedFile | null;
    expect(file).toBeDefined();
    expect(file!.path).toBe('Calendar/Notes/ICS Linked Note Event.md');
    expect(file!.content).toContain('# ICS Linked Note Event');
    expect(file!.content).toContain('**Calendar**: Remote Calendar (ICS)');
    expect(file!.content).toContain('fc-event-uid: "ics-uid-123"');
  });

  it('should use custom template when linkedNoteTemplate setting is provided', async () => {
    PluginState.getSettings = jest.fn().mockReturnValue({
      linkedNotesDirectory: 'Calendar/Notes',
      linkedNoteTemplate: 'ICS Custom: {{title}}'
    });

    const file = (await provider.createLinkedNote(mockEvent)) as MockCreatedFile | null;
    expect(file).toBeDefined();
    expect(file!.path).toBe('Calendar/Notes/ICS Linked Note Event.md');
    expect(file!.content).toContain('ICS Custom: ICS Linked Note Event');
  });

  it('creates one shared title-based note for recurring occurrences in name mode', async () => {
    PluginState.getSettings = jest.fn().mockReturnValue({
      linkedNotesDirectory: 'Calendar/Notes',
      linkedNoteTemplate: '',
      linkedNoteLinkStrategy: 'name'
    });
    const recurringEvent: OFCEvent = {
      title: 'Five Day Project',
      type: 'rrule',
      startDate: '2026-03-21',
      endDate: null,
      rrule: 'FREQ=DAILY;COUNT=5',
      skipDates: [],
      allDay: true,
      isTask: true,
      uid: 'project-series'
    };
    const lookup = jest
      .spyOn(provider.linkedNoteIndex, 'getFileForEventAfterHydration')
      .mockResolvedValue(null);

    const file = (await provider.createLinkedNote(
      recurringEvent,
      '2026-03-23'
    )) as MockCreatedFile | null;

    expect(file!.path).toBe('Calendar/Notes/Five Day Project.md');
    expect(file!.content).not.toContain('fc-event-recurrence-id');
    expect(lookup).toHaveBeenCalledWith('project-series', undefined);
  });

  it('keeps separate occurrence notes in deadline mode', async () => {
    PluginState.getSettings = jest.fn().mockReturnValue({
      linkedNotesDirectory: 'Calendar/Notes',
      linkedNoteTemplate: '',
      linkedNoteLinkStrategy: 'deadline'
    });
    const recurringEvent: OFCEvent = {
      title: 'Five Day Project',
      type: 'rrule',
      startDate: '2026-03-21',
      endDate: null,
      rrule: 'FREQ=DAILY;COUNT=5',
      skipDates: [],
      allDay: true,
      isTask: true,
      uid: 'project-series'
    };

    const file = (await provider.createLinkedNote(
      recurringEvent,
      '2026-03-23'
    )) as MockCreatedFile | null;

    expect(file!.path).toBe('Calendar/Notes/Five Day Project 2026-03-23.md');
    expect(file!.content).toContain('fc-event-recurrence-id: "2026-03-23"');
  });

  it('reuses an existing exact-title file in name mode without adding a suffix', async () => {
    PluginState.getSettings = jest.fn().mockReturnValue({
      linkedNotesDirectory: 'Calendar/Notes',
      linkedNoteTemplate: '',
      linkedNoteLinkStrategy: 'name'
    });
    const existingFile = new TFile();
    existingFile.name = 'ICS Linked Note Event.md';
    const existingContents = '---\ncustom: keep-me\n---\nExisting project notes.';
    let updatedContents = existingContents;
    mockApp.vault.getFileByPath.mockReturnValue(existingFile);
    mockApp.vault.read.mockResolvedValue(existingContents);
    mockApp.vault.modify.mockImplementation((_file: TFile, contents: string) => {
      updatedContents = contents;
      return Promise.resolve();
    });

    const file = await provider.createLinkedNote(mockEvent);

    expect(file).toBe(existingFile);
    expect(mockApp.vault.getFileByPath).toHaveBeenCalledWith(
      'Calendar/Notes/ICS Linked Note Event.md'
    );
    expect(mockApp.vault.create).not.toHaveBeenCalled();
    expect(updatedContents).toContain('custom: keep-me');
    expect(updatedContents).toContain('fc-event-uid: "ics-uid-123"');
    expect(updatedContents).toContain('fc-calendar-id: "ics_1"');
    expect(updatedContents.endsWith('Existing project notes.')).toBe(true);
  });
});
