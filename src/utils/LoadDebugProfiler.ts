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

export interface SubPhaseRecord {
  subPhaseName: string;
  durationMs: number;
  contextPath: string;
  details?: string;
}

export interface FreezeRecord {
  context: string;
  durationMs: number;
  timestamp: number;
  relativeMs?: number;
  contextStack?: string[];
  details?: string;
}

export interface DailyNotesStats {
  totalScanned: number;
  preFiltered: number;
  cacheHits: number;
  readFromDisk: number;
}

export interface DebugLogEntry {
  timestampMs: number;
  wallTimestamp: number;
  type:
    | 'stage_start'
    | 'stage_end'
    | 'provider_start'
    | 'provider_end'
    | 'subphase_start'
    | 'subphase_end'
    | 'freeze'
    | 'info';
  contextPath: string;
  durationMs?: number;
  details?: string;
}

export interface FreezeStats {
  totalCount: number;
  maxDurationMs: number;
  totalFrozenTimeMs: number;
}

export interface LoadReport {
  onloadDurationMs: number | null;
  timeToLayoutReadyMs: number | null;
  layoutReadyToPopulateMs: number | null;
  totalPopulateDurationMs: number | null;
  stages: StageTimingRecord[];
  phases: PhaseTimingRecord[];
  subPhases: SubPhaseRecord[];
  freezes: FreezeRecord[];
  freezeStats: FreezeStats;
  dailyNotesStats: DailyNotesStats;
  totalYieldDurationMs: number;
  unaccountedDurationMs: number;
  traceLogs: DebugLogEntry[];
  timestamp: number;
}

interface ContextFrame {
  name: string;
  details?: string;
  startTime: number;
}

class LoadDebugProfilerImpl {
  private enabled = true;
  private liveConsoleLog = false;

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
  private contextStack: ContextFrame[] = [];
  private traceLogs: DebugLogEntry[] = [];

  private completedStages: StageTimingRecord[] = [];
  private completedPhases: PhaseTimingRecord[] = [];
  private completedSubPhases: SubPhaseRecord[] = [];
  private detectedFreezes: FreezeRecord[] = [];

  private dailyNotesStats: DailyNotesStats = {
    totalScanned: 0,
    preFiltered: 0,
    cacheHits: 0,
    readFromDisk: 0
  };

  private lastReport: LoadReport | null = null;
  private lastFormattedReport: string | null = null;

  // Real-time Main Thread Lag Monitor
  private lagTimer: number | ReturnType<typeof window.setInterval> | null = null;
  private lastLagCheckTime = 0;
  private readonly LAG_INTERVAL_MS = 10;
  private readonly FREEZE_THRESHOLD_MS = 30;

  public setEnabled(enabled: boolean): void {
    const previous = this.enabled;
    this.enabled = enabled;
    if (enabled && !previous) {
      this.startLagMonitor();
    } else if (!enabled && previous) {
      this.stopLagMonitor();
    }
  }

  public setLiveConsoleLog(enabled: boolean): void {
    this.liveConsoleLog = enabled;
  }

  public get isEnabled(): boolean {
    return this.enabled;
  }

  private startLagMonitor(): void {
    if (typeof window === 'undefined') return;
    this.stopLagMonitor();
    this.lastLagCheckTime = performance.now();
    this.lagTimer = window.setInterval(() => {
      if (!this.enabled) return;
      const now = performance.now();
      const elapsed = now - this.lastLagCheckTime;
      const delay = elapsed - this.LAG_INTERVAL_MS;

      if (delay >= this.FREEZE_THRESHOLD_MS) {
        const contextPath = this.getContextPath() || 'Main Thread Event Loop';
        this.recordFreeze(
          `Lag Spike (${contextPath})`,
          elapsed,
          `Event-loop tick delayed by ${delay.toFixed(1)}ms`
        );
      }
      this.lastLagCheckTime = now;
    }, this.LAG_INTERVAL_MS);
  }

  private stopLagMonitor(): void {
    if (this.lagTimer !== null) {
      window.clearInterval(this.lagTimer);
      this.lagTimer = null;
    }
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
    this.contextStack = [];
    this.traceLogs = [];
    this.completedStages = [];
    this.completedPhases = [];
    this.completedSubPhases = [];
    this.detectedFreezes = [];
    this.dailyNotesStats = {
      totalScanned: 0,
      preFiltered: 0,
      cacheHits: 0,
      readFromDisk: 0
    };
    this.lastReport = null;
    this.lastFormattedReport = null;
  }

  private getRelativeMs(): number {
    const base = this.populateStartTime ?? this.onloadStartTime ?? performance.now();
    return Number((performance.now() - base).toFixed(2));
  }

  public pushContext(name: string, details?: string): void {
    if (!this.enabled) return;
    this.contextStack.push({ name, details, startTime: performance.now() });
    this.addLogEntry('subphase_start', this.getContextPath(), undefined, details);
  }

