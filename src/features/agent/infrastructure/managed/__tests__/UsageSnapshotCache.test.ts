import { UsageSnapshotCache } from '../state/UsageSnapshotCache';
import { TokenEstimator } from '../state/TokenEstimator';

describe('UsageSnapshotCache & TokenEstimator', () => {
  it('starts null/stale and only updates from authoritative server responses', () => {
    const cache = new UsageSnapshotCache();
    expect(cache.getSnapshot()).toBeNull();
    expect(cache.isStale()).toBe(true);

    const listener = jest.fn();
    const unsub = cache.subscribe(listener);

    cache.update({
      principalId: 'prin_1',
      planTier: 'pro',
      status: 'active',
      periodStart: '2026-11-01T00:00:00Z',
      periodEnd: '2026-12-01T00:00:00Z',
      totalMicrocredits: 100_000_000,
      remainingMicrocredits: 100_000_000,
      uncachedInputTokensUsed: 0,
      cachedInputTokensUsed: 0,
      outputTokensUsed: 0,
      priceVersion: '2026-11-16-v1',
      syncedAt: Date.now()
    });

    expect(cache.isStale()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);

    cache.applySettlement(
      {
        microcreditsReserved: 50000,
        microcreditsSettled: 12000,
        microcreditsRemaining: 99_988_000,
        priceVersion: '2026-11-16-v1',
        requestId: 'req_1'
      },
      { uncachedInput: 800, cachedInput: 0, output: 100 }
    );

    const updated = cache.getSnapshot();
    expect(updated?.remainingMicrocredits).toBe(99_988_000);
    expect(updated?.uncachedInputTokensUsed).toBe(800);
    expect(updated?.outputTokensUsed).toBe(100);

    unsub();
    cache.clear();
    expect(cache.getSnapshot()).toBeNull();
  });

  it('estimates pre-flight input tokens and worst-case WTC cleanly without side effects', () => {
    const estimator = new TokenEstimator();
    const est = estimator.estimateWorstCaseWtc(
      [{ role: 'user', content: 'Schedule deep work tomorrow from 9am to 11am' }],
      [],
      1024
    );

    expect(est.estimatedInputTokens).toBeGreaterThan(10);
    expect(est.worstCaseMicrocredits).toBeGreaterThan(1024 * 40);
    expect(est.worstCaseWtc).toBeGreaterThan(4096);
  });
});
