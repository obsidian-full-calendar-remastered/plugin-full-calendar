/**
 * @file SecretStorageAdapter.ts
 * @brief Fail-closed wrapper around Obsidian's SecretStorage API for managed credentials.
 *
 * @description
 * Stores private ECDSA key material, access tokens, and refresh tokens strictly in
 * Obsidian's isolated SecretStorage under deterministic environment-scoped keys.
 * Refuses to fall back to plaintext data.json if SecretStorage is unavailable.
 *
 * @license See LICENSE.md
 */

import { NormalizedAgentError } from '../../../domain/AgentError';
import { getBuildEnvironment } from '../protocol/managedTypes';

export interface ISecretBackingStore {
  getSecret(key: string): string | null;
  setSecret(key: string, value: string): void;
}

declare const app: { secretStorage?: ISecretBackingStore } | undefined;

export type ManagedSecretSlot = 'priv-jwk' | 'pub-spki' | 'access-tok' | 'refresh-tok';

export function resolveObsidianSecretStorage(
  appInstance?: unknown
): ISecretBackingStore | undefined {
  const fromArg = (appInstance as { secretStorage?: ISecretBackingStore } | undefined)
    ?.secretStorage;
  if (
    fromArg &&
    typeof fromArg.getSecret === 'function' &&
    typeof fromArg.setSecret === 'function'
  ) {
    return fromArg;
  }
  const fromGlobal = typeof app !== 'undefined' ? app?.secretStorage : undefined;
  if (
    fromGlobal &&
    typeof fromGlobal.getSecret === 'function' &&
    typeof fromGlobal.setSecret === 'function'
  ) {
    return fromGlobal;
  }
  return undefined;
}

export class SecretStorageAdapter {
  private readonly envLabel: 'production' | 'staging';
  private readonly getBackingStore: () => ISecretBackingStore | undefined;

  constructor(
    appInstance?: unknown,
    envOverride?: 'production' | 'staging',
    customStore?: ISecretBackingStore
  ) {
    this.envLabel = envOverride ?? getBuildEnvironment();
    this.getBackingStore = customStore
      ? () => customStore
      : () => resolveObsidianSecretStorage(appInstance);
  }

  public getKeyName(slot: ManagedSecretSlot): string {
    return `fcr-managed-${this.envLabel}-${slot}`;
  }

  public isSupported(): boolean {
    return this.getBackingStore() !== undefined;
  }

  private requireStore(): ISecretBackingStore {
    const store = this.getBackingStore();
    if (!store) {
      throw new NormalizedAgentError({
        code: 'authentication_required',
        message:
          'Secure credential storage (Obsidian SecretStorage) is unavailable on this platform. Managed AI cannot initialize without secure secret storage.'
      });
    }
    return store;
  }

  public getSecret(slot: ManagedSecretSlot): string | null {
    const store = this.requireStore();
    const raw = store.getSecret(this.getKeyName(slot));
    return raw && raw.length > 0 ? raw : null;
  }

  public setSecret(slot: ManagedSecretSlot, value: string): void {
    const store = this.requireStore();
    store.setSecret(this.getKeyName(slot), value);
  }

  public clearTokens(): void {
    if (!this.isSupported()) return;
    this.setSecret('access-tok', '');
    this.setSecret('refresh-tok', '');
  }

  public clearAll(): void {
    if (!this.isSupported()) return;
    this.setSecret('priv-jwk', '');
    this.setSecret('pub-spki', '');
    this.setSecret('access-tok', '');
    this.setSecret('refresh-tok', '');
  }
}
