/**
 * @file Handles all chart rendering logic using the Plotly.js library.
 * Each function in this module takes prepared data and renders a specific type of chart to the DOM.
 */

import Plotly from './plotly-custom';
import {
  TimeRecord,
  SunburstData,
  PieData,
  TimeSeriesData,
  ActivityPatternData,
  PLOTLY_BASE_LAYOUT,
  PLOTLY_LIGHT_THEME,
  PLOTLY_DARK_THEME,
  ProcessingError
} from '../data/types';
import * as Utils from '../data/utils';
import { DataManager } from '../data/DataManager';
import { PluginState } from '../../core/PluginState';

export interface PlotterRenderOptions {
  variant?: 'full' | 'compact';
  title?: string;
  breakdownLabel?: string;
  granularity?: 'daily' | 'weekly' | 'monthly';
  timeSeriesType?: 'line' | 'stackedArea';
  stackingLevel?: keyof TimeRecord;
  patternType?: 'dayOfWeek' | 'hourOfDay' | 'heatmapDOWvsHOD';
  height?: number;
  timeSeriesData?: TimeSeriesData;
  activityData?: ActivityPatternData;
}

interface DetailPopupContextBase {
  [key: string]: unknown;
  value?: number | null;
}
type ShowDetailPopupFn = (
  categoryName: string,
  recordsList: TimeRecord[],
  context?: DetailPopupContextBase
) => void;

type PlotlyPoint = {
  label?: string | number;
  value?: number | string;
  id?: string | number;
  x?: string | number;
  y?: string | number;
  z?: number | string;
};

type PlotlyEvent = { points?: PlotlyPoint[] } | null | undefined;

// Type guard for Obsidian HTMLElement extensions
interface ObsidianHTMLElement extends HTMLElement {
  empty(): void;
  createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    o?: { cls?: string; text?: string; attr?: Record<string, string> } | string,
    callback?: (el: HTMLElementTagNameMap[K]) => void
  ): HTMLElementTagNameMap[K];
  createDiv(
    o?: { cls?: string; text?: string; attr?: Record<string, string> } | string
  ): HTMLDivElement;
}

// Helper functions to safely interact with DOM elements
function safeEmpty(element: HTMLElement): void {
  const maybe = element as Partial<ObsidianHTMLElement>;
  if (typeof maybe.empty === 'function') {
    maybe.empty();
    element.innerHTML = '';
  } else {
    element.textContent = '';
  }
}

interface CreateOptions {
  cls?: string;
  text?: string;
  attr?: Record<string, string>;
}
function safeCreateEl(element: HTMLElement, tag: string, options?: CreateOptions): HTMLElement {
  const maybe = element as Partial<ObsidianHTMLElement>;
  if (typeof maybe.createEl === 'function') {
    return maybe.createEl(tag as keyof HTMLElementTagNameMap, options) as HTMLElement;
  }

  const newEl = createEl(tag as keyof HTMLElementTagNameMap);
  if (options) {
    if (options.cls) newEl.className = options.cls;
    if (options.text) newEl.textContent = options.text;
    if (options.attr) {
      Object.entries(options.attr).forEach(([key, value]) => newEl.setAttribute(key, value));
    }
  }
  element.appendChild(newEl);
  return newEl;
}

function safeCreateDiv(element: HTMLElement, options?: CreateOptions): HTMLDivElement {
  return safeCreateEl(element, 'div', options) as HTMLDivElement;
}

function setupPlotlyEvents(
  element: HTMLElement,
  eventType: string,
  handler: (eventData: unknown) => void
): void {
  const maybe = element as unknown as {
    removeAllListeners?: (evt: string) => void;
    on?: (evt: string, cb: (d: unknown) => void) => void;
  };
  maybe.removeAllListeners?.(eventType);
  maybe.on?.(eventType, handler);
}

const pendingResizeElements = new Set<HTMLElement>();
let resizeFlushTimer: number | null = null;