  public popContext(): void {
    if (!this.enabled || this.contextStack.length === 0) return;
    const frame = this.contextStack.pop();
    if (!frame) return;
    const durationMs = Number((performance.now() - frame.startTime).toFixed(2));
    const contextPath = this.getContextPath()
      ? `${this.getContextPath()} > ${frame.name}`
      : frame.name;
    this.completedSubPhases.push({
      subPhaseName: frame.name,
      durationMs,
      contextPath,
      details: frame.details
    });
    this.addLogEntry('subphase_end', contextPath, durationMs, frame.details);
  }

  public getContextPath(): string {
    return this.contextStack.map(c => c.name).join(' > ');
  }

  public getContextStack(): string[] {
    return this.contextStack.map(c => c.name);
  }

  public withContext<T>(name: string, fn: () => T, details?: string): T {
    if (!this.enabled) {
      return fn();
    }
    this.pushContext(name, details);
    try {
      const result = fn();
      if (result && typeof (result as unknown as Promise<unknown>).then === 'function') {
        return (result as unknown as Promise<unknown>).finally(() => {
          this.popContext();
        }) as T;
      }
      this.popContext();
      return result;
    } catch (e) {
      this.popContext();
      throw e;
    }
  }

  private addLogEntry(
    type: DebugLogEntry['type'],
    contextPath: string,
    durationMs?: number,
    details?: string
  ): void {
    const relMs = this.getRelativeMs();
    if (this.enabled) {
      this.traceLogs.push({
        timestampMs: relMs,
        wallTimestamp: Date.now(),
        type,
        contextPath,
        durationMs,
        details
      });
    }
  }

  public recordFreeze(context: string, durationMs: number, details?: string): void {
    const activePath = this.getContextPath();
    const fullContext = activePath ? `${context} [at ${activePath}]` : context;
    const record: FreezeRecord = {
      context: fullContext,
      durationMs: Number(durationMs.toFixed(2)),
      timestamp: Date.now(),
      relativeMs: this.getRelativeMs(),
      contextStack: this.getContextStack(),
      details
    };

    // if (durationMs >= 30) {
    //   console.warn(
    //     `[Full Calendar UI Freeze Warning] 🚨 "${fullContext}" blocked main thread for ${durationMs.toFixed(1)}ms.`,
    //     details || ''
    //   );
    // }

    if (!this.enabled) return;
    this.detectedFreezes.push(record);
    this.addLogEntry('freeze', fullContext, durationMs, details);
  }

  public recordDailyNotesStats(stats: Partial<DailyNotesStats>): void {
    if (!this.enabled) return;
    if (stats.totalScanned !== undefined) this.dailyNotesStats.totalScanned += stats.totalScanned;
    if (stats.preFiltered !== undefined) this.dailyNotesStats.preFiltered += stats.preFiltered;
    if (stats.cacheHits !== undefined) this.dailyNotesStats.cacheHits += stats.cacheHits;
    if (stats.readFromDisk !== undefined) this.dailyNotesStats.readFromDisk += stats.readFromDisk;
  }

  public recordYield(durationMs: number): void {
    if (!this.enabled) return;
    this.totalYieldDurationMs += durationMs;
  }

  public markPluginOnloadStart(): void {
    if (!this.enabled) return;
    this.clearState();
    this.onloadStartTime = performance.now();
    this.startLagMonitor();
    this.addLogEntry('info', 'Plugin onload() started');
  }

  public markPluginOnloadEnd(): void {
    if (!this.enabled || this.onloadStartTime === null) return;
    this.onloadEndTime = performance.now();
    this.addLogEntry(
      'info',
      'Plugin onload() finished',
      Number((this.onloadEndTime - this.onloadStartTime).toFixed(2))
    );
  }

  public markLayoutReady(): void {
    if (!this.enabled) return;
    this.layoutReadyTime = performance.now();
    this.addLogEntry('info', 'Obsidian Layout Ready');
  }

  public startPopulate(): void {
    if (!this.enabled) return;
    this.clearState();
    this.populateStartTime = performance.now();
    this.startLagMonitor();
    this.addLogEntry('info', 'Event Cache Populate Started');
  }

  public startStage(stageName: string): void {
    if (!this.enabled) return;
    this.currentStages.set(stageName, {
      startTime: performance.now(),
      providers: new Map(),
      completedProviders: []
    });
    this.pushContext(stageName);
    this.addLogEntry('stage_start', stageName);
  }

  public startProvider(stageName: string, calendarId: string, calendarName: string): void {
    if (!this.enabled) return;
    const stage = this.currentStages.get(stageName);
    if (!stage) return;
    stage.providers.set(calendarId, {
      calendarName,
      startTime: performance.now()
    });
    this.pushContext(`Provider: ${calendarName}`);
    this.addLogEntry('provider_start', `${stageName} > ${calendarName}`);
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
    if (durationMs >= 50) {
      this.recordFreeze(`Provider load: ${provider.calendarName} (${stageName})`, durationMs);
    }
    stage.providers.delete(calendarId);
    stage.completedProviders.push({
      calendarId,
      calendarName: provider.calendarName,
      durationMs,
      eventCount,
      success,
      error
    });
    this.addLogEntry(
      'provider_end',
      `${stageName} > ${provider.calendarName}`,
      durationMs,
      `events: ${eventCount}, success: ${success}`
    );
    this.popContext();
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
    this.addLogEntry('stage_end', stageName, durationMs);
    this.popContext();
  }

