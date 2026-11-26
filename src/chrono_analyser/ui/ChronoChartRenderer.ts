/**
 * @file ChronoChartRenderer.ts
 * @brief Shared Plotly chart mount helper for embedded codeblocks, chat cards, and modals.
 */

import { App } from 'obsidian';
import { ChronoAnalysisService, type ChronoAnalysisQueryResult } from '../ChronoAnalysisService';
import type { ChronoChartSpec, TimeRecord } from '../data/types';
import { ensurePlotlyLoaded } from './plotly-custom';
import * as Plotter from './plotter';
import { DetailPopup } from './components/DetailPopup';

export interface ChronoChartRendererOptions {
  app: App;
  containerEl: HTMLElement;
  variant?: 'full' | 'compact';
  height?: number;
  onDetailPopup?: (
    categoryName: string,
    recordsList: TimeRecord[],
    context?: Record<string, unknown> & { value?: number | null }
  ) => void;
}

export class ChronoChartRenderer {
  private destroyed = false;
  private hasRenderedOnce = false;
  private lastChartType: ChronoChartSpec['chartType'] | null = null;
  private lastSpec: ChronoChartSpec | null = null;
  private lastResult: ChronoAnalysisQueryResult | null = null;
  private lastVariant: 'full' | 'compact' = 'compact';
  private renderSeq = 0;

  constructor(private options: ChronoChartRendererOptions) {}

  public async render(
    spec: ChronoChartSpec,
    variantOverride?: 'full' | 'compact'
  ): Promise<ChronoAnalysisQueryResult | null> {
    if (this.destroyed) return null;
    const seq = ++this.renderSeq;
    this.lastSpec = spec;
    const variant = variantOverride ?? this.options.variant ?? 'compact';
    this.lastVariant = variant;

    if (!this.options.containerEl.querySelector('#mainChart')) {
      this.options.containerEl.empty();
      this.options.containerEl.addClass('chrono-analyser-view');
      this.options.containerEl.createDiv({ attr: { id: 'mainChart' } });
    }

    try {
      await ensurePlotlyLoaded(this.options.app);
    } catch (err) {
      console.error('[ChronoChartRenderer] Failed to load Plotly:', err);
      if (!this.destroyed && seq === this.renderSeq) {
        Plotter.renderChartMessage(
          this.options.containerEl,
          'Failed to load charting library. Please check your connection.'
        );
      }
      return null;
    }

    if (this.destroyed || seq !== this.renderSeq) return null;

    const service = ChronoAnalysisService.getInstance();
    const result = await service.queryAnalysis(spec);

    if (this.destroyed || seq !== this.renderSeq) return null;

    this.lastResult = result;
    if (result.records.length === 0) {
      Plotter.renderChartMessage(this.options.containerEl, 'No data matches the current filters.');
      this.hasRenderedOnce = false;
      this.lastChartType = null;
      return result;
    }

    this.renderResult(result, spec, variant);
    return result;
  }

  public retheme(): void {
    if (
      this.destroyed ||
      !this.lastResult ||
      !this.lastSpec ||
      this.lastResult.records.length === 0 ||
      !window.Plotly
    ) {
      return;
    }
    this.renderResult(this.lastResult, this.lastSpec, this.lastVariant);
  }

  private renderResult(
    result: ChronoAnalysisQueryResult,
    spec: ChronoChartSpec,
    variant: 'full' | 'compact'
  ): void {
    const isNewChartType = !this.hasRenderedOnce || this.lastChartType !== spec.chartType;
    const useReact = !isNewChartType;
    const metric = spec.metric || 'duration';

    const showDetail =
      this.options.onDetailPopup ??
      ((categoryName, recordsList, context) => {
        DetailPopup.showInModal(this.options.app, categoryName, recordsList, context);
      });

    const plotterOptions: Plotter.PlotterRenderOptions = {
      variant,
      title: spec.title,
      height: this.options.height,
      breakdownLabel: spec.breakdownBy
        ? spec.breakdownBy.charAt(0).toUpperCase() + spec.breakdownBy.slice(1)
        : undefined,
      granularity: spec.granularity || 'daily',
      timeSeriesType: spec.timeSeriesType || 'line',
      stackingLevel: spec.stackingLevel || 'hierarchy',
      patternType: spec.patternType || 'dayOfWeek',
      timeSeriesData: result.chartData.kind === 'time-series' ? result.chartData.data : undefined,
      activityData: result.chartData.kind === 'activity' ? result.chartData.data : undefined
    };

    switch (result.chartData.kind) {
      case 'pie':
        Plotter.renderPieChartDisplay(
          this.options.containerEl,
          result.chartData.data,
          showDetail,
          useReact,
          isNewChartType,
          metric,
          plotterOptions
        );
        break;
      case 'sunburst':
        Plotter.renderSunburstChartDisplay(
          this.options.containerEl,
          result.chartData.data,
          showDetail,
          useReact,
          isNewChartType,
          metric,
          plotterOptions
        );
        break;
      case 'time-series':
        Plotter.renderTimeSeriesChart(
          this.options.containerEl,
          result.records,
          useReact,
          isNewChartType,
          metric,
          plotterOptions
        );
        break;
      case 'activity':
        Plotter.renderActivityPatternChart(
          this.options.containerEl,
          result.records,
          showDetail,
          useReact,
          isNewChartType,
          metric,
          plotterOptions
        );
        break;
    }

    this.hasRenderedOnce = true;
    this.lastChartType = spec.chartType;
  }

  public getLastSpec(): ChronoChartSpec | null {
    return this.lastSpec;
  }

  public resize(): void {
    if (this.destroyed) return;
    const plotlyEl = this.options.containerEl.querySelector<HTMLElement>('.js-plotly-plot');
    if (plotlyEl && window.Plotly) {
      window.Plotly.Plots.resize(plotlyEl);
    }
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.lastResult = null;
    Plotter.destroyChart(this.options.containerEl);
    this.options.containerEl.empty();
  }
}
