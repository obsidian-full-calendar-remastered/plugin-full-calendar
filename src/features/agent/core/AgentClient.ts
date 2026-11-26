/**
 * @file AgentClient.ts
 * @brief Lean, ultra-robust OpenAI-compatible HTTP client with streaming, retry, and rate-limit handling.
 *
 * @description
 * Zero bloatware: uses standard fetch and SSE parsing.
 * Features:
 * 1. Automatic exponential backoff with jitter on 429 and 5xx errors.
 * 2. Honor 'Retry-After' response headers.
 * 3. Configurable timeouts with linked AbortControllers.
 * 4. Resilient chunk buffering and UTF-8 stream decoding.
 * 5. Full typed error categorization for clear diagnostics.
 *
 * @license See LICENSE.md
 */

import { requestUrl } from 'obsidian';
import type { ChatMessage, ToolDefinition, ChatToolCall } from '../types';
import type { AgentAuditLogger } from './AgentAuditLogger';
import type {
  ChatCompletionRequestConfig,
  CompletionResult,
  ConnectionTestResult,
  IAgentClient,
  StreamCallbacks
} from '../domain/contracts/IAgentClient';
import { AGENT_ABORT_ERROR_MESSAGE, raceWithAbort } from '../domain/abortUtils';
import { parseRetryAfterHeaderMs, sanitizeChatMessages } from '../domain/httpUtils';
import { type ParsedSseResult, SseChunkParser } from '../domain/sseParser';

export type {
  StreamCallbacks,
  CompletionResult,
  ChatCompletionRequestConfig,
  ConnectionTestResult
};

export class AgentApiError extends Error {
  public status: number;
  public endpoint: string;
  public responseBody?: string;
  public isRateLimit: boolean;
  public isAuthError: boolean;

  constructor(status: number, endpoint: string, message: string, responseBody?: string) {
    super(message);
    this.name = 'AgentApiError';
    this.status = status;
    this.endpoint = endpoint;
    this.responseBody = responseBody;
    this.isRateLimit = status === 429;
    this.isAuthError = status === 401 || status === 403;
  }
}

export interface AgentClientOptions {
  endpointUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxRetries?: number;
  timeoutMs?: number;
}

export class AgentClient implements IAgentClient {
  private options: AgentClientOptions;
  private logger?: AgentAuditLogger;

  constructor(options: AgentClientOptions, logger?: AgentAuditLogger) {
    this.options = {
      ...options,
      maxRetries: options.maxRetries ?? 3,
      timeoutMs: options.timeoutMs ?? 60000
    };
    if (typeof options.temperature === 'number') {
      this.options.temperature = options.temperature;
    } else {
      delete this.options.temperature;
    }
    this.logger = logger;
  }

  public updateOptions(options: Partial<AgentClientOptions>): void {
    this.options = {
      ...this.options,
      ...options
    };
    if (options.temperature === undefined && 'temperature' in options) {
      delete this.options.temperature;
    }
  }

  private normalizeUrl(endpointUrl: string): string {
    let clean = endpointUrl.trim().replace(/\/+$/, '');
    if (!clean.endsWith('/chat/completions')) {
      clean = `${clean}/chat/completions`;
    }
    return clean;
  }

  private parseRetryAfter(
    headers?: Headers | { get?: (k: string) => string | null } | Record<string, string>
  ): number | null {
    if (!headers) return null;
    let header: string | null;
    if (typeof (headers as Headers).get === 'function') {
      header = (headers as Headers).get('Retry-After') ?? (headers as Headers).get('retry-after');
    } else {
      const rec = headers as Record<string, string>;
      header = rec['retry-after'] || rec['Retry-After'] || null;
    }
    const parsed = parseRetryAfterHeaderMs(header);
    return parsed !== undefined ? parsed : null;
  }

