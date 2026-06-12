import {
  EmbeddedWidgetStrategy,
  EmbeddedWidgetInstance,
  WidgetContext
} from '../features/codeblock/EmbeddedBlockRegistry';
import { DataManager } from './data/DataManager';
import { DataService } from './data/DataService';
import { PluginState } from '../core/PluginState';
import * as Plotter from './ui/plotter';
import { EmbeddedBlockRegistry } from '../features/codeblock/EmbeddedBlockRegistry';
import FullCalendarPlugin from '../main';
import { TimeRecord } from './data/types';

interface StrategyConfig {
  chart?: string;
  metric?: 'duration' | 'count';
  type?: string;
  stackBy?: string;
  granularity?: string;
  patternType?: string;
  titleFilter?: string;
  tagFilter?: string;
  pathFilter?: string;
  startDate?: string;
  endDate?: string;
  breakdownBy?: string;
  level?: string;
}

export class AnalysisWidgetStrategy implements EmbeddedWidgetStrategy {
  constructor(private plugin: FullCalendarPlugin) {}

  async render(
    el: HTMLElement,
    config: Record<string, unknown>,
    ctx: WidgetContext
  ): Promise<EmbeddedWidgetInstance> {
    el.empty();
    el.addClass('chrono-analyser-view'); // Re-use styling

    const configObj = config as StrategyConfig;

    // Create main chart div Plotter expects
    el.createDiv({ attr: { id: 'mainChart' } });

    // Inject hidden selectors to bridge configuration directly into plotter.ts
    const typeSelect = el.createEl('select', {
      attr: { id: 'timeSeriesTypeSelect' },
      cls: 'hidden-controls'
    });
    typeSelect.createEl('option', { attr: { value: configObj.type || 'line' } });

    const stackingSelect = el.createEl('select', {
      attr: { id: 'timeSeriesStackingLevelSelect' },
      cls: 'hidden-controls'
    });
    stackingSelect.createEl('option', { attr: { value: configObj.stackBy || 'hierarchy' } });

    const granularitySelect = el.createEl('select', {
      attr: { id: 'timeSeriesGranularitySelect' },
      cls: 'hidden-controls'
    });
    granularitySelect.createEl('option', { attr: { value: configObj.granularity || 'weekly' } });

    const patternSelect = el.createEl('select', {
      attr: { id: 'activityPatternTypeSelect' },
      cls: 'hidden-controls'
    });
    patternSelect.createEl('option', { attr: { value: configObj.patternType || 'dayOfWeek' } });

    // Create hidden error elements Plotter expects
    el.createDiv({ attr: { id: 'errorLogContainer' }, cls: 'hidden-controls' });
    el.createDiv({ attr: { id: 'errorLogSummary' }, cls: 'hidden-controls' });
    el.createDiv({ attr: { id: 'errorLogEntries' }, cls: 'hidden-controls' });

    // Initialize localized DataManager & DataService
    const dataManager = new DataManager();

    const handleDataUpdate = () => {
      const chartType = configObj.chart || 'sunburst';
      const metric: 'duration' | 'count' = configObj.metric || 'duration';
      const expandRecurring = chartType === 'time-series' || chartType === 'activity';

      const patterns: string[] = [];
      if (configObj.titleFilter) {
        patterns.push(`"${configObj.titleFilter}"`);
      }
      if (configObj.tagFilter) {
        patterns.push(`"${configObj.tagFilter}"`);
      }

      const filters = {
        pattern: patterns.join(' ') || undefined,
        hierarchy: configObj.pathFilter || undefined,
        filterStartDate: configObj.startDate ? new Date(configObj.startDate) : null,
        filterEndDate: configObj.endDate ? new Date(configObj.endDate) : null
      };

      const { records } = dataManager.getAnalyzedData(filters, null, { expandRecurring });

      if (records.length === 0) {
        Plotter.renderChartMessage(el, 'No data matches the current filters.');
        return;
      }

      // Delegate to Plotter strategy based on chart config
      switch (chartType) {
        case 'pie': {
          const breakdownBy = (configObj.breakdownBy || 'hierarchy') as keyof TimeRecord;
          const pieData = dataManager.preparePieChartData(records, breakdownBy, metric);
          Plotter.renderPieChartDisplay(el, pieData, () => {}, false, true, metric);
          break;
        }
        case 'sunburst': {
          const level = configObj.level || 'subcategory';
          const sunburstData = dataManager.prepareSunburstData(records, level, metric);
          Plotter.renderSunburstChartDisplay(el, sunburstData, () => {}, false, true, metric);
          break;
        }
        case 'time-series': {
          Plotter.renderTimeSeriesChart(el, records, false, true, metric);
          break;
        }
        case 'activity': {
          Plotter.renderActivityPatternChart(el, records, () => {}, false, true, metric);
          break;
        }
        default:
          Plotter.renderChartMessage(el, `Unknown chart type: ${chartType}`);
      }
    };

    const dataService = new DataService(
      PluginState.getCache(),
      dataManager,
      PluginState.getSettings(),
      () => handleDataUpdate()
    );
    dataService.initialize();

    // Trigger initial render
    handleDataUpdate();

    // Setup reactive callback
    ctx.onUpdate(() => {
      void dataService.initialize();
    });

    return {
      updateSize() {
        const plotlyEl = el.querySelector('.js-plotly-plot') as HTMLElement;
        const plotlyGlobal = (
          window as unknown as { Plotly?: { Plots: { resize: (el: HTMLElement) => void } } }
        ).Plotly;
        if (plotlyEl && plotlyGlobal) {
          plotlyGlobal.Plots.resize(plotlyEl);
        }
      },
      async refresh() {
        void dataService.initialize();
      },
      destroy() {
        dataService.destroy();
        dataManager.clear();
        el.empty();
      }
    };
  }
}

export function registerChronoAnalysisStrategy(plugin: FullCalendarPlugin): void {
  if (!EmbeddedBlockRegistry.has('analysis')) {
    EmbeddedBlockRegistry.register('analysis', new AnalysisWidgetStrategy(plugin));
  }
}
