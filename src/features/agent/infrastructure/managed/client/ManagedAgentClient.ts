/**
 * @file ManagedAgentClient.ts
 * @brief IAgentClient implementation communicating with the Full Calendar Managed AI gateway.
 *
 * @description
 * Constructs strictly allowlisted stateless chat completion payloads (never sending
 * model, temperature, provider URL, or n), signs every request with ECDSA P-256,
 * delegates 401 token refresh to IAccessTokenProvider preserving the idempotency key,
 * and updates the read-only UsageSnapshotCache from authoritative terminal fcr:usage events.
 *
 * @license See LICENSE.md
 */

import type { ChatMessage, ToolDefinition } from '../../../types';
import type {
  ChatCompletionRequestConfig,
  CompletionResult,
  ConnectionTestResult,
  IAgentClient
} from '../../../domain/contracts/IAgentClient';
import { isNormalizedAgentError, NormalizedAgentError } from '../../../domain/AgentError';
import { generateRandomId } from '../../../domain/crypto/randomId';
import { sanitizeChatMessages } from '../../../domain/httpUtils';
import type { ManagedUsageMetadata, TokenUsage } from '../../../domain/Usage';
import type { IAccessTokenProvider } from '../identity/LicenseManager';
import type { IRequestSigner } from './RequestSigner';
import { type IStreamingTransport, StreamingTransport } from './StreamingTransport';
import type { UsageSnapshotCache } from '../state/UsageSnapshotCache';
import { type FetchLike, defaultFetch } from './managedHttp';

export interface ManagedAgentClientDeps {
  getBaseUrl: () => string;
  signer: IRequestSigner;
  tokenProvider: IAccessTokenProvider;
  usageCache: UsageSnapshotCache;
  transport?: IStreamingTransport;
  fetchFn?: FetchLike;
}

export class ManagedAgentClient implements IAgentClient {
  private readonly deps: ManagedAgentClientDeps;
  private readonly transport: IStreamingTransport;

  constructor(deps: ManagedAgentClientDeps) {
    this.deps = deps;
    this.transport = deps.transport ?? new StreamingTransport(deps.fetchFn);
  }

  public async testConnection(): Promise<ConnectionTestResult> {
    try {
      const fetchImpl = this.deps.fetchFn ?? defaultFetch;
      const res = await fetchImpl(`${this.deps.getBaseUrl()}/health/live`, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });
      if (res.ok) {
        return { success: true, message: 'Managed AI gateway reachable.' };
      }
      return { success: false, message: `Gateway returned status ${res.status}` };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Unable to reach Managed AI gateway.'
      };
    }
  }

  public async chatCompletion(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    config: ChatCompletionRequestConfig = {}
  ): Promise<CompletionResult> {
    const startTime = Date.now();
    const idempotencyKey = config.idempotencyKey ?? generateRandomId('idem');
    const path = '/v1/chat/completions';

    // Strict allowlisted body: never pass model, n, temperature, logprobs, or provider URLs
    const bodyObj: Record<string, unknown> = {
      messages: sanitizeChatMessages(messages),
      stream: config.stream ?? true
    };
    if (tools && tools.length > 0) {
      bodyObj.tools = tools;
    }
    const bodyStr = JSON.stringify(bodyObj);

    let streamed;
    try {
      streamed = await this.deps.tokenProvider.withAccessToken(async accessToken => {
        const sigHeaders = await this.deps.signer.signRequest({
          method: 'POST',
          path,
          body: bodyStr,
          idempotencyKey
        });

        return this.transport.streamChatCompletions({
          url: `${this.deps.getBaseUrl()}${path}`,
          headers: {
            ...sigHeaders,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream'
          },
          body: bodyStr,
          signal: config.signal,
          callbacks: config.callbacks
        });
      });
    } catch (err) {
      if (isNormalizedAgentError(err)) {
        throw err;
      }
      throw new NormalizedAgentError({
        code: 'unknown',
        message: err instanceof Error ? err.message : String(err),
        cause: err
      });
    }

    let tokenUsage: TokenUsage | undefined;
    let managedUsage: ManagedUsageMetadata | undefined;

    if (streamed.usageEvent) {
      const ue = streamed.usageEvent;
      const totalInput = ue.uncached_input_tokens + ue.cached_input_tokens;
      tokenUsage = {
        prompt: totalInput,
        cachedPrompt: ue.cached_input_tokens,
        completion: ue.output_tokens,
        total: totalInput + ue.output_tokens
      };
      managedUsage = {
        microcreditsReserved: ue.microcredits_reserved,
        microcreditsSettled: ue.microcredits_settled,
        microcreditsRemaining: ue.microcredits_remaining,
        priceVersion: ue.price_version,
        requestId: ue.request_id,
        providerRequestId: ue.provider_request_id
      };
      this.deps.usageCache.applySettlement(managedUsage, {
        uncachedInput: ue.uncached_input_tokens,
        cachedInput: ue.cached_input_tokens,
        output: ue.output_tokens
      });
    }

    return {
      content: streamed.content,
      toolCalls: streamed.toolCalls,
      durationMs: Date.now() - startTime,
      finishReason: streamed.finishReason,
      requestId: managedUsage?.requestId,
      idempotencyKey,
      tokenUsage,
      managedUsage
    };
  }
}
