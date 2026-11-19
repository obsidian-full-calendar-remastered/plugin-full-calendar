import { webcrypto } from 'node:crypto';
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import { isNormalizedAgentError } from '../../../domain/AgentError';
import { ManagedAgentClient } from '../client/ManagedAgentClient';
import { RequestSigner } from '../client/RequestSigner';
import type { FetchLike } from '../client/managedHttp';
import { DeviceKeyManager } from '../identity/DeviceKeyManager';
import { LicenseManager } from '../identity/LicenseManager';
import { type ISecretBackingStore, SecretStorageAdapter } from '../identity/SecretStorageAdapter';
import { PROD_GATEWAY_URL, resolveGatewayBaseUrl } from '../protocol/managedTypes';
import { UsageSnapshotCache } from '../state/UsageSnapshotCache';

if (!window.crypto?.subtle) {
  Object.defineProperty(window, 'crypto', {
    value: webcrypto,
    configurable: true
  });
}
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

function createSeededStore(): ISecretBackingStore {
  const data = new Map<string, string>([
    ['fcr-managed-staging-access-tok', 'tok_initial'],
    ['fcr-managed-staging-refresh-tok', 'ref_initial']
  ]);
  return {
    getSecret: (k: string) => data.get(k) ?? null,
    setSecret: (k: string, v: string) => {
      if (!v) data.delete(k);
      else data.set(k, v);
    }
  };
}

function createSseStreamResponse(byteChunks: Uint8Array[]): Response {
  let idx = 0;
  const mockReader = {
    read: async () => {
      if (idx >= byteChunks.length) {
        return { done: true as const, value: undefined };
      }
      const value = byteChunks[idx++];
      return { done: false as const, value };
    },
    cancel: async () => undefined
  };

  return {
    ok: true,
    status: 200,
    headers: { get: () => 'text/event-stream' },
    body: { getReader: () => mockReader }
  } as unknown as Response;
}

function jsonErrorResponse(status: number, body: unknown): Response {
  const text = JSON.stringify(body);
  return {
    ok: false,
    status,
    headers: { get: () => null },
    text: async () => text
  } as unknown as Response;
}

