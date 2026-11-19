/**
 * @file managedHttp.ts
 * @brief Shared gateway HTTP request, signing dispatch, and error normalization helpers.
 *
 * @license See LICENSE.md
 */

import { type AgentErrorCode, NormalizedAgentError } from '../../../domain/AgentError';
import { parseRetryAfterHeaderMs } from '../../../domain/httpUtils';
import type { IRequestSigner } from './RequestSigner';
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

  let parsed: GatewayErrorBody | undefined;
  if (bodyText.trim().length > 0) {
    try {
      parsed = JSON.parse(bodyText) as GatewayErrorBody;
    } catch {
      // Non-JSON error body
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
      : parseRetryAfterHeaderMs(retryAfterHeader);

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
  signer: IRequestSigner;
  accessToken?: string | null;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
  fetchFn?: FetchLike;
}

export async function signedFetch(options: SignedJsonRequestOptions): Promise<Response> {
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

  return fetchImpl(`${options.baseUrl}${options.path}`, {
    method: options.method,
    headers,
    body: options.method === 'POST' ? bodyStr : undefined,
    signal: options.signal
  });
}

export async function signedJsonRequest<T>(options: SignedJsonRequestOptions): Promise<T> {
  const response = await signedFetch(options);
  const text = await response.text().catch(() => '');
  if (!response.ok) {
    throw mapGatewayError(response.status, text, response.headers?.get?.('retry-after'));
  }
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}
