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

import type { ChatMessage, ToolDefinition, ChatCompletionChunk, ChatToolCall } from '../types';
import type { AgentAuditLogger } from './AgentAuditLogger';

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

export interface StreamCallbacks {
  onChunk?: (contentDelta: string) => void;
  onToolCallDelta?: (toolCalls: ChatToolCall[]) => void;
  onRetry?: (attempt: number, maxRetries: number, delayMs: number, reason: string) => void;
}

export interface CompletionResult {
  content: string;
  toolCalls: ChatToolCall[];
  durationMs: number;
  tokenUsage?: { prompt: number; completion: number; total: number };
}

export class AgentClient {
  private options: AgentClientOptions;
  private logger?: AgentAuditLogger;

  constructor(options: AgentClientOptions, logger?: AgentAuditLogger) {
    this.options = {
      ...options,
      temperature: options.temperature ?? 0.2,
      maxRetries: options.maxRetries ?? 3,
      timeoutMs: options.timeoutMs ?? 60000
    };
    this.logger = logger;
  }

  public updateOptions(options: Partial<AgentClientOptions>): void {
    this.options = {
      ...this.options,
      ...options
    };
  }

  private normalizeUrl(endpointUrl: string): string {
    let clean = endpointUrl.trim().replace(/\/+$/, '');
    if (!clean.endsWith('/chat/completions')) {
      clean = `${clean}/chat/completions`;
    }
    return clean;
  }

  private parseRetryAfter(response: Response): number | null {
    const header = response.headers.get('Retry-After');
    if (!header) return null;
    const seconds = parseInt(header, 10);
    if (!isNaN(seconds) && seconds > 0) {
      return seconds * 1000;
    }
    const date = Date.parse(header);
    if (!isNaN(date)) {
      const diff = date - Date.now();
      return diff > 0 ? diff : null;
    }
    return null;
  }

