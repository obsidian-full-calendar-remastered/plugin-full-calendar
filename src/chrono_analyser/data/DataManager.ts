/**
 * @file Manages the state of all parsed TimeRecords, providing indexed lookups and efficient filtering.
 * This class is the single source of truth for all analytical data.
 */

import { ActivityPatternData, TimeRecord, TimeSeriesData } from './types';
import * as Utils from './utils';
import { OFCEvent } from '../../types';

export interface AnalysisFilters {
  hierarchy?: string;
  project?: string;
  filterStartDate?: Date | null;
  filterEndDate?: Date | null;
  pattern?: string;
}

export interface DataManagerOptions {
  /**
   * If true, recurring events will be expanded into individual, dated records.
   * If false (default), they will be returned as a single record with a calculated
   * total duration for the period.
   */
  expandRecurring?: boolean;
}

/**
 * The result of a full analysis query, including aggregated data.
 */
export interface AnalysisResult {
  records: TimeRecord[];
  totalHours: number;
  fileCount: number;
  // A map of category names to the sum of hours for that category.
  aggregation: Map<string, number>;
  // A map of category names to the list of records belonging to that category.
  recordsByCategory: Map<string, TimeRecord[]>;
  error: string | null;
}

/**
 * A stateful class that holds all time records and provides indexed,
 * high-performance filtering and aggregation in a single pass.
 */
export class DataManager {
  #records: Map<string, TimeRecord> = new Map();
  #hierarchyIndex: Map<string, Set<string>> = new Map();
  #projectIndex: Map<string, Set<string>> = new Map();

  #originalHierarchyCasing: Map<string, string> = new Map();
  #originalProjectCasing: Map<string, string> = new Map();

  public clear(): void {
    this.#records.clear();
    this.#hierarchyIndex.clear();
    this.#projectIndex.clear();
    this.#originalHierarchyCasing.clear();
    this.#originalProjectCasing.clear();
  }

  public addRecord(record: TimeRecord): void {
    // --- CHANGE 'record.path' to 'record._id' ---
    if (this.#records.has(record._id)) {
      this.removeRecord(record._id);
    }
    this.#records.set(record._id, record);

    const hierarchyKey = record.hierarchy.toLowerCase();
    if (!this.#hierarchyIndex.has(hierarchyKey)) {
      this.#hierarchyIndex.set(hierarchyKey, new Set());
      this.#originalHierarchyCasing.set(hierarchyKey, record.hierarchy);
    }
    // --- CHANGE 'record.path' to 'record._id' ---
    const hierarchySet = this.#hierarchyIndex.get(hierarchyKey);
    if (hierarchySet) {
      hierarchySet.add(record._id);
    }

    const projectKey = record.project.toLowerCase();
    if (!this.#projectIndex.has(projectKey)) {
      this.#projectIndex.set(projectKey, new Set());
      this.#originalProjectCasing.set(projectKey, record.project);
    }
    // --- CHANGE 'record.path' to 'record._id' ---
    const projectSet = this.#projectIndex.get(projectKey);
    if (projectSet) {
      projectSet.add(record._id);
    }
  }

  /**
   * Must be called after all records are added.
   * (Currently empty, but kept for future optimizations like sorting indexes).
   */
  public finalize(): void {
    // No-op for now.
  }

  public removeRecord(recordId: string): void {
    // <-- CHANGE parameter name for clarity
    // --- CHANGE 'filePath' to 'recordId' ---
    const record = this.#records.get(recordId);
    if (!record) return;

    const hierarchyKey = record.hierarchy.toLowerCase();
    const projectKey = record.project.toLowerCase();
    const hierarchyPaths = this.#hierarchyIndex.get(hierarchyKey);
    if (hierarchyPaths) {
      // --- CHANGE 'filePath' to 'recordId' ---
      hierarchyPaths.delete(recordId);
      if (hierarchyPaths.size === 0) {
        this.#hierarchyIndex.delete(hierarchyKey);
        this.#originalHierarchyCasing.delete(hierarchyKey);
      }
    }
    const projectPaths = this.#projectIndex.get(projectKey);
    if (projectPaths) {
      // --- CHANGE 'filePath' to 'recordId' ---
      projectPaths.delete(recordId);
      if (projectPaths.size === 0) {
        this.#projectIndex.delete(projectKey);
        this.#originalProjectCasing.delete(projectKey);
      }
    }
    // --- CHANGE 'filePath' to 'recordId' ---
    this.#records.delete(recordId);
  }

