/**
 * @file abortUtils.ts
 * @brief Shared abort-signal racing utility for non-cancellable APIs (e.g., Obsidian requestUrl).
 */

export const AGENT_ABORT_ERROR_MESSAGE = 'Agent request was cancelled by user.';

/**
 * Races a non-abortable promise against an optional `AbortSignal` while attaching
 * a noop catch handler on the underlying promise so late settlement after abort
 * never triggers an unhandled rejection.
 */
export async function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    throw new Error(AGENT_ABORT_ERROR_MESSAGE);
  }

  void promise.catch(() => undefined);
  let onAbort: (() => void) | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        onAbort = (): void => {
          reject(new Error(AGENT_ABORT_ERROR_MESSAGE));
        };
        signal.addEventListener('abort', onAbort, { once: true });
      })
    ]);
  } finally {
    if (onAbort) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}
