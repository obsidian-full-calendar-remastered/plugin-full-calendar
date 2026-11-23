import {
  EmbeddedWidgetStrategy,
  EmbeddedWidgetInstance,
  WidgetContext,
  EmbeddedBlockRegistry
} from '../features/codeblock/EmbeddedBlockRegistry';
import { ChronoAnalysisService } from './ChronoAnalysisService';
import { ChronoChartRenderer } from './ui/ChronoChartRenderer';
import type { ChronoChartSpec } from './data/types';
import FullCalendarPlugin from '../main';

interface StrategyConfig {
  chart?: string;
  metric?: 'duration' | 'count';
  type?: string;
  timeSeriesType?: string;
  stackBy?: string;
  granularity?: string;
  patternType?: string;
  titleFilter?: string;
  tagFilter?: string;
  pathFilter?: string;
  projectFilter?: string;
  pattern?: string;
  startDate?: string;
  endDate?: string;
  breakdownBy?: string;
  level?: string;
}

function toChartSpec(configObj: StrategyConfig): ChronoChartSpec {
  const rawChart = configObj.chart || 'sunburst';
  const chartType: ChronoChartSpec['chartType'] =
    rawChart === 'pie' ||
    rawChart === 'sunburst' ||
    rawChart === 'time-series' ||
    rawChart === 'activity'
      ? rawChart
      : 'sunburst';

  const patterns: string[] = [];
  if (configObj.pattern) {
    patterns.push(configObj.pattern);
  }
  if (configObj.titleFilter) {
    patterns.push(`"${configObj.titleFilter}"`);
  }
  if (configObj.tagFilter) {
    patterns.push(`"${configObj.tagFilter}"`);
  }

  const rawTsType =
    configObj.timeSeriesType ||
    (configObj.type && configObj.type !== 'analysis' && configObj.type !== 'chart'
      ? configObj.type
      : undefined);

  return {
    chartType,
    metric: configObj.metric === 'count' ? 'count' : 'duration',
    startDate: configObj.startDate || undefined,
    endDate: configObj.endDate || undefined,
    hierarchy: configObj.pathFilter || undefined,
    project: configObj.projectFilter || undefined,
    pattern: patterns.join(' ') || undefined,
    breakdownBy: (configObj.breakdownBy as ChronoChartSpec['breakdownBy']) || 'hierarchy',
    level: configObj.level === 'project' ? 'project' : 'subproject',
    granularity: (configObj.granularity as ChronoChartSpec['granularity']) || 'weekly',
    timeSeriesType: (rawTsType as ChronoChartSpec['timeSeriesType']) || 'line',
    stackingLevel: (configObj.stackBy as ChronoChartSpec['stackingLevel']) || 'hierarchy',
    patternType: (configObj.patternType as ChronoChartSpec['patternType']) || 'dayOfWeek'
  };
}

export class AnalysisWidgetStrategy implements EmbeddedWidgetStrategy {
  constructor(private plugin: FullCalendarPlugin) {}

  async render(
    el: HTMLElement,
    config: Record<string, unknown>,
    ctx: WidgetContext
  ): Promise<EmbeddedWidgetInstance> {
    el.empty();
    el.addClass('chrono-analyser-view');

    const configObj = config as StrategyConfig;
    const spec = toChartSpec(configObj);
    const service = ChronoAnalysisService.getInstance();
    const renderer = new ChronoChartRenderer({
      app: this.plugin.app,
      containerEl: el,
      variant: 'full'
    });

    const renderChart = async () => {
      await renderer.render(spec, 'full');
    };

    const unsubscribe = service.subscribe(() => {
      void renderChart();
    });

    await renderChart();

    ctx.onUpdate(() => {
      void renderChart();
    });

    return {
      updateSize() {
        renderer.resize();
      },
      async refresh() {
        await renderChart();
      },
      destroy() {
        unsubscribe();
        renderer.destroy();
      }
    };
  }
}

export function registerChronoAnalysisStrategy(plugin: FullCalendarPlugin): void {
  if (!EmbeddedBlockRegistry.has('analysis')) {
    EmbeddedBlockRegistry.register('analysis', new AnalysisWidgetStrategy(plugin));
  }
}