function scheduleChartResize(element: HTMLElement): void {
  pendingResizeElements.add(element);
  if (resizeFlushTimer !== null) {
    window.clearTimeout(resizeFlushTimer);
  }
  resizeFlushTimer = window.setTimeout(() => {
    resizeFlushTimer = null;
    const elements = Array.from(pendingResizeElements);
    pendingResizeElements.clear();
    if (!window.Plotly) return;
    for (const el of elements) {
      if (el.isConnected && el.offsetParent !== null) {
        Plotly.Plots.resize(el);
      }
    }
  }, 100);
}

const chartResizeObserver =
  typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(entries => {
        for (const entry of entries) {
          const element = entry.target as HTMLElement;
          if (element.offsetParent !== null) {
            scheduleChartResize(element);
          }
        }
      })
    : null;

const observedCharts = new Set<HTMLElement>();
let plotterCleanupRegistered = false;

export function cleanupPlotterObservers(): void {
  if (resizeFlushTimer !== null) {
    window.clearTimeout(resizeFlushTimer);
    resizeFlushTimer = null;
  }
  pendingResizeElements.clear();
  for (const el of observedCharts) {
    chartResizeObserver?.unobserve(el);
  }
  observedCharts.clear();
  plotterCleanupRegistered = false;
}

function manageChartResizeObserver(element: HTMLElement) {
  if (!plotterCleanupRegistered) {
    plotterCleanupRegistered = true;
    PluginState.registerCleanup(() => cleanupPlotterObservers());
  }
  if (chartResizeObserver && !observedCharts.has(element)) {
    chartResizeObserver.observe(element);
    observedCharts.add(element);
  }
}

export function destroyChart(rootEl: HTMLElement): void {
  const candidates = [
    rootEl.querySelector<HTMLElement>('.js-plotly-plot'),
    rootEl.querySelector<HTMLElement>('.sunburst-chart-div'),
    rootEl.querySelector<HTMLElement>('#mainChart')
  ];
  for (const el of candidates) {
    if (!el) continue;
    pendingResizeElements.delete(el);
    if (observedCharts.has(el)) {
      chartResizeObserver?.unobserve(el);
      observedCharts.delete(el);
    }
    if (window.Plotly) {
      try {
        Plotly.purge(el);
      } catch {
        // Ignore purge errors on detached elements
      }
    }
  }
}

export function renderChartMessage(rootEl: HTMLElement, message: string) {
  const mainChartEl = rootEl.querySelector<HTMLElement>('#mainChart');
  if (!mainChartEl) return;

  destroyChart(rootEl);

  safeEmpty(mainChartEl);
  safeCreateEl(mainChartEl, 'p', { cls: 'chart-message', text: message });
}

function resolveThemeColors(ownerDocument: Document): {
  textColor: string;
  borderColor: string;
  bgColor: string;
} {
  const isDarkMode = ownerDocument.body.classList.contains('theme-dark');
  const fallbackText = isDarkMode ? '#dcddde' : '#2e3338';
  const fallbackBorder = isDarkMode ? '#3a3a3a' : '#d4d4d4';
  const fallbackBg = isDarkMode ? '#1e1e1e' : '#ffffff';

  try {
    const view = ownerDocument.defaultView;
    if (!view || typeof view.getComputedStyle !== 'function') {
      return { textColor: fallbackText, borderColor: fallbackBorder, bgColor: fallbackBg };
    }
    const styles = view.getComputedStyle(ownerDocument.body);
    return {
      textColor: styles.getPropertyValue('--text-normal').trim() || fallbackText,
      borderColor: styles.getPropertyValue('--background-modifier-border').trim() || fallbackBorder,
      bgColor: styles.getPropertyValue('--background-primary').trim() || fallbackBg
    };
  } catch {
    return { textColor: fallbackText, borderColor: fallbackBorder, bgColor: fallbackBg };
  }
}

