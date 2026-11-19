/**
 * @file FakeAgentClient.ts
 * @brief Deterministic in-process IAgentClient test double for UI, engine, and edge-case testing.
 *
 * @license See LICENSE.md
 */

import type { ChatMessage, ChatToolCall, ToolDefinition } from '../types';
import { NormalizedAgentError } from '../domain/AgentError';
import type {
  ChatCompletionRequestConfig,
  CompletionFinishReason,
  CompletionResult,
  ConnectionTestResult,
  IAgentClient
} from '../domain/contracts/IAgentClient';
import type { ManagedUsageMetadata, TokenUsage } from '../domain/Usage';

export interface FakeCompletionTurn {
  chunks?: string[];
  chunkDelayMs?: number;
  toolCalls?: ChatToolCall[];
  finishReason?: CompletionFinishReason;
  tokenUsage?: TokenUsage;
  managedUsage?: ManagedUsageMetadata;
  /** Optional normalized error thrown either immediately or after streaming `failAfterChunkIndex` chunks. */
  error?: NormalizedAgentError;
  failAfterChunkIndex?: number;
}

interface RecordedIdempotencyEntry {
  bodyFingerprint: string;
  result: CompletionResult;
}

/**
 * Exercises normal streaming, fragmented chunks, tool-call deltas, cancellation,
 * active-generation conflicts, idempotency replay/conflict, and partial-stream failures.
 */
export class FakeAgentClient implements IAgentClient {
  private readonly queue: FakeCompletionTurn[];
  private readonly idempotencyStore = new Map<string, RecordedIdempotencyEntry>();
  private activeGeneration = false;
  public readonly recordedRequests: {
    messages: ChatMessage[];
    tools: ToolDefinition[];
    idempotencyKey?: string;
  }[] = [];

  constructor(turns: FakeCompletionTurn[] = []) {
    this.queue = [...turns];
  }

  public enqueue(turn: FakeCompletionTurn): void {
    this.queue.push(turn);
  }

  public async testConnection(): Promise<ConnectionTestResult> {
    return { success: true, message: 'Fake connection ok', model: 'fake-model' };
  }

  public async chatCompletion(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    config: ChatCompletionRequestConfig = {}
  ): Promise<CompletionResult> {
    const startTime = Date.now();
    const fingerprint = JSON.stringify({ messages, tools });

    if (config.idempotencyKey) {
      const existing = this.idempotencyStore.get(config.idempotencyKey);
      if (existing) {
        if (existing.bodyFingerprint !== fingerprint) {
          throw new NormalizedAgentError({
            code: 'idempotency_conflict',
            status: 409,
            message: 'Idempotency key reused with a different request payload.'
          });
        }
        return existing.result;
      }
    }

    if (this.activeGeneration) {
      throw new NormalizedAgentError({
        code: 'generation_in_progress',
        status: 409,
        message: 'Another generation is already in progress for this principal.'
      });
    }

    this.activeGeneration = true;
    this.recordedRequests.push({
      messages: [...messages],
      tools: [...tools],
      idempotencyKey: config.idempotencyKey
    });

    try {
      const turn = this.queue.shift() ?? { chunks: ['OK'], finishReason: 'stop' };

      if (turn.error && turn.failAfterChunkIndex === undefined) {
        throw turn.error;
      }

      const chunks = turn.chunks ?? [];
      let content = '';

      for (let i = 0; i < chunks.length; i++) {
        if (config.signal?.aborted) {
          throw new NormalizedAgentError({
            code: 'cancelled',
            message: 'Agent request was cancelled by user.'
          });
        }

        if (turn.chunkDelayMs && turn.chunkDelayMs > 0) {
          await new Promise<void>(resolve => window.setTimeout(resolve, turn.chunkDelayMs));
        }

        const chunk = chunks[i];
        content += chunk;
        config.callbacks?.onChunk?.(chunk);

        if (turn.error && turn.failAfterChunkIndex === i) {
          throw turn.error;
        }
      }

      if (turn.toolCalls && turn.toolCalls.length > 0) {
        config.callbacks?.onToolCallDelta?.(turn.toolCalls);
      }

      const result: CompletionResult = {
        content,
        toolCalls: turn.toolCalls ?? [],
        durationMs: Date.now() - startTime,
        finishReason: turn.finishReason ?? (turn.toolCalls?.length ? 'tool_calls' : 'stop'),
        requestId: `fake_req_${this.recordedRequests.length}`,
        idempotencyKey: config.idempotencyKey,
        tokenUsage: turn.tokenUsage,
        managedUsage: turn.managedUsage
      };

      if (config.idempotencyKey) {
        this.idempotencyStore.set(config.idempotencyKey, {
          bodyFingerprint: fingerprint,
          result
        });
      }

      return result;
    } finally {
      this.activeGeneration = false;
    }
  }
}
