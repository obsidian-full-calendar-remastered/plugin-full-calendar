/**
 * @file AgentError.ts
 * @brief Normalized domain error taxonomy shared across BYOK and Managed AI clients.
 *
 * @license See LICENSE.md
 */

export type AgentErrorCode =
  | 'invalid_request'
  | 'authentication_required'
  | 'invalid_signature'
  | 'replay_detected'
  | 'license_invalid'
  | 'entitlement_inactive'
  | 'insufficient_credits'
  | 'generation_in_progress'
  | 'idempotency_conflict'
  | 'rate_limited'
  | 'trial_registration_blocked'
  | 'verification_required'
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'service_budget_exhausted'
  | 'managed_ai_disabled'
  | 'cancelled'
  | 'unknown';

export interface NormalizedAgentErrorOptions {
  code: AgentErrorCode;
  message: string;
  status?: number;
  retryable?: boolean;
  retryAfterMs?: number;
  requestId?: string;
  cause?: unknown;
}

/**
 * Domain-level error produced by any IAgentClient implementation.
 * Decouples AgentEngine and UI from transport/provider-specific error shapes.
 */
export class NormalizedAgentError extends Error {
  public readonly code: AgentErrorCode;
  public readonly status?: number;
  public readonly retryable: boolean;
  public readonly retryAfterMs?: number;
  public readonly requestId?: string;

  constructor(options: NormalizedAgentErrorOptions) {
    super(options.message);
    this.name = 'NormalizedAgentError';
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.requestId = options.requestId;
  }
}

export function isNormalizedAgentError(value: unknown): value is NormalizedAgentError {
  return value instanceof NormalizedAgentError;
}
