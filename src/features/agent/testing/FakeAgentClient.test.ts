import { computeWeightedMicrocredits, microcreditsToWtc } from '../domain/Usage';
import { isNormalizedAgentError, NormalizedAgentError } from '../domain/AgentError';
import { FakeAgentClient } from './FakeAgentClient';

describe('Agent domain contracts & FakeAgentClient', () => {
  describe('Usage integer microcredit arithmetic', () => {
    it('computes exact integer weighted microcredits (10 uncached, 1 cached, 40 output)', () => {
      // 1,000 uncached (10,000) + 500 cached (500) + 250 output (10,000) = 20,500 microcredits
      const mc = computeWeightedMicrocredits(1000, 500, 250);
      expect(mc).toBe(20500);
      expect(microcreditsToWtc(mc)).toBe(2050);
    });

    it('matches exact single-dimension bounds for 24M WTC Power grant', () => {
      // 24,000,000 WTC = 240,000,000 microcredits
      expect(microcreditsToWtc(computeWeightedMicrocredits(24_000_000, 0, 0))).toBe(24_000_000);
      expect(microcreditsToWtc(computeWeightedMicrocredits(0, 240_000_000, 0))).toBe(24_000_000);
      expect(microcreditsToWtc(computeWeightedMicrocredits(0, 0, 6_000_000))).toBe(24_000_000);
    });

    it('clamps negative or fractional inputs safely', () => {
      expect(computeWeightedMicrocredits(-10, 5.9, 2.7)).toBe(85);
    });
  });

  describe('FakeAgentClient protocol invariants', () => {
    it('streams chunks and replays identical idempotency keys without a second turn', async () => {
      const client = new FakeAgentClient([
        { chunks: ['Hello', ', ', 'calendar!'], finishReason: 'stop' }
      ]);

      const received: string[] = [];
      const first = await client.chatCompletion([{ role: 'user', content: 'Hi' }], [], {
        idempotencyKey: 'idem-1',
        callbacks: { onChunk: delta => received.push(delta) }
      });

      expect(first.content).toBe('Hello, calendar!');
      expect(received).toEqual(['Hello', ', ', 'calendar!']);

      const replay = await client.chatCompletion([{ role: 'user', content: 'Hi' }], [], {
        idempotencyKey: 'idem-1'
      });
      expect(replay).toEqual(first);
      expect(client.recordedRequests).toHaveLength(1);
    });

    it('throws idempotency_conflict when key is reused with different body', async () => {
      const client = new FakeAgentClient([{ chunks: ['First'] }]);
      await client.chatCompletion([{ role: 'user', content: 'A' }], [], {
        idempotencyKey: 'idem-conflict'
      });

      await expect(
        client.chatCompletion([{ role: 'user', content: 'B' }], [], {
          idempotencyKey: 'idem-conflict'
        })
      ).rejects.toMatchObject({
        code: 'idempotency_conflict',
        status: 409
      });
    });

    it('enforces exactly one active generation at a time', async () => {
      const client = new FakeAgentClient([
        { chunks: ['slow-1', 'slow-2'], chunkDelayMs: 30 },
        { chunks: ['second'] }
      ]);

      const p1 = client.chatCompletion([{ role: 'user', content: '1' }], []);
      await expect(
        client.chatCompletion([{ role: 'user', content: '2' }], [])
      ).rejects.toMatchObject({
        code: 'generation_in_progress',
        status: 409
      });

      const res1 = await p1;
      expect(res1.content).toBe('slow-1slow-2');
    });

    it('supports partial stream followed by normalized error', async () => {
      const client = new FakeAgentClient([
        {
          chunks: ['part1', 'part2'],
          failAfterChunkIndex: 0,
          error: new NormalizedAgentError({
            code: 'provider_timeout',
            status: 504,
            retryable: true,
            message: 'Upstream timed out'
          })
        }
      ]);

      const chunks: string[] = [];
      let caught: unknown;
      try {
        await client.chatCompletion([{ role: 'user', content: 'hi' }], [], {
          callbacks: { onChunk: c => chunks.push(c) }
        });
      } catch (err) {
        caught = err;
      }
      expect(isNormalizedAgentError(caught)).toBe(true);
      if (isNormalizedAgentError(caught)) {
        expect(caught.code).toBe('provider_timeout');
        expect(caught.retryable).toBe(true);
      }
      expect(chunks).toEqual(['part1']);
    });
  });
});
