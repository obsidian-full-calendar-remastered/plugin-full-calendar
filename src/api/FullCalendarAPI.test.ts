/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-floating-promises */
import { PublicAPI, InternalAPI } from './FullCalendarAPI';
import { PluginState } from '../core/PluginState';
import { FullCalendarSettings } from '../types/settings';

// Mock Obsidian modules
jest.mock(
  'obsidian',
  () => ({
    App: jest.fn(),
    Modal: jest.fn().mockImplementation(() => ({
      open: jest.fn(),
      close: jest.fn()
    })),
    PluginSettingTab: jest.fn(),
    Setting: jest.fn().mockImplementation(() => ({
      setName: jest.fn().mockReturnThis(),
      setDesc: jest.fn().mockReturnThis(),
      addDropdown: jest.fn().mockReturnThis(),
      addExtraButton: jest.fn().mockReturnThis(),
      addText: jest.fn().mockReturnThis(),
      addToggle: jest.fn().mockReturnThis()
    })),
    DropdownComponent: jest.fn(),
    TextComponent: jest.fn(),
    ToggleComponent: jest.fn(),
    setIcon: jest.fn(),
    normalizePath: (p: string) => p,
    Platform: {
      isMobile: false
    },
    ItemView: jest.fn(),
    WorkspaceLeaf: jest.fn(),
    TFile: jest.fn(),
    TFolder: jest.fn(),
    Menu: jest.fn(),
    activeDocument: typeof document !== 'undefined' ? document : undefined
  }),
  { virtual: true }
);

// Mock i18n
jest.mock('../features/i18n/i18n', () => ({
  t: jest.fn().mockImplementation((key: string) => key)
}));

describe('FullCalendarAPI Unit Tests', () => {
  let mockSettings: any;
  let mockPlugin: any;
  let mockCache: any;
  let mockRegistry: any;
  let internalApi: InternalAPI;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSettings = {
      apiTokens: {},
      authorizedTokens: {}
    };

    mockPlugin = {
      app: {
        workspace: {
          getLeavesOfType: jest.fn().mockReturnValue([])
        }
      }
    };

    mockCache = {
      getAllEvents: jest.fn().mockReturnValue([]),
      getEventById: jest.fn().mockReturnValue(null),
      addEvent: jest.fn().mockResolvedValue(true),
      updateEventWithId: jest.fn().mockResolvedValue(true),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      store: {
        getEventDetails: jest.fn().mockReturnValue(null)
      }
    };

    mockRegistry = {
      getAllSources: jest.fn().mockReturnValue([]),
      getCapabilities: jest.fn().mockReturnValue({})
    };

    PluginState.getPlugin = () => mockPlugin;
    PluginState.getSettings = () => mockSettings as FullCalendarSettings;
    PluginState.getCache = () => mockCache;
    PluginState.getProviderRegistry = () => mockRegistry;
    PluginState.saveSettings = jest.fn().mockResolvedValue(undefined);

    internalApi = new InternalAPI();
    PluginState.getInternalAPI = () => internalApi;
  });

  describe('InternalAPI', () => {
    it('should register and unregister views', () => {
      const mockView: any = { fullCalendarView: {} };
      internalApi.registerView(mockView);
      // Accessing active views is private, but we can verify it doesn't throw
      internalApi.unregisterView(mockView);
    });

    it('should query all events', () => {
      mockCache.getAllEvents.mockReturnValue([
        {
          id: 'source-1',
          events: [{ id: 'event-1', event: { title: 'Test 1', date: '2026-06-26' } }]
        }
      ]);
      mockCache.store.getEventDetails.mockReturnValue({
        event: { title: 'Test 1', date: '2026-06-26' },
        calendarId: 'source-1',
        location: null
      });

      const events = internalApi.getEvents({});
      expect(events.length).toBe(1);
      expect(events[0].id).toBe('event-1');
    });
  });

  describe('PublicAPI and AuthorizedAPI token checks', () => {
    let publicApi: PublicAPI;

    beforeEach(() => {
      publicApi = new PublicAPI(mockPlugin);
    });

    it('should return null with an invalid token', () => {
      const api = publicApi.withToken('invalid-token');
      expect(api).toBeNull();
    });

    it('should return AuthorizedAPI wrapper with a valid token and execute scoped actions', () => {
      // Setup a mock token record
      mockSettings.apiTokens['test-token'] = {
        pluginId: 'other-plugin',
        reason: 'Testing API',
        requestedScopes: ['events:read', 'events:write'],
        grantedScopes: ['events:read', 'events:write'],
        grantedAt: Date.now()
      };

      const api = publicApi.withToken('test-token');
      expect(api).not.toBeNull();

      // Call event read API
      api?.getAllEvents();
      expect(mockCache.getAllEvents).toHaveBeenCalled();

      // Call event write API
      api?.createEvent('calendar-1', {
        type: 'single',
        title: 'New',
        date: '2026-06-26',
        allDay: true,
        endDate: null
      });
      expect(mockCache.addEvent).toHaveBeenCalled();
    });

    it('should throw scope missing error if scope is not granted', () => {
      // Setup token with events:read but not events:write
      mockSettings.apiTokens['test-token'] = {
        pluginId: 'other-plugin',
        reason: 'Testing API',
        requestedScopes: ['events:read'],
        grantedScopes: ['events:read'],
        grantedAt: Date.now()
      };

      const api = publicApi.withToken('test-token');
      expect(api).not.toBeNull();

      // Calling events:read should succeed
      expect(() => api?.getAllEvents()).not.toThrow();

      // Calling events:write should throw
      expect(() =>
        api?.createEvent('calendar-1', {
          type: 'single',
          title: 'New',
          date: '2026-06-26',
          allDay: true,
          endDate: null
        })
      ).toThrow('Full Calendar API: Missing required scope: events:write');
    });
  });
});