  private calculateBackoff(attempt: number, retryAfterMs: number | null): number {
    if (retryAfterMs !== null && retryAfterMs > 0 && retryAfterMs <= 60000) {
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

  /**
   * Tests the connection and credentials with a minimal prompt.
   */
  public async testConnection(): Promise<{ success: boolean; message: string; model?: string }> {
    const testMessages: ChatMessage[] = [{ role: 'user', content: 'Respond with OK.' }];
    try {
      await this.chatCompletion(testMessages, [], {
        maxTokens: 5,
        stream: false
      });
      return {
        success: true,
        message: 'Connection successful!',
        model: this.options.model
      };
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
    config: {
      stream?: boolean;
      maxTokens?: number;
      signal?: AbortSignal;
      callbacks?: StreamCallbacks;
    } = {}
  ): Promise<CompletionResult> {
    const url = this.normalizeUrl(this.options.endpointUrl);
    const maxRetries = this.options.maxRetries ?? 3;
    const stream = config.stream ?? true;
    let attempt = 0;
    const startTime = Date.now();

    while (attempt <= maxRetries) {
      // Create a combined timeout and user abort controller
      const timeoutController = new AbortController();
      const timeoutId = window.setTimeout(() => {
        timeoutController.abort(new Error(`Request timed out after ${this.options.timeoutMs}ms`));
      }, this.options.timeoutMs ?? 60000);

      const onUserAbort = () => {
        timeoutController.abort(new Error('Request aborted by user'));
      };
      if (config.signal) {
        config.signal.addEventListener('abort', onUserAbort, { once: true });
      }

      try {
        const payload: Record<string, unknown> = {
          model: this.options.model,
          messages: messages.map(m => {
            const base: Record<string, unknown> = {
              role: m.role,
              content: m.content
            };
            if (m.name) base.name = m.name;
            if (m.tool_call_id) base.tool_call_id = m.tool_call_id;
            if (m.tool_calls) base.tool_calls = m.tool_calls;
            return base;
          }),
          temperature: this.options.temperature,
          stream
        };

        if (tools && tools.length > 0) {
          payload.tools = tools;
          payload.tool_choice = 'auto';
        }
        if (config.maxTokens) {
          payload.max_tokens = config.maxTokens;
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };
        if (this.options.apiKey && this.options.apiKey.trim().length > 0) {
          headers['Authorization'] = `Bearer ${this.options.apiKey.trim()}`;
        }

        const response = await window.fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: timeoutController.signal
        });

        window.clearTimeout(timeoutId);
        if (config.signal) {
          config.signal.removeEventListener('abort', onUserAbort);
        }

        // ====================================================================
        // HANDLE HTTP STATUS CODES & RETRIES
        // ====================================================================
        if (!response.ok) {
          const status = response.status;
          const bodyText = await response.text().catch(() => '');

          // Non-retryable errors: Auth failure or Bad Request (client error)
          if (status === 401 || status === 403) {
            throw new AgentApiError(
              status,
              url,
              `Authentication failed (${status}). Please verify your API key in settings.`,
              bodyText
            );
          }
          if (status === 400 || status === 404) {
            throw new AgentApiError(
              status,
              url,
              `API Request rejected (${status}): ${bodyText.slice(0, 300)}`,
              bodyText
            );
          }

          // Retryable errors: 429 (Rate Limit) or 5xx (Server Error)
          const isRetryable = status === 429 || (status >= 500 && status <= 599);
          if (isRetryable && attempt < maxRetries) {
            const retryAfterMs = this.parseRetryAfter(response);
            const backoffMs = this.calculateBackoff(attempt, retryAfterMs);
            const reason = status === 429 ? 'Rate limited (429)' : `Server error (${status})`;

            this.logger?.warn(`API retry ${attempt + 1}/${maxRetries}: ${reason}`, {
              status,
              backoffMs,
              url
            });

            config.callbacks?.onRetry?.(attempt + 1, maxRetries, backoffMs, reason);
            attempt++;
            await this.delay(backoffMs, config.signal);
            continue; // Retry loop
          }

          throw new AgentApiError(
            status,
            url,
            `API call failed with status ${status}: ${bodyText.slice(0, 300)}`,
            bodyText
          );
        }

        // ====================================================================
        // PARSE RESPONSE BODY (STREAMING OR JSON)
        // ====================================================================
        if (stream && response.body) {
          return await this.parseStreamResponse(response.body, config.callbacks, startTime);
        }
        const json = (await response.json()) as Record<string, unknown>;
        const durationMs = Date.now() - startTime;
        return this.parseStandardResponse(json, durationMs);
      } catch (err) {
        window.clearTimeout(timeoutId);
        if (config.signal) {
          config.signal.removeEventListener('abort', onUserAbort);
        }

        if (config.signal?.aborted) {
          throw new Error('Agent request was cancelled by user.', { cause: err });
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

  /**
   * Decodes and parses Server-Sent Events (SSE) stream.
   */
  private async parseStreamResponse(
    body: ReadableStream<Uint8Array>,
    callbacks?: StreamCallbacks,
    startTime = Date.now()
  ): Promise<CompletionResult> {
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullContent = '';
    const toolCallAccumulators: Map<number, { id: string; name: string; arguments: string }> =
      new Map();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last incomplete fragment in buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue; // Skip empty lines and SSE comments

          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') {
              continue;
            }

            try {
              const chunk = JSON.parse(dataStr) as ChatCompletionChunk;
              const choice = chunk.choices?.[0];
              if (!choice) continue;

              const delta = choice.delta;
              if (delta.content) {
                fullContent += delta.content;
                callbacks?.onChunk?.(delta.content);
              }

              if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  const existing = toolCallAccumulators.get(idx) || {
                    id: tc.id || `call_${idx}_${Date.now()}`,
                    name: tc.function?.name || '',
                    arguments: ''
                  };
                  if (tc.id) existing.id = tc.id;
                  if (tc.function?.name) existing.name = tc.function.name;
                  if (tc.function?.arguments) existing.arguments += tc.function.arguments;
                  toolCallAccumulators.set(idx, existing);
                }

                // Notify callback of current accumulated tool calls
                const currentToolCalls = Array.from(toolCallAccumulators.values()).map(a => ({
                  id: a.id,
                  type: 'function' as const,
                  function: {
                    name: a.name,
                    arguments: a.arguments
                  }
                }));
                callbacks?.onToolCallDelta?.(currentToolCalls);
              }
            } catch {
              // Ignore partial JSON parsing glitches in stream
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const toolCalls: ChatToolCall[] = Array.from(toolCallAccumulators.values()).map(a => ({
      id: a.id,
      type: 'function',
      function: {
        name: a.name,
        arguments: a.arguments
      }
    }));

    return {
      content: fullContent,
      toolCalls,
      durationMs: Date.now() - startTime
    };
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
