/**
 * @file sseParser.test.ts
 * @brief Unit tests for pure domain SseChunkParser.
 */

import { SseChunkParser } from './sseParser';

describe('SseChunkParser', () => {
  it('assembles split SSE chunks and CRLF framing into incremental content deltas', () => {
    const chunks: string[] = [];
    const parser = new SseChunkParser({
      callbacks: {
        onChunk: delta => chunks.push(delta)
      }
    });

    parser.feed('data: {"choices":[{"delta":{"content":"Hel"},"finish_reason":null}]}\r\n\r\n');
    parser.feed('data: {"choices":[{"delta":{"content":"lo "},"finish_reason":null}]}\n');
    parser.feed('\ndata: {"choices":[{"delta":{"content":"world"},"finish_reason":"stop"}]}\n\n');
    parser.feed('data: [DONE]\n\n');
    parser.flush();

    expect(chunks).toEqual(['Hel', 'lo ', 'world']);
    expect(parser.getResult()).toEqual({
      content: 'Hello world',
      toolCalls: [],
      finishReason: 'stop'
    });
  });

  it('captures token usage from OpenAI trailing usage-only chunks with empty choices', () => {
    const parser = new SseChunkParser();
    parser.feed('data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":"stop"}]}\n\n');
    parser.feed(
      'data: {"choices":[],"usage":{"prompt_tokens":120,"completion_tokens":15,"total_tokens":135}}\n\n'
    );
    parser.feed('data: [DONE]\n\n');
    parser.flush();

    expect(parser.getResult().tokenUsage).toEqual({
      prompt: 120,
      completion: 15,
      total: 135
    });
  });

  it('throws on in-stream JSON error frames', () => {
    const parser = new SseChunkParser();
    expect(() => {
      parser.feed('data: {"error":{"message":"Model context limit exceeded"}}\n\n');
    }).toThrow('Model context limit exceeded');
  });

  it('separates colliding index: 0 tool calls when distinct tool IDs are streamed (local LLM quirk)', () => {
    const deltas: number[] = [];
    const parser = new SseChunkParser({
      callbacks: {
        onToolCallDelta: tcs => deltas.push(tcs.length)
      }
    });

    parser.feed(
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_a","function":{"name":"get_events","arguments":"{\\"startDate\\":"}}]},"finish_reason":null}]}\n\n'
    );
    parser.feed(
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"2026-11-15\\"}"}}]},"finish_reason":null}]}\n\n'
    );
    parser.feed(
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_b","function":{"name":"get_user_categories","arguments":"{"}}]},"finish_reason":null}]}\n\n'
    );
    parser.feed(
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"}"}}]},"finish_reason":"tool_calls"}]}\n\n'
    );
    parser.flush();

    const result = parser.getResult();
    expect(result.finishReason).toBe('tool_calls');
    expect(result.toolCalls).toEqual([
      {
        id: 'call_a',
        type: 'function',
        function: { name: 'get_events', arguments: '{"startDate":"2026-11-15"}' }
      },
      {
        id: 'call_b',
        type: 'function',
        function: { name: 'get_user_categories', arguments: '{}' }
      }
    ]);
    expect(deltas).toEqual([1, 1, 2, 2]);
  });

  it('delegates non-message custom SSE event names without error', () => {
    const customEvents: { name: string; data: string }[] = [];
    const parser = new SseChunkParser({
      onCustomEvent: (name, data) => customEvents.push({ name, data })
    });

    parser.feed('event: fcr:usage\ndata: {"tokens":42}\n\n');
    parser.flush();

    expect(customEvents).toEqual([{ name: 'fcr:usage', data: '{"tokens":42}' }]);
  });

  it('emits onReasoningDelta for reasoning_content and reasoning SSE frames without polluting content', () => {
    const reasoningDeltas: string[] = [];
    const contentDeltas: string[] = [];
    const parser = new SseChunkParser({
      callbacks: {
        onReasoningDelta: d => reasoningDeltas.push(d),
        onChunk: d => contentDeltas.push(d)
      }
    });

    parser.feed(
      'data: {"choices":[{"delta":{"reasoning_content":"Thinking "},"finish_reason":null}]}\n\n'
    );
    parser.feed('data: {"choices":[{"delta":{"reasoning":"more"},"finish_reason":null}]}\n\n');
    parser.feed('data: {"choices":[{"delta":{"content":"Done."},"finish_reason":"stop"}]}\n\n');
    parser.flush();

    expect(reasoningDeltas).toEqual(['Thinking ', 'more']);
    expect(contentDeltas).toEqual(['Done.']);
    expect(parser.getResult().content).toBe('Done.');
  });
});
