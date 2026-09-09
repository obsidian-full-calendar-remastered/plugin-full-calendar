/**
 * @file AgentClient.test.ts
 * @brief Unit tests for AgentClient resilience, retry logic, rate limit handling, and streaming.
 */

import { AgentClient, AgentApiError } from './AgentClient';

describe('AgentClient', () => {
  const mockFetch = jest.fn();
  const originalFetch = (...args: Parameters<typeof window.fetch>) => window.fetch(...args);

  beforeEach(() => {
    window.fetch = mockFetch;
    mockFetch.mockReset();
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
      { headers: Record<string, string> }
    ];
    expect(callUrl).toBe('https://api.openai.com/v1/chat/completions');
    expect(callInit.headers['Authorization']).toBe('Bearer test-key-123');
    expect(callInit.headers['Content-Type']).toBe('application/json');
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
});
