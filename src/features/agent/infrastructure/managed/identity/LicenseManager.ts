/**
 * @file LicenseManager.ts
 * @brief Activate-once Paddle license binding, token rotation, device deactivation, and usage sync.
 *
 * @license See LICENSE.md
 */

import { isNormalizedAgentError, NormalizedAgentError } from '../../../domain/AgentError';
import {
  type AccountUsageSnapshot,
  type AuthChallengeResponse,
  type IManagedActivationService,
  type IManagedUsageService,
  type LicenseActivateResponse,
  type ManagedPlanTier,
  type ManagedSessionMetadata,
  type TokenRefreshResponse,
  type WireAccountUsage,
  mapWireUsageToSnapshot
} from '../protocol/managedTypes';
import type { DeviceKeyManager } from './DeviceKeyManager';
import type { SecretStorageAdapter } from './SecretStorageAdapter';
import type { IRequestSigner } from '../client/RequestSigner';
import { type FetchLike, signedJsonRequest } from '../client/managedHttp';
import type { UsageSnapshotCache } from '../state/UsageSnapshotCache';

export interface IAccessTokenProvider {
  getAccessToken(): string | null;
  refreshAccessToken(): Promise<string>;
  withAccessToken<T>(operation: (accessToken: string) => Promise<T>): Promise<T>;
}

export interface PersistSessionInput {
  principalId: string;
  activationId: string;
  keyId: string;
  planTier: ManagedPlanTier;
  licenseKeyMasked?: string;
  accessToken: string;
  refreshToken: string;
  wireUsage: WireAccountUsage;
}

export interface LicenseManagerDeps {
  getBaseUrl: () => string;
  keyManager: DeviceKeyManager;
  secretStorage: SecretStorageAdapter;
  signer: IRequestSigner;
  usageCache: UsageSnapshotCache;
  onSessionUpdated?: (session: ManagedSessionMetadata | null) => Promise<void> | void;
  fetchFn?: FetchLike;
}

