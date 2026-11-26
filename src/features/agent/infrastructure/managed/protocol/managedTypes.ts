/**
 * @file managedTypes.ts
 * @brief Protocol DTOs, build-isolated gateway URLs, and segregated managed service contracts.
 *
 * @license See LICENSE.md
 */

import type { AgentErrorCode } from '../../../domain/AgentError';

declare const __FCR_BUILD_ENV__: 'production' | 'staging' | undefined;

export const MANAGED_PROTOCOL_VERSION = '2026-11-16';
export const PROD_GATEWAY_URL = 'https://gateway.full-calendar-remastered.in';
export const STAGING_GATEWAY_URL = 'https://staging-gateway.full-calendar-remastered.in';
export const PRICING_PAGE_URL = 'https://full-calendar-remastered.in/pricing/';

export function getPricingPlanUrl(plan?: 'pro' | 'power'): string {
  return plan ? `${PRICING_PAGE_URL}?plan=${plan}` : PRICING_PAGE_URL;
}

export function getBuildEnvironment(): 'production' | 'staging' {
  if (typeof __FCR_BUILD_ENV__ !== 'undefined') {
    return __FCR_BUILD_ENV__;
  }
  if (typeof process !== 'undefined' && process.env?.BUILD_ENV === 'production') {
    return 'production';
  }
  return 'staging';
}

/**
 * Production builds always pin the official gateway origin and never honor
 * client-supplied overrides, staging URLs, or local-provider endpoints.
 */
export function resolveGatewayBaseUrl(configuredUrl?: string): string {
  if (getBuildEnvironment() === 'production') {
    return PROD_GATEWAY_URL;
  }
  const trimmed = configuredUrl?.trim().replace(/\/+$/, '');
  return trimmed && trimmed.length > 0 ? trimmed : STAGING_GATEWAY_URL;
}

export type ManagedPlanTier = 'trial' | 'pro' | 'power';
export type ManagedEntitlementStatus = 'active' | 'past_due' | 'paused' | 'canceled' | 'revoked';

export interface ManagedPlanSpec {
  id: ManagedPlanTier;
  title: string;
  priceLabel: string;
  grantWtc: number;
  grantMicrocredits: number;
  maxActivations: number;
  maxInputTokens: number;
  allowanceSummary: string;
  estimatedRequestsLabel: string;
  details: string[];
}

export const MANAGED_PLAN_CATALOG: Record<ManagedPlanTier, ManagedPlanSpec> = {
  trial: {
    id: 'trial',
    title: 'Free trial',
    priceLabel: '$0',
    grantWtc: 1_000_000,
    grantMicrocredits: 10_000_000,
    maxActivations: 1,
    maxInputTokens: 16_000,
    allowanceSummary: '1,000,000 credits (lifetime)',
    estimatedRequestsLabel: 'Est. ~100–200 typical requests',
    details: [
      'Up to 1M input, 10M cached, or 250K output tokens',
      '1 active device · 16K token context',
      'No signup or credit card required'
    ]
  },
  pro: {
    id: 'pro',
    title: 'Pro',
    priceLabel: '$7 / month',
    grantWtc: 10_000_000,
    grantMicrocredits: 100_000_000,
    maxActivations: 3,
    maxInputTokens: 32_000,
    allowanceSummary: '10,000,000 credits / month',
    estimatedRequestsLabel: 'Est. ~1,000–2,000 typical requests / month',
    details: [
      'Up to 10M input, 100M cached, or 2.5M output tokens',
      '3 active devices · 32K token context',
      'Resets every billing cycle'
    ]
  },
  power: {
    id: 'power',
    title: 'Power',
    priceLabel: '$11 / month',
    grantWtc: 24_000_000,
    grantMicrocredits: 240_000_000,
    maxActivations: 5,
    maxInputTokens: 32_000,
    allowanceSummary: '24,000,000 credits / month',
    estimatedRequestsLabel: 'Est. ~2,400–4,800 typical requests / month',
    details: [
      'Up to 24M input, 240M cached, or 6M output tokens',
      '5 active devices · 32K token context',
      'High-volume allowance with prorated upgrades'
    ]
  }
};

