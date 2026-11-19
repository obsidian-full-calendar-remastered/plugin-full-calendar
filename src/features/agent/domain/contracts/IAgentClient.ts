/**
 * @file IAgentClient.ts
 * @brief Neutral domain contract for LLM/AI generation transports (BYOK and Managed).
 *
 * @license See LICENSE.md
 */

import type { ChatMessage, ChatToolCall, ToolDefinition } from '../../types';
import type { ManagedUsageMetadata, TokenUsage } from '../Usage';

export type CompletionFinishReason =
  'stop' | 'tool_calls' | 'length' | 'content_filter' | 'cancelled' | 'unknown';

export interface StreamCallbacks {
  onChunk?: (contentDelta: string) => void;
  onToolCallDelta?: (toolCalls: ChatToolCall[]) => void;
  onRetry?: (attempt: number, maxRetries: number, delayMs: number, reason: string) => void;
}

export interface ChatCompletionRequestConfig {
  stream?: boolean;
  maxTokens?: number;
  signal?: AbortSignal;
  /**
   * Caller-generated UUID per generation attempt.
   * Managed transport binds this key to the canonical body hash for idempotency.
   * BYOK transport safely ignores it.
   */
  idempotencyKey?: string;
  callbacks?: StreamCallbacks;
}

export interface CompletionResult {
  content: string;
  toolCalls: ChatToolCall[];
  durationMs: number;
  finishReason?: CompletionFinishReason;
  requestId?: string;
  idempotencyKey?: string;
  tokenUsage?: TokenUsage;
  managedUsage?: ManagedUsageMetadata;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  model?: string;
}

/**
 * Abstract gateway contract consumed by AgentEngine.
 * Both BYOK (AgentClient) and Managed (ManagedAgentClient) implement this interface.
 */
export interface IAgentClient {
  chatCompletion(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    config?: ChatCompletionRequestConfig
  ): Promise<CompletionResult>;

  testConnection?(): Promise<ConnectionTestResult>;
}
