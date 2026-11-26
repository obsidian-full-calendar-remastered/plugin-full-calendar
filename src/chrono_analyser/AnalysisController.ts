import { showNotice } from '../utils/showNotice';
import { PluginState } from '../core/PluginState';
import { App } from 'obsidian';
import FullCalendarPlugin from '../main';
import * as Plotter from './ui/plotter';
import { DataManager } from './data/DataManager';
import { UIService, ChartType, FilterPayload } from './ui/UIService';
import { ChronoAnalysisService } from './ChronoAnalysisService';
import { DemoDataService } from './data/DemoDataService';
import { TimeRecord } from './data/types';
import { InsightsEngine } from './data/InsightsEngine';
import { InsightConfigModal, InsightsConfig } from './ui/ui';
import { t } from '../features/i18n/i18n';
import { ensurePlotlyLoaded } from './ui/plotly-custom';

export class AnalysisController {
  public uiService: UIService;
  public demoDataService: DemoDataService;
  public dataManager: DataManager;
  public insightsEngine: InsightsEngine;
  public rootEl: HTMLElement;

  private activeChartType: ChartType | null = null;
  private isChartRendered = false;
  private liveDataInitialized = false;
  private liveServiceUnsubscribe: (() => void) | null = null;
  private demoModeActive = false;
  private demoModeDisabledForSession = false;
  private forceLiveDataOnInit = false;

  private activePieBreakdown: string | null = null;
  private activeSunburstLevel: string | null = null;
  private activeTimeSeriesGranularity: string | null = null;
  private activeTimeSeriesType: string | null = null;
  private activeActivityPattern: string | null = null;
  private pendingFilterPayload: FilterPayload | null = null;
  private hasDataReady = false;

  constructor(
    private app: App,
    rootEl: HTMLElement,
    private plugin: FullCalendarPlugin
  ) {
    this.rootEl = rootEl;
    this.dataManager = new DataManager();
    this.insightsEngine = new InsightsEngine();

    this.uiService = new UIService(
      app,
      rootEl,
      plugin,
      () => this.updateAnalysis(),
      () => {
        void this.handleGenerateInsights();
      },
      () => this.openInsightsConfigModal(),
      () => {
        this.openInsightsConfigModal();
      }
    );

    this.demoDataService = new DemoDataService(app, this.dataManager);
  }

  private async handleGenerateInsights() {
    const config = this.uiService.insightsConfig;
    if (!config || Object.keys(config.insightGroups).length === 0) {
      showNotice(t('notices.chronoAnalyserConfigureFirst'), 5000);
      return;
    }

    showNotice(t('notices.chronoAnalyserGeneratingInsights'));
    this.uiService.setInsightsLoading(true);

    const allRecords = this.dataManager.getAllRecords();
    try {
      const insights = await this.insightsEngine.generateInsights(allRecords, config);
      this.uiService.renderInsights(insights);
    } catch (error) {
      console.error('Error generating insights:', error);
      showNotice(t('notices.chronoAnalyserInsightsFailed'));
    } finally {
      this.uiService.setInsightsLoading(false);
    }
  }

  private openInsightsConfigModal() {
    new InsightConfigModal(
      this.app,
      this.uiService.insightsConfig,
      this.dataManager.getKnownHierarchies(),
      this.dataManager.getKnownProjects(),
      (newConfig: InsightsConfig) => {
        PluginState.getSettings().chrono_analyser_config = newConfig;
        void PluginState.saveSettings();
        this.uiService.insightsConfig = newConfig;
        showNotice(t('notices.chronoAnalyserInsightsSaved'));
        if (this.demoModeActive) {
          void this.disableDemoForSession();
        }
      }
    ).open();
  }

  public async initialize(): Promise<void> {
    await this.uiService.initialize();

    // Pre-load Plotly charting library asynchronously
    try {
      await ensurePlotlyLoaded(this.app);
    } catch (err) {
      console.error('[ChronoAnalyzer] Failed to load charting library from CDN:', err);
      showNotice(
        t('notices.chronoAnalyserChartLoadFailed') ||
          'Failed to load charting library from CDN. Please check your internet connection.'
      );
    }

    if (this.shouldOpenDemoMode()) {
      try {
        await this.initializeDemoData();
        return;
      } catch (error) {
        console.error('[ChronoAnalyzer] Failed to load demo data:', error);
        showNotice(t('notices.chronoAnalyserDemoLoadFailed'));
      }
    }

    await this.initializeLiveData();
  }

  private shouldOpenDemoMode(): boolean {
    if (this.forceLiveDataOnInit || this.demoModeDisabledForSession) {
      return false;
    }
    // Only show demo mode if user has not configured insights
    return !DemoDataService.hasConfiguredInsights(PluginState.getSettings().chrono_analyser_config);
  }

