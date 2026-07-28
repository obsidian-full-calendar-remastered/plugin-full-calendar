/**
 * @file async.ts
 * @brief Asynchronous utilities for non-blocking main-thread execution.
 */

import { LoadDebugProfiler } from './LoadDebugProfiler';

interface WindowWithIdle {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
  setTimeout?: typeof window.setTimeout;
  clearTimeout?: typeof window.clearTimeout;
}

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

    if (typeof MessageChannel !== 'undefined') {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        onDone();
      };
      channel.port2.postMessage(null);
    } else {
      window.setTimeout(onDone, 0);
    }
  });
}

/**
 * Checks elapsed time since `frameStartTime`. If it exceeds `budgetMs` (default 5ms),
 * yields to the main thread via macro-task yielding and returns the new frame start time.
 */
export async function yieldIfFrameBudgetExceeded(
  frameStartTime: number,
  budgetMs = 5
): Promise<number> {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    return frameStartTime;
  }
  if (performance.now() - frameStartTime >= budgetMs) {
    await yieldToMainThread();
    return performance.now();
  }
  return frameStartTime;
}

/**
 * Schedules a callback to be run during browser idle periods, with cross-platform fallback.
 * Guaranteed to execute on Desktop (Electron) and Mobile (iOS/Android WebKit).
 */
export function runWhenIdle(callback: () => void, timeoutMs = 1500): number {
  const win = typeof window !== 'undefined' ? (window as unknown as WindowWithIdle) : undefined;
  if (win?.requestIdleCallback) {
    return win.requestIdleCallback(callback, { timeout: timeoutMs });
  }
  if (typeof requestIdleCallback === 'function') {
    return requestIdleCallback(callback, { timeout: timeoutMs });
  }
  if (win?.setTimeout) {
    return win.setTimeout(callback, 200);
  }
  return window.setTimeout(callback, 200);
}

/**
 * Cancels a previously scheduled idle callback.
 */
export function cancelIdle(handle: number): void {
  const win = typeof window !== 'undefined' ? (window as unknown as WindowWithIdle) : undefined;
  if (win?.cancelIdleCallback) {
    win.cancelIdleCallback(handle);
  } else if (typeof cancelIdleCallback === 'function') {
    cancelIdleCallback(handle);
  } else if (win?.clearTimeout) {
    win.clearTimeout(handle);
  } else {
    window.clearTimeout(handle);
  }
}
