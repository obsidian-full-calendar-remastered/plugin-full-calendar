/**
 * @file ChatAnalyticsCard.ts
 * @brief Interactive inline analytics chart card mounted inside AI chat messages.
 */

import { App, type EventRef, Modal, setIcon } from 'obsidian';
import type { AgentChartAttachment } from '../types';
import type { ChronoChartSpec, ChronoKpiPill } from '../../../chrono_analyser/data/types';
import { ChronoAnalysisService } from '../../../chrono_analyser/ChronoAnalysisService';
import { ChronoChartRenderer } from '../../../chrono_analyser/ui/ChronoChartRenderer';
import type { FilterPayload } from '../../../chrono_analyser/ui/UIService';
import { PluginState } from '../../../core/PluginState';
import { showNotice } from '../../../utils/showNotice';

class ExpandedChartModal extends Modal {
  private renderer: ChronoChartRenderer | null = null;

  constructor(
    app: App,
    private titleText: string,
    private spec: ChronoChartSpec
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ofc-agent-analytics-modal');
    this.setTitle(this.titleText);

    const chartHost = contentEl.createDiv({ cls: 'ofc-agent-analytics-modal-chart' });
    this.renderer = new ChronoChartRenderer({
      app: this.app,
      containerEl: chartHost,
      variant: 'full',
      height: 460
    });
    void this.renderer.render(this.spec, 'full');
  }

  onClose(): void {
    this.renderer?.destroy();
    this.renderer = null;
    this.contentEl.empty();
  }
}

function parseLocalIsoDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (match) {
    const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  const fallback = new Date(iso);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function isMobilePlatform(): boolean {
  try {
    return PluginState.isMobile();
  } catch {
    return false;
  }
}

function specToFilterPayload(spec: ChronoChartSpec): FilterPayload {
  const payload: FilterPayload = {
    metric: spec.metric || 'duration',
    analysisTypeSelect: spec.chartType
  };
  if (spec.hierarchy) payload.hierarchyFilterInput = spec.hierarchy;
  if (spec.project) payload.projectFilterInput = spec.project;
  if (spec.pattern) payload.patternInput = spec.pattern;
  if (spec.startDate && spec.endDate) {
    const start = parseLocalIsoDate(spec.startDate);
    const end = parseLocalIsoDate(spec.endDate);
    if (start && end) {
      payload.dateRangePicker = [start, end];
    }
  } else if (spec.startDate) {
    const start = parseLocalIsoDate(spec.startDate);
    if (start) {
      payload.dateRangePicker = [start, new Date()];
    }
  }
  if (spec.chartType === 'pie' && spec.breakdownBy) {
    payload.levelSelect_pie = spec.breakdownBy;
  } else if (spec.chartType === 'sunburst' && spec.level) {
    payload.levelSelect = spec.level;
  } else if (spec.chartType === 'time-series') {
    if (spec.granularity) payload.timeSeriesGranularitySelect = spec.granularity;
    if (spec.timeSeriesType) payload.timeSeriesTypeSelect = spec.timeSeriesType;
    if (spec.stackingLevel) payload.timeSeriesStackingLevelSelect = spec.stackingLevel;
  } else if (spec.chartType === 'activity' && spec.patternType) {
    payload.activityPatternTypeSelect = spec.patternType;
  }
  return payload;
}

function formatYamlScalar(value: string): string {
  if (/[:#"'[\]{}]|^\s|\s$|^-/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

export function specToCodeblock(spec: ChronoChartSpec): string {
  const lines = [
    '```fc-calendar',
    'widget: analysis',
    `chart: ${spec.chartType}`,
    `metric: ${spec.metric}`
  ];
  if (spec.startDate) lines.push(`startDate: ${spec.startDate}`);
  if (spec.endDate) lines.push(`endDate: ${spec.endDate}`);
  if (spec.hierarchy) lines.push(`pathFilter: ${formatYamlScalar(spec.hierarchy)}`);
  if (spec.project) lines.push(`projectFilter: ${formatYamlScalar(spec.project)}`);
  if (spec.pattern) lines.push(`pattern: ${formatYamlScalar(spec.pattern)}`);
  if (spec.chartType === 'pie' && spec.breakdownBy) {
    lines.push(`breakdownBy: ${spec.breakdownBy}`);
  } else if (spec.chartType === 'sunburst' && spec.level) {
    lines.push(`level: ${spec.level}`);
  } else if (spec.chartType === 'time-series') {
    if (spec.granularity) lines.push(`granularity: ${spec.granularity}`);
    if (spec.timeSeriesType) lines.push(`timeSeriesType: ${spec.timeSeriesType}`);
    if (spec.stackingLevel) lines.push(`stackBy: ${spec.stackingLevel}`);
  } else if (spec.chartType === 'activity' && spec.patternType) {
    lines.push(`patternType: ${spec.patternType}`);
  }
  lines.push('```');
  return lines.join('\n');
}

export class ChatAnalyticsCard {
  private rootEl: HTMLElement;
  private kpiRowEl: HTMLElement | null = null;
  private chartHostEl: HTMLElement;
  private renderer: ChronoChartRenderer;
  private currentSpec: ChronoChartSpec;
  private observer: IntersectionObserver | null = null;
  private unsubscribeService: (() => void) | null = null;
  private cssChangeRef: EventRef | null = null;
  private refreshTimer: number | null = null;
  private rethemeTimer: number | null = null;
  private hasMountedChart = false;
  private hasUserToggled = false;
  private destroyed = false;

  constructor(
    private app: App,
    parentEl: HTMLElement,
    private attachment: AgentChartAttachment
  ) {
    this.currentSpec = { ...attachment.spec };
    this.rootEl = parentEl.createDiv({ cls: 'ofc-agent-analytics-card' });

    this.renderHeader();
    this.kpiRowEl = this.rootEl.createDiv({ cls: 'ofc-agent-analytics-kpis' });
    this.renderKpis(this.attachment.kpis);
    this.renderToolbar();

    this.chartHostEl = this.rootEl.createDiv({ cls: 'ofc-agent-analytics-chart-host' });
    this.chartHostEl.createDiv({
      cls: 'ofc-agent-analytics-loading',
      text: 'Loading chart...'
    });

    this.renderer = new ChronoChartRenderer({
      app: this.app,
      containerEl: this.chartHostEl,
      variant: 'compact',
      height: 260
    });

    this.setupLazyMount();
  }

  private renderHeader(): void {
    const header = this.rootEl.createDiv({ cls: 'ofc-agent-analytics-header' });
    header.createDiv({ cls: 'ofc-agent-analytics-title', text: this.attachment.title });

    const chipsEl = header.createDiv({ cls: 'ofc-agent-analytics-chips' });
    if (this.currentSpec.startDate || this.currentSpec.endDate) {
      const rangeText = `${this.currentSpec.startDate || '...'} to ${this.currentSpec.endDate || '...'}`;
      chipsEl.createSpan({ cls: 'ofc-agent-analytics-chip', text: rangeText });
    }
    if (this.currentSpec.hierarchy) {
      chipsEl.createSpan({ cls: 'ofc-agent-analytics-chip', text: this.currentSpec.hierarchy });
    }
    if (this.currentSpec.project) {
      chipsEl.createSpan({ cls: 'ofc-agent-analytics-chip', text: this.currentSpec.project });
    }
  }

  private renderKpis(kpis: ChronoKpiPill[]): void {
    if (!this.kpiRowEl) return;
    this.kpiRowEl.empty();
    if (!kpis || kpis.length === 0) {
      this.kpiRowEl.addClass('is-hidden');
      return;
    }
    this.kpiRowEl.removeClass('is-hidden');
    for (const kpi of kpis) {
      const toneCls =
        kpi.tone === 'positive' ? 'is-positive' : kpi.tone === 'warning' ? 'is-warning' : '';
      const pill = this.kpiRowEl.createDiv({ cls: `ofc-agent-analytics-kpi ${toneCls}`.trim() });
      pill.createSpan({ cls: 'ofc-agent-analytics-kpi-label', text: kpi.label });
      pill.createSpan({ cls: 'ofc-agent-analytics-kpi-value', text: kpi.value });
    }
  }

  private async renderAndSyncKpis(): Promise<void> {
    const result = await this.renderer.render(this.currentSpec, 'compact');
    if (this.destroyed || !result) return;
    // Preserve comparison delta KPIs on initial render when data is non-empty; show live KPIs otherwise
    if (!this.hasUserToggled && this.attachment.comparisonSummary && result.records.length > 0) {
      return;
    }
    this.renderKpis(result.kpis);
  }

  private scheduleRefresh(): void {
    if (this.destroyed || !this.hasMountedChart) return;
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.renderAndSyncKpis();
    }, 250);
  }

  private scheduleRetheme(): void {
    if (this.destroyed || !this.hasMountedChart) return;
    if (this.rethemeTimer !== null) {
      window.clearTimeout(this.rethemeTimer);
    }
    this.rethemeTimer = window.setTimeout(() => {
      this.rethemeTimer = null;
      this.renderer.retheme();
    }, 150);
  }

  private renderToolbar(): void {
    const toolbar = this.rootEl.createDiv({ cls: 'ofc-agent-analytics-toolbar' });
    const leftGroup = toolbar.createDiv({
      cls: 'ofc-agent-analytics-toolbar-group',
      attr: { role: 'group', 'aria-label': 'Chart controls' }
    });
    const rightGroup = toolbar.createDiv({ cls: 'ofc-agent-analytics-toolbar-group' });

    const isCount = this.currentSpec.metric === 'count';
    const hoursBtn = leftGroup.createEl('button', {
      cls: `ofc-agent-analytics-toggle ${!isCount ? 'is-active' : ''}`,
      text: 'Hours',
      attr: { type: 'button', 'aria-pressed': String(!isCount) }
    });
    const countBtn = leftGroup.createEl('button', {
      cls: `ofc-agent-analytics-toggle ${isCount ? 'is-active' : ''}`,
      text: 'Count',
      attr: { type: 'button', 'aria-pressed': String(isCount) }
    });

    const setMetric = (metric: 'duration' | 'count') => {
      if (this.currentSpec.metric === metric) return;
      this.hasUserToggled = true;
      this.currentSpec = { ...this.currentSpec, metric };
      hoursBtn.toggleClass('is-active', metric === 'duration');
      countBtn.toggleClass('is-active', metric === 'count');
      hoursBtn.setAttribute('aria-pressed', String(metric === 'duration'));
      countBtn.setAttribute('aria-pressed', String(metric === 'count'));
      void this.renderAndSyncKpis();
    };
    hoursBtn.addEventListener('click', () => setMetric('duration'));
    countBtn.addEventListener('click', () => setMetric('count'));

    this.mountChartSwitcher(leftGroup);

    const expandBtn = rightGroup.createEl('button', {
      cls: 'clickable-icon ofc-agent-analytics-icon-btn',
      attr: { type: 'button', title: 'Expand chart', 'aria-label': 'Expand chart' }
    });
    setIcon(expandBtn, 'maximize-2');
    expandBtn.addEventListener('click', () => {
      new ExpandedChartModal(this.app, this.attachment.title, this.currentSpec).open();
    });

    if (!isMobilePlatform()) {
      const openTabBtn = rightGroup.createEl('button', {
        cls: 'clickable-icon ofc-agent-analytics-icon-btn',
        attr: {
          type: 'button',
          title: 'Open in chrono analyzer',
          'aria-label': 'Open in chrono analyzer'
        }
      });
      setIcon(openTabBtn, 'external-link');
      openTabBtn.addEventListener('click', () => {
        void import('../../../chrono_analyser/AnalysisView').then(({ activateAnalysisView }) =>
          activateAnalysisView(this.app, specToFilterPayload(this.currentSpec))
        );
      });
    }

    const copyBtn = rightGroup.createEl('button', {
      cls: 'clickable-icon ofc-agent-analytics-icon-btn',
      attr: {
        type: 'button',
        title: 'Copy codeblock',
        'aria-label': 'Copy codeblock'
      }
    });
    setIcon(copyBtn, 'copy');
    copyBtn.addEventListener('click', () => {
      void navigator.clipboard
        .writeText(specToCodeblock(this.currentSpec))
        .then(() => {
          showNotice('Codeblock copied to clipboard.');
        })
        .catch(() => {
          showNotice('Failed to copy codeblock.');
        });
    });
  }

  private mountChartSwitcher(groupEl: HTMLElement): void {
    const type = this.currentSpec.chartType;
    if (type === 'pie' || type === 'sunburst') {
      const pieBtn = groupEl.createEl('button', {
        cls: `ofc-agent-analytics-toggle ${type === 'pie' ? 'is-active' : ''}`,
        text: 'Pie',
        attr: { type: 'button', 'aria-pressed': String(type === 'pie') }
      });
      const sunBtn = groupEl.createEl('button', {
        cls: `ofc-agent-analytics-toggle ${type === 'sunburst' ? 'is-active' : ''}`,
        text: 'Sunburst',
        attr: { type: 'button', 'aria-pressed': String(type === 'sunburst') }
      });
      pieBtn.addEventListener('click', () => {
        if (this.currentSpec.chartType === 'pie') return;
        this.hasUserToggled = true;
        this.currentSpec = { ...this.currentSpec, chartType: 'pie' };
        pieBtn.addClass('is-active');
        sunBtn.removeClass('is-active');
        pieBtn.setAttribute('aria-pressed', 'true');
        sunBtn.setAttribute('aria-pressed', 'false');
        void this.renderAndSyncKpis();
      });
      sunBtn.addEventListener('click', () => {
        if (this.currentSpec.chartType === 'sunburst') return;
        this.hasUserToggled = true;
        this.currentSpec = { ...this.currentSpec, chartType: 'sunburst' };
        sunBtn.addClass('is-active');
        pieBtn.removeClass('is-active');
        sunBtn.setAttribute('aria-pressed', 'true');
        pieBtn.setAttribute('aria-pressed', 'false');
        void this.renderAndSyncKpis();
      });
    } else if (type === 'time-series') {
      const isStacked = this.currentSpec.timeSeriesType === 'stackedArea';
      const lineBtn = groupEl.createEl('button', {
        cls: `ofc-agent-analytics-toggle ${!isStacked ? 'is-active' : ''}`,
        text: 'Line',
        attr: { type: 'button', 'aria-pressed': String(!isStacked) }
      });
      const areaBtn = groupEl.createEl('button', {
        cls: `ofc-agent-analytics-toggle ${isStacked ? 'is-active' : ''}`,
        text: 'Stacked',
        attr: { type: 'button', 'aria-pressed': String(isStacked) }
      });
      lineBtn.addEventListener('click', () => {
        if (this.currentSpec.timeSeriesType === 'line') return;
        this.hasUserToggled = true;
        this.currentSpec = { ...this.currentSpec, timeSeriesType: 'line' };
        lineBtn.addClass('is-active');
        areaBtn.removeClass('is-active');
        lineBtn.setAttribute('aria-pressed', 'true');
        areaBtn.setAttribute('aria-pressed', 'false');
        void this.renderAndSyncKpis();
      });
      areaBtn.addEventListener('click', () => {
        if (this.currentSpec.timeSeriesType === 'stackedArea') return;
        this.hasUserToggled = true;
        this.currentSpec = { ...this.currentSpec, timeSeriesType: 'stackedArea' };
        areaBtn.addClass('is-active');
        lineBtn.removeClass('is-active');
        areaBtn.setAttribute('aria-pressed', 'true');
        lineBtn.setAttribute('aria-pressed', 'false');
        void this.renderAndSyncKpis();
      });
    } else if (type === 'activity') {
      const modes: { key: 'dayOfWeek' | 'hourOfDay' | 'heatmapDOWvsHOD'; label: string }[] = [
        { key: 'dayOfWeek', label: 'Day' },
        { key: 'hourOfDay', label: 'Hour' },
        { key: 'heatmapDOWvsHOD', label: 'Heatmap' }
      ];
      const buttons = new Map<string, HTMLButtonElement>();
      const activeMode = this.currentSpec.patternType || 'dayOfWeek';
      for (const mode of modes) {
        const btn = groupEl.createEl('button', {
          cls: `ofc-agent-analytics-toggle ${activeMode === mode.key ? 'is-active' : ''}`,
          text: mode.label,
          attr: { type: 'button', 'aria-pressed': String(activeMode === mode.key) }
        });
        buttons.set(mode.key, btn);
        btn.addEventListener('click', () => {
          if (this.currentSpec.patternType === mode.key) return;
          this.hasUserToggled = true;
          this.currentSpec = { ...this.currentSpec, patternType: mode.key };
          for (const [k, b] of buttons.entries()) {
            const active = k === mode.key;
            b.toggleClass('is-active', active);
            b.setAttribute('aria-pressed', String(active));
          }
          void this.renderAndSyncKpis();
        });
      }
    }
  }

  private setupLazyMount(): void {
    const mountNow = () => {
      if (this.destroyed || this.hasMountedChart) return;
      this.hasMountedChart = true;
      this.unsubscribeService = ChronoAnalysisService.getInstance().subscribe(() => {
        this.scheduleRefresh();
      });
      if (typeof this.app.workspace?.on === 'function') {
        this.cssChangeRef = this.app.workspace.on('css-change', () => {
          this.scheduleRetheme();
        });
      }
      void this.renderAndSyncKpis();
    };

    if (typeof IntersectionObserver === 'undefined') {
      mountNow();
      return;
    }

    this.observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.observer?.disconnect();
            this.observer = null;
            mountNow();
            break;
          }
        }
      },
      { threshold: 0.05 }
    );
    this.observer.observe(this.rootEl);
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.rethemeTimer !== null) {
      window.clearTimeout(this.rethemeTimer);
      this.rethemeTimer = null;
    }
    this.observer?.disconnect();
    this.observer = null;
    this.unsubscribeService?.();
    this.unsubscribeService = null;
    if (this.cssChangeRef && typeof this.app.workspace?.offref === 'function') {
      this.app.workspace.offref(this.cssChangeRef);
      this.cssChangeRef = null;
    }
    this.renderer.destroy();
    this.rootEl.remove();
  }
}
