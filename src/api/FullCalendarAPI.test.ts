import { PublicAPI, InternalAPI } from './FullCalendarAPI';
import { PluginState } from '../core/PluginState';
import { FullCalendarSettings } from '../types/settings';
import type FullCalendarPlugin from '../main';
import type EventCache from '../core/EventCache';
import type { ProviderRegistry } from '../providers/ProviderRegistry';
import type { CalendarView } from '../ui/view';

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
  let mockSettings: {
    apiTokens: Record<string, unknown>;
    authorizedTokens: Record<string, unknown>;
  };
  let mockPlugin: {
    app: {
      workspace: {
        getLeavesOfType: jest.Mock;
        getLeaf: jest.Mock;
        getRightLeaf: jest.Mock;
        revealLeaf: jest.Mock;
        setActiveLeaf: jest.Mock;
      };
    };
  };
  let mockCache: {
    getAllEvents: jest.Mock;
    getEventById: jest.Mock;
    addEvent: jest.Mock;
    updateEventWithId: jest.Mock;
    deleteEvent: jest.Mock;
    store: { getEventDetails: jest.Mock };
  };
  let mockRegistry: { getAllSources: jest.Mock; getCapabilities: jest.Mock };
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
          getLeavesOfType: jest.fn().mockReturnValue([]),
          getLeaf: jest.fn(),
          getRightLeaf: jest.fn(),
          revealLeaf: jest.fn().mockResolvedValue(undefined),
          setActiveLeaf: jest.fn()
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

    PluginState.getPlugin = () => mockPlugin as unknown as FullCalendarPlugin;
    PluginState.getSettings = () => mockSettings as FullCalendarSettings;
    PluginState.getCache = () => mockCache as unknown as EventCache;
    PluginState.getProviderRegistry = () => mockRegistry as unknown as ProviderRegistry;
    PluginState.saveSettings = jest.fn().mockResolvedValue(undefined);

    internalApi = new InternalAPI();
    PluginState.getInternalAPI = () => internalApi;
  });

  describe('InternalAPI', () => {
    it('should register and unregister views', () => {
      const mockView: { fullCalendarView: Record<string, unknown> } = { fullCalendarView: {} };
      internalApi.registerView(mockView as unknown as CalendarView);
      // Accessing active views is private, but we can verify it doesn't throw
      internalApi.unregisterView(mockView as unknown as CalendarView);
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

    it('should create and activate a new tab leaf when openCalendar is called with no existing leaves', async () => {
      const mockLeaf = {
        setViewState: jest.fn().mockResolvedValue(undefined)
      };
      mockPlugin.app.workspace.getLeavesOfType.mockReturnValue([]);
      mockPlugin.app.workspace.getLeaf.mockReturnValue(mockLeaf);

      await internalApi.openCalendar();

      expect(mockPlugin.app.workspace.getLeaf).toHaveBeenCalledWith('tab');
      expect(mockLeaf.setViewState).toHaveBeenCalledWith({
        type: 'full-calendar-view',
        active: true
      });
      expect(mockPlugin.app.workspace.revealLeaf).not.toHaveBeenCalled();
    });

    it('should reveal and focus the existing leaf when openCalendar is called and a leaf already exists', async () => {
      const existingLeaf = {
        view: { inSidebar: false }
      };
      mockPlugin.app.workspace.getLeavesOfType.mockReturnValue([existingLeaf]);

      await internalApi.openCalendar();

      expect(mockPlugin.app.workspace.getLeaf).not.toHaveBeenCalled();
      expect(mockPlugin.app.workspace.revealLeaf).toHaveBeenCalledWith(existingLeaf);
      expect(mockPlugin.app.workspace.setActiveLeaf).toHaveBeenCalledWith(existingLeaf, {
        focus: true
      });
    });

    it('should create and reveal a right leaf when openSidebar is called with no existing sidebar leaves', async () => {
      const mockSidebarLeaf = {
        setViewState: jest.fn().mockResolvedValue(undefined)
      };
      mockPlugin.app.workspace.getLeavesOfType.mockReturnValue([]);
      mockPlugin.app.workspace.getRightLeaf.mockReturnValue(mockSidebarLeaf);

      await internalApi.openSidebar();

      expect(mockPlugin.app.workspace.getRightLeaf).toHaveBeenCalledWith(false);
      expect(mockSidebarLeaf.setViewState).toHaveBeenCalledWith({
        type: 'full-calendar-sidebar-view'
      });
      expect(mockPlugin.app.workspace.revealLeaf).toHaveBeenCalledWith(mockSidebarLeaf);
      expect(mockPlugin.app.workspace.setActiveLeaf).toHaveBeenCalledWith(mockSidebarLeaf, {
        focus: true
      });
    });

    it('should reveal and focus the existing sidebar leaf when openSidebar is called and leaf already exists', async () => {
      const existingSidebarLeaf = {
        view: { inSidebar: true }
      };
      mockPlugin.app.workspace.getLeavesOfType.mockReturnValue([existingSidebarLeaf]);

      await internalApi.openSidebar();

      expect(mockPlugin.app.workspace.getRightLeaf).not.toHaveBeenCalled();
      expect(mockPlugin.app.workspace.revealLeaf).toHaveBeenCalledWith(existingSidebarLeaf);
      expect(mockPlugin.app.workspace.setActiveLeaf).toHaveBeenCalledWith(existingSidebarLeaf, {
        focus: true
      });
    });
  });

  describe('PublicAPI and AuthorizedAPI token checks', () => {
    let publicApi: PublicAPI;

    beforeEach(() => {
      publicApi = new PublicAPI(mockPlugin as unknown as FullCalendarPlugin);
    });

    it('should return null with an invalid token', () => {
      const api = publicApi.withToken('invalid-token');
      expect(api).toBeNull();
    });

    it('should reject prototype properties as tokens and return null', () => {
      const api = publicApi.withToken('toString');
      expect(api).toBeNull();

      const api2 = publicApi.withToken('constructor');
      expect(api2).toBeNull();

      const api3 = publicApi.withToken('__proto__');
      expect(api3).toBeNull();
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
      void api?.createEvent('calendar-1', {
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