  public getKnownHierarchies = (): string[] =>
    Array.from(this.#originalHierarchyCasing.values()).sort();
  public getKnownProjects = (): string[] => Array.from(this.#originalProjectCasing.values()).sort();
  public getTotalRecordCount = (): number => this.#records.size;

  public getAllRecords(): TimeRecord[] {
    return Array.from(this.#records.values());
  }

  /**
   * Performs a high-performance, single-pass filter AND aggregation of the data.
   * This is the primary query method for the analyzer.
   *
   * ## Filter Format
   * The `filters.pattern` property supports both inclusion and exclusion keywords:
   *
   * - **Inclusion:** Any word or quoted phrase (e.g. `"work" 'team meeting' urgent`) will match records whose project name contains **all** of those tokens (AND logic).
   * - **Exclusion:** Prefix a keyword or quoted phrase with a space and hyphen (e.g. `"work -personal -'team meeting'"`) to exclude records whose project name contains any of those tokens.
   * - **Multiple exclusions:** You can chain exclusions: `"work -personal -test -'team meeting'"` excludes all listed tokens.
   * - **Quoted phrases:** Use double or single quotes to match exact phrases, e.g. `"project A" -'archive folder'`.
   * - **Regex:** Each token is interpreted as a case-insensitive regular expression.
   *
   * Example:
   *   pattern = `"projectA" urgent -archive -'old version'`
   *   → Includes records with both "projectA" and "urgent" in the project name, but excludes those containing "archive" or "old version".
   *
   * @param filters - The filter criteria to apply (see above for pattern usage).
   * @param breakdownBy - The TimeRecord property to use for aggregation/categorization.
   * @param options - Options to control data processing, like expanding recurring events.
   * @returns An AnalysisResult object containing filtered records, stats, and aggregated data.
   */
  public getAnalyzedData(
    filters: AnalysisFilters,
    breakdownBy: keyof TimeRecord | null,
    options: DataManagerOptions = {}
  ): AnalysisResult {
    const result: AnalysisResult = {
      records: [],
      totalHours: 0,
      fileCount: 0,
      aggregation: new Map(),
      recordsByCategory: new Map(),
      error: null
    };

    const { expandRecurring = false } = options;

    // --- NEW: Use an array for multiple inclusion conditions (AND logic) ---
    const inclusionRegexes: RegExp[] = [];
    let exclusionRegex: RegExp | null = null;

    if (filters.pattern) {
      try {
        let patternText = filters.pattern;
        const exclusionKeywords: string[] = [];

        // 1. Find and strip out all exclusion tokens first
        const exclusionTokenRegex = /(?:^|\s)-(?:"[^"]+"|'[^']+'|\S+)/g;
        const exclusionMatches = patternText.match(exclusionTokenRegex);

        if (exclusionMatches) {
          for (const match of exclusionMatches) {
            const trimmedMatch = match.trimStart();
            let keyword = trimmedMatch.substring(1);
            const firstChar = keyword.charAt(0);
            const lastChar = keyword.charAt(keyword.length - 1);
            if (
              (firstChar === '"' && lastChar === '"') ||
              (firstChar === "'" && lastChar === "'")
            ) {
              keyword = keyword.slice(1, -1);
            }
            if (keyword) exclusionKeywords.push(keyword);
          }
          patternText = patternText.replace(exclusionTokenRegex, '').trim();
        }
        if (exclusionKeywords.length > 0) {
          exclusionRegex = new RegExp(exclusionKeywords.join('|'), 'i');
        }

        // 2. Parse the remaining text for inclusion tokens (words or phrases)
        if (patternText) {
          const inclusionTokenRegex = /"[^"]+"|'[^']+'|\S+/g;
          const inclusionMatches = patternText.match(inclusionTokenRegex);
          if (inclusionMatches) {
            for (let token of inclusionMatches) {
              const firstChar = token.charAt(0);
              const lastChar = token.charAt(token.length - 1);
              if (
                (firstChar === '"' && lastChar === '"') ||
                (firstChar === "'" && lastChar === "'")
              ) {
                token = token.slice(1, -1);
              }
              if (token) {
                inclusionRegexes.push(new RegExp(token, 'i'));
              }
            }
          }
        }
      } catch (e) {
        result.error = e instanceof Error ? e.message : String(e);
        return result;
      }
    }

    let candidatePaths: Set<string> | null = null;

    if (filters.hierarchy) {
      const hierarchyKey = filters.hierarchy.toLowerCase();
      candidatePaths = this.#hierarchyIndex.get(hierarchyKey) || new Set();
    }

    if (filters.project) {
      const projectKey = filters.project.toLowerCase();
      const projectPaths = this.#projectIndex.get(projectKey) || new Set();
      candidatePaths = candidatePaths
        ? new Set([...candidatePaths].filter(path => projectPaths.has(path)))
        : projectPaths;
    }

    const recordsToScan: Iterable<TimeRecord> = candidatePaths
      ? Array.from(candidatePaths)
          .map(path => this.#records.get(path))
          .filter((record): record is TimeRecord => Boolean(record))
      : this.#records.values();

    const uniqueFiles = new Set<string>();
    const startDate = filters.filterStartDate ?? null;
    const endDate = filters.filterEndDate ?? null;
    const hasDateFilter = !!(startDate || endDate);

    for (const record of recordsToScan) {
      // --- NEW: Correctly apply universal category filter with AND/OR logic ---
      const targetString = record.project;
      if (exclusionRegex && exclusionRegex.test(targetString)) continue;
      if (inclusionRegexes.length > 0 && !inclusionRegexes.every(re => re.test(targetString))) {
        continue;
      }

      if (record.metadata.type === 'recurring' && hasDateFilter) {
        if (expandRecurring) {
          const instances = Utils.getRecurringInstances(record, startDate, endDate);
          for (const instanceDate of instances) {
            const isoDate = Utils.getISODate(instanceDate);
            if (!isoDate) continue;
            let newMetadata: OFCEvent;
            const commonProperties = {
              title: record.metadata.title,
              id: record.metadata.id,
              category: record.metadata.category,
              timezone: record.metadata.timezone,
              type: 'single' as const,
              date: isoDate,
              endDate: isoDate
            };
            if (record.metadata.allDay) {
              newMetadata = { ...commonProperties, allDay: true };
            } else {
              newMetadata = {
                ...commonProperties,
                allDay: false,
                startTime: 'startTime' in record.metadata ? record.metadata.startTime : '00:00',
                endTime: 'endTime' in record.metadata ? record.metadata.endTime : '00:00'
              };
            }
            const instanceRecord: TimeRecord = {
              ...record,
              date: instanceDate,
              metadata: newMetadata,
              _effectiveDurationInPeriod: record.duration
            };
            this.processRecord(instanceRecord, record.duration, breakdownBy, result, uniqueFiles);
          }
        } else {
          const numInstances = Utils.calculateRecurringInstancesInDateRange(
            record.metadata,
            startDate,
            endDate
          );
          if (numInstances > 0) {
            const effectiveDuration = record.duration * numInstances;
            const finalRecord = { ...record, _effectiveDurationInPeriod: effectiveDuration };
            this.processRecord(finalRecord, effectiveDuration, breakdownBy, result, uniqueFiles);
          }
        }
      } else if (record.metadata.type === 'rrule' && hasDateFilter) {
        if (expandRecurring) {
          const instances = Utils.getRruleInstances(record, startDate, endDate);
          for (const instanceDate of instances) {
            const isoDate = Utils.getISODate(instanceDate);
            if (!isoDate) continue;
            let newMetadata: OFCEvent;
            const commonProperties = {
              title: record.metadata.title,
              id: record.metadata.id,
              category: record.metadata.category,
              timezone: record.metadata.timezone,
              type: 'single' as const,
              date: isoDate,
              endDate: isoDate
            };
            if (record.metadata.allDay) {
              newMetadata = { ...commonProperties, allDay: true };
            } else {
              newMetadata = {
                ...commonProperties,
                allDay: false,
                startTime: 'startTime' in record.metadata ? record.metadata.startTime : '00:00',
                endTime: 'endTime' in record.metadata ? record.metadata.endTime : '00:00'
              };
            }
            const instanceRecord: TimeRecord = {
              ...record,
              date: instanceDate,
              metadata: newMetadata,
              _effectiveDurationInPeriod: record.duration
            };
            this.processRecord(instanceRecord, record.duration, breakdownBy, result, uniqueFiles);
          }
        } else {
          const numInstances = Utils.calculateRruleInstancesInDateRange(
            record.metadata,
            startDate,
            endDate
          );
          if (numInstances > 0) {
            const effectiveDuration = record.duration * numInstances;
            const finalRecord = { ...record, _effectiveDurationInPeriod: effectiveDuration };
            this.processRecord(finalRecord, effectiveDuration, breakdownBy, result, uniqueFiles);
          }
        }
      } else {
        const effectiveDuration = record.duration;
        let includeRecord = false;
        if (
          (record.metadata.type === 'recurring' || record.metadata.type === 'rrule') &&
          !hasDateFilter
        ) {
          includeRecord = true;
        } else if (record.metadata.type !== 'recurring' && record.metadata.type !== 'rrule') {
          if (hasDateFilter) {
            if (this.isWithinDateRange(record.date, startDate, endDate)) {
              includeRecord = true;
            }
          } else {
            includeRecord = true;
          }
        }
        if (includeRecord) {
          // Allow 0-duration events (like Tasks) to be included
          const finalRecord = { ...record, _effectiveDurationInPeriod: effectiveDuration };
          this.processRecord(finalRecord, effectiveDuration, breakdownBy, result, uniqueFiles);
        }
      }
    }

    result.fileCount = uniqueFiles.size;
    return result;
  }

  /**
   * Prepares data for a Pie Chart.
   */
  public preparePieChartData(
    records: TimeRecord[],
    breakdownBy: keyof TimeRecord,
    metric: 'duration' | 'count'
  ): { hours: Map<string, number>; recordsByCategory: Map<string, TimeRecord[]>; error: boolean } {
    const aggregation = new Map<string, number>();
    const recordsByCategory = new Map<string, TimeRecord[]>();

    for (const record of records) {
      const key = this.formatBreakdownValue(record[breakdownBy], breakdownBy);
      const value = metric === 'count' ? 1 : record._effectiveDurationInPeriod || 0;

      if (metric === 'duration' && value <= 0) continue;

      aggregation.set(key, (aggregation.get(key) || 0) + value);

      if (!recordsByCategory.has(key)) recordsByCategory.set(key, []);
      const categoryRecords = recordsByCategory.get(key);
      if (categoryRecords) {
        categoryRecords.push(record);
      }
    }

    return { hours: aggregation, recordsByCategory, error: false };
  }

  /**
   * Prepares data for a Sunburst Chart.
   */
  public prepareSunburstData(
    records: TimeRecord[],
    level: string,
    metric: 'duration' | 'count'
  ): {
    ids: string[];
    labels: string[];
    parents: string[];
    values: number[];
    recordsByLabel: Map<string, TimeRecord[]>;
  } {
    const data = {
      ids: [] as string[],
      labels: [] as string[],
      parents: [] as string[],
      values: [] as number[],
      recordsByLabel: new Map<string, TimeRecord[]>()
    };

    let innerField: keyof TimeRecord;
    let outerField: keyof TimeRecord;

    if (level === 'project') {
      innerField = 'hierarchy';
      outerField = 'project';
    } else {
      innerField = 'project';
      outerField = 'subproject';
    }

    const uniqueEntries = new Map<
      string,
      { value: number; records: TimeRecord[]; inner: string; outer: string }
    >();

    for (const record of records) {
      const val = metric === 'count' ? 1 : record._effectiveDurationInPeriod;
      if (typeof val !== 'number' || isNaN(val)) continue;
      if (metric === 'duration' && val <= 0) continue;

      const innerVal = String(record[innerField] || `(No ${innerField})`).trim();
      const outerVal = String(record[outerField] || `(No ${outerField})`).trim();
      const leafId = `${innerVal} - ${outerVal}`;

      if (!uniqueEntries.has(leafId)) {
        uniqueEntries.set(leafId, { value: 0, records: [], inner: innerVal, outer: outerVal });
      }
      const entry = uniqueEntries.get(leafId);
      if (!entry) continue;
      entry.value += val;
      entry.records.push(record);
    }

    const parentTotals = new Map<string, number>();
    let grandTotal = 0;

    for (const { value, inner } of uniqueEntries.values()) {
      parentTotals.set(inner, (parentTotals.get(inner) || 0) + value);
    }
    for (const total of parentTotals.values()) {
      grandTotal += total;
    }

    const rootId = 'Total';
    data.ids.push(rootId);
    data.labels.push(rootId);
    data.parents.push('');
    data.values.push(grandTotal);
    data.recordsByLabel.set(rootId, records);

    for (const [parent, total] of parentTotals.entries()) {
      data.ids.push(parent);
      data.labels.push(parent);
      data.parents.push(rootId);
      data.values.push(total);
      const parentRecords = records.filter(
        r => String(r[innerField] || `(No ${innerField})`).trim() === parent
      );
      data.recordsByLabel.set(parent, parentRecords);
    }

    for (const [leafId, { value, records, inner, outer }] of uniqueEntries.entries()) {
      data.ids.push(leafId);
      data.labels.push(outer);
      data.parents.push(inner);
      data.values.push(value);
      data.recordsByLabel.set(leafId, records);
    }

    return data;
  }

  /**
   * Prepares aggregated time-series buckets (daily/weekly/monthly) for line or stackedArea charts.
   */
  public prepareTimeSeriesData(
    records: TimeRecord[],
    options: {
      granularity: 'daily' | 'weekly' | 'monthly';
      chartType: 'line' | 'stackedArea';
      stackingLevel: keyof TimeRecord;
      metric: 'duration' | 'count';
    }
  ): TimeSeriesData {
    const { granularity, chartType, stackingLevel, metric } = options;
    const dataByPeriod = new Map<string, { total: number; categories: Record<string, number> }>();

    for (const record of records) {
      if (!record.date || isNaN(record.date.getTime())) continue;
      const value = metric === 'count' ? 1 : record._effectiveDurationInPeriod || 0;
      if (metric === 'duration' && value <= 0) continue;

      let periodKey: string | null;
      if (granularity === 'daily') {
        periodKey = Utils.getISODate(record.date);
      } else if (granularity === 'weekly') {
        periodKey = Utils.getISODate(Utils.getWeekStartDate(record.date));
      } else {
        periodKey = Utils.getISODate(Utils.getMonthStartDate(record.date));
      }
      if (!periodKey) continue;

      let periodData = dataByPeriod.get(periodKey);
      if (!periodData) {
        periodData = { total: 0, categories: {} };
        dataByPeriod.set(periodKey, periodData);
      }
      periodData.total += value;

      if (chartType === 'stackedArea') {
        const category = this.formatBreakdownValue(record[stackingLevel], stackingLevel);
        periodData.categories[category] = (periodData.categories[category] || 0) + value;
      }
    }

    const periods = Array.from(dataByPeriod.keys()).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );
    const totals = periods.map(p => Number((dataByPeriod.get(p)?.total ?? 0).toFixed(2)));
    const categories: Record<string, number[]> = {};

    if (chartType === 'stackedArea' && periods.length > 0) {
      const allCategories = new Set<string>();
      for (const p of periods) {
        const cats = dataByPeriod.get(p)?.categories;
        if (cats) {
          Object.keys(cats).forEach(cat => allCategories.add(cat));
        }
      }
      for (const category of Array.from(allCategories).sort()) {
        categories[category] = periods.map(p =>
          Number((dataByPeriod.get(p)?.categories[category] || 0).toFixed(2))
        );
      }
    }

    return {
      periods,
      totals,
      categories,
      granularity,
      chartType,
      stackingLevel,
      metric
    };
  }

  /**
   * Prepares aggregated activity pattern data (dayOfWeek, hourOfDay, or 7x24 heatmapDOWvsHOD).
   */
  public prepareActivityPatternData(
    records: TimeRecord[],
    options: {
      patternType: 'dayOfWeek' | 'hourOfDay' | 'heatmapDOWvsHOD';
      metric: 'duration' | 'count';
    }
  ): ActivityPatternData {
    const { patternType, metric } = options;
    const daysOfWeekLabels = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday'
    ];
    const hourLabels = Array.from({ length: 24 }, (_, i) => `${i}`);

    if (patternType === 'dayOfWeek') {
      const hoursByDay: number[] = Array.from({ length: 7 }, () => 0);
      for (const record of records) {
        if (record.date && !isNaN(record.date.getTime())) {
          const dayIndex = record.date.getUTCDay();
          const value = metric === 'count' ? 1 : record._effectiveDurationInPeriod || 0;
          hoursByDay[dayIndex] += value;
        }
      }
      return {
        patternType,
        metric,
        labelsX: daysOfWeekLabels,
        values1D: hoursByDay.map(h => Number(h.toFixed(2))),
        filteredRecords: records
      };
    }

    if (patternType === 'hourOfDay') {
      const hoursByHour: number[] = Array.from({ length: 24 }, () => 0);
      for (const record of records) {
        const startTime = 'startTime' in record.metadata ? record.metadata.startTime : null;
        const startHour = startTime ? Utils.getHourFromTimeStr(startTime) : null;
        if (startHour !== null) {
          const value = metric === 'count' ? 1 : record._effectiveDurationInPeriod || 0;
          hoursByHour[startHour] += value;
        }
      }
      return {
        patternType,
        metric,
        labelsX: hourLabels,
        values1D: hoursByHour.map(h => Number(h.toFixed(2))),
        filteredRecords: records
      };
    }

    const heatmapData: number[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => 0)
    );
    for (const record of records) {
      const startTime = 'startTime' in record.metadata ? record.metadata.startTime : null;
      const startHour = startTime ? Utils.getHourFromTimeStr(startTime) : null;
      if (startHour === null) continue;
      if (record.date && !isNaN(record.date.getTime())) {
        const dayIndex = record.date.getUTCDay();
        const value = metric === 'count' ? 1 : record._effectiveDurationInPeriod || 0;
        heatmapData[dayIndex][startHour] += value;
      }
    }

    return {
      patternType: 'heatmapDOWvsHOD',
      metric,
      labelsX: hourLabels,
      labelsY: daysOfWeekLabels,
      values2D: heatmapData.map(row => row.map(val => (val > 0 ? Number(val.toFixed(2)) : null))),
      filteredRecords: records
    };
  }

