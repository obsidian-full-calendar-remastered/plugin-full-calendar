/**
 * @file managedHttp.ts
 * @brief Shared gateway HTTP request, error normalization, and Retry-After parsing helpers.
 *
 * @license See LICENSE.md
 */

import { type AgentErrorCode, NormalizedAgentError } from '../../../domain/AgentError';
import type { RequestSigner } from './RequestSigner';
import type { GatewayErrorBody } from '../protocol/managedTypes';

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function defaultFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    return window.fetch(input, init);
  }
  return Promise.reject(new Error('Fetch API is unavailable in this environment.'));
}

const RETRYABLE_ERROR_CODES = new Set<AgentErrorCode>([
  'rate_limited',
  'provider_unavailable',
  'provider_timeout'
]);

export function parseRetryAfterMs(headerVal: string | null | undefined): number | undefined {
  if (!headerVal) return undefined;
  const seconds = Number(headerVal);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1000);
  }
  const dateMs = Date.parse(headerVal);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return undefined;
}

export function mapGatewayError(
  status: number,
  bodyText: string,
  retryAfterHeader?: string | null
): NormalizedAgentError {
  if (status === 426) {
    return new NormalizedAgentError({
      code: 'invalid_request',
      status: 426,
      retryable: false,
      message: 'Please update Full Calendar Remastered to continue using Managed AI.'
    });
  }

  let parsed: GatewayErrorBody | null = null;
  if (bodyText.trim().length > 0) {
    try {
      parsed = JSON.parse(bodyText) as GatewayErrorBody;
    } catch {
      parsed = null;
    }
  }

  const errObj = parsed?.error;
  const code: AgentErrorCode =
    errObj?.code ??
    (status === 401
      ? 'authentication_required'
      : status === 403
        ? 'entitlement_inactive'
        : status === 402
          ? 'insufficient_credits'
          : status === 409
            ? 'generation_in_progress'
            : status === 429
              ? 'rate_limited'
              : status === 504
                ? 'provider_timeout'
                : status >= 500
                  ? 'provider_unavailable'
                  : 'invalid_request');

  const retryAfterMs =
    typeof errObj?.retry_after_sec === 'number'
      ? errObj.retry_after_sec * 1000
      : parseRetryAfterMs(retryAfterHeader);

  return new NormalizedAgentError({
    code,
    status,
    retryable: RETRYABLE_ERROR_CODES.has(code) || status === 502 || status === 503,
    retryAfterMs,
    requestId: errObj?.request_id,
    message: errObj?.message || `Gateway request failed with status ${status}`
  });
}

export interface SignedJsonRequestOptions {
  baseUrl: string;
  path: string;
  method: 'GET' | 'POST';
  signer: RequestSigner;
  accessToken?: string | null;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
  fetchFn?: FetchLike;
}

export async function signedJsonRequest<T>(options: SignedJsonRequestOptions): Promise<T> {
  const fetchImpl = options.fetchFn ?? defaultFetch;
  const bodyStr = options.body !== undefined ? JSON.stringify(options.body) : '';
  const sigHeaders = await options.signer.signRequest({
    method: options.method,
    path: options.path,
    body: bodyStr,
    idempotencyKey: options.idempotencyKey
  });

  const headers: Record<string, string> = {
    ...sigHeaders,
    Accept: 'application/json'
  };
  if (options.method === 'POST') {
    headers['Content-Type'] = 'application/json';
  }
  if (options.accessToken) {
    headers['Authorization'] = `Bearer ${options.accessToken}`;
  }

  const response = await fetchImpl(`${options.baseUrl}${options.path}`, {
    method: options.method,
    headers,
    body: options.method === 'POST' ? bodyStr : undefined,
    signal: options.signal
  });

  const text = await response.text().catch(() => '');
  if (!response.ok) {
    throw mapGatewayError(response.status, text, response.headers?.get?.('retry-after'));
  }

  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}
