/**
 * @file TasksLifecycle.test.ts
 * @brief Tests for Tasks Provider lifecycle management fixes
 *
 * @description
 * This test suite verifies that the Tasks Backlog Manager lifecycle is properly
 * managed both during startup (with pre-existing Tasks calendars) and during
 * runtime (when Tasks calendars are added/removed).
 *
 * @license See LICENSE.md
 */

import FullCalendarPlugin from '../../../main';
import { ProviderRegistry } from '../../ProviderRegistry';

// Mock the TaskBacklogManager to avoid CSS/import issues
const mockTaskBacklogManager = {
  getIsLoaded: jest.fn(),
  onload: jest.fn(),
  onunload: jest.fn()
};

// Mock the TaskBacklogManager constructor
jest.mock('../../../features/task-backlogs/TaskBacklogManager', () => ({
  TaskBacklogManager: jest.fn().mockImplementation(() => mockTaskBacklogManager)
}));

// Mock the plugin
const createMockPlugin = () => {
  const mockPlugin = {
    app: {
      workspace: {
        on: jest.fn(),
        off: jest.fn()
      }
    },
    settings: {
      calendarSources: []
    }
  } as unknown as FullCalendarPlugin;

  return mockPlugin;
};

describe('Tasks Provider Lifecycle Management', () => {
  let providerRegistry: ProviderRegistry;
  let mockPlugin: FullCalendarPlugin;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPlugin = createMockPlugin();
    providerRegistry = new ProviderRegistry(mockPlugin);
  });

  describe('syncBacklogManagerLifecycle', () => {
    it('should load backlog when Tasks provider is available', () => {
      // Mock that a task backlog provider exists
      const spy = jest.spyOn(providerRegistry, 'getTaskBacklogProviders').mockReturnValue([
        {} as ReturnType<ProviderRegistry['getTaskBacklogProviders']>[number]
      ]);
      mockTaskBacklogManager.getIsLoaded.mockReturnValue(false);

      providerRegistry.syncBacklogManagerLifecycle();

      expect(spy).toHaveBeenCalled();
      expect(mockTaskBacklogManager.getIsLoaded).toHaveBeenCalled();
      expect(mockTaskBacklogManager.onload).toHaveBeenCalled();
      expect(mockTaskBacklogManager.onunload).not.toHaveBeenCalled();
    });

    it('should not load backlog if already loaded', () => {
      // Mock that a task backlog provider exists and backlog is already loaded
      const spy = jest.spyOn(providerRegistry, 'getTaskBacklogProviders').mockReturnValue([
        {} as ReturnType<ProviderRegistry['getTaskBacklogProviders']>[number]
      ]);
      mockTaskBacklogManager.getIsLoaded.mockReturnValue(true);

      providerRegistry.syncBacklogManagerLifecycle();

      expect(spy).toHaveBeenCalled();
      expect(mockTaskBacklogManager.getIsLoaded).toHaveBeenCalled();
      expect(mockTaskBacklogManager.onload).not.toHaveBeenCalled();
      expect(mockTaskBacklogManager.onunload).not.toHaveBeenCalled();
    });

    it('should unload backlog when no Tasks provider is available', () => {
      // Mock that no task backlog provider exists but backlog is loaded
      const spy = jest.spyOn(providerRegistry, 'getTaskBacklogProviders').mockReturnValue([]);
      mockTaskBacklogManager.getIsLoaded.mockReturnValue(true);

      providerRegistry.syncBacklogManagerLifecycle();

      expect(spy).toHaveBeenCalled();
      expect(mockTaskBacklogManager.getIsLoaded).toHaveBeenCalled();
      expect(mockTaskBacklogManager.onunload).toHaveBeenCalled();
      expect(mockTaskBacklogManager.onload).not.toHaveBeenCalled();
    });

    it('should not unload backlog if already unloaded', () => {
      // Mock that no task backlog provider exists and backlog is already unloaded
      const spy = jest.spyOn(providerRegistry, 'getTaskBacklogProviders').mockReturnValue([]);
      mockTaskBacklogManager.getIsLoaded.mockReturnValue(false);

      providerRegistry.syncBacklogManagerLifecycle();

      expect(spy).toHaveBeenCalled();
      expect(mockTaskBacklogManager.getIsLoaded).toHaveBeenCalled();
      expect(mockTaskBacklogManager.onload).not.toHaveBeenCalled();
      expect(mockTaskBacklogManager.onunload).not.toHaveBeenCalled();
    });
  });

  describe('Integration with startup flow', () => {
    it('should ensure syncBacklogManagerLifecycle is callable from main.ts', () => {
      // This test ensures the method exists and is public
      expect(typeof providerRegistry.syncBacklogManagerLifecycle).toBe('function');
    });
  });
});
