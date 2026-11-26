/**
 * @file StreamingTransport.ts
 * @brief Cross-platform ReadableStream SSE reader with unified SSE parser and tool-call assembly.
 *
 * @license See LICENSE.md
 */

import type { ChatCompletionChunk, ChatToolCall } from '../../../types';
import type {
  CompletionFinishReason,
  StreamCallbacks
} from '../../../domain/contracts/IAgentClient';
import { NormalizedAgentError } from '../../../domain/AgentError';
import type { ManagedSseUsageEvent } from '../protocol/managedTypes';
import { type FetchLike, defaultFetch, mapGatewayError } from './managedHttp';

export interface ParsedSseStreamResult {
  content: string;
  toolCalls: ChatToolCall[];
  finishReason: CompletionFinishReason;
  usageEvent?: ManagedSseUsageEvent;
}

export interface StreamChatCompletionsParams {
  url: string;
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
  callbacks?: StreamCallbacks;
}

export interface IStreamingTransport {
  streamChatCompletions(params: StreamChatCompletionsParams): Promise<ParsedSseStreamResult>;
}

interface ToolCallAccumulator {
  id: string;
  name: string;
  arguments: string;
}

function mapFinishReason(raw: string | null | undefined): CompletionFinishReason {
  if (raw === 'stop' || raw === 'tool_calls' || raw === 'length' || raw === 'content_filter') {
    return raw;
  }
  return 'unknown';
}

/**
 * Single stateful SSE parser shared across streaming ReadableStream and buffered text paths,
 * ensuring identical delta assembly, fcr:usage extraction, and fcr:error propagation.
 */
class SseChunkParser {
  private readonly callbacks?: StreamCallbacks;
  private lineBuffer = '';
  private currentEventType = 'message';
  private dataLines: string[] = [];
  private content = '';
  private readonly toolMap = new Map<number, ToolCallAccumulator>();
  private finishReason: CompletionFinishReason = 'unknown';
  private usageEvent?: ManagedSseUsageEvent;

  constructor(callbacks?: StreamCallbacks) {
    this.callbacks = callbacks;
  }

  public feed(text: string): void {
    this.lineBuffer += text;
    const lines = this.lineBuffer.split(/\r?\n/);
    this.lineBuffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      if (rawLine === '') {
        this.flushEventBlock();
        continue;
      }
      if (rawLine.startsWith(':')) {
        continue;
      }
      if (rawLine.startsWith('event:')) {
        this.currentEventType = rawLine.slice(6).trim();
        continue;
      }
      if (rawLine.startsWith('data:')) {
        this.dataLines.push(rawLine.slice(5).trimStart());
      }
    }
  }

  public flush(): void {
    if (this.lineBuffer.trim().length > 0) {
      this.feed('\n');
    }
    this.flushEventBlock();
  }

  public getResult(): ParsedSseStreamResult {
    return {
      content: this.content,
      toolCalls: this.materializeToolCalls(),
      finishReason: this.finishReason,
      usageEvent: this.usageEvent
    };
  }

  private flushEventBlock(): void {
    if (this.dataLines.length === 0) {
      this.currentEventType = 'message';
      return;
    }

    const dataStr = this.dataLines.join('\n').trim();
    this.dataLines = [];
    const eventName = this.currentEventType;
    this.currentEventType = 'message';

    if (!dataStr || dataStr === '[DONE]') {
      return;
    }

    if (eventName === 'fcr:usage') {
      try {
        this.usageEvent = JSON.parse(dataStr) as ManagedSseUsageEvent;
      } catch {
        // Ignore malformed telemetry frame
      }
      return;
    }

    if (eventName === 'fcr:error') {
      throw mapGatewayError(502, dataStr);
    }

    let chunk: ChatCompletionChunk;
    try {
      chunk = JSON.parse(dataStr) as ChatCompletionChunk;
    } catch {
      return;
    }

    const choice = chunk.choices?.[0];
    if (!choice) return;

    if (choice.finish_reason) {
      this.finishReason = mapFinishReason(choice.finish_reason);
    }

    const delta = choice.delta;
    if (!delta) return;

    if (typeof delta.content === 'string' && delta.content.length > 0) {
      this.content += delta.content;
      this.callbacks?.onChunk?.(delta.content);
    }

    if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
      for (let i = 0; i < delta.tool_calls.length; i++) {
        const tc = delta.tool_calls[i];
        const idx = typeof tc.index === 'number' ? tc.index : i;
        const existing = this.toolMap.get(idx) ?? {
          id: tc.id || `call_${idx}`,
          name: '',
          arguments: ''
        };
        if (tc.id) existing.id = tc.id;
        if (tc.function?.name) existing.name += tc.function.name;
        if (tc.function?.arguments) existing.arguments += tc.function.arguments;
        this.toolMap.set(idx, existing);
      }

      this.callbacks?.onToolCallDelta?.(this.materializeToolCalls());
    }
  }

  private materializeToolCalls(): ChatToolCall[] {
    return Array.from(this.toolMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([, tc]) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: tc.arguments
        }
      }));
  }
}

export class StreamingTransport implements IStreamingTransport {
  private readonly fetchFn: FetchLike;

  constructor(fetchFn: FetchLike = defaultFetch) {
    this.fetchFn = fetchFn;
  }

  public async streamChatCompletions(
    params: StreamChatCompletionsParams
  ): Promise<ParsedSseStreamResult> {
    let response: Response;
    try {
      response = await this.fetchFn(params.url, {
        method: 'POST',
        headers: params.headers,
        body: params.body,
        signal: params.signal
      });
    } catch (err) {
      if (params.signal?.aborted) {
        throw new NormalizedAgentError({
          code: 'cancelled',
          message: 'Agent request was cancelled by user.'
        });
      }
      throw new NormalizedAgentError({
        code: 'provider_unavailable',
        retryable: true,
        message: err instanceof Error ? err.message : 'Network error reaching gateway.'
      });
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw mapGatewayError(response.status, errorText, response.headers?.get?.('retry-after'));
    }

    const parser = new SseChunkParser(params.callbacks);

    if (!response.body || typeof response.body.getReader !== 'function') {
      const fallbackText = await response.text().catch(() => '');
      parser.feed(fallbackText);
      parser.flush();
      return parser.getResult();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    try {
      while (true) {
        if (params.signal?.aborted) {
          throw new NormalizedAgentError({
            code: 'cancelled',
            message: 'Agent request was cancelled by user.'
          });
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
    } catch (err) {
      await reader.cancel().catch(() => undefined);
      if (params.signal?.aborted) {
        throw new NormalizedAgentError({
          code: 'cancelled',
          message: 'Agent request was cancelled by user.'
        });
      }
      throw err;
    }

    return parser.getResult();
  }
}
