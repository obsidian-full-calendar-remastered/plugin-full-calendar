/**
 * @file AgentChronoBridge.ts
 * @brief Sandboxed bridge between the AI Agent and ChronoAnalysisService.
 *
 * @description
 * Zero-cost at startup: ChronoAnalysisService is only resolved when a Chrono
 * analytics tool is actually invoked. Returns token-lean JSON summaries and
 * serializable AgentChartAttachment specs for inline rendering.
 */

import {
  ChronoAnalysisService,
  isValidIsoDateInput
} from '../../../chrono_analyser/ChronoAnalysisService';
import type { ChronoChartSpec } from '../../../chrono_analyser/data/types';
import type { AgentChartAttachment } from '../types';

export interface ChronoToolExecutionResult {
  toolJson: string;
  attachment?: AgentChartAttachment;
}

const MAX_OVERVIEW_ITEMS = 40;
const MAX_INSIGHT_GROUPS = 20;
const MAX_INSIGHTS_ITEMS = 15;
const MAX_PATTERN_CHARS = 200;
const MAX_LABEL_CHARS = 120;

function sanitizeLabel(val: string, maxLen = MAX_LABEL_CHARS): string {
  // eslint-disable-next-line no-control-regex -- Strip ASCII control characters from external ICS/event labels
  return val
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLen);
}

