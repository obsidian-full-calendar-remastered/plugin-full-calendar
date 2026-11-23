import { ChronoAnalysisService } from './ChronoAnalysisService';
import { PluginState } from '../core/PluginState';
import { DEFAULT_SETTINGS } from '../types/settings';
import type EventCache from '../core/EventCache';

describe('ChronoAnalysisService', () => {
  const sampleEvents = [
    {
      id: 'ev-1',
      location: { path: 'events/ev-1.md', lineNumber: 0 },
      event: {
        id: 'ev-1',
        title: 'API Refactor',
        category: 'Work',
        subCategory: 'Backend',
        type: 'single' as const,
        date: '2026-11-16',
        endDate: null,
        allDay: false,
        startTime: '09:00',
        endTime: '12:00'
      }
    },
    {
      id: 'ev-2',
      location: { path: 'events/ev-2.md', lineNumber: 0 },
      event: {
        id: 'ev-2',
        title: 'Morning Run',
        category: 'Wellness',
        subCategory: 'Cardio',
        type: 'single' as const,
        date: '2026-11-17',
        endDate: null,
        allDay: false,
        startTime: '07:00',
        endTime: '08:00'
      }
    },
    {
      id: 'ev-3',
      location: { path: 'events/ev-3.md', lineNumber: 0 },
      event: {
        id: 'ev-3',
        title: 'Sprint Planning',
        category: 'Work',
        subCategory: 'Meetings',
        type: 'single' as const,
        date: '2026-11-09',
        endDate: null,
        allDay: false,
        startTime: '10:00',
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

  it('stays uninitialized until getInstance() is explicitly called', () => {
    expect(ChronoAnalysisService.hasInstance()).toBe(false);
    ChronoAnalysisService.getInstance();
    expect(ChronoAnalysisService.hasInstance()).toBe(true);
  });

  it('returns accurate overview, pie breakdown, period comparison, and insights', async () => {
    const service = ChronoAnalysisService.getInstance();

    const overview = await service.getOverview();
    expect(overview.categorizationMode).toBe('category');
    expect(overview.totalRecords).toBe(3);
    expect(overview.hierarchies).toEqual(['Wellness', 'Work']);
    expect(overview.dateRange).toEqual({ earliest: '2026-11-09', latest: '2026-11-17' });

    const pie = await service.queryAnalysis({
      chartType: 'pie',
      metric: 'duration',
      breakdownBy: 'hierarchy',
      startDate: '2026-11-16',
      endDate: '2026-11-17'
    });
    expect(pie.totalHours).toBe(4);
    expect(pie.totalCount).toBe(2);
    expect(pie.kpis[0].value).toBe('4.0h');

    const cmp = await service.comparePeriods(
      {
        chartType: 'pie',
        metric: 'duration',
        startDate: '2026-11-16',
        endDate: '2026-11-22'
      },
      '2026-11-09',
      '2026-11-15'
    );
    expect(cmp.base.totalHours).toBe(4);
    expect(cmp.compare.totalHours).toBe(2);
    expect(cmp.deltaValue).toBe(2);
    expect(cmp.deltaPct).toBe(100);
    expect(cmp.combinedChart.spec.chartType).toBe('time-series');

    const insights = await service.generateInsights();
    expect(insights.insightGroupsConfigured).toBe(false);
    expect(insights.insights.length).toBeGreaterThan(0);
  });

  it('expands recurring events in count mode for pie charts', async () => {
    mockCache.store.getEventsInCalendar.mockReturnValueOnce([
      {
        id: 'rec-1',
        location: { path: 'events/rec-1.md', lineNumber: 0 },
        event: {
          id: 'rec-1',
          title: 'Daily Standup',
          category: 'Work',
          type: 'recurring' as const,
          daysOfWeek: ['M', 'T', 'W', 'R', 'F'],
          startRecur: '2026-11-16',
          endRecur: '2026-11-20',
          allDay: false,
          startTime: '09:00',
          endTime: '09:30'
        }
      }
    ]);

    const service = ChronoAnalysisService.getInstance();
    const res = await service.queryAnalysis({
      chartType: 'pie',
      metric: 'count',
      breakdownBy: 'hierarchy',
      startDate: '2026-11-16',
      endDate: '2026-11-20'
    });
    expect(res.totalCount).toBe(5);
  });
});
