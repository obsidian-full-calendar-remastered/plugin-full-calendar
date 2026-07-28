/**
 * @file LoadDebugProfiler.ts
 * @brief High-performance load debug profiler for Obsidian Full Calendar.
 *
 * @details
 * Captures detailed timing breakdown during plugin initialization, stage loading,
 * individual calendar provider sync operations, cache delta indexing, and event loop yields.
 *
 * Designed with a strict zero-overhead policy: when disabled (the default),
 * all method calls evaluate `if (!this.enabled) return;` immediately on entry.
 *
 * @license See LICENSE.md
 */

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

export interface PhaseTimingRecord {
  phaseName: string;
  durationMs: number;
}

export interface LoadReport {
  onloadDurationMs: number | null;
  timeToLayoutReadyMs: number | null;
  layoutReadyToPopulateMs: number | null;
  totalPopulateDurationMs: number | null;
  stages: StageTimingRecord[];
  phases: PhaseTimingRecord[];
  totalYieldDurationMs: number;
  unaccountedDurationMs: number;
  timestamp: number;
}

class LoadDebugProfilerImpl {
  private enabled = false;

  private onloadStartTime: number | null = null;
  private onloadEndTime: number | null = null;
  private layoutReadyTime: number | null = null;
  private populateStartTime: number | null = null;
  private populateEndTime: number | null = null;

  private totalYieldDurationMs = 0;

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

  private currentPhases = new Map<string, number>();
  private completedStages: StageTimingRecord[] = [];
  private completedPhases: PhaseTimingRecord[] = [];

  private lastReport: LoadReport | null = null;
  private lastFormattedReport: string | null = null;

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
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
    this.totalYieldDurationMs = 0;
    this.currentStages.clear();
    this.currentPhases.clear();
    this.completedStages = [];
    this.completedPhases = [];
    this.lastReport = null;
    this.lastFormattedReport = null;
  }

  public recordYield(durationMs: number): void {
    if (!this.enabled) return;
    this.totalYieldDurationMs += durationMs;
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
    this.clearState();
    this.populateStartTime = performance.now();
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

  public startPhase(phaseName: string): void {
    if (!this.enabled) return;
    this.currentPhases.set(phaseName, performance.now());
  }

  public endPhase(phaseName: string): void {
    if (!this.enabled) return;
    const startTime = this.currentPhases.get(phaseName);
    if (startTime === undefined) return;
    const durationMs = Number((performance.now() - startTime).toFixed(2));
    this.currentPhases.delete(phaseName);
    this.completedPhases.push({ phaseName, durationMs });
  }

  public endPopulate(): void {
    if (!this.enabled) return;
    this.populateEndTime = performance.now();
    this.generateReport();
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

    const totalYieldDurationMs = Number(this.totalYieldDurationMs.toFixed(2));

    const totalStagesDuration = this.completedStages.reduce((sum, s) => sum + s.durationMs, 0);
    const totalPhasesDuration = this.completedPhases.reduce((sum, p) => sum + p.durationMs, 0);

    const accountedSoFar = totalStagesDuration + totalPhasesDuration + totalYieldDurationMs;
    const unaccountedDurationMs =
      totalPopulateDurationMs !== null
        ? Number(Math.max(0, totalPopulateDurationMs - accountedSoFar).toFixed(2))
        : 0;

    const report: LoadReport = {
      onloadDurationMs,
      timeToLayoutReadyMs,
      layoutReadyToPopulateMs,
      totalPopulateDurationMs,
      stages: [...this.completedStages],
      phases: [...this.completedPhases],
      totalYieldDurationMs,
      unaccountedDurationMs,
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

    lines.push('');
    lines.push('Stage & Provider Breakdown:');
    for (const stage of report.stages) {
      lines.push(`  [${stage.stageName}] - ${stage.durationMs} ms`);
      for (const provider of stage.providers) {
        const statusStr = provider.success ? 'OK' : `FAILED (${provider.error || 'Unknown error'})`;
        lines.push(
          `    • ${provider.calendarName} (${provider.calendarId}): ${provider.durationMs} ms | ${provider.eventCount} events | ${statusStr}`
        );
      }
    }

    lines.push('');
    lines.push('Overhead & Processing Breakdown:');
    for (const phase of report.phases) {
      lines.push(`  • ${phase.phaseName}: ${phase.durationMs} ms`);
    }
    if (report.totalYieldDurationMs > 0) {
      lines.push(`  • Main thread event-loop yields: ${report.totalYieldDurationMs} ms`);
    }
    if (report.unaccountedDurationMs > 0) {
      lines.push(`  • Other post-processing / delays: ${report.unaccountedDurationMs} ms`);
    }

    if (report.totalPopulateDurationMs !== null) {
      const sumAll = (
        report.stages.reduce((sum, s) => sum + s.durationMs, 0) +
        report.phases.reduce((sum, p) => sum + p.durationMs, 0) +
        report.totalYieldDurationMs +
        report.unaccountedDurationMs
      ).toFixed(2);
      lines.push('');
      lines.push(`Sum of all components: ${sumAll} ms (100% accounted for)`);
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
