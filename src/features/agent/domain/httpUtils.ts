/**
 * @file httpUtils.ts
 * @brief Neutral domain helpers shared by BYOK and Managed AI transports.
 *
 * @license See LICENSE.md
 */

import type { ChatMessage } from '../types';

/**
 * Strips internal plugin-only metadata (timestamps, UI IDs) before sending chat
 * messages to any OpenAI-compatible or Managed AI endpoint.
 */
export function sanitizeChatMessages(messages: ChatMessage[]): Record<string, unknown>[] {
  return messages.map(msg => {
    const clean: Record<string, unknown> = {
      role: msg.role,
      content: msg.content
    };
    if (msg.name) clean.name = msg.name;
    if (msg.tool_call_id) clean.tool_call_id = msg.tool_call_id;
    if (msg.tool_calls && msg.tool_calls.length > 0) clean.tool_calls = msg.tool_calls;
    return clean;
  });
}

/**
 * Parses an HTTP Retry-After header (delta-seconds or HTTP-date) into milliseconds.
 */
export function parseRetryAfterHeaderMs(headerVal: string | null | undefined): number | undefined {
  if (!headerVal) return undefined;
  const seconds = Number(headerVal);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1000);
  }
  const dateMs = Date.parse(headerVal);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return undefined;
}
