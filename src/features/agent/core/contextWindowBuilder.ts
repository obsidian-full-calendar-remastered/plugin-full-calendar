/**
 * @file contextWindowBuilder.ts
 * @brief Prefix-cache-preserving wire message builder with structural tool compaction and block-eviction sliding window.
 *
 * @license See LICENSE.md
 */

import type { ChatMessage, CurrentTimeInfo } from '../types';

export interface ContextWindowOptions {
  maxMessages?: number;
  maxTotalChars?: number;
}

const DEFAULT_MAX_MESSAGES = 80;
const DEFAULT_MAX_TOTAL_CHARS = 22_000;
const MAX_COMPACTED_EVENTS = 25;
const COMPACT_STUB_PREFIX_CHARS = 400;
const BROWSE_COMPACT_THRESHOLD_CHARS = 1_200;
const GENERIC_COMPACT_THRESHOLD_CHARS = 600;

const STRUCTURED_CALENDAR_TOOLS = new Set([
  'get_events',
  'get_event_by_id',
  'get_calendar_sources',
  'get_user_categories',
  'get_current_time',
  'propose_create_event',
  'propose_update_event',
  'propose_delete_event',
  'propose_batch_create_events'
]);

export function formatUserMessageWithTimeContext(
  msg: ChatMessage,
  getCurrentTime: (atMs?: number) => CurrentTimeInfo
): ChatMessage {
  if (
    msg.role !== 'user' ||
    typeof msg.content !== 'string' ||
    typeof msg.timestamp !== 'number' ||
    !Number.isFinite(msg.timestamp) ||
    msg.content.includes('[Current Local Time:')
  ) {
    return { ...msg };
  }

  const t = getCurrentTime(msg.timestamp);
  return {
    ...msg,
    content: `${msg.content}\n\n[Current Local Time: ${t.currentDate} ${t.currentTime24h} (${t.dayOfWeek}, ${t.displayTimezone})]`
  };
}

function compactGetEventsJson(rawContent: string): string | null {
  try {
    const parsed = JSON.parse(rawContent) as {
      count?: unknown;
      events?: Record<string, unknown>[];
    };
    if (!parsed || !Array.isArray(parsed.events)) {
      return null;
    }

    const projected = parsed.events.slice(0, MAX_COMPACTED_EVENTS).map(ev => {
      const compact: Record<string, unknown> = {
        id: ev.id,
        calendarId: ev.calendarId,
        title: ev.title,
        date: ev.date,
        allDay: ev.allDay
      };
      if (ev.startTime !== undefined) compact.startTime = ev.startTime;
      if (ev.endTime !== undefined) compact.endTime = ev.endTime;
      return compact;
    });

    const out = JSON.stringify({
      count: typeof parsed.count === 'number' ? parsed.count : parsed.events.length,
      compacted: true,
      events: projected
    });
    return out.length < rawContent.length ? out : rawContent;
  } catch {
    return null;
  }
}

export function compactToolMessageContent(
  msg: ChatMessage,
  toolName: string | undefined,
  turnsAgo: number
): ChatMessage {
  if (msg.role !== 'tool' || typeof msg.content !== 'string' || turnsAgo <= 0) {
    return { ...msg };
  }

  const content = msg.content;
  if (turnsAgo === 1) {
    if (toolName && STRUCTURED_CALENDAR_TOOLS.has(toolName)) {
      return { ...msg };
    }
    if (content.length <= BROWSE_COMPACT_THRESHOLD_CHARS) {
      return { ...msg };
    }
    return {
      ...msg,
      content: `[Compacted ${toolName ?? 'tool'} output (${content.length} chars): ${content.slice(0, COMPACT_STUB_PREFIX_CHARS)}...]`
    };
  }

  if (toolName === 'get_events') {
    const compactedEvents = compactGetEventsJson(content);
    if (compactedEvents !== null) {
      return { ...msg, content: compactedEvents };
    }
  }

  if (content.length <= GENERIC_COMPACT_THRESHOLD_CHARS) {
    return { ...msg };
  }

  return {
    ...msg,
    content: `[Compacted ${toolName ?? 'tool'} output (${content.length} chars): ${content.slice(0, COMPACT_STUB_PREFIX_CHARS)}...]`
  };
}