export class LicenseManager
  implements IManagedActivationService, IManagedUsageService, IAccessTokenProvider
{
  private readonly deps: LicenseManagerDeps;
  private refreshPromise: Promise<string> | null = null;

  constructor(deps: LicenseManagerDeps) {
    this.deps = deps;
  }

  public hasActiveSession(): boolean {
    if (!this.deps.secretStorage.isSupported()) return false;
    return Boolean(
      this.deps.secretStorage.getSecret('access-tok') ||
      this.deps.secretStorage.getSecret('refresh-tok')
    );
  }

  public getAccessToken(): string | null {
    return this.deps.secretStorage.getSecret('access-tok');
  }

  public getUsageSnapshot(): AccountUsageSnapshot | null {
    return this.deps.usageCache.getSnapshot();
  }

  public subscribe(listener: (snapshot: AccountUsageSnapshot | null) => void): () => void {
    return this.deps.usageCache.subscribe(listener);
  }

  /**
   * Single DRY persistence path shared by both LicenseManager and TrialManager.
   */
  public async persistSession(
    input: PersistSessionInput
  ): Promise<{ session: ManagedSessionMetadata; usage: AccountUsageSnapshot }> {
    this.deps.secretStorage.setSecret('access-tok', input.accessToken);
    this.deps.secretStorage.setSecret('refresh-tok', input.refreshToken);

    const usage = mapWireUsageToSnapshot(input.wireUsage);
    this.deps.usageCache.update(usage);

    const session: ManagedSessionMetadata = {
      principalId: input.principalId,
      activationId: input.activationId,
      keyId: input.keyId,
      planTier: input.planTier,
      licenseKeyMasked: input.licenseKeyMasked,
      currentPeriodEnd: usage.periodEnd
    };
    await this.deps.onSessionUpdated?.(session);
    return { session, usage };
  }

  /**
   * Executes an authenticated gateway call with automatic single token refresh on 401.
   */
  public async withAccessToken<T>(operation: (accessToken: string) => Promise<T>): Promise<T> {
    let token = this.getAccessToken();
    if (!token) {
      token = await this.refreshAccessToken();
    }

    try {
      return await operation(token);
    } catch (err) {
      if (isNormalizedAgentError(err) && err.code === 'authentication_required') {
        const refreshed = await this.refreshAccessToken();
        return operation(refreshed);
      }
      throw err;
    }
  }

  public async activateLicense(
    rawLicenseKey: string,
    deviceLabel = 'Obsidian Device'
  ): Promise<ManagedSessionMetadata> {
    const trimmedKey = rawLicenseKey.trim();
    if (!trimmedKey) {
      throw new NormalizedAgentError({
        code: 'license_invalid',
        message: 'Please enter a valid license key.'
      });
    }

    const keyMaterial = await this.deps.keyManager.ensureKeyPair();

    const challenge = await signedJsonRequest<AuthChallengeResponse>({
      baseUrl: this.deps.getBaseUrl(),
      path: '/v1/auth/challenge',
      method: 'POST',
      signer: this.deps.signer,
      body: { public_key_spki: keyMaterial.publicKeySpkiB64Url },
      fetchFn: this.deps.fetchFn
    });

    const activated = await signedJsonRequest<LicenseActivateResponse>({
      baseUrl: this.deps.getBaseUrl(),
      path: '/v1/licenses/activate',
      method: 'POST',
      signer: this.deps.signer,
      body: {
        license_key: trimmedKey,
        public_key_spki: keyMaterial.publicKeySpkiB64Url,
        challenge_nonce: challenge.nonce,
        device_label: deviceLabel
      },
      fetchFn: this.deps.fetchFn
    });

    const { session } = await this.persistSession({
      principalId: activated.principal_id,
      activationId: activated.activation_id,
      keyId: activated.key_id,
      planTier: activated.plan_tier,
      licenseKeyMasked: activated.license_key_masked,
      accessToken: activated.access_token,
      refreshToken: activated.refresh_token,
      wireUsage: activated.usage
    });
    return session;
  }

  public async deactivateDevice(): Promise<void> {
    if (this.hasActiveSession()) {
      try {
        await this.withAccessToken(accessToken =>
          signedJsonRequest<{ deactivated: boolean }>({
            baseUrl: this.deps.getBaseUrl(),
            path: '/v1/licenses/deactivate',
            method: 'POST',
            signer: this.deps.signer,
            accessToken,
            body: {},
            fetchFn: this.deps.fetchFn
          })
        );
      } catch {
        // Proceed with local cleanup even if server session was already revoked.
      }
    }

    this.deps.secretStorage.clearTokens();
    this.deps.usageCache.clear();
    await this.deps.onSessionUpdated?.(null);
  }

  public async refreshAccessToken(): Promise<string> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      const refreshToken = this.deps.secretStorage.getSecret('refresh-tok');
      if (!refreshToken) {
        throw new NormalizedAgentError({
          code: 'authentication_required',
          status: 401,
          message: 'Managed session expired. Please re-activate your license or start a trial.'
        });
      }

      const rotated = await signedJsonRequest<TokenRefreshResponse>({
        baseUrl: this.deps.getBaseUrl(),
        path: '/v1/auth/refresh',
        method: 'POST',
        signer: this.deps.signer,
        body: { refresh_token: refreshToken },
        fetchFn: this.deps.fetchFn
      });

      this.deps.secretStorage.setSecret('access-tok', rotated.access_token);
      this.deps.secretStorage.setSecret('refresh-tok', rotated.refresh_token);
      return rotated.access_token;
    })();

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  public async refreshUsage(): Promise<AccountUsageSnapshot> {
    const wire = await this.withAccessToken(accessToken =>
      signedJsonRequest<WireAccountUsage>({
        baseUrl: this.deps.getBaseUrl(),
        path: '/v1/account/usage',
        method: 'GET',
        signer: this.deps.signer,
        accessToken,
        fetchFn: this.deps.fetchFn
      })
    );

    const snapshot = mapWireUsageToSnapshot(wire);
    this.deps.usageCache.update(snapshot);
    return snapshot;
  }
}
