/**
 * @file randomId.ts
 * @brief Cross-platform random UUID / prefixed identifier helper for the agent domain.
 *
 * @license See LICENSE.md
 */

export function generateRandomId(prefix?: string): string {
  if (typeof window !== 'undefined' && typeof window.crypto?.randomUUID === 'function') {
    const uuid = window.crypto.randomUUID();
    return prefix ? `${prefix}_${uuid}` : uuid;
  }
  const fallback = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  return prefix ? `${prefix}_${fallback}` : fallback;
}