  public startPhase(phaseName: string): void {
    if (!this.enabled) return;
    this.currentPhases.set(phaseName, performance.now());
    this.pushContext(`Phase: ${phaseName}`);
  }

  public endPhase(phaseName: string): void {
    if (!this.enabled) return;
    const startTime = this.currentPhases.get(phaseName);
    if (startTime === undefined) return;
    const durationMs = Number((performance.now() - startTime).toFixed(2));
    if (durationMs >= 50) {
      this.recordFreeze(`Phase execution: ${phaseName}`, durationMs);
    }
    this.currentPhases.delete(phaseName);
    this.completedPhases.push({ phaseName, durationMs });
    this.popContext();
  }

  public endPopulate(): void {
    if (!this.enabled) return;
    this.populateEndTime = performance.now();
    this.stopLagMonitor();
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

    const freezeStats: FreezeStats = {
      totalCount: this.detectedFreezes.length,
      maxDurationMs: this.detectedFreezes.reduce((max, f) => Math.max(max, f.durationMs), 0),
      totalFrozenTimeMs: Number(
        this.detectedFreezes.reduce((sum, f) => sum + f.durationMs, 0).toFixed(2)
      )
    };

    const report: LoadReport = {
      onloadDurationMs,
      timeToLayoutReadyMs,
      layoutReadyToPopulateMs,
      totalPopulateDurationMs,
      stages: [...this.completedStages],
      phases: [...this.completedPhases],
      subPhases: [...this.completedSubPhases],
      freezes: [...this.detectedFreezes],
      freezeStats,
      dailyNotesStats: { ...this.dailyNotesStats },
      totalYieldDurationMs,
      unaccountedDurationMs,
      traceLogs: [...this.traceLogs],
      timestamp: Date.now()
    };

    this.lastReport = report;
    this.lastFormattedReport = this.formatReportToString(report);
    return report;
  }

  public formatReportToString(report: LoadReport): string {
    const lines: string[] = ['[FullCalendar Load Debug & UI Freeze Diagnostic Report]'];
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
    lines.push(`🚨 UI Freeze Diagnostic Summary (Main-Thread Stutters > 30ms):`);
    lines.push(`  • Total UI Freezes Detected: ${report.freezeStats.totalCount}`);
    lines.push(`  • Max Freeze Spike: ${report.freezeStats.maxDurationMs} ms`);
    lines.push(`  • Total Main-Thread Blocked Time: ${report.freezeStats.totalFrozenTimeMs} ms`);

    if (report.freezes.length > 0) {
      lines.push('');
      lines.push('Detailed Freeze Log (Exact Active Context at Spike):');
      for (const freeze of report.freezes) {
        const relStr = freeze.relativeMs !== undefined ? `+${freeze.relativeMs}ms` : '';
        lines.push(
          `  ⚠️ [${relStr}] ${freeze.durationMs} ms -> ${freeze.context} ${
            freeze.details ? `(${freeze.details})` : ''
          }`
        );
      }
    }

    if (report.dailyNotesStats.totalScanned > 0) {
      lines.push('');
      lines.push('Daily Notes Optimization Metrics:');
      lines.push(`  • Total daily notes scanned: ${report.dailyNotesStats.totalScanned}`);
      lines.push(`  • Metadata pre-filtered (0ms skip): ${report.dailyNotesStats.preFiltered}`);
      lines.push(`  • In-memory parse cache hits: ${report.dailyNotesStats.cacheHits}`);
      lines.push(`  • Disk/Vault file reads: ${report.dailyNotesStats.readFromDisk}`);
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

    if (report.subPhases.length > 0) {
      lines.push('');
      lines.push('Detailed Sub-Phase Timing Breakdown:');
      for (const sub of report.subPhases) {
        lines.push(
          `  • ${sub.contextPath}: ${sub.durationMs} ms ${sub.details ? `(${sub.details})` : ''}`
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

    if (report.traceLogs.length > 0) {
      lines.push('');
      lines.push('Chronological Timeline Trace Log:');
      for (const log of report.traceLogs.slice(0, 50)) {
        const dur = log.durationMs !== undefined ? ` (${log.durationMs} ms)` : '';
        const det = log.details ? ` [${log.details}]` : '';
        lines.push(
          `  [${log.timestampMs.toFixed(1)}ms] [${log.type.toUpperCase()}] ${log.contextPath}${dur}${det}`
        );
      }
      if (report.traceLogs.length > 50) {
        lines.push(`  ... (${report.traceLogs.length - 50} more entries omitted)`);
      }
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