  /**
   * Helper function to process a single record (real or expanded) and add it to the result set.
   * This avoids logic duplication within getAnalyzedData.
   */
  private processRecord(
    record: TimeRecord,
    duration: number,
    breakdownBy: keyof TimeRecord | null,
    // regex parameter is now removed
    result: AnalysisResult,
    uniqueFiles: Set<string>
  ): void {
    if (breakdownBy) {
      const key = this.formatBreakdownValue(record[breakdownBy], breakdownBy);
      // The regex check is now removed from here
      result.aggregation.set(key, (result.aggregation.get(key) || 0) + duration);
      if (!result.recordsByCategory.has(key)) result.recordsByCategory.set(key, []);
      const recordsForKey = result.recordsByCategory.get(key);
      if (recordsForKey) {
        recordsForKey.push(record);
      }
    }

    result.records.push(record);
    result.totalHours += duration;
    uniqueFiles.add(record.path); // Use record.path as per original code, assuming it exists on TimeRecord
  }

  private isWithinDateRange(
    recordDate: Date | null,
    startDate: Date | null,
    endDate: Date | null
  ): boolean {
    if (!recordDate || isNaN(recordDate.getTime())) return false;
    const recordTime = new Date(recordDate.valueOf());
    recordTime.setUTCHours(0, 0, 0, 0);
    const recordTimestamp = recordTime.getTime();
    if (startDate) {
      const startTime = new Date(startDate.valueOf());
      startTime.setUTCHours(0, 0, 0, 0);
      if (recordTimestamp < startTime.getTime()) return false;
    }
    if (endDate) {
      const endTime = new Date(endDate.valueOf());
      endTime.setUTCHours(0, 0, 0, 0);
      if (recordTimestamp > endTime.getTime()) return false;
    }
    return true;
  }

  private formatBreakdownValue(
    rawValue: TimeRecord[keyof TimeRecord],
    breakdownBy: keyof TimeRecord
  ): string {
    if (!rawValue) return `(No ${breakdownBy})`;
    if (
      typeof rawValue === 'string' ||
      typeof rawValue === 'number' ||
      typeof rawValue === 'boolean'
    ) {
      return String(rawValue);
    }
    if (rawValue instanceof Date) return Utils.getISODate(rawValue) ?? `(No ${breakdownBy})`;
    if (rawValue === undefined || rawValue === null) {
      return `(No ${breakdownBy})`;
    }

    if (typeof rawValue === 'object') {
      try {
        return JSON.stringify(rawValue);
      } catch (error) {
        console.error('[ChronoAnalyzer] Failed to stringify breakdown value:', error);
        return '(Unserializable value)';
      }
    }

    return String(rawValue);
  }
}