function getThemedLayout(
  chartLayout: Partial<Plotly.Layout>,
  ownerDocument: Document
): Partial<Plotly.Layout> {
  const isDarkMode = ownerDocument.body.classList.contains('theme-dark');
  const theme = isDarkMode ? PLOTLY_DARK_THEME : PLOTLY_LIGHT_THEME;
  const { textColor, borderColor } = resolveThemeColors(ownerDocument);
  return {
    ...PLOTLY_BASE_LAYOUT,
    ...theme,
    font: {
      ...PLOTLY_BASE_LAYOUT.font,
      ...theme.font,
      color: textColor
    },
    xaxis: {
      ...theme.xaxis,
      gridcolor: borderColor,
      linecolor: borderColor,
      ...chartLayout.xaxis
    },
    yaxis: {
      ...theme.yaxis,
      gridcolor: borderColor,
      linecolor: borderColor,
      ...chartLayout.yaxis
    },
    legend: {
      ...theme.legend,
      bordercolor: borderColor,
      ...chartLayout.legend
    },
    ...chartLayout,
    ...(chartLayout.xaxis
      ? {
          xaxis: {
            ...theme.xaxis,
            gridcolor: borderColor,
            linecolor: borderColor,
            ...chartLayout.xaxis
          }
        }
      : {}),
    ...(chartLayout.yaxis
      ? {
          yaxis: {
            ...theme.yaxis,
            gridcolor: borderColor,
            linecolor: borderColor,
            ...chartLayout.yaxis
          }
        }
      : {})
  };
}

function plotChart(
  mainChartEl: HTMLElement,
  data: Plotly.Data[],
  layout: Partial<Plotly.Layout>,
  useReact: boolean,
  options?: PlotterRenderOptions
) {
  const isCompact = options?.variant === 'compact';
  const heightOverride = options?.height ?? (isCompact ? 260 : undefined);
  const mergedLayout: Partial<Plotly.Layout> = {
    ...layout,
    ...(heightOverride ? { height: heightOverride } : {})
  };
  const finalLayout = getThemedLayout(mergedLayout, mainChartEl.ownerDocument);
  const config: Partial<Plotly.Config> = isCompact
    ? { responsive: true, displayModeBar: false }
    : { responsive: true };

  if (useReact) {
    void Plotly.react(mainChartEl, data, finalLayout, config);
  } else {
    void Plotly.newPlot(mainChartEl, data, finalLayout, config);
  }
  manageChartResizeObserver(mainChartEl);
}

export function renderPieChartDisplay(
  rootEl: HTMLElement,
  pieData: PieData,
  showDetailPopup: ShowDetailPopupFn,
  useReact: boolean,
  isNewChartType: boolean,
  metric: 'duration' | 'count',
  options?: PlotterRenderOptions
) {
  const mainChartEl = rootEl.querySelector<HTMLElement>('#mainChart');
  if (!mainChartEl) return;

  if (isNewChartType) {
    destroyChart(rootEl);
    safeEmpty(mainChartEl);
  }

  const isCompact = options?.variant === 'compact';
  const { bgColor } = resolveThemeColors(mainChartEl.ownerDocument);
  const levelSelect = rootEl.querySelector<HTMLSelectElement>('#levelSelect_pie');
  const chartTitleText =
    options?.breakdownLabel ||
    (levelSelect ? levelSelect.selectedOptions[0].text.split('(')[0].trim() : 'Category');
  const data: Plotly.Data[] = [
    {
      type: 'pie',
      labels: Array.from(pieData.hours.keys()),
      values: Array.from(pieData.hours.values()),
      textinfo: isCompact ? 'percent' : 'label+percent',
      textposition: isCompact ? 'inside' : 'outside',
      hoverinfo: 'label+value+percent',
      marker: { line: { color: bgColor, width: 2 } }
    }
  ];

  const layout: Partial<Plotly.Layout> = {
    title: options?.title
      ? { text: options.title }
      : isCompact
        ? undefined
        : {
            text: `${metric === 'count' ? 'Event Count' : 'Time'} Distribution by ${chartTitleText}`
          },
    showlegend: true,
    ...(isCompact ? { legend: { orientation: 'h', y: -0.15 } } : {}),
    margin: isCompact ? { l: 12, r: 12, t: 16, b: 44 } : { l: 40, r: 40, t: 60, b: 80 }
  };

  plotChart(mainChartEl, data, layout, useReact, options);

  // Set up event handling with proper typing
  setupPlotlyEvents(mainChartEl, 'plotly_click', (eventData: unknown) => {
    const points = (eventData as PlotlyEvent)?.points;
    const point = points?.[0];
    if (!point || point.label === undefined) return;
    const categoryName = String(point.label);
    const recordsForCategory = pieData.recordsByCategory.get(categoryName);
    if (recordsForCategory) {
      showDetailPopup(categoryName, recordsForCategory, {
        type: 'pie',
        metric,
        value: typeof point.value === 'number' ? point.value : Number(point.value) || null
      });
    }
  });
}

