import { recordMilestoneAction, getMilestoneCards, getLifetimeMilestoneStats } from './milestones';
import { PluginState } from '../../core/PluginState';
import { FullCalendarSettings } from '../../types/settings';
import type { ProviderRegistry } from '../../providers/ProviderRegistry';
import type EventCache from '../../core/EventCache';

// Mock Obsidian modules
jest.mock(
  'obsidian',
  () => ({
    App: jest.fn(),
    setIcon: jest.fn(),
    Platform: {
      isMobile: false
    }
  }),
  { virtual: true }
);

// Mock translation module
jest.mock('../i18n/i18n', () => ({
  t: jest.fn().mockImplementation((key: string) => key)
}));

describe('Milestones Feature Unit Tests', () => {
  let mockSettings: {
    milestones: {
      counters: Record<string, number>;
      unlockedAt: Record<string, number>;
      shown: Record<string, number>;
    };
    dev: number;
    calendarSources: Array<{ id: string; type: string }>;
  };
  let mockPersistData: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSettings = {
      milestones: {
        counters: {},
        unlockedAt: {},
        shown: {}
      },
      dev: 0,
      calendarSources: [{ id: 'local-1', type: 'local' }]
    };

    PluginState.getSettings = () => mockSettings as unknown as FullCalendarSettings;
    mockPersistData = jest.fn().mockResolvedValue(undefined);
    PluginState.persistData = mockPersistData;

    const mockRegistry = {
      getSource: jest.fn().mockReturnValue({ type: 'local' })
    };
    PluginState.getProviderRegistry = () => mockRegistry as unknown as ProviderRegistry;

    const mockCache = {
      getAllEvents: jest.fn().mockReturnValue([])
    };
    PluginState.getCache = () => mockCache as unknown as EventCache;
  });

  describe('recordMilestoneAction', () => {
    it('should increment created total counter', async () => {
      await recordMilestoneAction('created', 'local-1');
      const state = mockSettings.milestones;
      expect(state.counters['created.total']).toBe(1);
      expect(state.counters['created.local']).toBe(1);
    });

    it('should evaluate and trigger unlocks when milestones targets are met', async () => {
      // Simulate meeting milestone targets for 100 created events
      mockSettings.milestones.counters['created.total'] = 99;

      await recordMilestoneAction('created', 'local-1');

      const state = mockSettings.milestones;
      expect(state.counters['created.total']).toBe(100);
      expect(state.unlockedAt['created.total.100']).toBeDefined();
      expect(state.shown['created.total.100']).toBe(1);
      const persistDataMock = mockPersistData;
      expect(persistDataMock).toHaveBeenCalled();
    });
  });

  describe('getMilestoneCards', () => {
    it('should list all milestone definitions with their lock/unlock states', () => {
      mockSettings.milestones.counters['created.total'] = 10;
      const cards = getMilestoneCards();

      // Find a specific milestone card e.g. createdCentury (target 100)
      const centuryCard = cards.find(c => c.id === 'created.total.100');
      expect(centuryCard).toBeDefined();
      expect(centuryCard?.current).toBe(10);
      expect(centuryCard?.percent).toBe(10); // 10 / 100 * 100
      expect(centuryCard?.unlocked).toBe(false);
    });
  });

  describe('getLifetimeMilestoneStats', () => {
    it('should aggregate actions across provider types', () => {
      mockSettings.milestones.counters['created.total'] = 5;
      mockSettings.milestones.counters['updated.total'] = 2;
      mockSettings.milestones.counters['created.local'] = 5;

      const stats = getLifetimeMilestoneStats();
      expect(stats.operations.created).toBe(5);
      expect(stats.operations.updated).toBe(2);
      expect(stats.operationsByCalendarType['local'].created).toBe(5);
    });
  });
});
