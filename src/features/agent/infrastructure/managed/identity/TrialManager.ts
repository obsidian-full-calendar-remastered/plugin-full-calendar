/**
 * @file TrialManager.ts
 * @brief Anonymous free-trial registration and out-of-band Turnstile verification poller.
 *
 * @license See LICENSE.md
 */

import { NormalizedAgentError } from '../../../domain/AgentError';
import type {
  AccountUsageSnapshot,
  GatewayErrorBody,
  IManagedAccountService,
  ManagedSessionMetadata,
  TrialRegisterActiveResponse,
  TrialRegistrationOutcome,
  TrialVerifyStatusResponse
} from '../protocol/managedTypes';
import type { DeviceKeyManager } from './DeviceKeyManager';
import type { PersistSessionInput } from './LicenseManager';
import type { IRequestSigner } from '../client/RequestSigner';
import {
  type FetchLike,
  mapGatewayError,
  signedFetch,
  signedJsonRequest
} from '../client/managedHttp';

export interface TrialManagerDeps {
  getBaseUrl: () => string;
  keyManager: DeviceKeyManager;
  signer: IRequestSigner;
  persistSession: (
    input: PersistSessionInput
  ) => Promise<{ session: ManagedSessionMetadata; usage: AccountUsageSnapshot }>;
  refreshSessionFn: () => Promise<void>;
  fetchFn?: FetchLike;
}

export class TrialManager implements IManagedAccountService {
  private readonly deps: TrialManagerDeps;

  constructor(deps: TrialManagerDeps) {
    this.deps = deps;
  }

  private persistActiveTrial(
    res: TrialRegisterActiveResponse
  ): Promise<{ session: ManagedSessionMetadata; usage: AccountUsageSnapshot }> {
    return this.deps.persistSession({
      principalId: res.principal_id,
      activationId: res.activation_id,
      keyId: res.key_id,
      planTier: res.plan_tier,
      accessToken: res.access_token,
      refreshToken: res.refresh_token,
      wireUsage: res.usage
    });
  }

  public async startAnonymousTrial(): Promise<TrialRegistrationOutcome> {
    const keyMaterial = await this.deps.keyManager.ensureKeyPair();
    const response = await signedFetch({
      baseUrl: this.deps.getBaseUrl(),
      path: '/v1/trials/register',
      method: 'POST',
      signer: this.deps.signer,
      body: { public_key_spki: keyMaterial.publicKeySpkiB64Url },
      fetchFn: this.deps.fetchFn
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
        const validatedUrl = this.validateVerificationUrl(parsed.error.verification_url);
        return {
          status: 'verification_required',
          transactionId: parsed.error.transaction_id,
          verificationUrl: validatedUrl
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

  private validateVerificationUrl(rawUrl: string): string {
    let parsed: URL;
    let base: URL;
    try {
      parsed = new URL(rawUrl);
      base = new URL(this.deps.getBaseUrl());
    } catch {
      throw new NormalizedAgentError({
        code: 'invalid_request',
        message: 'Gateway returned an invalid verification URL.'
      });
    }

    const isAllowedProtocol =
      parsed.protocol === 'https:' ||
      (parsed.protocol === 'http:' &&
        (base.hostname === 'localhost' || base.hostname === '127.0.0.1'));

    if (!isAllowedProtocol || parsed.origin !== base.origin || parsed.pathname !== '/verify') {
      throw new NormalizedAgentError({
        code: 'invalid_request',
        message: 'Gateway returned an untrusted verification URL.'
      });
    }
    return parsed.toString();
  }
}