export function renderSunburstChartDisplay(
  rootEl: HTMLElement,
  sunburstData: SunburstData,
  showDetailPopup: ShowDetailPopupFn,
  useReact: boolean,
  isNewChartType: boolean,
  metric: 'duration' | 'count',
  options?: PlotterRenderOptions
) {
  const mainContainerEl = rootEl.querySelector<HTMLElement>('#mainChart');
  if (!mainContainerEl) return;

  if (isNewChartType) {
    destroyChart(rootEl);
    safeEmpty(mainContainerEl);
    const wrapper = safeCreateDiv(mainContainerEl, { cls: 'sunburst-wrapper' });
    safeCreateDiv(wrapper, { cls: 'sunburst-chart-div' });
    safeCreateDiv(wrapper, {
      cls: 'custom-legend',
      attr: { id: 'customLegend' } // Keep ID for now, style with class
    });
  }

  const chartEl = mainContainerEl.querySelector<HTMLElement>('.sunburst-chart-div');
  const legendEl = mainContainerEl.querySelector<HTMLElement>('.custom-legend');
  if (!chartEl || !legendEl) return;

  const isCompact = options?.variant === 'compact';
  const data: Plotly.Data[] = [
    {
      type: 'sunburst',
      ids: sunburstData.ids,
      labels: sunburstData.labels,
      parents: sunburstData.parents,
      values: sunburstData.values,
      branchvalues: 'total',
      hoverinfo: 'text'
      // Note: insidetextorientation property exists in Plotly but not in TypeScript types
    }
  ];

  const layout: Partial<Plotly.Layout> = {
    title: options?.title
      ? { text: options.title }
      : isCompact
        ? undefined
        : { text: metric === 'count' ? 'Event Count Breakdown' : 'Time Breakdown' },
    margin: isCompact ? { l: 8, r: 8, b: 8, t: 16 } : { l: 0, r: 0, b: 0, t: 40 },
    showlegend: false
  };

  plotChart(chartEl, data, layout, useReact, options);
  if (legendEl) {
    safeEmpty(legendEl);
  }

  setupPlotlyEvents(chartEl, 'plotly_sunburstclick', (eventData: unknown) => {
    const points = (eventData as PlotlyEvent)?.points;
    const point = points?.[0];
    if (!point || point.id === undefined || point.label === undefined) return;
    const recordsForPoint = sunburstData.recordsByLabel.get(String(point.id));
    if (recordsForPoint) {
      showDetailPopup(String(point.label), recordsForPoint, {
        type: 'sunburst',
        metric,
        value: typeof point.value === 'number' ? point.value : Number(point.value) || null
      });
    }
  });
}

