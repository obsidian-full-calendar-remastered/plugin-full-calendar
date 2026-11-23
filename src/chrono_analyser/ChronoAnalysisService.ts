/**
 * @file ChronoAnalysisService.ts
 * @brief Strictly on-demand headless analytics engine for Chrono Analyzer.
 *
 * @description
 * Single source of truth for Chrono Analyzer data queries, aggregations,
 * period comparisons, and insights generation across:
 * - AnalysisView (full tab)
 * - AnalysisWidgetStrategy (embedded codeblocks)
 * - AgentChronoBridge (AI chat tools & interactive chat cards)
 * - Future token-scoped PublicAPI extensions
 *
 * Zero-cost startup guarantee: never instantiated or subscribed to EventCache
 * until ChronoAnalysisService.getInstance() is explicitly called.
 */

import { PluginState } from '../core/PluginState';
import { DataManager, AnalysisFilters } from './data/DataManager';
import { DataService } from './data/DataService';
import { InsightsEngine, Insight } from './data/InsightsEngine';
import * as Utils from './data/utils';
import type {
  ActivityPatternData,
  ChronoChartSpec,
  ChronoKpiPill,
  PieData,
  SunburstData,
  TimeRecord,
  TimeSeriesData
} from './data/types';

export interface ChronoOverview {
  categorizationMode: 'category' | 'legacy';
  totalRecords: number;
  dateRange: { earliest: string | null; latest: string | null };
  hierarchies: string[];
  projects: string[];
  insightGroupsConfigured: boolean;
  insightGroups: { name: string; persona: string }[];
}

export interface ChronoAnalysisQueryResult {
  spec: ChronoChartSpec;
  totalHours: number;
  totalCount: number;
  fileCount: number;
  records: TimeRecord[];
  chartData:
    | { kind: 'pie'; data: PieData }
    | { kind: 'sunburst'; data: SunburstData }
    | { kind: 'time-series'; data: TimeSeriesData }
    | { kind: 'activity'; data: ActivityPatternData };
  kpis: ChronoKpiPill[];
  summary: Record<string, unknown>;
}

export interface ChronoComparisonResult {
  base: ChronoAnalysisQueryResult;
  compare: ChronoAnalysisQueryResult;
  combinedChart: ChronoAnalysisQueryResult;
  deltaValue: number;
  deltaPct: number | null;
  topChanges: { name: string; base: number; compare: number; delta: number }[];
  kpis: ChronoKpiPill[];
  comparisonSummary: {
    baseLabel: string;
    compareLabel: string;
    deltaText: string;
  };
}

export interface ChronoInsightsResult {
  insights: Insight[];
  insightGroupsConfigured: boolean;
  summaries: {
    category: string;
    sentiment: Insight['sentiment'];
    text: string;
    items: { project: string; details: string }[];
  }[];
}

const MAX_SUMMARY_BUCKETS = 15;
const MAX_SUMMARY_PERIODS = 31;

export function isValidIsoDateInput(iso: string): boolean {
  const trimmed = iso.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const d = new Date(Date.UTC(year, month - 1, day));
    return (
      !isNaN(d.getTime()) &&
      d.getUTCFullYear() === year &&
      d.getUTCMonth() === month - 1 &&
      d.getUTCDate() === day
    );
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const d = new Date(trimmed);
    return !isNaN(d.getTime());
  }
  return false;
}

