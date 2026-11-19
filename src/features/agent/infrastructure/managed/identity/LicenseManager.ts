/**
 * @file LicenseManager.ts
 * @brief Activate-once Paddle license binding, token rotation, device deactivation, and usage sync.
 *
 * @license See LICENSE.md
 */

import { NormalizedAgentError } from '../../../domain/AgentError';
import {
  type AccountUsageSnapshot,
  type AuthChallengeResponse,
  type IManagedActivationService,
  type IManagedUsageService,
  type LicenseActivateResponse,
  type ManagedSessionMetadata,
  type TokenRefreshResponse,
  type WireAccountUsage,
  mapWireUsageToSnapshot
} from '../protocol/managedTypes';
import type { DeviceKeyManager } from './DeviceKeyManager';
import type { SecretStorageAdapter } from './SecretStorageAdapter';
import type { RequestSigner } from '../client/RequestSigner';
import { type FetchLike, signedJsonRequest } from '../client/managedHttp';
import type { UsageSnapshotCache } from '../state/UsageSnapshotCache';

export interface LicenseManagerDeps {
  getBaseUrl: () => string;
  keyManager: DeviceKeyManager;
  secretStorage: SecretStorageAdapter;
  signer: RequestSigner;
  usageCache: UsageSnapshotCache;
  onSessionUpdated?: (session: ManagedSessionMetadata | null) => Promise<void> | void;
  fetchFn?: FetchLike;
}

export class LicenseManager implements IManagedActivationService, IManagedUsageService {
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

    this.deps.secretStorage.setSecret('access-tok', activated.access_token);
    this.deps.secretStorage.setSecret('refresh-tok', activated.refresh_token);

    const usage = mapWireUsageToSnapshot(activated.usage);
    this.deps.usageCache.update(usage);

    const session: ManagedSessionMetadata = {
      principalId: activated.principal_id,
      activationId: activated.activation_id,
      keyId: activated.key_id,
      planTier: activated.plan_tier,
      licenseKeyMasked: activated.license_key_masked,
      currentPeriodEnd: usage.periodEnd
    };
    await this.deps.onSessionUpdated?.(session);
    return session;
  }

  public async deactivateDevice(): Promise<void> {
    const accessToken = this.deps.secretStorage.getSecret('access-tok');
    if (accessToken) {
      try {
        await signedJsonRequest<{ deactivated: boolean }>({
          baseUrl: this.deps.getBaseUrl(),
          path: '/v1/licenses/deactivate',
          method: 'POST',
          signer: this.deps.signer,
          accessToken,
          body: {},
          fetchFn: this.deps.fetchFn
        });
      } catch {
        // Proceed with local cleanup even if server session was already revoked.
      }
    }

    this.deps.keyManager.clear();
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
    const token = this.deps.secretStorage.getSecret('access-tok');
    if (!token) {
      throw new NormalizedAgentError({
        code: 'authentication_required',
        status: 401,
        message: 'No active Managed AI session.'
      });
    }

    const fetchWithToken = async (tok: string) =>
      signedJsonRequest<WireAccountUsage>({
        baseUrl: this.deps.getBaseUrl(),
        path: '/v1/account/usage',
        method: 'GET',
        signer: this.deps.signer,
        accessToken: tok,
        fetchFn: this.deps.fetchFn
      });

    let wire: WireAccountUsage;
    try {
      wire = await fetchWithToken(token);
    } catch (err) {
      if (err instanceof NormalizedAgentError && err.code === 'authentication_required') {
        const nextToken = await this.refreshAccessToken();
        wire = await fetchWithToken(nextToken);
      } else {
        throw err;
      }
    }

    const snapshot = mapWireUsageToSnapshot(wire);
    this.deps.usageCache.update(snapshot);
    return snapshot;
  }
}