export function renderTimeSeriesChart(
  rootEl: HTMLElement,
  filteredRecords: TimeRecord[],
  useReact: boolean,
  isNewChartType: boolean,
  metric: 'duration' | 'count',
  options?: PlotterRenderOptions
) {
  const mainChartEl = rootEl.querySelector<HTMLElement>('#mainChart');
  if (!mainChartEl) return;
  if (isNewChartType) {
    destroyChart(rootEl);
    safeEmpty(mainChartEl);
  }

  if (!filteredRecords || filteredRecords.length === 0) {
    renderChartMessage(rootEl, 'No data available for Time-Series chart.');
    return;
  }

  const granularity = (options?.granularity ||
    rootEl.querySelector<HTMLSelectElement>('#timeSeriesGranularitySelect')?.value) as
    'daily' | 'weekly' | 'monthly' | undefined;
  const chartType = (options?.timeSeriesType ||
    rootEl.querySelector<HTMLSelectElement>('#timeSeriesTypeSelect')?.value) as
    'line' | 'stackedArea' | undefined;
  const stackingLevel = (options?.stackingLevel ||
    rootEl.querySelector<HTMLSelectElement>('#timeSeriesStackingLevelSelect')?.value) as
    keyof TimeRecord | undefined;
  if (!granularity || !chartType || !stackingLevel) return;

  const tsData =
    options?.timeSeriesData ??
    new DataManager().prepareTimeSeriesData(filteredRecords, {
      granularity,
      chartType,
      stackingLevel,
      metric
    });

  if (tsData.periods.length === 0) {
    renderChartMessage(rootEl, 'No data points to plot for Time-Series.');
    return;
  }

  const traces: Partial<Plotly.PlotData>[] = [];
  if (chartType === 'line') {
    traces.push({
      x: tsData.periods,
      y: tsData.totals,
      type: 'scatter',
      mode: 'lines+markers',
      name: metric === 'count' ? 'Total Events' : 'Total Hours'
    });
  } else {
    for (const [category, values] of Object.entries(tsData.categories)) {
      traces.push({
        x: tsData.periods,
        y: values,
        type: 'scatter',
        mode: 'lines',
        stackgroup: 'one',
        name: category,
        hoverinfo: 'x+y+name'
      });
    }
  }

  const isCompact = options?.variant === 'compact';
  const layout: Partial<Plotly.Layout> = {
    title: options?.title
      ? { text: options.title }
      : isCompact
        ? undefined
        : {
            text: `${metric === 'count' ? 'Event Count' : 'Time Spent'} (${granularity}) - ${
              chartType === 'line' ? 'Overall Trend' : `Stacked by ${String(stackingLevel)}`
            }`
          },
    xaxis: { title: isCompact ? undefined : { text: 'Period' }, type: 'date' },
    yaxis: { title: { text: metric === 'count' ? 'Count' : 'Hours' } },
    margin: isCompact ? { t: 16, b: 44, l: 40, r: 16 } : { t: 50, b: 80, l: 60, r: 30 },
    ...(isCompact ? { legend: { orientation: 'h', y: -0.25 } } : {}),
    hovermode: 'x unified'
  };
  plotChart(mainChartEl, traces, layout, useReact, options);
}