function parseIsoDateBoundary(iso?: string): Date | null {
  if (!iso || typeof iso !== 'string') return null;
  const trimmed = iso.trim();
  if (!trimmed) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const d = new Date(Date.UTC(year, month, day));
    return isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(trimmed);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function formatMetricValue(value: number, metric: 'duration' | 'count'): string {
  return metric === 'count' ? `${Math.round(value)}` : `${value.toFixed(1)}h`;
}

export class ChronoAnalysisService {
  private static instance: ChronoAnalysisService | null = null;

  public readonly dataManager: DataManager;
  private readonly insightsEngine: InsightsEngine;
  private dataService: DataService | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private listeners = new Set<() => void>();

  private constructor() {
    this.dataManager = new DataManager();
    this.insightsEngine = new InsightsEngine();
  }

  public static hasInstance(): boolean {
    return ChronoAnalysisService.instance !== null;
  }

  public static getInstance(): ChronoAnalysisService {
    if (!ChronoAnalysisService.instance) {
      ChronoAnalysisService.instance = new ChronoAnalysisService();
      PluginState.registerCleanup(() => ChronoAnalysisService.resetInstance());
    }
    return ChronoAnalysisService.instance;
  }

  public static resetInstance(): void {
    if (ChronoAnalysisService.instance) {
      ChronoAnalysisService.instance.destroy();
      ChronoAnalysisService.instance = null;
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const cache = PluginState.getCache();
      if (!cache.initialized) {
        await cache.populate();
      }
      if (!this.dataService) {
        this.dataService = new DataService(
          cache,
          this.dataManager,
          PluginState.getSettings(),
          () => {
            if (!this.initialized) return;
            for (const listener of this.listeners) {
              try {
                listener();
              } catch (err) {
                console.error('[ChronoAnalysisService] Listener error:', err);
              }
            }
          }
        );
        this.dataService.initialize();
      }
      this.initialized = true;
    })().finally(() => {
      this.initPromise = null;
    });

    return this.initPromise;
  }

  public destroy(): void {
    this.dataService?.destroy();
    this.dataService = null;
    this.dataManager.clear();
    this.listeners.clear();
    this.initialized = false;
    this.initPromise = null;
  }

  public async getOverview(): Promise<ChronoOverview> {
    await this.ensureInitialized();
    const settings = PluginState.getSettings();
    const records = this.dataManager.getAllRecords();

    let earliestMs: number | null = null;
    let latestMs: number | null = null;
    for (const r of records) {
      if (!r.date || isNaN(r.date.getTime())) continue;
      const t = r.date.getTime();
      if (earliestMs === null || t < earliestMs) earliestMs = t;
      if (latestMs === null || t > latestMs) latestMs = t;
    }

    const config = settings.chrono_analyser_config;
    const insightGroups = Object.entries(config?.insightGroups || {}).map(([name, group]) => ({
      name,
      persona: group?.persona || 'neutral'
    }));

    return {
      categorizationMode: settings.enableAdvancedCategorization ? 'category' : 'legacy',
      totalRecords: records.length,
      dateRange: {
        earliest: earliestMs !== null ? Utils.getISODate(new Date(earliestMs)) : null,
        latest: latestMs !== null ? Utils.getISODate(new Date(latestMs)) : null
      },
      hierarchies: this.dataManager.getKnownHierarchies(),
      projects: this.dataManager.getKnownProjects(),
      insightGroupsConfigured: insightGroups.length > 0,
      insightGroups
    };
  }

  public async queryAnalysis(spec: ChronoChartSpec): Promise<ChronoAnalysisQueryResult> {
    await this.ensureInitialized();

    const metric = spec.metric || 'duration';
    const expandRecurring =
      spec.chartType === 'time-series' || spec.chartType === 'activity' || metric === 'count';
    const filters: AnalysisFilters = {
      hierarchy: spec.hierarchy || undefined,
      project: spec.project || undefined,
      pattern: spec.pattern || undefined,
      filterStartDate: parseIsoDateBoundary(spec.startDate),
      filterEndDate: parseIsoDateBoundary(spec.endDate)
    };

    const { records, totalHours, fileCount, error } = this.dataManager.getAnalyzedData(
      filters,
      null,
      { expandRecurring }
    );

    if (error) {
      throw new Error(`Invalid filter pattern: ${error}`);
    }

    const totalCount = records.length;
    const kpis: ChronoKpiPill[] = [
      {
        label: metric === 'count' ? 'Events' : 'Total',
        value: metric === 'count' ? `${totalCount}` : `${totalHours.toFixed(1)}h`
      }
    ];

    if (spec.chartType === 'pie') {
      const breakdownBy = spec.breakdownBy || 'hierarchy';
      const pieData = this.dataManager.preparePieChartData(records, breakdownBy, metric);
      const sorted = Array.from(pieData.hours.entries()).sort((a, b) => b[1] - a[1]);
      const grandTotal = sorted.reduce((acc, [, v]) => acc + v, 0);

      if (sorted.length > 0) {
        const [topName, topVal] = sorted[0];
        const pct = grandTotal > 0 ? Math.round((topVal / grandTotal) * 100) : 0;
        kpis.push({
          label: 'Top',
          value: `${topName} (${pct}%)`,
          tone: 'positive'
        });
      }

      return {
        spec,
        totalHours,
        totalCount,
        fileCount,
        records,
        chartData: { kind: 'pie', data: pieData },
        kpis,
        summary: {
          chartType: 'pie',
          breakdownBy,
          metric,
          totalHours: Number(totalHours.toFixed(2)),
          totalCount,
          buckets: sorted.slice(0, MAX_SUMMARY_BUCKETS).map(([name, val]) => ({
            name,
            value: Number(val.toFixed(2)),
            pct: grandTotal > 0 ? Number(((val / grandTotal) * 100).toFixed(1)) : 0
          })),
          truncatedBuckets: Math.max(0, sorted.length - MAX_SUMMARY_BUCKETS)
        }
      };
    }

    if (spec.chartType === 'sunburst') {
      const level = spec.level || 'subproject';
      const sunburstData = this.dataManager.prepareSunburstData(records, level, metric);
      const rootTotal = sunburstData.values[0] || 0;
      const topParents = sunburstData.ids
        .map((id, idx) => ({
          id,
          label: sunburstData.labels[idx],
          parent: sunburstData.parents[idx],
          value: sunburstData.values[idx]
        }))
        .filter(item => item.parent === 'Total')
        .sort((a, b) => b.value - a.value);

      if (topParents.length > 0) {
        const pct = rootTotal > 0 ? Math.round((topParents[0].value / rootTotal) * 100) : 0;
        kpis.push({
          label: 'Top',
          value: `${topParents[0].label} (${pct}%)`,
          tone: 'positive'
        });
      }

      return {
        spec,
        totalHours,
        totalCount,
        fileCount,
        records,
        chartData: { kind: 'sunburst', data: sunburstData },
        kpis,
        summary: {
          chartType: 'sunburst',
          level,
          metric,
          totalHours: Number(totalHours.toFixed(2)),
          totalCount,
          topGroups: topParents.slice(0, MAX_SUMMARY_BUCKETS).map(p => ({
            name: p.label,
            value: Number(p.value.toFixed(2)),
            pct: rootTotal > 0 ? Number(((p.value / rootTotal) * 100).toFixed(1)) : 0
          }))
        }
      };
    }

    if (spec.chartType === 'time-series') {
      const granularity = spec.granularity || 'daily';
      const timeSeriesType = spec.timeSeriesType || 'line';
      const stackingLevel = spec.stackingLevel || 'hierarchy';
      const tsData = this.dataManager.prepareTimeSeriesData(records, {
        granularity,
        chartType: timeSeriesType,
        stackingLevel,
        metric
      });

      const periodCount = tsData.periods.length;
      const sumTotal = tsData.totals.reduce((a, b) => a + b, 0);
      const avgPerPeriod = periodCount > 0 ? sumTotal / periodCount : 0;
      if (periodCount > 0) {
        kpis.push({
          label: `Avg/${granularity === 'daily' ? 'day' : granularity === 'weekly' ? 'wk' : 'mo'}`,
          value: formatMetricValue(avgPerPeriod, metric)
        });
      }

      let peakPeriod: { period: string; value: number } | null = null;
      for (let i = 0; i < tsData.periods.length; i++) {
        if (!peakPeriod || tsData.totals[i] > peakPeriod.value) {
          peakPeriod = { period: tsData.periods[i], value: tsData.totals[i] };
        }
      }

      const sliceStart = Math.max(0, tsData.periods.length - MAX_SUMMARY_PERIODS);
      return {
        spec,
        totalHours,
        totalCount,
        fileCount,
        records,
        chartData: { kind: 'time-series', data: tsData },
        kpis,
        summary: {
          chartType: 'time-series',
          granularity,
          timeSeriesType,
          metric,
          totalHours: Number(totalHours.toFixed(2)),
          totalCount,
          avgPerPeriod: Number(avgPerPeriod.toFixed(2)),
          peakPeriod,
          series: tsData.periods.slice(sliceStart).map((period, idx) => ({
            period,
            total: tsData.totals[sliceStart + idx]
          }))
        }
      };
    }

    // activity
    const patternType = spec.patternType || 'dayOfWeek';
    const actData = this.dataManager.prepareActivityPatternData(records, {
      patternType,
      metric
    });

    let peakSlot: { label: string; value: number } | null = null;
    if (actData.values1D) {
      actData.values1D.forEach((val, idx) => {
        if (!peakSlot || val > peakSlot.value) {
          peakSlot = { label: actData.labelsX[idx], value: val };
        }
      });
    } else if (actData.values2D && actData.labelsY) {
      for (let d = 0; d < actData.values2D.length; d++) {
        for (let h = 0; h < actData.values2D[d].length; h++) {
          const val = actData.values2D[d][h];
          if (val !== null && (!peakSlot || val > peakSlot.value)) {
            peakSlot = { label: `${actData.labelsY[d]} ${h}:00`, value: val };
          }
        }
      }
    }

    if (peakSlot && peakSlot.value > 0) {
      const peakLabel = patternType === 'hourOfDay' ? `${peakSlot.label}:00` : peakSlot.label;
      kpis.push({
        label: 'Peak',
        value: `${peakLabel} (${formatMetricValue(peakSlot.value, metric)})`,
        tone: 'positive'
      });
    }

    return {
      spec,
      totalHours,
      totalCount,
      fileCount,
      records,
      chartData: { kind: 'activity', data: actData },
      kpis,
      summary: {
        chartType: 'activity',
        patternType,
        metric,
        totalHours: Number(totalHours.toFixed(2)),
        totalCount,
        peakSlot,
        distribution: actData.values1D
          ? actData.labelsX.map((label, i) => ({ label, value: actData.values1D?.[i] ?? 0 }))
          : undefined
      }
    };
  }

  public async comparePeriods(
    baseSpec: ChronoChartSpec,
    compareStartDate: string,
    compareEndDate: string
  ): Promise<ChronoComparisonResult> {
    const metric = baseSpec.metric || 'duration';
    const breakdownBy = baseSpec.breakdownBy || 'hierarchy';

    const baseQuerySpec: ChronoChartSpec = {
      ...baseSpec,
      chartType: 'pie',
      breakdownBy
    };
    const compareQuerySpec: ChronoChartSpec = {
      ...baseSpec,
      chartType: 'pie',
      breakdownBy,
      startDate: compareStartDate,
      endDate: compareEndDate
    };

    const [base, compare] = await Promise.all([
      this.queryAnalysis(baseQuerySpec),
      this.queryAnalysis(compareQuerySpec)
    ]);

    const baseVal = metric === 'count' ? base.totalCount : base.totalHours;
    const compareVal = metric === 'count' ? compare.totalCount : compare.totalHours;
    const deltaValue = Number((baseVal - compareVal).toFixed(2));
    const deltaPct =
      compareVal > 0 ? Number((((baseVal - compareVal) / compareVal) * 100).toFixed(1)) : null;

    const baseMap =
      base.chartData.kind === 'pie' ? base.chartData.data.hours : new Map<string, number>();
    const compareMap =
      compare.chartData.kind === 'pie' ? compare.chartData.data.hours : new Map<string, number>();
    const allKeys = new Set([...baseMap.keys(), ...compareMap.keys()]);
    const topChanges = Array.from(allKeys)
      .map(name => {
        const b = Number((baseMap.get(name) || 0).toFixed(2));
        const c = Number((compareMap.get(name) || 0).toFixed(2));
        return { name, base: b, compare: c, delta: Number((b - c).toFixed(2)) };
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 10);

    // Reuse existing time-series chart spanning the combined date range when dated,
    // or pie chart on the base period otherwise.
    const normalizedDates = [baseSpec.startDate, baseSpec.endDate, compareStartDate, compareEndDate]
      .map(d => parseIsoDateBoundary(d))
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime())
      .map(d => Utils.getISODate(d))
      .filter((d): d is string => d !== null);

    const combinedSpec: ChronoChartSpec =
      normalizedDates.length >= 2
        ? {
            ...baseSpec,
            chartType: 'time-series',
            granularity: baseSpec.granularity || 'daily',
            timeSeriesType: baseSpec.timeSeriesType || 'stackedArea',
            stackingLevel: baseSpec.stackingLevel || breakdownBy,
            startDate: normalizedDates[0],
            endDate: normalizedDates[normalizedDates.length - 1]
          }
        : baseQuerySpec;

    const combinedChart = await this.queryAnalysis(combinedSpec);

    const sign = deltaValue >= 0 ? '+' : '';
    const pctSuffix = deltaPct !== null ? ` (${sign}${deltaPct}%)` : '';
    const deltaText = `${sign}${formatMetricValue(deltaValue, metric)}${pctSuffix}`;
    const tone: ChronoKpiPill['tone'] =
      deltaValue > 0 ? 'positive' : deltaValue < 0 ? 'warning' : 'neutral';

    const kpis: ChronoKpiPill[] = [
      { label: 'Current', value: formatMetricValue(baseVal, metric) },
      { label: 'Previous', value: formatMetricValue(compareVal, metric) },
      { label: 'Delta', value: deltaText, tone }
    ];

    const baseLabel =
      baseSpec.startDate && baseSpec.endDate
        ? `${baseSpec.startDate}..${baseSpec.endDate}`
        : 'Current';
    const compareLabel = `${compareStartDate}..${compareEndDate}`;

    return {
      base,
      compare,
      combinedChart,
      deltaValue,
      deltaPct,
      topChanges,
      kpis,
      comparisonSummary: {
        baseLabel,
        compareLabel,
        deltaText
      }
    };
  }

  public async generateInsights(): Promise<ChronoInsightsResult> {
    await this.ensureInitialized();
    const settings = PluginState.getSettings();
    const config = settings.chrono_analyser_config || {
      version: 1,
      lastUpdated: '',
      insightGroups: {}
    };
    const insightGroupsConfigured = Object.keys(config.insightGroups || {}).length > 0;
    const allRecords = this.dataManager.getAllRecords();
    const insights = await this.insightsEngine.generateInsights(allRecords, config);

    const summaries = insights.map(ins => ({
      category: ins.category,
      sentiment: ins.sentiment,
      text: ins.displayTextFragments.map(f => f.text).join(''),
      items: (ins.payload || []).slice(0, 5).map(item => ({
        project: item.project,
        details: item.detailsFragments.map(f => f.text).join('')
      }))
    }));

    return {
      insights,
      insightGroupsConfigured,
      summaries
    };
  }
}
