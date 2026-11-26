import { AgentChronoBridge, sanitizeAgentPattern } from './AgentChronoBridge';
import { AGENT_TOOLS } from './toolDefinitions';
import { ChronoAnalysisService } from '../../../chrono_analyser/ChronoAnalysisService';
import { PluginState } from '../../../core/PluginState';
import { DEFAULT_SETTINGS } from '../../../types/settings';
import type EventCache from '../../../core/EventCache';

describe('AgentChronoBridge & Tool Definitions', () => {
  const sampleEvents = [
    {
      id: 'ev-1',
      location: { path: 'events/ev-1.md', lineNumber: 0 },
      event: {
        id: 'ev-1',
        title: 'Deep Work',
        category: 'Work',
        subCategory: 'Coding',
        type: 'single' as const,
        date: '2026-11-16',
        endDate: null,
        allDay: false,
        startTime: '09:00',
        endTime: '12:00'
      }
    }
  ];

  const mockCache = {
    initialized: true,
    populate: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    off: jest.fn(),
    calendars: new Map([['local::events', { type: 'local', displayName: 'Events' }]]),
    store: {
      getEventsInCalendar: jest.fn().mockReturnValue(sampleEvents)
    }
  };

  beforeEach(() => {
    ChronoAnalysisService.resetInstance();
    PluginState.clear();
    PluginState.setCache(mockCache as unknown as EventCache);
    PluginState.setSettings({
      ...DEFAULT_SETTINGS,
      enableAdvancedCategorization: true
    });
  });

  afterEach(() => {
    ChronoAnalysisService.resetInstance();
    PluginState.clear();
  });

  it('keeps all AGENT_TOOLS within gateway byte and description limits', () => {
    for (const tool of AGENT_TOOLS) {
      expect(tool.function.description.length).toBeLessThanOrEqual(400);
      const bytes = Buffer.byteLength(JSON.stringify(tool), 'utf8');
      expect(bytes).toBeLessThanOrEqual(2400);
    }
    const names = AGENT_TOOLS.map(t => t.function.name);
    expect(names).toContain('get_chrono_overview');
    expect(names).toContain('analyze_time');
    expect(names).toContain('get_chrono_insights');
  });

  it('executes get_chrono_overview, analyze_time, and get_chrono_insights with chart attachments', async () => {
    const bridge = new AgentChronoBridge();
    expect(ChronoAnalysisService.hasInstance()).toBe(false);

    const overview = JSON.parse(await bridge.getChronoOverview()) as { totalRecords: number };
    expect(overview.totalRecords).toBe(1);

    const analysis = await bridge.analyzeTime(
      {
        analysisType: 'pie',
        metric: 'duration',
        startDate: '2026-11-16',
        endDate: '2026-11-16',
        breakdownBy: 'hierarchy'
      },
      'chart_1'
    );
    const parsed = JSON.parse(analysis.toolJson) as { chartId?: string; totalHours?: number };
    expect(parsed.chartId).toBe('chart_1');
    expect(parsed.totalHours).toBe(3);
    expect(analysis.attachment?.chartId).toBe('chart_1');
    expect(analysis.attachment?.spec.chartType).toBe('pie');

    const insights = JSON.parse(await bridge.getChronoInsights()) as { count: number };
    expect(insights.count).toBeGreaterThan(0);
  });

  it('escapes regex metacharacters in sanitizeAgentPattern to prevent ReDoS', () => {
    expect(sanitizeAgentPattern('(a+)+$ -"foo[bar]"')).toBe('\\(a\\+\\)\\+\\$ -"foo\\[bar\\]"');
    const longPattern = 'a'.repeat(300);
    expect(sanitizeAgentPattern(longPattern)?.length).toBe(200);
  });

  it('caps hierarchies and projects in get_chrono_overview', async () => {
    const manyEvents = Array.from({ length: 50 }, (_, i) => ({
      id: `ev-${i}`,
      location: { path: `events/ev-${i}.md`, lineNumber: 0 },
      event: {
        id: `ev-${i}`,
        title: `Project ${i}`,
        category: `Cat ${i}`,
        type: 'single' as const,
        date: '2026-11-16',
        endDate: null,
        allDay: false,
        startTime: '09:00',
        endTime: '10:00'
      }
    }));
    mockCache.store.getEventsInCalendar.mockReturnValueOnce(manyEvents);

    const bridge = new AgentChronoBridge();
    const overview = JSON.parse(await bridge.getChronoOverview()) as {
      hierarchies: string[];
      projects: string[];
      totalHierarchies: number;
      totalProjects: number;
      truncated: boolean;
    };
    expect(overview.hierarchies).toHaveLength(40);
    expect(overview.projects).toHaveLength(40);
    expect(overview.totalHierarchies).toBe(50);
    expect(overview.totalProjects).toBe(50);
    expect(overview.truncated).toBe(true);
  });

  it('rejects invalid date formats and inverted date ranges in analyze_time', async () => {
    const bridge = new AgentChronoBridge();

    const invalidStart = await bridge.analyzeTime(
      { analysisType: 'pie', startDate: 'last week', endDate: '2026-11-16' },
      'chart_1'
    );
    expect((JSON.parse(invalidStart.toolJson) as { error?: string }).error).toContain(
      'Invalid startDate'
    );
    expect(invalidStart.attachment).toBeUndefined();

    const rolloverDate = await bridge.analyzeTime(
      { analysisType: 'pie', startDate: '2026-02-31', endDate: '2026-03-01' },
      'chart_1'
    );
    expect((JSON.parse(rolloverDate.toolJson) as { error?: string }).error).toContain(
      'Invalid startDate'
    );

    const inverted = await bridge.analyzeTime(
      { analysisType: 'pie', startDate: '2026-11-20', endDate: '2026-11-10' },
      'chart_1'
    );
    expect((JSON.parse(inverted.toolJson) as { error?: string }).error).toContain(
      'Inverted date range'
    );
  });
});