export function renderActivityPatternChart(
  rootEl: HTMLElement,
  filteredRecords: TimeRecord[],
  showDetailPopup: ShowDetailPopupFn,
  useReact: boolean,
  isNewChartType: boolean,
  metric: 'duration' | 'count',
  options?: PlotterRenderOptions
) {
  const mainChartEl = rootEl.querySelector<HTMLElement>('#mainChart');
  if (!mainChartEl) return;
  if (isNewChartType) {
    destroyChart(rootEl);
    safeEmpty(mainChartEl);
  }

  if (!filteredRecords || filteredRecords.length === 0) {
    renderChartMessage(rootEl, 'No data available for Activity Patterns.');
    return;
  }

  const patternTypeEl = rootEl.querySelector<HTMLSelectElement>('#activityPatternTypeSelect');
  const patternType = (options?.patternType || patternTypeEl?.value) as
    'dayOfWeek' | 'hourOfDay' | 'heatmapDOWvsHOD' | undefined;
  if (!patternType) return;
  const analysisTypeName =
    patternTypeEl?.selectedOptions[0]?.text ||
    (patternType === 'dayOfWeek'
      ? 'Day of Week'
      : patternType === 'hourOfDay'
        ? 'Hour of Day'
        : 'Activity Heatmap');

  const actData =
    options?.activityData ??
    new DataManager().prepareActivityPatternData(filteredRecords, {
      patternType,
      metric
    });

  const isCompact = options?.variant === 'compact';
  let data: Partial<Plotly.PlotData>[] = [];
  let layout: Partial<Plotly.Layout> = {};
  let plotType: 'bar' | 'heatmap' = 'bar';
  const daysOfWeekLabels = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
  ];
  const activityLayoutMargin = isCompact
    ? { t: 16, b: 44, l: 44, r: 16 }
    : { t: 50, b: 60, l: 70, r: 30 };

  if (patternType === 'dayOfWeek') {
    data = [{ x: actData.labelsX, y: actData.values1D || [], type: 'bar' }];
    layout = {
      title: options?.title
        ? { text: options.title }
        : isCompact
          ? undefined
          : { text: `Total ${metric === 'count' ? 'Events' : 'Hours'} by Day of Week` },
      yaxis: { title: { text: metric === 'count' ? 'Count' : 'Hours' } },
      margin: activityLayoutMargin
    };
  } else if (patternType === 'hourOfDay') {
    data = [{ x: actData.labelsX, y: actData.values1D || [], type: 'bar' }];
    layout = {
      title: options?.title
        ? { text: options.title }
        : isCompact
          ? undefined
          : { text: `Total ${metric === 'count' ? 'Events' : 'Hours'} by Task Start Hour` },
      xaxis: { title: isCompact ? undefined : { text: 'Hour of Day (0-23)' } },
      yaxis: { title: { text: metric === 'count' ? 'Count' : 'Hours' } },
      margin: activityLayoutMargin
    };
  } else if (patternType === 'heatmapDOWvsHOD') {
    plotType = 'heatmap';
    data = [
      {
        z: actData.values2D || [],
        x: actData.labelsX,
        y: actData.labelsY || daysOfWeekLabels,
        type: 'heatmap',
        colorscale: 'Viridis',
        hoverongaps: false
      }
    ];
    layout = {
      title: options?.title
        ? { text: options.title }
        : isCompact
          ? undefined
          : { text: 'Activity Heatmap (Day vs Task Start Hour)' },
      xaxis: { title: isCompact ? undefined : { text: 'Hour of Day (0-23)' } },
      margin: isCompact ? { t: 16, b: 40, l: 64, r: 16 } : activityLayoutMargin
    };
  }

  // Type-safe data validation
  function hasEmptyBarData(plotData: Partial<Plotly.PlotData>[]): boolean {
    if (!plotData.length) return true;
    const firstData = plotData[0];
    if (plotType === 'bar' && firstData && 'y' in firstData && Array.isArray(firstData.y)) {
      return firstData.y.every(val => parseFloat(String(val)) === 0);
    }
    return false;
  }

  function hasEmptyHeatmapData(plotData: Partial<Plotly.PlotData>[]): boolean {
    if (!plotData.length) return true;
    const firstData = plotData[0];
    if (plotType === 'heatmap' && firstData && 'z' in firstData && Array.isArray(firstData.z)) {
      const zData = firstData.z as (string | null)[][];
      return zData.flat().every(val => val === null);
    }
    return false;
  }

  if (!data.length || hasEmptyBarData(data) || hasEmptyHeatmapData(data)) {
    renderChartMessage(rootEl, `No data to plot for ${analysisTypeName}.`);
    return;
  }
  plotChart(mainChartEl, data, layout, useReact, options);

  setupPlotlyEvents(mainChartEl, 'plotly_click', (eventData: unknown) => {
    const points = (eventData as PlotlyEvent)?.points;
    if (!points || points.length === 0) return;
    const point = points[0];
    let recordsForPopup: TimeRecord[] = [];
    let categoryNameForPopup = '';
    let clickedValue: number | null = null;

    if (plotType === 'bar') {
      const categoryClickedRaw = point.x;
      if (categoryClickedRaw === undefined || categoryClickedRaw === null) return;
      const categoryClicked = String(categoryClickedRaw);
      clickedValue = typeof point.y === 'number' ? point.y : parseFloat(String(point.y));

      if (patternType === 'dayOfWeek') {
        const dayIndexClicked = daysOfWeekLabels.indexOf(categoryClicked);
        if (dayIndexClicked === -1) return;
        categoryNameForPopup = `${categoryClicked} (Day)`;
        recordsForPopup = filteredRecords.filter(
          r => r.date && r.date.getUTCDay() === dayIndexClicked
        );
      } else if (patternType === 'hourOfDay') {
        const hourClicked = parseInt(categoryClicked, 10);
        if (isNaN(hourClicked)) return;
        categoryNameForPopup = `${categoryClicked}:00 (Start Hour)`;
        recordsForPopup = filteredRecords.filter(r => {
          const startTime = 'startTime' in r.metadata ? r.metadata.startTime : null;
          return startTime && Utils.getHourFromTimeStr(startTime) === hourClicked;
        });
      }
    } else if (plotType === 'heatmap') {
      const clickedHour = typeof point.x === 'number' ? point.x : parseInt(String(point.x), 10);
      const clickedDayIndex = daysOfWeekLabels.indexOf(String(point.y));
      clickedValue = typeof point.z === 'number' ? point.z : parseFloat(String(point.z));

      if (
        Number.isNaN(clickedHour) ||
        clickedDayIndex === -1 ||
        !clickedValue ||
        clickedValue === 0
      ) {
        return;
      }
      const nextHour = (clickedHour + 1) % 24;
      categoryNameForPopup = `Activity: ${point.y}, ${String(clickedHour).padStart(2, '0')}:00 - ${String(nextHour).padStart(2, '0')}:00`;
      recordsForPopup = filteredRecords.filter(r => {
        const startTime = 'startTime' in r.metadata ? r.metadata.startTime : null;
        return (
          startTime &&
          Utils.getHourFromTimeStr(startTime) === clickedHour &&
          r.date &&
          r.date.getUTCDay() === clickedDayIndex
        );
      });
    }

    if (recordsForPopup.length > 0) {
      showDetailPopup(categoryNameForPopup, recordsForPopup, { metric, value: clickedValue });
    }
  });
}

