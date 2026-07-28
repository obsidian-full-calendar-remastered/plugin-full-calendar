/**
 * @file async.ts
 * @brief Asynchronous utilities for non-blocking main-thread execution.
 */

/**
 * Yields execution back to the browser event loop / UI thread.
 * Uses requestIdleCallback (with short fallback timeout) or setTimeout(0).
 */
export function yieldToMainThread(): Promise<void> {
  return new Promise(resolve => {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: 50 });
    } else if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 50 });
    } else {
      window.setTimeout(resolve, 0);
    }
  });
}
