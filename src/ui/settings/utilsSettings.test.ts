import { migrateAndSanitizeSettings } from './utilsSettings';
import { DEFAULT_SETTINGS } from '../../types/settings';

// Mock Obsidian modules that may be imported transitively
jest.mock('obsidian', () => ({
  Notice: class {},
  normalizePath: (p: string) => p
}));

jest.mock('../../utils/showNotice', () => ({
  showNotice: jest.fn()
}));

jest.mock('../../features/i18n/i18n', () => ({
  t: (key: string) => key
}));

describe('utilsSettings - migrateAndSanitizeSettings', () => {
  it('should preserve existing milestone settings', () => {
    const rawSettings = {
      ...DEFAULT_SETTINGS,
      milestones: {
        counters: { 'created.total': 42 },
        unlockedAt: { 'created.total.100': 1234567890 },
        shown: { 'created.total.100': 1 }
      },
      enableMonthlyStatsReport: false,
      lastMonthlyMilestonesGeneratedMonth: '2026-05',
      lastMonthlyMilestonesCheckDate: '2026-06-01'
    };

    const { settings } = migrateAndSanitizeSettings(rawSettings);

    expect(settings.milestones).toEqual({
      counters: { 'created.total': 42 },
      unlockedAt: { 'created.total.100': 1234567890 },
      shown: { 'created.total.100': 1 }
    });
    expect(settings.enableMonthlyStatsReport).toBe(false);
    expect(settings.lastMonthlyMilestonesGeneratedMonth).toBe('2026-05');
    expect(settings.lastMonthlyMilestonesCheckDate).toBe('2026-06-01');
  });

  it('should fallback to defaults when milestone settings are missing', () => {
    const rawSettings = { ...DEFAULT_SETTINGS } as Partial<typeof DEFAULT_SETTINGS>;
    delete rawSettings.milestones;
    delete rawSettings.enableMonthlyStatsReport;
    delete rawSettings.lastMonthlyMilestonesGeneratedMonth;
    delete rawSettings.lastMonthlyMilestonesCheckDate;

    const { settings } = migrateAndSanitizeSettings(rawSettings);

    expect(settings.milestones).toEqual({
      counters: {},
      unlockedAt: {},
      shown: {}
    });
    expect(settings.enableMonthlyStatsReport).toBe(DEFAULT_SETTINGS.enableMonthlyStatsReport);
    expect(settings.lastMonthlyMilestonesGeneratedMonth).toBe(
      DEFAULT_SETTINGS.lastMonthlyMilestonesGeneratedMonth
    );
    expect(settings.lastMonthlyMilestonesCheckDate).toBe(
      DEFAULT_SETTINGS.lastMonthlyMilestonesCheckDate
    );
  });
});