  private async initializeDemoData(): Promise<void> {
    if (this.liveDataInitialized) {
      this.liveServiceUnsubscribe?.();
      this.liveServiceUnsubscribe = null;
      this.liveDataInitialized = false;
    }
    this.dataManager = new DataManager();
    this.demoDataService = new DemoDataService(this.app, this.dataManager);

    const demoResult = await this.demoDataService.loadDemoData();
    this.demoModeActive = true;
    this.uiService.insightsConfig = demoResult.insightsConfig;
    this.uiService.setDemoMode(true);
    showNotice(
      demoResult.fromCache
        ? t('notices.chronoAnalyserDemoLoadedFromCache')
        : t('notices.chronoAnalyserDemoLoaded')
    );
    this.handleDataReady();
  }

  private async initializeLiveData(): Promise<void> {
    this.demoModeActive = false;
    this.uiService.setDemoMode(false);

    if (!PluginState.getCache().initialized) {
      showNotice(t('notices.chronoAnalyserInitializing'), 2000);
    }

    const service = ChronoAnalysisService.getInstance();
    this.dataManager = service.dataManager;
    await service.ensureInitialized();

    if (!this.liveDataInitialized) {
      this.liveServiceUnsubscribe = service.subscribe(() => this.handleDataReady());
      this.liveDataInitialized = true;
    }
    this.handleDataReady();
  }

  public destroy(): void {
    Plotter.destroyChart(this.rootEl);
    this.uiService.destroy();
    if (this.liveDataInitialized) {
      this.liveServiceUnsubscribe?.();
      this.liveServiceUnsubscribe = null;
      this.liveDataInitialized = false;
    }
  }

  private async disableDemoForSession(): Promise<void> {
    this.demoModeDisabledForSession = true;
    this.demoModeActive = false;
    this.dataManager.clear();
    this.uiService.insightsConfig = PluginState.getSettings().chrono_analyser_config || null;
    await this.initializeLiveData();
  }

  public applyFilterPayload(payload: FilterPayload, options?: { forceLiveData?: boolean }): void {
    if (options?.forceLiveData) {
      this.forceLiveDataOnInit = true;
    }
    if (this.demoModeActive && options?.forceLiveData) {
      this.pendingFilterPayload = payload;
      void this.disableDemoForSession();
      return;
    }
    if (!this.hasDataReady) {
      this.pendingFilterPayload = payload;
      return;
    }
    this.uiService.setControlPanelState(payload);
  }

  private handleDataReady(): void {
    this.hasDataReady = true;
    this.activeChartType = null;
    this.isChartRendered = false;
    this.uiService.populateFilterDataSources(
      () => this.dataManager.getKnownHierarchies(),
      () => this.dataManager.getKnownProjects()
    );
    if (this.pendingFilterPayload) {
      const payload = this.pendingFilterPayload;
      this.pendingFilterPayload = null;
      this.uiService.setControlPanelState(payload);
      return;
    }
    this.updateAnalysis();
  }

  private updateAnalysis(): void {
    this.uiService.saveState(null);

    const { filters, newChartType, metric } = this.uiService.getFilterState();
    const chartSpecificFilters = this.uiService.getChartSpecificFilter(newChartType);

    const isNewChartType = this.activeChartType !== newChartType;
    let useReact = !isNewChartType && this.isChartRendered;

    if (!isNewChartType) {
      switch (chartSpecificFilters.chart) {
        case 'pie':
          if (this.activePieBreakdown !== chartSpecificFilters.breakdownBy) useReact = false;
          break;
        case 'sunburst':
          if (this.activeSunburstLevel !== chartSpecificFilters.level) useReact = false;
          break;
        case 'time-series':
          if (
            this.activeTimeSeriesGranularity !== chartSpecificFilters.granularity ||
            this.activeTimeSeriesType !== chartSpecificFilters.type
          ) {
            useReact = false;
          }
          break;
        case 'activity':
          if (this.activeActivityPattern !== chartSpecificFilters.patternType) useReact = false;
          break;
      }
    }

    // REFACTOR: Tell DataManager to expand events for time-based charts or count metric
    const expandRecurring =
      chartSpecificFilters.chart === 'time-series' ||
      chartSpecificFilters.chart === 'activity' ||
      metric === 'count';
    const { records, totalHours, fileCount } = this.dataManager.getAnalyzedData(
      filters,
      null, // breakdown is handled by the chart strategy if needed
      { expandRecurring }
    );

    this.renderUI(records, totalHours, fileCount, useReact, isNewChartType, metric);

    this.activeChartType = newChartType;
    switch (chartSpecificFilters.chart) {
      case 'pie':
        this.activePieBreakdown = chartSpecificFilters.breakdownBy;
        this.activeSunburstLevel = null;
        this.activeTimeSeriesGranularity = null;
        this.activeTimeSeriesType = null;
        this.activeActivityPattern = null;
        break;
      case 'sunburst':
        this.activeSunburstLevel = chartSpecificFilters.level;
        this.activePieBreakdown = null;
        this.activeTimeSeriesGranularity = null;
        this.activeTimeSeriesType = null;
        this.activeActivityPattern = null;
        break;
      case 'time-series':
        this.activeTimeSeriesGranularity = chartSpecificFilters.granularity;
        this.activeTimeSeriesType = chartSpecificFilters.type;
        this.activePieBreakdown = null;
        this.activeSunburstLevel = null;
        this.activeActivityPattern = null;
        break;
      case 'activity':
        this.activeActivityPattern = chartSpecificFilters.patternType;
        this.activePieBreakdown = null;
        this.activeSunburstLevel = null;
        this.activeTimeSeriesGranularity = null;
        this.activeTimeSeriesType = null;
        break;
      default:
        this.activePieBreakdown = null;
        this.activeSunburstLevel = null;
        this.activeTimeSeriesGranularity = null;
        this.activeTimeSeriesType = null;
        this.activeActivityPattern = null;
    }
  }

