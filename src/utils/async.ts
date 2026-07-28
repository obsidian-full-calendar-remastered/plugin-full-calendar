/**
 * @file async.ts
 * @brief Asynchronous utilities for non-blocking main-thread execution.
 */

import { LoadDebugProfiler } from './LoadDebugProfiler';

/**
 * Yields execution back to the browser event loop / UI thread.
 * Uses window.setTimeout(resolve, 0) or requestIdleCallback with a tight fallback timeout.
 */
export function yieldToMainThread(): Promise<void> {
  const profilingActive = LoadDebugProfiler.isEnabled;
  const start = profilingActive ? performance.now() : 0;

  return new Promise(resolve => {
    const onDone = () => {
      if (profilingActive) {
        LoadDebugProfiler.recordYield(performance.now() - start);
      }
      resolve();
    };

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(onDone, { timeout: 10 });
    } else if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(onDone, { timeout: 10 });
    } else if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      window.setTimeout(onDone, 0);
    } else {
      setTimeout(onDone, 0);
    }
  });
}
