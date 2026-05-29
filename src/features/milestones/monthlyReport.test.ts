import { getMonthlyActivitySummary } from './milestones';
import { compileMonthlyReport } from './monthlyReport';
import { PluginState } from '../../core/PluginState';
import { App } from 'obsidian';
import { FullCalendarSettings } from '../../types/settings';

// Mock Obsidian modules
jest.mock(
  'obsidian',
  () => ({
    App: jest.fn(),
    MarkdownView: jest.fn(),
    TFile: jest.fn(),
    normalizePath: (p: string) => p,
    requestUrl: jest.fn(),
    Platform: {
      isMobile: false
    }
  }),
  { virtual: true }
);

// Mock PluginState settings
const mockSettings = {
  calendarSources: [
    { type: 'local', id: 'local_1', name: 'My Notes', color: '#ff0000' },
    { type: 'google', id: 'google_1', name: 'Work', color: '#00ff00' }
  ],
  milestones: {
    counters: {
      'day.action.2026-04-01': 5,
      'day.created.2026-04-01': 3,
      'day.action.2026-04-15': 10,
      'day.created.2026-04-15': 5,
      'day.action.2026-05-01': 8, // Different month
      'created.total': 18,
      'created.local': 10,
      'created.google': 8,
      'updated.total': 5,
      'deleted.total': 2,
      'moved.total': 4
    },
    unlockedAt: {}
  },
  workspaces: []
};

PluginState.getSettings = () => mockSettings as unknown as FullCalendarSettings;

describe('Monthly Milestones Statistics & Report Feature', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMonthlyActivitySummary', () => {
    it('should correctly sum action and creation counts for a specific month', () => {
      const summary = getMonthlyActivitySummary('2026-04');
      expect(summary.totalOps).toBe(15); // 5 + 10
      expect(summary.createdCount).toBe(8); // 3 + 5
    });

    it('should return 0 counts if no actions exist for the requested month', () => {
      const summary = getMonthlyActivitySummary('2026-03');
      expect(summary.totalOps).toBe(0);
      expect(summary.createdCount).toBe(0);
    });
  });

  describe('Telemetry Anonymization Auditing', () => {
    it('should compile the note content and contain all mandatory placeholders', async () => {
      const appMock = {
        vault: {
          configDir: 'test-vault-config-dir',
          adapter: {
            exists: jest.fn().mockResolvedValue(true),
            read: jest
              .fn()
              .mockResolvedValue(
                '# 🏆 Full Calendar - Monthly Milestones & Usage Report\n*This report summarizes your activity and achievements for the month of **{{MONTH}}**.*\n\n{{TOTAL_CALENDARS}} calendars\n{{LIFETIME_OPS}} lifetime operations\n{{PREV_MONTH_OPS}} operations this month\n{{PREV_MONTH_CREATED}} created this month\n{{LIFETIME_STREAK}} streak\n{{LIFETIME_TZ}} timezones\n{{CALENDARS_TABLE}}\n{{JSON_PAYLOAD}}'
              )
          }
        }
      } as unknown as App;
      const pluginId = 'obsidian-full-calendar-remastered';

      const report = await compileMonthlyReport(appMock, pluginId, '2026-04');

      // Verify report name and titles are rendered
      expect(report).toContain('April 2026');

      // Verify metrics dashboard counts are substituted
      expect(report).toContain('15'); // Previous month operations (totalOps)
      expect(report).toContain('8'); // Previous month created (createdCount)

      // Verify total calendars is displayed
      expect(report).toContain('2 calendars');

      // Verify the telemetry JSON payload block exists
      expect(report).toContain('"pluginId": "obsidian-full-calendar-remastered"');
      expect(report).toContain('"isMobile": false');

      // Make sure NO raw database paths, vault names, or personal info is in telemetry
      expect(report).not.toContain('My Notes');
      expect(report).not.toContain('Work');
      expect(report).not.toContain('local_1');
      expect(report).not.toContain('google_1');
    });
  });
});
