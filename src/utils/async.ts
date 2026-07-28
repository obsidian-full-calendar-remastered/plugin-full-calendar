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

    const win = typeof window !== 'undefined' ? (window as unknown as WindowWithIdle) : undefined;
    if (win?.requestIdleCallback) {
      win.requestIdleCallback(onDone, { timeout: 10 });
    } else if (win?.setTimeout) {
      win.setTimeout(onDone, 0);
    } else if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(onDone, { timeout: 10 });
    } else {
      window.setTimeout(onDone, 0);
    }
  });
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
