/**
 * @file sseParser.ts
 * @brief Pure domain Server-Sent Events (SSE) parser for OpenAI-compatible chat streams.
 *
 * @license See LICENSE.md
 */

import type { ChatCompletionChunk, ChatToolCall } from '../types';
import type { TokenUsage } from './Usage';
import type { CompletionFinishReason, StreamCallbacks } from './contracts/IAgentClient';

export interface ParsedSseResult {
  content: string;
  toolCalls: ChatToolCall[];
  finishReason: CompletionFinishReason;
  tokenUsage?: TokenUsage;
}

export interface SseChunkParserOptions {
  callbacks?: StreamCallbacks;
  onCustomEvent?: (eventName: string, data: string) => void;
}

interface ToolCallAccumulator {
  id: string;
  hasExplicitId: boolean;
  name: string;
  arguments: string;
}

interface RawSseChunk extends Partial<ChatCompletionChunk> {
  error?: string | { message?: string };
}

function mapFinishReason(raw: string | null | undefined): CompletionFinishReason {
  if (raw === 'stop' || raw === 'tool_calls' || raw === 'length' || raw === 'content_filter') {
    return raw;
  }
  return 'unknown';
}

function extractInStreamError(chunk: RawSseChunk): string | null {
  if (!chunk.error) {
    return null;
  }
  if (typeof chunk.error === 'string') {
    return chunk.error;
  }
  if (typeof chunk.error === 'object' && typeof chunk.error.message === 'string') {
    return chunk.error.message;
  }
  return JSON.stringify(chunk.error);
}

/**
 * Stateful SSE parser supporting CRLF/LF chunks, multi-line data frames,
 * trailing usage-only frames, in-stream errors, and local-LLM tool-call assembly.
 */
export class SseChunkParser {
  private readonly callbacks?: StreamCallbacks;
  private readonly onCustomEvent?: (eventName: string, data: string) => void;
  private lineBuffer = '';
  private currentEventType = 'message';
  private dataLines: string[] = [];
  private content = '';
  private readonly toolMap = new Map<number, ToolCallAccumulator>();
  private readonly rawIndexToSlot = new Map<number, number>();
  private nextSlotIndex = 0;
  private finishReason: CompletionFinishReason = 'unknown';
  private tokenUsage?: TokenUsage;

  constructor(options: SseChunkParserOptions = {}) {
    this.callbacks = options.callbacks;
    this.onCustomEvent = options.onCustomEvent;
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

  public getResult(): ParsedSseResult {
    return {
      content: this.content,
      toolCalls: this.materializeToolCalls(),
      finishReason: this.finishReason,
      ...(this.tokenUsage ? { tokenUsage: this.tokenUsage } : {})
    };
  }

  private allocateSlot(): number {
    while (this.toolMap.has(this.nextSlotIndex)) {
      this.nextSlotIndex++;
    }
    return this.nextSlotIndex++;
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

    if (eventName !== 'message' && this.onCustomEvent) {
      this.onCustomEvent(eventName, dataStr);
      return;
    }

    let chunk: RawSseChunk;
    try {
      chunk = JSON.parse(dataStr) as RawSseChunk;
    } catch {
      return;
    }

    const streamError = extractInStreamError(chunk);
    if (streamError) {
      throw new Error(streamError);
    }

    if (chunk.usage) {
      this.tokenUsage = {
        prompt: chunk.usage.prompt_tokens,
        completion: chunk.usage.completion_tokens,
        total: chunk.usage.total_tokens
      };
    }

    const choice = chunk.choices?.[0];
    if (!choice) {
      return;
    }

    if (choice.finish_reason) {
      this.finishReason = mapFinishReason(choice.finish_reason);
    }

    const delta = choice.delta;
    if (!delta) {
      return;
    }

    if (typeof delta.content === 'string' && delta.content.length > 0) {
      this.content += delta.content;
      this.callbacks?.onChunk?.(delta.content);
    }

    if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
      for (let i = 0; i < delta.tool_calls.length; i++) {
        const tc = delta.tool_calls[i];
        const rawIdx = typeof tc.index === 'number' ? tc.index : i;
        let slot = this.rawIndexToSlot.get(rawIdx);
        let existing = slot !== undefined ? this.toolMap.get(slot) : undefined;

        // Local LLMs (e.g. Ollama) sometimes emit multiple tool calls with index: 0 and distinct IDs.
        if (
          existing &&
          existing.hasExplicitId &&
          tc.id &&
          existing.id !== tc.id &&
          (existing.name.length > 0 || existing.arguments.length > 0)
        ) {
          slot = this.allocateSlot();
          this.rawIndexToSlot.set(rawIdx, slot);
          existing = undefined;
        }

        if (slot === undefined) {
          slot = this.toolMap.has(rawIdx) ? this.allocateSlot() : rawIdx;
          this.rawIndexToSlot.set(rawIdx, slot);
        }

        if (!existing) {
          existing = {
            id: tc.id || `call_${slot}`,
            hasExplicitId: Boolean(tc.id),
            name: '',
            arguments: ''
          };
        } else if (tc.id && !existing.hasExplicitId) {
          existing.id = tc.id;
          existing.hasExplicitId = true;
        }

        if (tc.function?.name) {
          existing.name += tc.function.name;
        }
        if (tc.function?.arguments) {
          existing.arguments += tc.function.arguments;
        }
        this.toolMap.set(slot, existing);
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
