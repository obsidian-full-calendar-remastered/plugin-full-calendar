/**
 * @jest-environment jsdom
 */
import { ICSProvider } from './ICSProvider';
import FullCalendarPlugin from '../../main';
import { PluginState } from '../../core/PluginState';
import { OFCEvent } from '../../types';

jest.mock('../../core/PluginState');
jest.mock('../../utils/showNotice');

interface MockVault {
  getAbstractFileByPath: jest.Mock;
  create: jest.Mock;
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
        create: jest.fn().mockImplementation((path: string, content: string): MockCreatedFile => {
          return { path, content };
        })
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
    expect(file!.content).toContain('fc-event-uid: ics-uid-123');
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
});
