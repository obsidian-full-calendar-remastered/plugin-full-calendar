import { LoadDebugProfiler } from './LoadDebugProfiler';
import { yieldToMainThread } from './async';

describe('LoadDebugProfiler', () => {
  beforeEach(() => {
    LoadDebugProfiler.setEnabled(false);
    LoadDebugProfiler.clearState();
  });

  afterEach(() => {
    LoadDebugProfiler.setEnabled(false);
    LoadDebugProfiler.clearState();
  });

  test('does nothing and incurs zero overhead when disabled', () => {
    LoadDebugProfiler.markPluginOnloadStart();
    LoadDebugProfiler.markPluginOnloadEnd();
    LoadDebugProfiler.markLayoutReady();
    LoadDebugProfiler.startPopulate();
    LoadDebugProfiler.startStage('Stage 1 (Local)');
    LoadDebugProfiler.startProvider('Stage 1 (Local)', 'cal1', 'Local Calendar');
    LoadDebugProfiler.endProvider('Stage 1 (Local)', 'cal1', 10, true);
    LoadDebugProfiler.endStage('Stage 1 (Local)');
    LoadDebugProfiler.endPopulate();

    expect(LoadDebugProfiler.getLastReport()).toBeNull();
  });

  test('records timing and generates structured report when enabled', () => {
    LoadDebugProfiler.setEnabled(true);

    LoadDebugProfiler.markPluginOnloadStart();
    LoadDebugProfiler.markPluginOnloadEnd();
    LoadDebugProfiler.markLayoutReady();

    LoadDebugProfiler.startPopulate();

    const stageName = 'Stage 1 (Local - Range)';
    LoadDebugProfiler.startStage(stageName);
    LoadDebugProfiler.startProvider(stageName, 'dailynote', 'Daily Notes');
    LoadDebugProfiler.endProvider(stageName, 'dailynote', 15, true);

    LoadDebugProfiler.startProvider(stageName, 'fullnote', 'Full Notes');
    LoadDebugProfiler.endProvider(stageName, 'fullnote', 5, false, 'Failed to read note');

    LoadDebugProfiler.endStage(stageName);

    LoadDebugProfiler.startPhase('Cache Delta Sync & Indexing');
    LoadDebugProfiler.endPhase('Cache Delta Sync & Indexing');

    LoadDebugProfiler.endPopulate();

    const report = LoadDebugProfiler.getLastReport();
    expect(report).not.toBeNull();
    expect(report?.stages.length).toBe(1);
    expect(report?.stages[0].stageName).toBe(stageName);
    expect(report?.stages[0].providers.length).toBe(2);

    const provider1 = report?.stages[0].providers[0];
    expect(provider1?.calendarId).toBe('dailynote');
    expect(provider1?.calendarName).toBe('Daily Notes');
    expect(provider1?.eventCount).toBe(15);
    expect(provider1?.success).toBe(true);

    const provider2 = report?.stages[0].providers[1];
    expect(provider2?.calendarId).toBe('fullnote');
    expect(provider2?.success).toBe(false);
    expect(provider2?.error).toBe('Failed to read note');

    expect(report?.phases.length).toBe(1);
    expect(report?.phases[0].phaseName).toBe('Cache Delta Sync & Indexing');

    const formatted = LoadDebugProfiler.getFormattedReport();
    expect(formatted).toContain('Sum of all components:');
    expect(formatted).toContain('100% accounted for');
  });

  test('yieldToMainThread resolves successfully and records yield when profiler enabled', async () => {
    LoadDebugProfiler.setEnabled(true);
    const promise = yieldToMainThread();
    await expect(promise).resolves.toBeUndefined();
  });

  test('yieldToMainThread incurs zero profiling overhead when disabled', async () => {
    LoadDebugProfiler.setEnabled(false);
    const promise = yieldToMainThread();
    await expect(promise).resolves.toBeUndefined();
    expect(LoadDebugProfiler.getLastReport()).toBeNull();
  });

  test('records freezes and daily note optimization metrics', () => {
    LoadDebugProfiler.setEnabled(true);
    LoadDebugProfiler.startPopulate();
    LoadDebugProfiler.recordFreeze('Heavy Operation', 120, '1000 items');
    LoadDebugProfiler.recordDailyNotesStats({
      totalScanned: 500,
      preFiltered: 450,
      cacheHits: 40,
      readFromDisk: 10
    });
    LoadDebugProfiler.endPopulate();

    const report = LoadDebugProfiler.getLastReport();
    expect(report?.freezes.length).toBe(1);
    expect(report?.freezes[0].context).toBe('Heavy Operation');
    expect(report?.freezes[0].durationMs).toBe(120);
    expect(report?.dailyNotesStats.totalScanned).toBe(500);
    expect(report?.dailyNotesStats.preFiltered).toBe(450);

    const formatted = LoadDebugProfiler.getFormattedReport();
    expect(formatted).toContain('Daily Notes Optimization Metrics:');
    expect(formatted).toContain('Metadata pre-filtered (0ms skip): 450');
    expect(formatted).toContain('UI Freeze Diagnostic Summary');
  });

  test('tracks hierarchical context stack and sub-phases via withContext', async () => {
    LoadDebugProfiler.setEnabled(true);
    LoadDebugProfiler.startPopulate();

    await LoadDebugProfiler.withContext('Parent Stage', async () => {
      expect(LoadDebugProfiler.getContextPath()).toBe('Parent Stage');

      await LoadDebugProfiler.withContext(
        'Child SubPhase',
        async () => {
          expect(LoadDebugProfiler.getContextPath()).toBe('Parent Stage > Child SubPhase');
          LoadDebugProfiler.recordFreeze('Inner Freeze Test', 85, '500 items');
        },
        'subphase details'
      );
    });

    expect(LoadDebugProfiler.getContextPath()).toBe('');

    LoadDebugProfiler.endPopulate();
    const report = LoadDebugProfiler.getLastReport();

    expect(report).not.toBeNull();
    expect(report?.subPhases.length).toBeGreaterThanOrEqual(2);
    expect(report?.freezes.length).toBe(1);
    expect(report?.freezes[0].context).toContain('[at Parent Stage > Child SubPhase]');
    expect(report?.freezeStats.totalCount).toBe(1);
    expect(report?.freezeStats.maxDurationMs).toBe(85);
    expect(report?.freezeStats.totalFrozenTimeMs).toBe(85);
    expect(report?.traceLogs.length).toBeGreaterThan(0);

    const formatted = LoadDebugProfiler.getFormattedReport();
    expect(formatted).toContain('Chronological Timeline Trace Log:');
    expect(formatted).toContain('Detailed Sub-Phase Timing Breakdown:');
    expect(formatted).toContain('Parent Stage > Child SubPhase');
  });
});
