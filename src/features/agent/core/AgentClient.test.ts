/**
 * @file AgentClient.test.ts
 * @brief Unit tests for AgentClient resilience, retry logic, rate limit handling, and streaming.
 */

import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import { requestUrl } from 'obsidian';
import { AgentClient, AgentApiError } from './AgentClient';

if (typeof window.TextEncoder === 'undefined') {
  Object.defineProperty(window, 'TextEncoder', {
    value: NodeTextEncoder,
    configurable: true
  });
}
if (typeof window.TextDecoder === 'undefined') {
  Object.defineProperty(window, 'TextDecoder', {
    value: NodeTextDecoder,
    configurable: true
  });
}

describe('AgentClient', () => {
  const mockFetch = jest.fn();
  const originalFetch = (...args: Parameters<typeof window.fetch>) => window.fetch(...args);

  beforeEach(() => {
    window.fetch = mockFetch;
    mockFetch.mockReset();
    (requestUrl as unknown as jest.Mock).mockReset();
  });

  afterAll(() => {
    window.fetch = originalFetch;
  });

  it('should format headers and send correct payload', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Hello World' } }]
      })
    });

    const client = new AgentClient({
      endpointUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key-123',
      model: 'gpt-4o-mini'
    });

    const res = await client.chatCompletion([{ role: 'user', content: 'Hi' }], [], {
      stream: false
    });

    expect(res.content).toBe('Hello World');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [callUrl, callInit] = mockFetch.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string }
    ];
    expect(callUrl).toBe('https://api.openai.com/v1/chat/completions');
    expect(callInit.headers['Authorization']).toBe('Bearer test-key-123');
    expect(callInit.headers['Content-Type']).toBe('application/json');
    const parsedPayload = JSON.parse(callInit.body) as { model?: string; temperature?: number };
    expect(parsedPayload.model).toBe('gpt-4o-mini');
    expect(parsedPayload.temperature).toBeUndefined();
  });

  it('should include temperature in payload when explicitly set', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Explicit Temp OK' } }]
      })
    });

    const client = new AgentClient({
      endpointUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key-123',
      model: 'gpt-4o-mini',
      temperature: 0.7
    });

    await client.chatCompletion([{ role: 'user', content: 'Hi' }], [], { stream: false });

    const [, callInit] = mockFetch.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string }
    ];
    const parsedPayload = JSON.parse(callInit.body) as { temperature?: number };
    expect(parsedPayload.temperature).toBe(0.7);
  });

  it('should auto-heal and retry chat completion without temperature if 400 rejects temperature', async () => {
    // Attempt 1 fails with 400 rejection for temperature
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          error: { message: '`temperature` is deprecated for this model.' }
        })
    });

    // Attempt 2 succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Success on retry without temperature' } }]
      })
    });

    const client = new AgentClient({
      endpointUrl: 'https://api.anthropic.com/v1',
      apiKey: 'anthropic-key',
      model: 'claude-opus-5-5',
      temperature: 0.2
    });

    const res = await client.chatCompletion([{ role: 'user', content: 'Hi' }], [], {
      stream: false
    });
    expect(res.content).toBe('Success on retry without temperature');
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const [, firstInit] = mockFetch.mock.calls[0] as [string, { body: string }];
    const [, secondInit] = mockFetch.mock.calls[1] as [string, { body: string }];

    const firstPayload = JSON.parse(firstInit.body) as { temperature?: number };
    const secondPayload = JSON.parse(secondInit.body) as { temperature?: number };

    expect(firstPayload.temperature).toBe(0.2);
    expect(secondPayload.temperature).toBeUndefined();
  });

  it('should not retry on 401 Unauthorized errors and throw AgentApiError', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Invalid API key'
    });

    const client = new AgentClient({
      endpointUrl: 'https://api.openai.com/v1',
      apiKey: 'bad-key',
      model: 'gpt-4o-mini',
      maxRetries: 3
    });

    await expect(
      client.chatCompletion([{ role: 'user', content: 'Hi' }], [], { stream: false })
    ).rejects.toThrow(AgentApiError);

    expect(mockFetch).toHaveBeenCalledTimes(1); // Did not attempt futile retries on auth error
  });

  it('should retry on 429 Rate Limit and succeed when second attempt passes', async () => {
    // Attempt 1: 429 Rate limited
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '0' }),
      text: async () => 'Rate limit exceeded'
    });

    // Attempt 2: Success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Success after retry' } }]
      })
    });

    const client = new AgentClient({
      endpointUrl: 'https://api.openai.com/v1',
      apiKey: 'key',
      model: 'gpt-4o-mini',
      maxRetries: 2
    });

    const retries: number[] = [];
    const res = await client.chatCompletion([{ role: 'user', content: 'Hi' }], [], {
      stream: false,
      callbacks: {
        onRetry: attempt => {
          retries.push(attempt);
        }
      }
    });

    expect(res.content).toBe('Success after retry');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(retries).toEqual([1]);
  });

  it('should retry on 503 Server Error and fail after max retries', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable'
    });

    const client = new AgentClient({
      endpointUrl: 'https://api.openai.com/v1',
      apiKey: 'key',
      model: 'gpt-4o-mini',
      maxRetries: 1
    });

    await expect(
      client.chatCompletion([{ role: 'user', content: 'Hi' }], [], { stream: false })
    ).rejects.toThrow();

    expect(mockFetch).toHaveBeenCalledTimes(2); // Initial + 1 retry
  });

  it('should fall back to requestUrl when fetch throws TypeError (CORS error in Obsidian desktop)', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    (requestUrl as unknown as jest.Mock).mockResolvedValueOnce({
      status: 200,
      text: JSON.stringify({
        choices: [{ message: { content: 'Response via requestUrl CORS fallback' } }]
      }),
      json: {
        choices: [{ message: { content: 'Response via requestUrl CORS fallback' } }]
      }
    });

    const client = new AgentClient({
      endpointUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o-mini'
    });

    const res = await client.chatCompletion([{ role: 'user', content: 'Hi' }], []);
    expect(res.content).toBe('Response via requestUrl CORS fallback');
    expect(requestUrl).toHaveBeenCalledTimes(1);
  });

  it('testConnection should use requestUrl and extract 401 error message', async () => {
    (requestUrl as unknown as jest.Mock).mockResolvedValueOnce({
      status: 401,
      text: JSON.stringify({
        error: { message: 'Incorrect API key provided' }
      }),
      json: {
        error: { message: 'Incorrect API key provided' }
      }
    });

    const client = new AgentClient({
      endpointUrl: 'https://api.openai.com/v1',
      apiKey: 'bad-key',
      model: 'gpt-4o-mini'
    });

    const status = await client.testConnection();
    expect(status.success).toBe(false);
    expect(status.message).toContain('Incorrect API key provided');
  });

  it('testConnection should omit temperature when unset', async () => {
    (requestUrl as unknown as jest.Mock).mockResolvedValueOnce({
      status: 200,
      text: JSON.stringify({ choices: [{ message: { content: 'OK' } }] }),
      json: { choices: [{ message: { content: 'OK' } }] }
    });

    const client = new AgentClient({
      endpointUrl: 'https://api.openai.com/v1',
      apiKey: 'valid-key',
      model: 'gpt-4o-mini'
    });

    const status = await client.testConnection();
    expect(status.success).toBe(true);
    expect(requestUrl).toHaveBeenCalledTimes(1);
    const mockRequest = requestUrl as unknown as jest.Mock<Promise<unknown>, [{ body: string }]>;
    const callArgs = mockRequest.mock.calls[0]?.[0];
    const parsedPayload = JSON.parse(callArgs?.body ?? '{}') as { temperature?: number };
    expect(parsedPayload.temperature).toBeUndefined();
  });

  it('testConnection should auto-heal if 400 rejects temperature and retry successfully', async () => {
    // Attempt 1 fails with 400 temperature deprecation
    (requestUrl as unknown as jest.Mock).mockResolvedValueOnce({
      status: 400,
      text: JSON.stringify({
        error: { message: '`temperature` is deprecated for this model.' }
      }),
      json: {
        error: { message: '`temperature` is deprecated for this model.' }
      }
    });

    // Attempt 2 succeeds
    (requestUrl as unknown as jest.Mock).mockResolvedValueOnce({
      status: 200,
      text: JSON.stringify({ choices: [{ message: { content: 'OK' } }] }),
      json: { choices: [{ message: { content: 'OK' } }] }
    });

    const client = new AgentClient({
      endpointUrl: 'https://api.anthropic.com/v1',
      apiKey: 'anthropic-key',
      model: 'claude-opus-5-5',
      temperature: 0.2
    });

    const status = await client.testConnection();
    expect(status.success).toBe(true);
    expect(requestUrl).toHaveBeenCalledTimes(2);

    const mockRequest = requestUrl as unknown as jest.Mock<Promise<unknown>, [{ body: string }]>;
    const firstCallArgs = mockRequest.mock.calls[0]?.[0];
    const secondCallArgs = mockRequest.mock.calls[1]?.[0];

    const firstCallPayload = JSON.parse(firstCallArgs?.body ?? '{}') as { temperature?: number };
    const secondCallPayload = JSON.parse(secondCallArgs?.body ?? '{}') as { temperature?: number };

    expect(firstCallPayload.temperature).toBe(0.2);
    expect(secondCallPayload.temperature).toBeUndefined();
  });

  it('should stream text/event-stream chunks incrementally when stream: true', async () => {
    const encoder = new TextEncoder();
    const frames = [
      encoder.encode('data: {"choices":[{"delta":{"content":"Hello "},"finish_reason":null}]}\n\n'),
      encoder.encode(
        'data: {"choices":[{"delta":{"content":"streaming!"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n'
      ),
      encoder.encode('data: [DONE]\n\n')
    ];
    let frameIdx = 0;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: {
        getReader: () => ({
          read: async () =>
            frameIdx < frames.length
              ? { done: false, value: frames[frameIdx++] }
              : { done: true, value: undefined },
          cancel: async () => undefined
        })
      }
    });

    const client = new AgentClient({
      endpointUrl: 'http://localhost:39090/v1',
      apiKey: '',
      model: 'local-model'
    });

    const received: string[] = [];
    const res = await client.chatCompletion([{ role: 'user', content: 'Hi' }], [], {
      stream: true,
      callbacks: {
        onChunk: delta => received.push(delta)
      }
    });

    const [, init] = mockFetch.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toMatchObject({ stream: true });
    expect(received).toEqual(['Hello ', 'streaming!']);
    expect(res.content).toBe('Hello streaming!');
    expect(res.finishReason).toBe('stop');
    expect(res.tokenUsage).toEqual({ prompt: 10, completion: 5, total: 15 });
  });

  it('should stream tool_calls deltas and fall back cleanly to JSON when server ignores stream: true', async () => {
    const encoder = new TextEncoder();
    const frames = [
      encoder.encode(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_events","arguments":"{\\"startDate\\":\\"2026-11-15\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n'
      ),
      encoder.encode('data: [DONE]\n\n')
    ];
    let idx = 0;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: {
        getReader: () => ({
          read: async () =>
            idx < frames.length
              ? { done: false, value: frames[idx++] }
              : { done: true, value: undefined },
          cancel: async () => undefined
        })
      }
    });

    const client = new AgentClient({
      endpointUrl: 'http://localhost:39090/v1',
      apiKey: '',
      model: 'local-model'
    });

    const toolDeltas: number[] = [];
    const sseRes = await client.chatCompletion([{ role: 'user', content: 'Check' }], [], {
      stream: true,
      callbacks: {
        onToolCallDelta: tcs => toolDeltas.push(tcs.length)
      }
    });
    expect(sseRes.toolCalls).toHaveLength(1);
    expect(sseRes.toolCalls[0].function.name).toBe('get_events');
    expect(toolDeltas).toEqual([1]);

    // Server returns plain JSON despite stream: true
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ choices: [{ message: { content: 'JSON reply' } }] })
    });

    const chunks: string[] = [];
    const jsonRes = await client.chatCompletion([{ role: 'user', content: 'Check' }], [], {
      stream: true,
      callbacks: {
        onChunk: delta => chunks.push(delta)
      }
    });
    expect(jsonRes.content).toBe('JSON reply');
    expect(chunks).toEqual(['JSON reply']);
  });

  it('should never retry or fall back to requestUrl after partial stream tokens have been emitted', async () => {
    const encoder = new TextEncoder();
    let reads = 0;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: {
        getReader: () => ({
          read: async () => {
            reads++;
            if (reads === 1) {
              return {
                done: false,
                value: encoder.encode(
                  'data: {"choices":[{"delta":{"content":"Partial "},"finish_reason":null}]}\n\n'
                )
              };
            }
            throw new TypeError('Stream connection dropped');
          },
          cancel: async () => undefined
        })
      }
    });

    const client = new AgentClient({
      endpointUrl: 'http://localhost:39090/v1',
      apiKey: '',
      model: 'local-model',
      maxRetries: 2
    });

    const emitted: string[] = [];
    await expect(
      client.chatCompletion([{ role: 'user', content: 'Hi' }], [], {
        stream: true,
        callbacks: { onChunk: c => emitted.push(c) }
      })
    ).rejects.toThrow('Stream connection dropped');

    expect(emitted).toEqual(['Partial ']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(requestUrl).not.toHaveBeenCalled();
  });

  it('should send stream: false when falling back to requestUrl on CORS error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    (requestUrl as unknown as jest.Mock).mockResolvedValueOnce({
      status: 200,
      text: JSON.stringify({ choices: [{ message: { content: 'Fallback OK' } }] }),
      json: { choices: [{ message: { content: 'Fallback OK' } }] }
    });

    const client = new AgentClient({
      endpointUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o-mini'
    });

    const res = await client.chatCompletion([{ role: 'user', content: 'Hi' }], [], {
      stream: true
    });
    expect(res.content).toBe('Fallback OK');
    const mockReq = requestUrl as unknown as jest.Mock<Promise<unknown>, [{ body: string }]>;
    expect(JSON.parse(mockReq.mock.calls[0][0].body)).toMatchObject({ stream: false });
  });

  it('forwards onReasoningDelta during SSE streaming', async () => {
    const encoder = new TextEncoder();
    let reads = 0;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: {
        getReader: () => ({
          read: async () => {
            reads++;
            if (reads === 1) {
              return {
                done: false,
                value: encoder.encode(
                  'data: {"choices":[{"delta":{"reasoning_content":"Checking "},"finish_reason":null}]}\n\n'
                )
              };
            }
            if (reads === 2) {
              return {
                done: false,
                value: encoder.encode(
                  'data: {"choices":[{"delta":{"content":"Ready."},"finish_reason":"stop"}]}\n\n'
                )
              };
            }
            return { done: true, value: undefined };
          },
          cancel: async () => undefined
        })
      }
    });

    const client = new AgentClient({
      endpointUrl: 'http://localhost:39090/v1',
      apiKey: '',
      model: 'local-reasoning'
    });

    const reasoning: string[] = [];
    const chunks: string[] = [];
    const res = await client.chatCompletion([{ role: 'user', content: 'Plan week' }], [], {
      stream: true,
      callbacks: {
        onReasoningDelta: d => reasoning.push(d),
        onChunk: c => chunks.push(c)
      }
    });

    expect(reasoning).toEqual(['Checking ']);
    expect(chunks).toEqual(['Ready.']);
    expect(res.content).toBe('Ready.');
  });

  it('aborts promptly while awaiting non-cancellable requestUrl fallback and suppresses late callbacks', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    let resolveReq!: (val: unknown) => void;
    (requestUrl as unknown as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveReq = resolve;
        })
    );

    const client = new AgentClient({
      endpointUrl: 'http://localhost:39090/v1',
      apiKey: '',
      model: 'local-model',
      maxRetries: 2
    });

    const controller = new AbortController();
    const chunks: string[] = [];
    const pending = client.chatCompletion([{ role: 'user', content: 'Hi' }], [], {
      stream: true,
      signal: controller.signal,
      callbacks: { onChunk: c => chunks.push(c) }
    });

    await new Promise(r => window.setTimeout(r, 10));
    controller.abort();

    await expect(pending).rejects.toThrow('cancelled by user');
    resolveReq({
      status: 200,
      text: JSON.stringify({ choices: [{ message: { content: 'Ghost reply' } }] }),
      json: { choices: [{ message: { content: 'Ghost reply' } }] }
    });
    await Promise.resolve();
    expect(chunks).toEqual([]);
  });
});
