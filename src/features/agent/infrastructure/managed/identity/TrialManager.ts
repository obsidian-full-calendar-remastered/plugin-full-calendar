/**
 * @file TrialManager.ts
 * @brief Anonymous free-trial registration and out-of-band Turnstile verification poller.
 *
 * @license See LICENSE.md
 */

import { NormalizedAgentError } from '../../../domain/AgentError';
import {
  type AccountUsageSnapshot,
  type GatewayErrorBody,
  type IManagedAccountService,
  type ManagedSessionMetadata,
  type TrialRegisterActiveResponse,
  type TrialRegistrationOutcome,
  type TrialVerifyStatusResponse,
  mapWireUsageToSnapshot
} from '../protocol/managedTypes';
import type { DeviceKeyManager } from './DeviceKeyManager';
import type { SecretStorageAdapter } from './SecretStorageAdapter';
import type { RequestSigner } from '../client/RequestSigner';
import {
  type FetchLike,
  defaultFetch,
  mapGatewayError,
  signedJsonRequest
} from '../client/managedHttp';
import type { UsageSnapshotCache } from '../state/UsageSnapshotCache';

export interface TrialManagerDeps {
  getBaseUrl: () => string;
  keyManager: DeviceKeyManager;
  secretStorage: SecretStorageAdapter;
  signer: RequestSigner;
  usageCache: UsageSnapshotCache;
  refreshSessionFn: () => Promise<void>;
  onSessionUpdated?: (session: ManagedSessionMetadata | null) => Promise<void> | void;
  fetchFn?: FetchLike;
}

export class TrialManager implements IManagedAccountService {
  private readonly deps: TrialManagerDeps;

  constructor(deps: TrialManagerDeps) {
    this.deps = deps;
  }

  private async persistActiveTrial(
    res: TrialRegisterActiveResponse
  ): Promise<{ session: ManagedSessionMetadata; usage: AccountUsageSnapshot }> {
    this.deps.secretStorage.setSecret('access-tok', res.access_token);
    this.deps.secretStorage.setSecret('refresh-tok', res.refresh_token);

    const usage = mapWireUsageToSnapshot(res.usage);
    this.deps.usageCache.update(usage);

    const session: ManagedSessionMetadata = {
      principalId: res.principal_id,
      activationId: res.activation_id,
      keyId: res.key_id,
      planTier: res.plan_tier,
      currentPeriodEnd: usage.periodEnd
    };
    await this.deps.onSessionUpdated?.(session);
    return { session, usage };
  }

  public async startAnonymousTrial(): Promise<TrialRegistrationOutcome> {
    const keyMaterial = await this.deps.keyManager.ensureKeyPair();
    const path = '/v1/trials/register';
    const bodyObj = { public_key_spki: keyMaterial.publicKeySpkiB64Url };
    const bodyStr = JSON.stringify(bodyObj);
    const sigHeaders = await this.deps.signer.signRequest({
      method: 'POST',
      path,
      body: bodyStr
    });

    const fetchImpl = this.deps.fetchFn ?? defaultFetch;
    const response = await fetchImpl(`${this.deps.getBaseUrl()}${path}`, {
      method: 'POST',
      headers: {
        ...sigHeaders,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: bodyStr
    });

    const text = await response.text().catch(() => '');
    if (response.status === 403) {
      let parsed: GatewayErrorBody | undefined;
      try {
        parsed = JSON.parse(text) as GatewayErrorBody;
      } catch {
        // Not valid JSON
      }
      if (
        parsed?.error?.code === 'verification_required' &&
        parsed.error.transaction_id &&
        parsed.error.verification_url
      ) {
        return {
          status: 'verification_required',
          transactionId: parsed.error.transaction_id,
          verificationUrl: parsed.error.verification_url
        };
      }
    }

    if (!response.ok) {
      throw mapGatewayError(response.status, text, response.headers?.get?.('retry-after'));
    }

    const active = JSON.parse(text) as TrialRegisterActiveResponse;
    const persisted = await this.persistActiveTrial(active);
    return { status: 'active', ...persisted };
  }

  public async pollVerification(
    transactionId: string,
    signal?: AbortSignal,
    intervalMs = 3000,
    timeoutMs = 300_000
  ): Promise<{ session: ManagedSessionMetadata; usage: AccountUsageSnapshot }> {
    const keyMaterial = await this.deps.keyManager.ensureKeyPair();
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      if (signal?.aborted) {
        throw new NormalizedAgentError({
          code: 'cancelled',
          message: 'Verification was cancelled.'
        });
      }

      const res = await signedJsonRequest<TrialVerifyStatusResponse>({
        baseUrl: this.deps.getBaseUrl(),
        path: '/v1/trials/verify-status',
        method: 'POST',
        signer: this.deps.signer,
        body: {
          transaction_id: transactionId,
          public_key_spki: keyMaterial.publicKeySpkiB64Url
        },
        signal,
        fetchFn: this.deps.fetchFn
      });

      if (res.status === 'active') {
        return this.persistActiveTrial(res);
      }
      if (res.status === 'expired') {
        throw new NormalizedAgentError({
          code: 'verification_required',
          message: 'Verification window expired. Please try starting the trial again.'
        });
      }

      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, intervalMs);

        const onAbort = () => {
          window.clearTimeout(timer);
          reject(
            new NormalizedAgentError({
              code: 'cancelled',
              message: 'Verification was cancelled.'
            })
          );
        };
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    }

    throw new NormalizedAgentError({
      code: 'provider_timeout',
      message: 'Verification timed out before completion.'
    });
  }

  public async refreshSession(): Promise<void> {
    await this.deps.refreshSessionFn();
  }
}