  private renderUI(
    records: TimeRecord[],
    totalHours: number,
    fileCount: number,
    useReact: boolean,
    isNewChartType: boolean,
    metric: 'duration' | 'count'
  ): void {
    Plotter.renderErrorLog(this.rootEl, [], this.dataManager.getTotalRecordCount());

    if (this.dataManager.getTotalRecordCount() === 0) {
      this.uiService.hideMainContainers();
      Plotter.renderChartMessage(
        this.rootEl,
        'No time-tracking events found in your configured Full Calendar sources.'
      );
      this.isChartRendered = false;
      return;
    }

    this.uiService.showMainContainers();

    if (records.length === 0) {
      this.uiService.renderStats('-', '-');
      this.uiService.updateActiveAnalysisStat('N/A');
      Plotter.renderChartMessage(this.rootEl, 'No data matches the current filters.');
      this.isChartRendered = false;
      return;
    }

    // Update Stats
    if (metric === 'count') {
      const totalCount = records.length;
      this.uiService.renderStats(totalCount, fileCount);
      const labelEl = this.rootEl.querySelector('#totalHours + .stat-label');
      if (labelEl) labelEl.textContent = 'Total events';
    } else {
      this.uiService.renderStats(totalHours, fileCount);
      const labelEl = this.rootEl.querySelector('#totalHours + .stat-label');
      if (labelEl) labelEl.textContent = 'Total hours (filtered)';
    }

    const { newChartType } = this.uiService.getFilterState();
    const chartSpecificFilters = this.uiService.getChartSpecificFilter(newChartType);

    this.uiService.updateActiveAnalysisStat(
      newChartType ? newChartType.charAt(0).toUpperCase() + newChartType.slice(1) : 'None'
    );

    if (!newChartType) {
      this.uiService.hideMainContainers();
      return;
    }

    this.isChartRendered = true;

    // Render Chart
    switch (chartSpecificFilters.chart) {
      case 'pie': {
        const pieData = this.dataManager.preparePieChartData(
          records,
          chartSpecificFilters.breakdownBy,
          metric
        );
        Plotter.renderPieChartDisplay(
          this.rootEl,
          pieData,
          this.uiService.showDetailPopup,
          useReact,
          isNewChartType,
          metric
        );
        break;
      }
      case 'sunburst': {
        const sunburstData = this.dataManager.prepareSunburstData(
          records,
          chartSpecificFilters.level,
          metric
        );
        Plotter.renderSunburstChartDisplay(
          this.rootEl,
          sunburstData,
          this.uiService.showDetailPopup,
          useReact,
          isNewChartType,
          metric
        );
        break;
      }
      case 'time-series': {
        const stackingLevel = (chartSpecificFilters.stackingLevel ||
          'hierarchy') as keyof TimeRecord;
        const timeSeriesData = this.dataManager.prepareTimeSeriesData(records, {
          granularity: chartSpecificFilters.granularity,
          chartType: chartSpecificFilters.type,
          stackingLevel,
          metric
        });
        Plotter.renderTimeSeriesChart(this.rootEl, records, useReact, isNewChartType, metric, {
          granularity: chartSpecificFilters.granularity,
          timeSeriesType: chartSpecificFilters.type,
          stackingLevel,
          timeSeriesData
        });
        break;
      }
      case 'activity': {
        const activityData = this.dataManager.prepareActivityPatternData(records, {
          patternType: chartSpecificFilters.patternType,
          metric
        });
        Plotter.renderActivityPatternChart(
          this.rootEl,
          records,
          this.uiService.showDetailPopup,
          useReact,
          isNewChartType,
          metric,
          {
            patternType: chartSpecificFilters.patternType,
            activityData
          }
        );
        break;
      }
      default:
        Plotter.renderChartMessage(this.rootEl, `Unknown chart type: ${newChartType}`);
        this.isChartRendered = false;
    }
  }
}
