/**
 * @file AgentClient.test.ts
 * @brief Unit tests for AgentClient resilience, retry logic, rate limit handling, and streaming.
 */

import { requestUrl } from 'obsidian';
import { AgentClient, AgentApiError } from './AgentClient';

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
});
