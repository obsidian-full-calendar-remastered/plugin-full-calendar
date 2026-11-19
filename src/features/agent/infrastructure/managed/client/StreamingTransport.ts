/**
 * @file StreamingTransport.ts
 * @brief Cross-platform ReadableStream SSE reader with UTF-8 boundary buffering and tool-call assembly.
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

export class StreamingTransport {
  private readonly fetchFn: FetchLike;

  constructor(fetchFn: FetchLike = defaultFetch) {
    this.fetchFn = fetchFn;
  }

  public async streamChatCompletions(params: {
    url: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
    callbacks?: StreamCallbacks;
  }): Promise<ParsedSseStreamResult> {
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

    if (!response.body || typeof response.body.getReader !== 'function') {
      const fallbackText = await response.text().catch(() => '');
      return this.parseBufferedSse(fallbackText, params.callbacks);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let lineBuffer = '';
    let currentEventType = 'message';
    let dataLines: string[] = [];

    const state: {
      content: string;
      toolMap: Map<number, ToolCallAccumulator>;
      finishReason: CompletionFinishReason;
      usageEvent?: ManagedSseUsageEvent;
    } = {
      content: '',
      toolMap: new Map(),
      finishReason: 'unknown'
    };

    const flushEventBlock = () => {
      if (dataLines.length === 0) {
        currentEventType = 'message';
        return;
      }
      const dataStr = dataLines.join('\n').trim();
      dataLines = [];
      const eventName = currentEventType;
      currentEventType = 'message';

      if (!dataStr || dataStr === '[DONE]') {
        return;
      }

      if (eventName === 'fcr:usage') {
        try {
          state.usageEvent = JSON.parse(dataStr) as ManagedSseUsageEvent;
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
        state.finishReason = mapFinishReason(choice.finish_reason);
      }

      const delta = choice.delta;
      if (!delta) return;

      if (typeof delta.content === 'string' && delta.content.length > 0) {
        state.content += delta.content;
        params.callbacks?.onChunk?.(delta.content);
      }

      if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
        for (const tc of delta.tool_calls) {
          const existing = state.toolMap.get(tc.index) ?? {
            id: tc.id || `call_${tc.index}`,
            name: '',
            arguments: ''
          };
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name += tc.function.name;
          if (tc.function?.arguments) existing.arguments += tc.function.arguments;
          state.toolMap.set(tc.index, existing);
        }

        const currentTools = this.materializeToolCalls(state.toolMap);
        params.callbacks?.onToolCallDelta?.(currentTools);
      }
    };

    const processDecodedText = (decoded: string) => {
      lineBuffer += decoded;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        if (rawLine === '') {
          flushEventBlock();
          continue;
        }
        if (rawLine.startsWith(':')) {
          continue;
        }
        if (rawLine.startsWith('event:')) {
          currentEventType = rawLine.slice(6).trim();
          continue;
        }
        if (rawLine.startsWith('data:')) {
          dataLines.push(rawLine.slice(5).trimStart());
        }
      }
    };

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
          processDecodedText(decoder.decode(value, { stream: true }));
        }
      }

      const tail = decoder.decode();
      if (tail) {
        processDecodedText(tail);
      }
      if (lineBuffer.trim().length > 0) {
        processDecodedText('\n');
      }
      flushEventBlock();
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

    return {
      content: state.content,
      toolCalls: this.materializeToolCalls(state.toolMap),
      finishReason: state.finishReason,
      usageEvent: state.usageEvent
    };
  }

  private parseBufferedSse(text: string, callbacks?: StreamCallbacks): ParsedSseStreamResult {
    let content = '';
    const toolMap = new Map<number, ToolCallAccumulator>();
    let finishReason: CompletionFinishReason = 'unknown';
    let usageEvent: ManagedSseUsageEvent | undefined;
    let currentEvent = 'message';

    for (const line of text.split(/\r?\n/)) {
      if (line === '') {
        currentEvent = 'message';
        continue;
      }
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim();
        continue;
      }
      if (!line.startsWith('data:')) continue;
      const dataStr = line.slice(5).trim();
      if (!dataStr || dataStr === '[DONE]') continue;

      if (currentEvent === 'fcr:usage') {
        try {
          usageEvent = JSON.parse(dataStr) as ManagedSseUsageEvent;
        } catch {
          // ignore
        }
        continue;
      }

      try {
        const chunk = JSON.parse(dataStr) as ChatCompletionChunk;
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        if (choice.finish_reason) finishReason = mapFinishReason(choice.finish_reason);
        if (choice.delta?.content) {
          content += choice.delta.content;
          callbacks?.onChunk?.(choice.delta.content);
        }
        if (choice.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            const acc = toolMap.get(tc.index) ?? {
              id: tc.id || `call_${tc.index}`,
              name: '',
              arguments: ''
            };
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name += tc.function.name;
            if (tc.function?.arguments) acc.arguments += tc.function.arguments;
            toolMap.set(tc.index, acc);
          }
          callbacks?.onToolCallDelta?.(this.materializeToolCalls(toolMap));
        }
      } catch {
        // ignore
      }
    }

    return {
      content,
      toolCalls: this.materializeToolCalls(toolMap),
      finishReason,
      usageEvent
    };
  }

  private materializeToolCalls(map: Map<number, ToolCallAccumulator>): ChatToolCall[] {
    return Array.from(map.entries())
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