function asOptionalStr(val: unknown): string | undefined {
  return typeof val === 'string' && val.trim() ? val.trim() : undefined;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sanitizeAgentPattern(rawPattern: unknown): string | undefined {
  const raw = asOptionalStr(rawPattern);
  if (!raw) return undefined;
  const bounded = raw.slice(0, MAX_PATTERN_CHARS);
  const tokens = bounded.match(/-?"[^"]+"|-?'[^']+'|\S+/g);
  if (!tokens || tokens.length === 0) return undefined;

  return tokens
    .map(token => {
      const isExclusion = token.startsWith('-');
      const body = isExclusion ? token.slice(1) : token;
      const first = body.charAt(0);
      const last = body.charAt(body.length - 1);
      if (
        body.length >= 2 &&
        ((first === '"' && last === '"') || (first === "'" && last === "'"))
      ) {
        const inner = escapeRegExp(body.slice(1, -1));
        return `${isExclusion ? '-' : ''}${first}${inner}${last}`;
      }
      return `${isExclusion ? '-' : ''}${escapeRegExp(body)}`;
    })
    .join(' ');
}

function buildDefaultTitle(spec: ChronoChartSpec): string {
  if (spec.title) return spec.title;
  const metricLabel = spec.metric === 'count' ? 'Events' : 'Time';
  switch (spec.chartType) {
    case 'pie':
      return `${metricLabel} by ${spec.breakdownBy || 'hierarchy'}`;
    case 'sunburst':
      return `${metricLabel} Hierarchy Breakdown`;
    case 'time-series':
      return `${metricLabel} Trend (${spec.granularity || 'daily'})`;
    case 'activity':
      return spec.patternType === 'hourOfDay'
        ? `${metricLabel} by Hour of Day`
        : spec.patternType === 'heatmapDOWvsHOD'
          ? 'Activity Heatmap'
          : `${metricLabel} by Day of Week`;
  }
}

export class AgentChronoBridge {
  public async getChronoOverview(): Promise<string> {
    const overview = await ChronoAnalysisService.getInstance().getOverview();
    const hierarchies = overview.hierarchies
      .slice(0, MAX_OVERVIEW_ITEMS)
      .map(h => sanitizeLabel(h));
    const projects = overview.projects.slice(0, MAX_OVERVIEW_ITEMS).map(p => sanitizeLabel(p));
    const insightGroups = overview.insightGroups.slice(0, MAX_INSIGHT_GROUPS).map(g => ({
      name: sanitizeLabel(g.name),
      persona: sanitizeLabel(g.persona, 40)
    }));
    return JSON.stringify({
      ...overview,
      hierarchies,
      projects,
      insightGroups,
      totalHierarchies: overview.hierarchies.length,
      totalProjects: overview.projects.length,
      truncated:
        overview.hierarchies.length > MAX_OVERVIEW_ITEMS ||
        overview.projects.length > MAX_OVERVIEW_ITEMS ||
        overview.insightGroups.length > MAX_INSIGHT_GROUPS
    });
  }

  public async analyzeTime(
    args: Record<string, unknown>,
    chartId: string
  ): Promise<ChronoToolExecutionResult> {
    const service = ChronoAnalysisService.getInstance();
    const rawType = asOptionalStr(args.analysisType) || 'pie';
    const metric: 'duration' | 'count' = args.metric === 'count' ? 'count' : 'duration';
    const embedChart = args.embedChart !== false;

    const startDate = asOptionalStr(args.startDate);
    const endDate = asOptionalStr(args.endDate);
    if (startDate && !isValidIsoDateInput(startDate)) {
      return {
        toolJson: JSON.stringify({
          error: `Invalid startDate "${startDate}". Expected YYYY-MM-DD.`
        })
      };
    }
    if (endDate && !isValidIsoDateInput(endDate)) {
      return {
        toolJson: JSON.stringify({
          error: `Invalid endDate "${endDate}". Expected YYYY-MM-DD.`
        })
      };
    }
    if (startDate && endDate && startDate.slice(0, 10) > endDate.slice(0, 10)) {
      return {
        toolJson: JSON.stringify({
          error: `Inverted date range: startDate (${startDate}) must be on or before endDate (${endDate}).`
        })
      };
    }

    const baseSpec: ChronoChartSpec = {
      chartType:
        rawType === 'sunburst' ||
        rawType === 'time-series' ||
        rawType === 'activity' ||
        rawType === 'pie'
          ? rawType
          : 'pie',
      metric,
      startDate,
      endDate,
      hierarchy: asOptionalStr(args.hierarchy),
      project: asOptionalStr(args.project),
      pattern: sanitizeAgentPattern(args.pattern),
      breakdownBy:
        (asOptionalStr(args.breakdownBy) as ChronoChartSpec['breakdownBy']) || 'hierarchy',
      level: (asOptionalStr(args.level) as ChronoChartSpec['level']) || 'subproject',
      granularity: (asOptionalStr(args.granularity) as ChronoChartSpec['granularity']) || 'daily',
      timeSeriesType:
        (asOptionalStr(args.timeSeriesType) as ChronoChartSpec['timeSeriesType']) || 'line',
      stackingLevel:
        (asOptionalStr(args.stackingLevel) as ChronoChartSpec['stackingLevel']) || 'hierarchy',
      patternType:
        (asOptionalStr(args.patternType) as ChronoChartSpec['patternType']) || 'dayOfWeek',
      title: asOptionalStr(args.title)
    };

    if (rawType === 'compare') {
      const compareStartDate = asOptionalStr(args.compareStartDate);
      const compareEndDate = asOptionalStr(args.compareEndDate);
      if (!compareStartDate || !compareEndDate) {
        return {
          toolJson: JSON.stringify({
            error: 'compareStartDate and compareEndDate are required for analysisType="compare".'
          })
        };
      }
      if (!isValidIsoDateInput(compareStartDate) || !isValidIsoDateInput(compareEndDate)) {
        return {
          toolJson: JSON.stringify({
            error: 'compareStartDate and compareEndDate must be valid YYYY-MM-DD dates.'
          })
        };
      }
      if (compareStartDate.slice(0, 10) > compareEndDate.slice(0, 10)) {
        return {
          toolJson: JSON.stringify({
            error: `Inverted compare date range: compareStartDate (${compareStartDate}) must be on or before compareEndDate (${compareEndDate}).`
          })
        };
      }

      const comparison = await service.comparePeriods(baseSpec, compareStartDate, compareEndDate);
      const hasData = comparison.base.records.length > 0 || comparison.compare.records.length > 0;
      const shouldAttach = embedChart && hasData;
      const title =
        baseSpec.title ||
        `${metric === 'count' ? 'Events' : 'Time'} Comparison (${comparison.comparisonSummary.baseLabel} vs ${comparison.comparisonSummary.compareLabel})`;

      const attachment: AgentChartAttachment | undefined = shouldAttach
        ? {
            chartId,
            spec: { ...comparison.combinedChart.spec, title },
            title,
            kpis: comparison.kpis,
            generatedAt: Date.now(),
            totalSnapshot:
              metric === 'count' ? comparison.base.totalCount : comparison.base.totalHours,
            comparisonSummary: comparison.comparisonSummary
          }
        : undefined;

      return {
        toolJson: JSON.stringify({
          analysisType: 'compare',
          metric,
          basePeriod: {
            startDate: baseSpec.startDate ?? null,
            endDate: baseSpec.endDate ?? null,
            totalHours: Number(comparison.base.totalHours.toFixed(2)),
            totalCount: comparison.base.totalCount
          },
          comparePeriod: {
            startDate: compareStartDate,
            endDate: compareEndDate,
            totalHours: Number(comparison.compare.totalHours.toFixed(2)),
            totalCount: comparison.compare.totalCount
          },
          deltaValue: comparison.deltaValue,
          deltaPct: comparison.deltaPct,
          topChanges: comparison.topChanges.map(c => ({
            ...c,
            name: sanitizeLabel(c.name)
          })),
          ...(attachment ? { chartId, anchorToken: `[[chart:${chartId}]]` } : {})
        }),
        attachment
      };
    }

    const result = await service.queryAnalysis(baseSpec);
    const shouldAttach = embedChart && result.records.length > 0;
    const title = buildDefaultTitle(baseSpec);

    const attachment: AgentChartAttachment | undefined = shouldAttach
      ? {
          chartId,
          spec: { ...baseSpec, title },
          title,
          kpis: result.kpis,
          generatedAt: Date.now(),
          totalSnapshot: metric === 'count' ? result.totalCount : result.totalHours
        }
      : undefined;

    const sanitizedSummary: Record<string, unknown> = { ...result.summary };
    if (Array.isArray(sanitizedSummary.buckets)) {
      sanitizedSummary.buckets = sanitizedSummary.buckets.map((b: Record<string, unknown>) => ({
        ...b,
        name: typeof b.name === 'string' ? sanitizeLabel(b.name) : b.name
      }));
    }
    if (Array.isArray(sanitizedSummary.topGroups)) {
      sanitizedSummary.topGroups = sanitizedSummary.topGroups.map((g: Record<string, unknown>) => ({
        ...g,
        name: typeof g.name === 'string' ? sanitizeLabel(g.name) : g.name
      }));
    }

    return {
      toolJson: JSON.stringify({
        ...sanitizedSummary,
        ...(attachment ? { chartId, anchorToken: `[[chart:${chartId}]]` } : {})
      }),
      attachment
    };
  }

  public async getChronoInsights(): Promise<string> {
    const result = await ChronoAnalysisService.getInstance().generateInsights();
    const bounded = result.summaries.slice(0, MAX_INSIGHTS_ITEMS).map(ins => ({
      category: sanitizeLabel(ins.category, 60),
      sentiment: ins.sentiment,
      text: sanitizeLabel(ins.text, 240),
      items: ins.items.slice(0, 5).map(item => ({
        project: sanitizeLabel(item.project),
        details: sanitizeLabel(item.details, 160)
      }))
    }));
    return JSON.stringify({
      insightGroupsConfigured: result.insightGroupsConfigured,
      count: bounded.length,
      totalInsights: result.summaries.length,
      truncated: result.summaries.length > MAX_INSIGHTS_ITEMS,
      insights: bounded
    });
  }
}
