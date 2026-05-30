/**
 * @jest-environment jsdom
 */
import { HolidayProvider } from './HolidayProvider';
import FullCalendarPlugin from '../../main';
import { PluginState } from '../../core/PluginState';
import { OFCEvent } from '../../types';

jest.mock('../../core/PluginState');
jest.mock('../../utils/showNotice');
jest.mock('./holidays-custom', () => ({
  ensureHolidaysLoaded: jest.fn().mockResolvedValue(undefined),
  HolidaysProxy: jest.fn().mockImplementation(() => ({
    init: jest.fn(),
    getHolidays: jest.fn().mockReturnValue([
      {
        date: '2026-05-08 00:00:00',
        name: 'Den vítězství',
        type: 'public'
      }
    ])
  }))
}));

interface MockVault {
  getAbstractFileByPath: jest.Mock;
  create: jest.Mock;
  loadLocalStorage?: jest.Mock;
  saveLocalStorage?: jest.Mock;
}

interface MockMetadataCache {
  getFileCache: jest.Mock;
  on: jest.Mock;
  offref: jest.Mock;
}

interface MockApp {
  vault: MockVault;
  metadataCache: MockMetadataCache;
  loadLocalStorage: jest.Mock;
  saveLocalStorage: jest.Mock;
}

interface MockCreatedFile {
  path: string;
  content: string;
}

describe('HolidayProvider Tests', () => {
  let mockPlugin: { app: MockApp };
  let mockApp: MockApp;
  let provider: HolidayProvider;

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
      },
      loadLocalStorage: jest.fn().mockReturnValue(null),
      saveLocalStorage: jest.fn()
    };
    mockPlugin = { app: mockApp };
    provider = new HolidayProvider(
      {
        id: 'holidays_1',
        name: 'Holidays',
        country: 'CZ',
        holidayTypes: 'public',
        display: 'block'
      },
      mockPlugin as unknown as FullCalendarPlugin
    );
  });

  describe('Initialization', () => {
    it('should initialize with linkedNoteIndex', () => {
      expect(provider.linkedNoteIndex).toBeDefined();
    });
  });

  describe('_toOFCEvent mapping', () => {
    it('should set both id and uid to ensure robust index resolution', () => {
      const holiday = {
        date: '2026-05-08 00:00:00',
        name: 'Den vítězství',
        type: 'public'
      };
      const event = (
        provider as unknown as {
          _toOFCEvent: (holiday: unknown) => OFCEvent;
        }
      )._toOFCEvent(holiday);
      expect(event.id).toBe('date-holidays:2026-05-08:Den vítězství');
      expect(event.uid).toBe('date-holidays:2026-05-08:Den vítězství');
      expect(event.title).toBe('Den vítězství');
    });
  });

  describe('createLinkedNote', () => {
    const mockEvent: OFCEvent = {
      title: 'Den vítězství',
      type: 'single',
      date: '2026-05-08',
      endDate: null,
      allDay: true,
      uid: 'date-holidays:2026-05-08:Den vítězství',
      id: 'date-holidays:2026-05-08:Den vítězství'
    };

    it('should create linked note with event title and correct frontmatter', async () => {
      PluginState.getSettings = jest.fn().mockReturnValue({
        linkedNotesDirectory: 'Calendar/Notes',
        linkedNoteTemplate: ''
      });

      const file = (await provider.createLinkedNote(mockEvent)) as MockCreatedFile | null;
      expect(file).toBeDefined();
      expect(file!.path).toBe('Calendar/Notes/Den vítězství.md');
      expect(file!.content).toContain('fc-event-uid: date-holidays:2026-05-08:Den vítězství');
      expect(file!.content).toContain('fc-calendar-id: holidays_1');
    });
  });

  describe('Cache Fallback Resolution', () => {
    it('should successfully match cached events lacking the uid field by falling back to event.id', async () => {
      const cachedEventWithoutUid: OFCEvent = {
        title: 'Den vítězství',
        type: 'single',
        date: '2026-05-08',
        endDate: null,
        allDay: true,
        id: 'date-holidays:2026-05-08:Den vítězství'
      };

      const mockFile = { path: 'Calendar/Notes/Den vítězství.md' };
      provider.linkedNoteIndex.getFileForEvent = jest.fn().mockImplementation((uid: string) => {
        if (uid === 'date-holidays:2026-05-08:Den vítězství') {
          return mockFile;
        }
        return null;
      });

      (
        provider as unknown as {
          _readCache: jest.Mock;
        }
      )._readCache = jest.fn().mockReturnValue([cachedEventWithoutUid]);

      const events = await provider.getEvents({
        start: new Date('2026-05-01'),
        end: new Date('2026-05-15')
      });

      expect(events.length).toBe(1);
      const [, location] = events[0];
      expect(location).toBeDefined();
      expect(location!.file.path).toBe('Calendar/Notes/Den vítězství.md');
    });
  });
});
