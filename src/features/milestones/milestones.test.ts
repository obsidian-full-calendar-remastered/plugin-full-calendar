/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/unbound-method */
import { recordMilestoneAction, getMilestoneCards, getLifetimeMilestoneStats } from './milestones';
import { PluginState } from '../../core/PluginState';
import { FullCalendarSettings } from '../../types/settings';

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
  let mockSettings: any;

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

    PluginState.getSettings = () => mockSettings as FullCalendarSettings;
    PluginState.persistData = jest.fn().mockResolvedValue(undefined);

    const mockRegistry = {
      getSource: jest.fn().mockReturnValue({ type: 'local' })
    };
    PluginState.getProviderRegistry = () => mockRegistry as any;

    const mockCache = {
      getAllEvents: jest.fn().mockReturnValue([])
    };
    PluginState.getCache = () => mockCache as any;
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
      expect(PluginState.persistData).toHaveBeenCalled();
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