export interface WireAccountUsage {
  principal_id: string;
  plan_tier: ManagedPlanTier;
  status: ManagedEntitlementStatus;
  period_start: string;
  period_end: string;
  total_microcredits: number;
  remaining_microcredits: number;
  uncached_input_tokens_used: number;
  cached_input_tokens_used: number;
  output_tokens_used: number;
  price_version: string;
}

export interface AccountUsageSnapshot {
  principalId: string;
  planTier: ManagedPlanTier;
  status: ManagedEntitlementStatus;
  periodStart: string;
  periodEnd: string;
  totalMicrocredits: number;
  remainingMicrocredits: number;
  uncachedInputTokensUsed: number;
  cachedInputTokensUsed: number;
  outputTokensUsed: number;
  priceVersion: string;
  syncedAt: number;
}

export function mapWireUsageToSnapshot(wire: WireAccountUsage): AccountUsageSnapshot {
  return {
    principalId: wire.principal_id,
    planTier: wire.plan_tier,
    status: wire.status,
    periodStart: wire.period_start,
    periodEnd: wire.period_end,
    totalMicrocredits: wire.total_microcredits,
    remainingMicrocredits: wire.remaining_microcredits,
    uncachedInputTokensUsed: wire.uncached_input_tokens_used,
    cachedInputTokensUsed: wire.cached_input_tokens_used,
    outputTokensUsed: wire.output_tokens_used,
    priceVersion: wire.price_version,
    syncedAt: Date.now()
  };
}

export interface GatewayErrorBody {
  error?: {
    code?: AgentErrorCode;
    message?: string;
    request_id?: string;
    retry_after_sec?: number;
    transaction_id?: string;
    verification_url?: string;
  };
}

export interface TrialRegisterActiveResponse {
  status: 'active';
  principal_id: string;
  activation_id: string;
  key_id: string;
  plan_tier: 'trial';
  access_token: string;
  refresh_token: string;
  usage: WireAccountUsage;
}

export interface TrialVerificationRequiredResponse {
  status: 'verification_required';
  transaction_id: string;
  verification_url: string;
  expires_at: string;
}

export type TrialVerifyStatusResponse =
  { status: 'pending' | 'expired' } | TrialRegisterActiveResponse;

export interface AuthChallengeResponse {
  nonce: string;
  expires_at: string;
}

export interface LicenseActivateResponse {
  principal_id: string;
  activation_id: string;
  key_id: string;
  plan_tier: 'pro' | 'power';
  license_key_masked: string;
  access_token: string;
  refresh_token: string;
  usage: WireAccountUsage;
}

export interface TokenRefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

export interface ManagedSseUsageEvent {
  request_id: string;
  provider_request_id?: string;
  price_version: string;
  uncached_input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  microcredits_reserved: number;
  microcredits_settled: number;
  microcredits_remaining: number;
}

export interface ManagedSessionMetadata {
  principalId: string;
  activationId: string;
  keyId: string;
  planTier: ManagedPlanTier;
  licenseKeyMasked?: string;
  currentPeriodEnd: string;
}

export interface IManagedUsageService {
  getUsageSnapshot(): AccountUsageSnapshot | null;
  refreshUsage(): Promise<AccountUsageSnapshot>;
  subscribe(listener: (snapshot: AccountUsageSnapshot | null) => void): () => void;
}

export interface IManagedActivationService {
  activateLicense(rawLicenseKey: string, deviceLabel?: string): Promise<ManagedSessionMetadata>;
  deactivateDevice(): Promise<void>;
  hasActiveSession(): boolean;
}

export type TrialRegistrationOutcome =
  | { status: 'active'; session: ManagedSessionMetadata; usage: AccountUsageSnapshot }
  | { status: 'verification_required'; transactionId: string; verificationUrl: string };

export interface IManagedAccountService {
  startAnonymousTrial(): Promise<TrialRegistrationOutcome>;
  pollVerification(
    transactionId: string,
    signal?: AbortSignal
  ): Promise<{ session: ManagedSessionMetadata; usage: AccountUsageSnapshot }>;
  refreshSession(): Promise<void>;
}
