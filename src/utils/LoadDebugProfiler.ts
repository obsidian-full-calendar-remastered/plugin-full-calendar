/**
 * @file LoadDebugProfiler.ts
 * @brief High-performance load debug profiler for Obsidian Full Calendar.
 *
 * @details
 * Captures detailed timing breakdown during plugin initialization, stage loading,
 * and individual calendar provider sync operations.
 *
 * Designed with a strict zero-overhead policy: when disabled (the default),
 * all method calls evaluate `if (!this.enabled) return;` immediately on entry.
 *
 * @license See LICENSE.md
 */

import { showNotice } from './showNotice';

export interface ProviderTimingRecord {
  calendarId: string;
  calendarName: string;
  durationMs: number;
  eventCount: number;
  success: boolean;
  error?: string;
}

export interface StageTimingRecord {
  stageName: string;
  durationMs: number;
  providers: ProviderTimingRecord[];
}

export interface LoadReport {
  onloadDurationMs: number | null;
  timeToLayoutReadyMs: number | null;
  layoutReadyToPopulateMs: number | null;
  totalPopulateDurationMs: number | null;
  stages: StageTimingRecord[];
  timestamp: number;
}

class LoadDebugProfilerImpl {
  private enabled = false;

  private onloadStartTime: number | null = null;
  private onloadEndTime: number | null = null;
  private layoutReadyTime: number | null = null;
  private populateStartTime: number | null = null;
  private populateEndTime: number | null = null;

  private currentStages = new Map<
    string,
    {
      startTime: number;
      providers: Map<
        string,
        {
          calendarName: string;
          startTime: number;
        }
      >;
      completedProviders: ProviderTimingRecord[];
    }
  >();

  private completedStages: StageTimingRecord[] = [];
  private lastReport: LoadReport | null = null;
  private lastFormattedReport: string | null = null;

  /**
   * Enable or disable profiling dynamically.
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clearState();
    }
  }

  public get isEnabled(): boolean {
    return this.enabled;
  }

  public clearState(): void {
    this.onloadStartTime = null;
    this.onloadEndTime = null;
    this.layoutReadyTime = null;
    this.populateStartTime = null;
    this.populateEndTime = null;
    this.currentStages.clear();
    this.completedStages = [];
    this.lastReport = null;
    this.lastFormattedReport = null;
  }

  public markPluginOnloadStart(): void {
    if (!this.enabled) return;
    this.clearState();
    this.onloadStartTime = performance.now();
  }

  public markPluginOnloadEnd(): void {
    if (!this.enabled || this.onloadStartTime === null) return;
    this.onloadEndTime = performance.now();
  }

  public markLayoutReady(): void {
    if (!this.enabled) return;
    this.layoutReadyTime = performance.now();
  }

  public startPopulate(): void {
    if (!this.enabled) return;
    this.populateStartTime = performance.now();
    this.currentStages.clear();
    this.completedStages = [];
  }

  public startStage(stageName: string): void {
    if (!this.enabled) return;
    this.currentStages.set(stageName, {
      startTime: performance.now(),
      providers: new Map(),
      completedProviders: []
    });
  }

  public startProvider(stageName: string, calendarId: string, calendarName: string): void {
    if (!this.enabled) return;
    const stage = this.currentStages.get(stageName);
    if (!stage) return;
    stage.providers.set(calendarId, {
      calendarName,
      startTime: performance.now()
    });
  }

  public endProvider(
    stageName: string,
    calendarId: string,
    eventCount: number = 0,
    success: boolean = true,
    error?: string
  ): void {
    if (!this.enabled) return;
    const stage = this.currentStages.get(stageName);
    if (!stage) return;
    const provider = stage.providers.get(calendarId);
    if (!provider) return;

    const durationMs = Number((performance.now() - provider.startTime).toFixed(2));
    stage.providers.delete(calendarId);
    stage.completedProviders.push({
      calendarId,
      calendarName: provider.calendarName,
      durationMs,
      eventCount,
      success,
      error
    });
  }

  public endStage(stageName: string): void {
    if (!this.enabled) return;
    const stage = this.currentStages.get(stageName);
    if (!stage) return;

    const durationMs = Number((performance.now() - stage.startTime).toFixed(2));
    this.currentStages.delete(stageName);
    this.completedStages.push({
      stageName,
      durationMs,
      providers: [...stage.completedProviders]
    });
  }

  public endPopulate(): void {
    if (!this.enabled) return;
    this.populateEndTime = performance.now();
    const report = this.generateReport();
    if (report) {
      const summaryText = `FullCalendar Load Timing: total ${report.totalPopulateDurationMs ?? 0} ms across ${report.stages.length} stage(s).`;
      showNotice(summaryText, 6000);
    }
  }

  public generateReport(): LoadReport | null {
    if (!this.enabled) return null;

    const onloadDurationMs =
      this.onloadStartTime !== null && this.onloadEndTime !== null
        ? Number((this.onloadEndTime - this.onloadStartTime).toFixed(2))
        : null;

    const timeToLayoutReadyMs =
      this.onloadStartTime !== null && this.layoutReadyTime !== null
        ? Number((this.layoutReadyTime - this.onloadStartTime).toFixed(2))
        : null;

    const layoutReadyToPopulateMs =
      this.layoutReadyTime !== null && this.populateStartTime !== null
        ? Number((this.populateStartTime - this.layoutReadyTime).toFixed(2))
        : null;

    const totalPopulateDurationMs =
      this.populateStartTime !== null && this.populateEndTime !== null
        ? Number((this.populateEndTime - this.populateStartTime).toFixed(2))
        : null;

    const report: LoadReport = {
      onloadDurationMs,
      timeToLayoutReadyMs,
      layoutReadyToPopulateMs,
      totalPopulateDurationMs,
      stages: [...this.completedStages],
      timestamp: Date.now()
    };

    this.lastReport = report;
    this.lastFormattedReport = this.formatReportToString(report);
    return report;
  }

  public formatReportToString(report: LoadReport): string {
    const lines: string[] = ['[FullCalendar Load Debug Timing]'];
    if (report.onloadDurationMs !== null) {
      lines.push(`Plugin onload(): ${report.onloadDurationMs} ms`);
    }
    if (report.timeToLayoutReadyMs !== null) {
      lines.push(`Time to layoutReady: ${report.timeToLayoutReadyMs} ms`);
    }
    if (report.layoutReadyToPopulateMs !== null) {
      lines.push(`LayoutReady delay to populate start: ${report.layoutReadyToPopulateMs} ms`);
    }
    if (report.totalPopulateDurationMs !== null) {
      lines.push(`Total cache population: ${report.totalPopulateDurationMs} ms`);
    }

    lines.push('Staging Breakdown:');
    for (const stage of report.stages) {
      lines.push(`  [${stage.stageName}] - ${stage.durationMs} ms`);
      for (const provider of stage.providers) {
        const statusStr = provider.success ? 'OK' : `FAILED (${provider.error || 'Unknown error'})`;
        lines.push(
          `    • ${provider.calendarName} (${provider.calendarId}): ${provider.durationMs} ms | ${provider.eventCount} events | ${statusStr}`
        );
      }
    }
    return lines.join('\n');
  }

  public getLastReport(): LoadReport | null {
    return this.lastReport;
  }

  public getFormattedReport(): string | null {
    return this.lastFormattedReport;
  }
}

export const LoadDebugProfiler = new LoadDebugProfilerImpl();