describe('ManagedAgentClient & StreamingTransport', () => {
  function setupHarness(fetchFn: FetchLike) {
    const store = createSeededStore();
    const secretStorage = new SecretStorageAdapter(undefined, 'staging', store);
    const keyManager = new DeviceKeyManager(secretStorage);
    const signer = new RequestSigner(keyManager);
    const usageCache = new UsageSnapshotCache();

    usageCache.update({
      principalId: 'prin_1',
      planTier: 'pro',
      status: 'active',
      periodStart: '2026-11-01T00:00:00Z',
      periodEnd: '2026-12-01T00:00:00Z',
      totalMicrocredits: 100_000_000,
      remainingMicrocredits: 100_000_000,
      uncachedInputTokensUsed: 0,
      cachedInputTokensUsed: 0,
      outputTokensUsed: 0,
      priceVersion: '2026-11-16-v1',
      syncedAt: Date.now()
    });

    const licenseManager = new LicenseManager({
      getBaseUrl: () => 'https://staging-gateway.destyleer.in.net',
      keyManager,
      secretStorage,
      signer,
      usageCache,
      fetchFn
    });

    const client = new ManagedAgentClient({
      getBaseUrl: () => 'https://staging-gateway.destyleer.in.net',
      signer,
      licenseManager,
      usageCache,
      fetchFn
    });

    return { client, usageCache, secretStorage };
  }

  it('decodes split multi-byte UTF-8 SSE frames, tool-call deltas, and terminal fcr:usage', async () => {
    const enc = new TextEncoder();
    const ssePayload = [
      'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"mistral-small","choices":[{"index":0,"delta":{"content":"Hi 🌍"},"finish_reason":null}]}\n\n',
      'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"mistral-small","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"get_events","arguments":"{\\"start"}}]},"finish_reason":null}]}\n\n',
      'data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"mistral-small","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\":\\"2026-11-19\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
      'event: fcr:usage\ndata: {"request_id":"req_99","provider_request_id":"prov_1","price_version":"2026-11-16-v1","uncached_input_tokens":100,"cached_input_tokens":50,"output_tokens":25,"microcredits_reserved":5000,"microcredits_settled":2050,"microcredits_remaining":99997950}\n\n',
      'data: [DONE]\n\n'
    ].join('');

    const fullBytes = enc.encode(ssePayload);
    const emojiStart = ssePayload.indexOf('🌍');
    const splitPoint = enc.encode(ssePayload.slice(0, emojiStart)).byteLength + 2;

    const fetchFn: FetchLike = async (_url, init) => {
      const bodyStr = typeof init?.body === 'string' ? init.body : '';
      const parsedBody = JSON.parse(bodyStr) as Record<string, unknown>;
      expect(parsedBody.model).toBeUndefined();
      expect(parsedBody.temperature).toBeUndefined();
      expect(parsedBody.n).toBeUndefined();

      return createSseStreamResponse([
        fullBytes.slice(0, splitPoint),
        fullBytes.slice(splitPoint, splitPoint + 45),
        fullBytes.slice(splitPoint + 45)
      ]);
    };

    const { client, usageCache } = setupHarness(fetchFn);
    const streamedChunks: string[] = [];
    const result = await client.chatCompletion([{ role: 'user', content: 'List events' }], [], {
      idempotencyKey: 'idem-stream-1',
      callbacks: { onChunk: delta => streamedChunks.push(delta) }
    });

    expect(streamedChunks.join('')).toBe('Hi 🌍');
    expect(result.content).toBe('Hi 🌍');
    expect(result.finishReason).toBe('tool_calls');
    expect(result.toolCalls).toEqual([
      {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'get_events',
          arguments: '{"start":"2026-11-19"}'
        }
      }
    ]);
    expect(result.managedUsage?.microcreditsSettled).toBe(2050);
    expect(usageCache.getSnapshot()?.remainingMicrocredits).toBe(99_997_950);
  });

  it('refreshes expired access token once on 401 and retries with the identical idempotency key', async () => {
    const calls: { url: string; auth?: string; idem?: string }[] = [];

    const fetchFn: FetchLike = async (url, init) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({
        url: urlStr,
        auth: headers['Authorization'],
        idem: headers['X-FCR-Idempotency-Key']
      });

      if (
        urlStr.endsWith('/v1/chat/completions') &&
        headers['Authorization'] === 'Bearer tok_initial'
      ) {
        return jsonErrorResponse(401, {
          error: { code: 'authentication_required', message: 'Access token expired' }
        });
      }

      if (urlStr.endsWith('/v1/auth/refresh')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          text: async () =>
            JSON.stringify({
              access_token: 'tok_rotated',
              refresh_token: 'ref_rotated',
              expires_at: '2026-11-19T12:00:00Z'
            })
        } as unknown as Response;
      }

      const bytes = new TextEncoder().encode(
        'data: {"id":"2","object":"chat.completion.chunk","created":1,"model":"mistral-small","choices":[{"index":0,"delta":{"content":"Recovered"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
      );
      return createSseStreamResponse([bytes]);
    };

    const { client, secretStorage } = setupHarness(fetchFn);
    const result = await client.chatCompletion([{ role: 'user', content: 'Hi' }], [], {
      idempotencyKey: 'idem-keep-same'
    });

    expect(result.content).toBe('Recovered');
    expect(calls).toHaveLength(3);
    expect(calls[0].idem).toBe('idem-keep-same');
    expect(calls[2].idem).toBe('idem-keep-same');
    expect(calls[2].auth).toBe('Bearer tok_rotated');
    expect(secretStorage.getSecret('refresh-tok')).toBe('ref_rotated');
  });

  it('maps gateway error codes cleanly (insufficient_credits, generation_in_progress, 426)', async () => {
    const errorResponses = [
      jsonErrorResponse(402, {
        error: { code: 'insufficient_credits', message: 'Out of credits' }
      }),
      jsonErrorResponse(409, { error: { code: 'generation_in_progress', message: 'Busy' } }),
      jsonErrorResponse(426, { message: 'Upgrade required' })
    ];

    const fetchFn: FetchLike = async () => errorResponses.shift() as Response;
    const { client } = setupHarness(fetchFn);

    for (const expected of [
      { code: 'insufficient_credits', status: 402 },
      { code: 'generation_in_progress', status: 409 },
      { code: 'invalid_request', status: 426 }
    ]) {
      let caught: unknown;
      try {
        await client.chatCompletion([{ role: 'user', content: 'test' }], []);
      } catch (err) {
        caught = err;
      }
      expect(isNormalizedAgentError(caught)).toBe(true);
      if (isNormalizedAgentError(caught)) {
        expect(caught.code).toBe(expected.code);
        expect(caught.status).toBe(expected.status);
      }
    }
  });

  it('pins production gateway URL regardless of configured overrides when BUILD_ENV is production', () => {
    const prevEnv = process.env.BUILD_ENV;
    try {
      process.env.BUILD_ENV = 'production';
      expect(resolveGatewayBaseUrl('http://localhost:8787')).toBe(PROD_GATEWAY_URL);

      process.env.BUILD_ENV = 'development';
      expect(resolveGatewayBaseUrl('http://localhost:8787/')).toBe('http://localhost:8787');
    } finally {
      process.env.BUILD_ENV = prevEnv;
    }
  });
});
