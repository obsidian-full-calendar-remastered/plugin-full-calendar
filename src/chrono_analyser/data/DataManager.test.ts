import { DataManager } from './DataManager';
import type { TimeRecord } from './types';

function makeRecord(overrides: Partial<TimeRecord> = {}): TimeRecord {
  return {
    _id: overrides._id || 'rec-1',
    path: overrides.path || 'cal/event1.md',
    hierarchy: overrides.hierarchy || 'Work',
    project: overrides.project || 'Backend',
    subproject: overrides.subproject || 'API',
    subprojectFull: overrides.subprojectFull || 'Backend - API',
    duration: overrides.duration ?? 2,
    file: overrides.file || 'event1.md',
    date: overrides.date === undefined ? new Date('2026-11-16T00:00:00.000Z') : overrides.date,
    _effectiveDurationInPeriod: overrides._effectiveDurationInPeriod ?? overrides.duration ?? 2,
    metadata: overrides.metadata || {
      title: 'Work - Backend - API',
      type: 'single',
      date: '2026-11-16',
      endDate: null,
      allDay: false,
      startTime: '09:00',
      endTime: '11:00'
    }
  };
}

describe('DataManager pure chart aggregations', () => {
  it('prepares daily, weekly, and monthly time-series data for line and stackedArea', () => {
    const dm = new DataManager();
    const records: TimeRecord[] = [
      makeRecord({
        _id: '1',
        hierarchy: 'Work',
        duration: 2,
        date: new Date('2026-11-16T00:00:00.000Z')
      }),
      makeRecord({
        _id: '2',
        hierarchy: 'Personal',
        duration: 1.5,
        date: new Date('2026-11-16T00:00:00.000Z')
      }),
      makeRecord({
        _id: '3',
        hierarchy: 'Work',
        duration: 3,
        date: new Date('2026-11-18T00:00:00.000Z')
      })
    ];

    const dailyLine = dm.prepareTimeSeriesData(records, {
      granularity: 'daily',
      chartType: 'line',
      stackingLevel: 'hierarchy',
      metric: 'duration'
    });
    expect(dailyLine.periods).toEqual(['2026-11-16', '2026-11-18']);
    expect(dailyLine.totals).toEqual([3.5, 3]);
    expect(dailyLine.categories).toEqual({});

    const weeklyStacked = dm.prepareTimeSeriesData(records, {
      granularity: 'weekly',
      chartType: 'stackedArea',
      stackingLevel: 'hierarchy',
      metric: 'count'
    });
    expect(weeklyStacked.periods).toEqual(['2026-11-16']);
    expect(weeklyStacked.totals).toEqual([3]);
    expect(weeklyStacked.categories).toEqual({
      Personal: [1],
      Work: [2]
    });

    const monthlyLine = dm.prepareTimeSeriesData(records, {
      granularity: 'monthly',
      chartType: 'line',
      stackingLevel: 'hierarchy',
      metric: 'duration'
    });
    expect(monthlyLine.periods).toEqual(['2026-11-01']);
    expect(monthlyLine.totals).toEqual([6.5]);
  });

  it('prepares activity pattern data for dayOfWeek, hourOfDay, and heatmapDOWvsHOD', () => {
    const dm = new DataManager();
    const records: TimeRecord[] = [
      makeRecord({
        _id: '1',
        duration: 2,
        date: new Date('2026-11-16T00:00:00.000Z'), // Monday (UTC day 1)
        metadata: {
          title: 'Morning Focus',
          type: 'single',
          date: '2026-11-16',
          endDate: null,
          allDay: false,
          startTime: '09:00',
          endTime: '11:00'
        }
      }),
      makeRecord({
        _id: '2',
        duration: 1,
        date: new Date('2026-11-16T00:00:00.000Z'),
        metadata: {
          title: 'Afternoon Sync',
          type: 'single',
          date: '2026-11-16',
          endDate: null,
          allDay: false,
          startTime: '14:00',
          endTime: '15:00'
        }
      })
    ];

    const dow = dm.prepareActivityPatternData(records, {
      patternType: 'dayOfWeek',
      metric: 'duration'
    });
    expect(dow.values1D?.[1]).toBe(3); // Monday
    expect(dow.values1D?.[0]).toBe(0); // Sunday

    const hod = dm.prepareActivityPatternData(records, {
      patternType: 'hourOfDay',
      metric: 'count'
    });
    expect(hod.values1D?.[9]).toBe(1);
    expect(hod.values1D?.[14]).toBe(1);

    const heatmap = dm.prepareActivityPatternData(records, {
      patternType: 'heatmapDOWvsHOD',
      metric: 'duration'
    });
    expect(heatmap.values2D?.[1][9]).toBe(2);
    expect(heatmap.values2D?.[1][14]).toBe(1);
    expect(heatmap.values2D?.[0][9]).toBeNull();
  });

  it('parses leading -exclusion tokens in pattern filters', () => {
    const dm = new DataManager();
    dm.addRecord(makeRecord({ _id: '1', project: 'Team Meeting' }));
    dm.addRecord(makeRecord({ _id: '2', project: 'Team Lunch' }));

    const res = dm.getAnalyzedData({ pattern: '-lunch' }, null);
    expect(res.records).toHaveLength(1);
    expect(res.records[0].project).toBe('Team Meeting');
  });
});
