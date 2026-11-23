/**
 * @file Defines all shared data structures, interfaces, and type definitions for the Chrono Analyser.
 * This centralizes the data contracts used across different modules (parsing, aggregation, plotting).
 */

import Plotly from '../ui/plotly-custom';
import type { OFCEvent } from '../../types';
export type { OFCEvent };

export interface TimeRecord {
  _id: string;
  path: string;
  hierarchy: string;
  project: string;
  subproject: string;
  subprojectFull: string;
  duration: number;
  file: string;
  date: Date | null;
  metadata: OFCEvent; // Changed from FileMetadata to the more specific OFCEvent
  _effectiveDurationInPeriod?: number;
  // Internal tagging metadata added during insights processing.
  _semanticTags?: string[];
  _isMuted?: boolean;
}

export interface ProcessingError {
  file: string;
  path: string;
  reason: string;
}

export interface SunburstData {
  ids: string[];
  labels: string[];
  parents: string[];
  values: number[];
  recordsByLabel: Map<string, TimeRecord[]>;
}

export interface PieData {
  hours: Map<string, number>;
  recordsByCategory: Map<string, TimeRecord[]>;
  error: boolean;
}

export interface TimeSeriesData {
  periods: string[];
  totals: number[];
  categories: Record<string, number[]>;
  granularity: 'daily' | 'weekly' | 'monthly';
  chartType: 'line' | 'stackedArea';
  stackingLevel: keyof TimeRecord;
  metric: 'duration' | 'count';
}

export interface ActivityPatternData {
  patternType: 'dayOfWeek' | 'hourOfDay' | 'heatmapDOWvsHOD';
  metric: 'duration' | 'count';
  labelsX: string[];
  labelsY?: string[];
  values1D?: number[];
  values2D?: (number | null)[][];
  filteredRecords: TimeRecord[];
}

export interface ChronoChartSpec {
  chartType: 'pie' | 'sunburst' | 'time-series' | 'activity';
  metric: 'duration' | 'count';
  startDate?: string;
  endDate?: string;
  hierarchy?: string;
  project?: string;
  pattern?: string;
  breakdownBy?: 'hierarchy' | 'project' | 'subproject';
  level?: 'project' | 'subproject';
  granularity?: 'daily' | 'weekly' | 'monthly';
  timeSeriesType?: 'line' | 'stackedArea';
  stackingLevel?: 'hierarchy' | 'project' | 'subproject';
  patternType?: 'dayOfWeek' | 'hourOfDay' | 'heatmapDOWvsHOD';
  title?: string;
}

export interface ChronoKpiPill {
  label: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'warning';
}

// FileMetadata is no longer needed as we now use OFCEvent directly.
// export interface FileMetadata { ... }

// --- PLOTLY THEME SYSTEM (Unchanged) ---

/**
 * Defines base layout properties common to both light and dark themes.
 * This ensures consistency and transparency.
 */
export const PLOTLY_BASE_LAYOUT: Partial<Plotly.Layout> = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(0,0,0,0)',
  font: {
    family: 'var(--font-default)',
    size: 12
  },
  showlegend: true
};

/**
 * Defines layout properties specific to Obsidian's light theme.
 */
export const PLOTLY_LIGHT_THEME: Partial<Plotly.Layout> = {
  font: { color: 'var(--text-normal)' },
  xaxis: {
    gridcolor: 'var(--background-modifier-border)',
    linecolor: 'var(--background-modifier-border)',
    zerolinecolor: 'var(--background-modifier-accent-hover)'
  },
  yaxis: {
    gridcolor: 'var(--background-modifier-border)',
    linecolor: 'var(--background-modifier-border)',
    zerolinecolor: 'var(--background-modifier-accent-hover)'
  },
  legend: {
    bordercolor: 'var(--background-modifier-border)'
  }
};

/**
 * Defines layout properties specific to Obsidian's dark theme.
 */
export const PLOTLY_DARK_THEME: Partial<Plotly.Layout> = {
  font: { color: 'var(--text-normal)' },
  xaxis: {
    gridcolor: 'var(--background-modifier-border)',
    linecolor: 'var(--background-modifier-border)',
    zerolinecolor: 'var(--background-modifier-accent)'
  },
  yaxis: {
    gridcolor: 'var(--background-modifier-border)',
    linecolor: 'var(--background-modifier-border)',
    zerolinecolor: 'var(--background-modifier-accent)'
  },
  legend: {
    bordercolor: 'var(--background-modifier-border)'
  }
};