function sanitizeTurnGroup(msgs: ChatMessage[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  let i = 0;

  while (i < msgs.length) {
    const m = msgs[i];
    if (m.role === 'tool') {
      // Orphan tool result without preceding assistant tool_calls
      i++;
      continue;
    }

    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      const expectedIds = new Set(m.tool_calls.map(tc => tc.id));
      const seenToolIds = new Set<string>();
      const matchedTools: ChatMessage[] = [];
      let j = i + 1;
      while (j < msgs.length && msgs[j].role === 'tool') {
        const tm = msgs[j];
        if (
          tm.tool_call_id &&
          expectedIds.has(tm.tool_call_id) &&
          !seenToolIds.has(tm.tool_call_id)
        ) {
          seenToolIds.add(tm.tool_call_id);
          matchedTools.push(tm);
        }
        j++;
      }

      if (matchedTools.length === expectedIds.size) {
        result.push(m, ...matchedTools);
      } else if (typeof m.content === 'string' && m.content.trim().length > 0) {
        // Drop incomplete tool_calls but preserve assistant prose
        result.push({ ...m, tool_calls: undefined });
      }
      i = j;
      continue;
    }

    if (
      m.role === 'assistant' &&
      (typeof m.content !== 'string' || m.content.trim().length === 0)
    ) {
      i++;
      continue;
    }

    result.push(m);
    i++;
  }

  return result;
}

function measureGroups(groups: ChatMessage[][]): { totalMessages: number; totalChars: number } {
  let totalMessages = 0;
  let totalChars = 0;
  for (const group of groups) {
    totalMessages += group.length;
    for (const msg of group) {
      totalChars +=
        (msg.content?.length ?? 0) + (msg.tool_calls ? JSON.stringify(msg.tool_calls).length : 0);
    }
  }
  return { totalMessages, totalChars };
}

/**
 * Builds wire-ready chat messages (excluding the leading system message) with:
 * - Immutable per-user-message local time context (preserves prefix cache)
 * - Turn-aware tool compaction keeping recent and structured event IDs intact
 * - Atomic 25% block eviction to stay under context/message limits while keeping cache prefix stable
 */
export function buildContextWindowMessages(
  messages: ChatMessage[],
  bridge: { getCurrentTime: (atMs?: number) => CurrentTimeInfo },
  options: ContextWindowOptions = {}
): ChatMessage[] {
  const maxMessages = options.maxMessages ?? DEFAULT_MAX_MESSAGES;
  const maxTotalChars = options.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS;

  const toolNameByCallId = new Map<string, string>();
  for (const m of messages) {
    if (m.role === 'assistant' && m.tool_calls) {
      for (const tc of m.tool_calls) {
        if (tc.id && tc.function?.name) {
          toolNameByCallId.set(tc.id, tc.function.name);
        }
      }
    }
  }

  const rawGroups: ChatMessage[][] = [];
  let currentGroup: ChatMessage[] | null = null;
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    if (msg.role === 'user') {
      currentGroup = [msg];
      rawGroups.push(currentGroup);
    } else if (currentGroup) {
      currentGroup.push(msg);
    }
  }

  const totalGroups = rawGroups.length;
  const transformedGroups = rawGroups
    .map((group, idx) => {
      const turnsAgo = totalGroups - 1 - idx;
      const mapped = group.map(msg => {
        if (msg.role === 'user') {
          return formatUserMessageWithTimeContext(msg, atMs => bridge.getCurrentTime(atMs));
        }
        if (msg.role === 'tool') {
          const toolName =
            msg.name ?? (msg.tool_call_id ? toolNameByCallId.get(msg.tool_call_id) : undefined);
          return compactToolMessageContent(msg, toolName, turnsAgo);
        }
        return { ...msg };
      });
      return sanitizeTurnGroup(mapped);
    })
    .filter(g => g.length > 0);

  while (transformedGroups.length > 1) {
    const { totalMessages, totalChars } = measureGroups(transformedGroups);
    if (totalMessages <= maxMessages && totalChars <= maxTotalChars) {
      break;
    }
    const evictCount = Math.min(
      transformedGroups.length - 1,
      Math.max(1, Math.ceil(transformedGroups.length * 0.25))
    );
    transformedGroups.splice(0, evictCount);
  }

  if (
    transformedGroups.length === 1 &&
    measureGroups(transformedGroups).totalChars > maxTotalChars
  ) {
    const singleGroup = transformedGroups[0];
    let lastToolIdx = -1;
    for (let i = singleGroup.length - 1; i >= 0; i--) {
      if (singleGroup[i].role === 'tool') {
        lastToolIdx = i;
        break;
      }
    }
    if (lastToolIdx > 0) {
      transformedGroups[0] = singleGroup.map((msg, idx) => {
        if (msg.role !== 'tool' || idx === lastToolIdx) {
          return msg;
        }
        const toolName =
          msg.name ?? (msg.tool_call_id ? toolNameByCallId.get(msg.tool_call_id) : undefined);
        return compactToolMessageContent(msg, toolName, 2);
      });
    }
  }

  return transformedGroups.flat();
}
