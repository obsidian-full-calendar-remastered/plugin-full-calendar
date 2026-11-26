/**
 * @file TokenEstimator.ts
 * @brief Lightweight non-binding client-side estimator for pre-flight UI warnings.
 *
 * @description
 * Used strictly for user-facing budget warnings (e.g., before sending a large request).
 * The Cloudflare Durable Object independently calculates and enforces server admission.
 *
 * @license See LICENSE.md
 */

import type { ChatMessage, ToolDefinition } from '../../../types';
import { computeWeightedMicrocredits, microcreditsToWtc } from '../../../domain/Usage';
import { encodeUtf8Bytes } from '../../../domain/crypto/sha256';

export interface PreFlightEstimate {
  estimatedInputTokens: number;
  maxOutputTokens: number;
  worstCaseMicrocredits: number;
  worstCaseWtc: number;
}

export class TokenEstimator {
  public estimateInputTokens(messages: ChatMessage[], tools: ToolDefinition[]): number {
    const payloadString = JSON.stringify({ messages, tools });
    const bytes = encodeUtf8Bytes(payloadString).byteLength;
    return Math.ceil(bytes / 2.2) + messages.length * 4 + 64;
  }

  public estimateWorstCaseWtc(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    maxOutputTokens = 1024
  ): PreFlightEstimate {
    const estimatedInputTokens = this.estimateInputTokens(messages, tools);
    const rawWorstMicrocredits = computeWeightedMicrocredits(
      estimatedInputTokens,
      0,
      maxOutputTokens
    );
    const worstCaseMicrocredits = Math.ceil(rawWorstMicrocredits * 1.1);
    return {
      estimatedInputTokens,
      maxOutputTokens,
      worstCaseMicrocredits,
      worstCaseWtc: microcreditsToWtc(worstCaseMicrocredits)
    };
  }
}