export function renderErrorLog(
  rootEl: HTMLElement,
  processingErrors: ProcessingError[],
  _recordsCount: number
) {
  const errorLogContainer = rootEl.querySelector<HTMLElement>('#errorLogContainer');
  const errorLogSummary = rootEl.querySelector<HTMLElement>('#errorLogSummary');
  const errorLogEntries = rootEl.querySelector<HTMLElement>('#errorLogEntries');
  if (!errorLogContainer || !errorLogSummary || !errorLogEntries) return;

  // Clear entries safely
  safeEmpty(errorLogEntries);

  if (processingErrors.length === 0) {
    errorLogSummary.textContent =
      'No processing issues found; all data is sourced from the main cache.';
    errorLogContainer.addClass('is-hidden');
    errorLogContainer.removeClass('is-visible');
    return;
  }

  errorLogSummary.textContent = `Found ${processingErrors.length} issue(s) during data translation:`;

  processingErrors.forEach(err => {
    const details = safeCreateEl(errorLogEntries, 'details', {
      cls: 'log-entry'
    }) as HTMLDetailsElement;
    const summary = safeCreateEl(details, 'summary');
    const content = safeCreateDiv(details, { cls: 'log-entry-content' });

    summary.textContent = `⚠️ ${err.file || 'Unknown file'}`;

    safeCreateEl(content, 'strong', { text: 'Path: ' });
    content.appendChild(content.ownerDocument.createTextNode(err.path || 'N/A'));
    safeCreateEl(content, 'br');

    safeCreateEl(content, 'strong', { text: 'Reason: ' });
    content.appendChild(
      content.ownerDocument.createTextNode(err.reason || 'No specific reason provided.')
    );
  });
  errorLogContainer.removeClass('is-hidden');
  errorLogContainer.addClass('is-visible');
}