  private calculateBackoff(attempt: number, retryAfterMs: number | null): number {
    if (retryAfterMs !== null && retryAfterMs >= 0 && retryAfterMs <= 60000) {
      return retryAfterMs;
    }
    const base = 1000;
    const maxBackoff = 30000;
    const exponential = base * Math.pow(2, attempt);
    const jitter = Math.random() * 500;
    return Math.min(exponential + jitter, maxBackoff);
  }

  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        return reject(new Error('Operation aborted'));
      }
      const timer = window.setTimeout(() => {
        resolve();
      }, ms);
      signal?.addEventListener(
        'abort',
        () => {
          window.clearTimeout(timer);
          reject(new Error('Operation aborted'));
        },
        { once: true }
      );
    });
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (this.options.apiKey && this.options.apiKey.trim().length > 0) {
      headers['Authorization'] = `Bearer ${this.options.apiKey.trim()}`;
    }
    return headers;
  }

  private buildPayload(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    maxTokens?: number,
    stream?: boolean
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      model: this.options.model,
      messages: sanitizeChatMessages(messages)
    };

    if (typeof this.options.temperature === 'number') {
      payload.temperature = this.options.temperature;
    }

    if (tools && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }
    if (maxTokens) {
      payload.max_tokens = maxTokens;
    }
    if (stream === true) {
      payload.stream = true;
    }
    return payload;
  }

  private extractMessageFromObject(obj: unknown): string | null {
    if (!obj || typeof obj !== 'object') return null;
    const record = obj as Record<string, unknown>;
    if (record.error && typeof record.error === 'object') {
      const errObj = record.error as Record<string, unknown>;
      if (typeof errObj.message === 'string') return errObj.message;
    }
    return typeof record.message === 'string' ? record.message : null;
  }

  private extractErrorMessage(status: number, text?: string, json?: unknown): string {
    const fromJson = this.extractMessageFromObject(json);
    if (fromJson) return fromJson;

    if (text && text.trim().length > 0) {
      try {
        const fromParsed = this.extractMessageFromObject(JSON.parse(text));
        if (fromParsed) return fromParsed;
      } catch {
        // Not JSON text
      }
      return text.slice(0, 300);
    }
    return `status ${status}`;
  }

  private isTemperatureRejection(status: number, message: string): boolean {
    if (status !== 400) return false;
    return /temperature.*deprecated|deprecated.*temperature|unsupported.*temperature|temperature.*not supported|invalid.*temperature/i.test(
      message
    );
  }

  private tryHealTemperatureRejection(
    status: number,
    text: string | undefined,
    json: unknown,
    payload: Record<string, unknown>,
    contextLabel: string
  ): boolean {
    if (status !== 400 || !('temperature' in payload)) return false;
    const errorDetail = this.extractErrorMessage(status, text, json);
    if (!this.isTemperatureRejection(status, errorDetail)) return false;
    this.logger?.warn(
      `Endpoint rejected temperature parameter. Retrying ${contextLabel} without temperature...`,
      { model: this.options.model }
    );
    delete payload.temperature;
    delete this.options.temperature;
    return true;
  }

  private handleHttpError(
    status: number,
    url: string,
    bodyText: string,
    errorDetail: string
  ): never {
    if (status === 401 || status === 403) {
      throw new AgentApiError(
        status,
        url,
        `Authentication failed (${status}): ${errorDetail}. Please verify your API key in settings.`,
        bodyText
      );
    }
    if (status === 400 || status === 404) {
      throw new AgentApiError(
        status,
        url,
        `API request rejected (${status}): ${errorDetail}`,
        bodyText
      );
    }
    throw new AgentApiError(
      status,
      url,
      `API call failed with status ${status}: ${errorDetail}`,
      bodyText
    );
  }

  private async readSseStream(
    body: ReadableStream<Uint8Array>,
    callbacks?: StreamCallbacks,
    signal?: AbortSignal
  ): Promise<ParsedSseResult> {
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');
    const parser = new SseChunkParser({ callbacks });

    try {
      while (true) {
        if (signal?.aborted) {
          throw new Error('Agent request was cancelled by user.');
        }

        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value && value.byteLength > 0) {
          parser.feed(decoder.decode(value, { stream: true }));
        }
      }

      const tail = decoder.decode();
      if (tail) {
        parser.feed(tail);
      }
      parser.flush();
      return parser.getResult();
    } catch (err) {
      await reader.cancel().catch(() => undefined);
      throw err;
    }
  }

  private parseBufferedSse(text: string, callbacks?: StreamCallbacks): ParsedSseResult {
    const parser = new SseChunkParser({ callbacks });
    parser.feed(text);
    parser.flush();
    return parser.getResult();
  }

  private async executeHttp(
    url: string,
    headers: Record<string, string>,
    payload: Record<string, unknown>,
    options: {
      signal?: AbortSignal;
      callbacks?: StreamCallbacks;
      hasEmitted?: () => boolean;
    } = {}
  ): Promise<{
    status: number;
    text: string;
    json?: unknown;
    headers?: Record<string, string>;
    streamResult?: ParsedSseResult;
  }> {
    const { signal, callbacks, hasEmitted } = options;

    if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
      try {
        const fetchHeaders =
          payload.stream === true
            ? { ...headers, Accept: 'text/event-stream, application/json' }
            : headers;
        const response = await window.fetch(url, {
          method: 'POST',
          headers: fetchHeaders,
          body: JSON.stringify(payload),
          signal
        });
        if (response) {
          const respHeaders: Record<string, string> = {};
          if (response.headers && typeof response.headers.forEach === 'function') {
            response.headers.forEach((val, key) => {
              respHeaders[key.toLowerCase()] = val;
              respHeaders[key] = val;
            });
          }
          const headerContentType =
            typeof response.headers?.get === 'function'
              ? response.headers.get('content-type') || ''
              : respHeaders['content-type'] || '';
          const contentType = headerContentType.toLowerCase();
          const status =
            typeof response.status === 'number' ? response.status : response.ok ? 200 : 500;

          if (
            status === 200 &&
            response.body &&
            typeof response.body.getReader === 'function' &&
            contentType.includes('text/event-stream')
          ) {
            const streamResult = await this.readSseStream(response.body, callbacks, signal);
            return { status, text: '', headers: respHeaders, streamResult };
          }

          let text = '';
          let json: unknown = null;
          if (typeof response.text === 'function') {
            text = await response.text().catch(() => '');
            if (
              status === 200 &&
              text &&
              (contentType.includes('text/event-stream') || text.trimStart().startsWith('data:'))
            ) {
              const streamResult = this.parseBufferedSse(text, callbacks);
              return { status, text, headers: respHeaders, streamResult };
            }
            if (text) {
              try {
                json = JSON.parse(text);
              } catch {
                /* ignore non-json text */
              }
            }
          } else if (typeof response.json === 'function') {
            try {
              json = await response.json();
              text = JSON.stringify(json);
            } catch {
              /* ignore json parse failure */
            }
          }

          return { status, text, json, headers: respHeaders };
        }
      } catch (err) {
        if (signal?.aborted || hasEmitted?.()) {
          throw err;
        }
        if (!(err instanceof TypeError)) {
          throw err;
        }
        this.logger?.warn('Fetch encountered CORS or network error, falling back to requestUrl', {
          url
        });
      }
    }

    const fallbackPayload = payload.stream === true ? { ...payload, stream: false } : payload;
    const res = await raceWithAbort(
      requestUrl({
        url,
        method: 'POST',
        headers,
        body: JSON.stringify(fallbackPayload),
        throw: false
      }),
      signal
    );
    if (signal?.aborted) {
      throw new Error(AGENT_ABORT_ERROR_MESSAGE);
    }
    const status = res?.status ?? 200;
    const text = res?.text ?? '';
    if (status === 200 && text.trimStart().startsWith('data:')) {
      const streamResult = this.parseBufferedSse(text, callbacks);
      return { status, text, headers: res?.headers ?? {}, streamResult };
    }
    return {
      status,
      text,
      json: res?.json ?? null,
      headers: res?.headers ?? {}
    };
  }

  /**
   * Tests the connection with a minimal prompt using requestUrl to bypass CORS in Obsidian desktop.
   */
  public async testConnection(): Promise<{ success: boolean; message: string; model?: string }> {
    try {
      const url = this.normalizeUrl(this.options.endpointUrl);
      const headers = this.buildHeaders();
      const payload = this.buildPayload([{ role: 'user', content: 'Respond with OK.' }], [], 5);

      let res = await requestUrl({
        url,
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        throw: false
      });

      // Auto-healing fallback: if 400 specifically rejects temperature, retry once without it
      if (
        res &&
        this.tryHealTemperatureRejection(res.status, res.text, res.json, payload, 'test ping')
      ) {
        res = await requestUrl({
          url,
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          throw: false
        });
      }

      if (res && res.status === 200) {
        return {
          success: true,
          message: 'Connection successful!',
          model: this.options.model
        };
      }

      const status = res?.status ?? 500;
      const text = res?.text ?? '';
      const json: unknown = res?.json;
      const errorDetail = this.extractErrorMessage(status, text, json);
      this.handleHttpError(status, url, text, errorDetail);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: msg
      };
    }
  }

  /**
   * Sends a chat completion request with resilient retry and rate-limit handling.
   */
  public async chatCompletion(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    config: ChatCompletionRequestConfig = {}
  ): Promise<CompletionResult> {
    const url = this.normalizeUrl(this.options.endpointUrl);
    const maxRetries = this.options.maxRetries ?? 3;
    const payload = this.buildPayload(messages, tools, config.maxTokens, config.stream === true);
    const headers = this.buildHeaders();
    const startTime = Date.now();
    let attempt = 0;

    while (attempt <= maxRetries) {
      if (config.signal?.aborted) {
        throw new Error(AGENT_ABORT_ERROR_MESSAGE);
      }

      let hasEmittedChunk = false;
      const wrappedCallbacks: StreamCallbacks = {
        onChunk: delta => {
          hasEmittedChunk = true;
          config.callbacks?.onChunk?.(delta);
        },
        onReasoningDelta: delta => {
          hasEmittedChunk = true;
          config.callbacks?.onReasoningDelta?.(delta);
        },
        onToolCallDelta: toolCalls => {
          hasEmittedChunk = true;
          config.callbacks?.onToolCallDelta?.(toolCalls);
        },
        onRetry: config.callbacks?.onRetry
      };

      try {
        const res = await this.executeHttp(url, headers, payload, {
          signal: config.signal,
          callbacks: wrappedCallbacks,
          hasEmitted: () => hasEmittedChunk
        });

        // 1. Success (200)
        if (res.status === 200) {
          if (config.signal?.aborted) {
            throw new Error(AGENT_ABORT_ERROR_MESSAGE);
          }
          const durationMs = Date.now() - startTime;
          if (res.streamResult) {
            return {
              content: res.streamResult.content,
              toolCalls: res.streamResult.toolCalls,
              durationMs,
              finishReason: res.streamResult.finishReason,
              ...(res.streamResult.tokenUsage ? { tokenUsage: res.streamResult.tokenUsage } : {})
            };
          }

          const json = (res.json ?? (res.text ? JSON.parse(res.text) : {})) as Record<
            string,
            unknown
          >;
          const result = this.parseStandardResponse(json, durationMs);
          if (config.callbacks?.onChunk && result.content) {
            config.callbacks.onChunk(result.content);
          }
          if (config.callbacks?.onToolCallDelta && result.toolCalls.length > 0) {
            config.callbacks.onToolCallDelta(result.toolCalls);
          }
          return result;
        }

        // 2. Retryable errors: 429 (Rate Limit) or 5xx (Server Error)
        const isRetryable = res.status === 429 || (res.status >= 500 && res.status <= 599);
        if (isRetryable && attempt < maxRetries) {
          const retryAfterMs = this.parseRetryAfter(res.headers);
          const backoffMs = this.calculateBackoff(attempt, retryAfterMs);
          const reason = res.status === 429 ? 'Rate limited (429)' : `Server error (${res.status})`;

          this.logger?.warn(`API retry ${attempt + 1}/${maxRetries}: ${reason}`, {
            status: res.status,
            backoffMs,
            url
          });

          config.callbacks?.onRetry?.(attempt + 1, maxRetries, backoffMs, reason);
          attempt++;
          await this.delay(backoffMs, config.signal);
          continue;
        }

        // 3. Auto-healing fallback: if 400 specifically rejects temperature, retry once without it
        if (
          this.tryHealTemperatureRejection(
            res.status,
            res.text,
            res.json,
            payload,
            'chat completion'
          )
        ) {
          continue;
        }

        // 4. Non-retryable error
        const errorDetail = this.extractErrorMessage(res.status, res.text, res.json);
        this.handleHttpError(res.status, url, res.text, errorDetail);
      } catch (err) {
        if (config.signal?.aborted || err instanceof AgentApiError || hasEmittedChunk) {
          throw err;
        }

        const isNetworkOrTimeout =
          err instanceof TypeError ||
          (err instanceof Error &&
            (err.name === 'AbortError' || err.message.includes('timed out')));

        if (isNetworkOrTimeout && attempt < maxRetries) {
          const backoffMs = this.calculateBackoff(attempt, null);
          const reason = `Network/timeout failure: ${err instanceof Error ? err.message : String(err)}`;

          this.logger?.warn(`API retry ${attempt + 1}/${maxRetries}: ${reason}`, {
            backoffMs,
            url
          });
          config.callbacks?.onRetry?.(attempt + 1, maxRetries, backoffMs, reason);
          attempt++;
          await this.delay(backoffMs, config.signal);
          continue;
        }

        this.logger?.error('Agent API Request Failed', err as Error, {
          url,
          model: this.options.model,
          attempt
        });
        throw err;
      }
    }

    throw new Error(`Request failed after ${maxRetries} retry attempts.`);
  }

  private parseStandardResponse(
    json: Record<string, unknown>,
    durationMs: number
  ): CompletionResult {
    const choices = json.choices as {
      message?: { content?: string; tool_calls?: ChatToolCall[] };
    }[];
    const choice = choices?.[0];
    const message = choice?.message;
    const content = message?.content || '';
    const toolCalls = message?.tool_calls || [];
    const usage = json.usage as
      { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

    return {
      content,
      toolCalls,
      durationMs,
      tokenUsage: usage
        ? {
            prompt: usage.prompt_tokens,
            completion: usage.completion_tokens,
            total: usage.total_tokens
          }
        : undefined
    };
  }
}
