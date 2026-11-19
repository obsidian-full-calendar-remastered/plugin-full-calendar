/**
 * @file Usage.ts
 * @brief Pure domain value objects and integer microcredit helpers for token/WTC usage.
 *
 * @license See LICENSE.md
 */

/**
 * Integer microcredit multipliers for Mistral Small 4 baseline:
 * - 10 microcredits = 1 uncached input token
 * -  1 microcredit  = 1 cached input token
 * - 40 microcredits = 1 output token
 */
export const MICROCREDITS_PER_UNCACHED_INPUT_TOKEN = 10;
export const MICROCREDITS_PER_CACHED_INPUT_TOKEN = 1;
export const MICROCREDITS_PER_OUTPUT_TOKEN = 40;
export const MICROCREDITS_PER_WTC = 10;

export interface TokenUsage {
  prompt: number;
  cachedPrompt?: number;
  completion: number;
  total: number;
}

/**
 * Read-only settlement metadata returned by the managed gateway after a turn.
 * The server (Principal Durable Object) is the sole balance authority.
 */
export interface ManagedUsageMetadata {
  microcreditsReserved: number;
  microcreditsSettled: number;
  microcreditsRemaining: number;
  priceVersion: string;
  requestId: string;
  providerRequestId?: string;
}

/**
 * Computes weighted microcredits strictly in integer arithmetic (never floats).
 */
export function computeWeightedMicrocredits(
  uncachedInputTokens: number,
  cachedInputTokens: number,
  outputTokens: number
): number {
  const safeUncached = Math.max(0, Math.trunc(uncachedInputTokens));
  const safeCached = Math.max(0, Math.trunc(cachedInputTokens));
  const safeOutput = Math.max(0, Math.trunc(outputTokens));

  return (
    safeUncached * MICROCREDITS_PER_UNCACHED_INPUT_TOKEN +
    safeCached * MICROCREDITS_PER_CACHED_INPUT_TOKEN +
    safeOutput * MICROCREDITS_PER_OUTPUT_TOKEN
  );
}

/**
 * Converts integer microcredits to display Weighted Token Credits (floored integer).
 */
export function microcreditsToWtc(microcredits: number): number {
  return Math.floor(Math.max(0, Math.trunc(microcredits)) / MICROCREDITS_PER_WTC);
}
