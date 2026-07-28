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
  });

  test('yieldToMainThread resolves successfully', async () => {
    const promise = yieldToMainThread();
    await expect(promise).resolves.toBeUndefined();
  });
});
