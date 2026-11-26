/**
 * @file UsageSnapshotCache.ts
 * @brief Read-only client projection of server-authoritative WTC usage & entitlement state.
 *
 * @description
 * Never acts as an authoritative ledger and never performs permanent optimistic deductions.
 * Values are populated strictly from server usage endpoints and terminal fcr:usage SSE events.
 *
 * @license See LICENSE.md
 */

import type { ManagedUsageMetadata } from '../../../domain/Usage';
import type { AccountUsageSnapshot } from '../protocol/managedTypes';

export class UsageSnapshotCache {
  private snapshot: AccountUsageSnapshot | null = null;
  private readonly listeners = new Set<(snapshot: AccountUsageSnapshot | null) => void>();

  public getSnapshot(): AccountUsageSnapshot | null {
    return this.snapshot ? { ...this.snapshot } : null;
  }

  public isStale(maxAgeMs = 60_000): boolean {
    if (!this.snapshot) return true;
    return Date.now() - this.snapshot.syncedAt > maxAgeMs;
  }

  public update(next: AccountUsageSnapshot): void {
    this.snapshot = { ...next, syncedAt: next.syncedAt || Date.now() };
    this.notify();
  }

  public applySettlement(
    usage: ManagedUsageMetadata,
    tokenDeltas?: { uncachedInput: number; cachedInput: number; output: number }
  ): void {
    if (!this.snapshot) return;
    this.snapshot = {
      ...this.snapshot,
      remainingMicrocredits: usage.microcreditsRemaining,
      priceVersion: usage.priceVersion,
      uncachedInputTokensUsed:
        this.snapshot.uncachedInputTokensUsed + (tokenDeltas?.uncachedInput ?? 0),
      cachedInputTokensUsed: this.snapshot.cachedInputTokensUsed + (tokenDeltas?.cachedInput ?? 0),
      outputTokensUsed: this.snapshot.outputTokensUsed + (tokenDeltas?.output ?? 0),
      syncedAt: Date.now()
    };
    this.notify();
  }

  public clear(): void {
    this.snapshot = null;
    this.notify();
  }

  public subscribe(listener: (snapshot: AccountUsageSnapshot | null) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const current = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(current);
    }
  }
}
