/**
 * @file contextWindowBuilder.test.ts
 * @brief Unit tests for prefix-cache preservation, structural tool compaction, and block eviction.
 */

import { buildContextWindowMessages } from './contextWindowBuilder';
import type { ChatMessage, CurrentTimeInfo } from '../types';

const makeBridge = () => ({
  getCurrentTime: (atMs: number = Date.now()): CurrentTimeInfo => {
    const d = new Date(atMs);
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      currentIsoTimestamp: d.toISOString(),
      currentDate: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      currentTime24h: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
      dayOfWeek: 'Thursday',
      displayTimezone: 'UTC',
      timeFormat24h: true
    };
  }
});

describe('contextWindowBuilder', () => {
  it('appends deterministic local time from immutable msg.timestamp without mutating inputs or legacy messages', () => {
    const t1 = Date.UTC(2026, 10, 19, 10, 15, 0);
    const t2 = Date.UTC(2026, 10, 19, 14, 30, 0);
    const raw: ChatMessage[] = [
      { role: 'user', content: 'Legacy message without timestamp' },
      { role: 'assistant', content: 'Old answer' },
      { role: 'user', content: 'Turn 1 question', timestamp: t1 },
      { role: 'assistant', content: 'Turn 1 answer' },
      { role: 'user', content: 'Turn 2 question', timestamp: t2 }
    ];

    const out1 = buildContextWindowMessages(raw, makeBridge());
    const out2 = buildContextWindowMessages(raw, makeBridge());

    // Original array untouched
    expect(raw[2].content).toBe('Turn 1 question');

    // Legacy message without timestamp does not call Date.now()
    expect(out1[0].content).toBe('Legacy message without timestamp');

    // Deterministic across multiple invocations (prefix cache stays stable)
    expect(out1[2].content).toBe(
      'Turn 1 question\n\n[Current Local Time: 2026-11-19 10:15 (Thursday, UTC)]'
    );
    expect(out1[4].content).toBe(
      'Turn 2 question\n\n[Current Local Time: 2026-11-19 14:30 (Thursday, UTC)]'
    );
    expect(out1).toEqual(out2);
  });

  it('keeps turnsAgo=1 structured events intact while structurally compacting turnsAgo>=2 get_events preserving eventId', () => {
    const t0 = Date.UTC(2026, 10, 19, 9, 0, 0);
    const largeEventsPayload = JSON.stringify({
      count: 2,
      events: [
        {
          id: 'evt_abc123',
          calendarId: 'work-cal',
          calendarName: 'Work',
          title: 'Work - Sprint Review',
          date: '2026-11-20',
          allDay: false,
          startTime: '14:00',
          endTime: '15:00',
          description: 'Very long meeting agenda '.repeat(40),
          location: 'Building 4, Conference Room Alpha'
        }
      ]
    });

    const messages: ChatMessage[] = [
      // turnsAgo = 2
      { role: 'user', content: 'Check my events', timestamp: t0 },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call_ge_old', type: 'function', function: { name: 'get_events', arguments: '{}' } }
        ]
      },
      { role: 'tool', tool_call_id: 'call_ge_old', content: largeEventsPayload },
      { role: 'assistant', content: 'You have Sprint Review.' },
      // turnsAgo = 1
      { role: 'user', content: 'Check syllabus and latest events', timestamp: t0 + 60_000 },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_ge_recent',
            type: 'function',
            function: { name: 'get_events', arguments: '{}' }
          },
          {
            id: 'call_browse',
            type: 'function',
            function: { name: 'browse_schedule_online', arguments: '{}' }
          }
        ]
      },
      { role: 'tool', tool_call_id: 'call_ge_recent', content: largeEventsPayload },
      { role: 'tool', tool_call_id: 'call_browse', content: 'Syllabus '.repeat(250) },
      { role: 'assistant', content: 'Got both.' },
      // turnsAgo = 0
      { role: 'user', content: 'Move Sprint Review to 16:00', timestamp: t0 + 120_000 }
    ];

    const out = buildContextWindowMessages(messages, makeBridge());

    // turnsAgo = 2 get_events is structurally compacted but preserves id & calendarId!
    const oldToolMsg = out.find(m => m.tool_call_id === 'call_ge_old');
    expect(oldToolMsg).toBeDefined();
    const parsedOld = JSON.parse(oldToolMsg!.content!) as {
      compacted: boolean;
      events: Record<string, unknown>[];
    };
    expect(parsedOld.compacted).toBe(true);
    expect(parsedOld.events[0]).toEqual({
      id: 'evt_abc123',
      calendarId: 'work-cal',
      title: 'Work - Sprint Review',
      date: '2026-11-20',
      allDay: false,
      startTime: '14:00',
      endTime: '15:00'
    });

    // turnsAgo = 1 structured get_events is kept uncompacted
    const recentEventsMsg = out.find(m => m.tool_call_id === 'call_ge_recent');
    expect(recentEventsMsg!.content).toBe(largeEventsPayload);

    // turnsAgo = 1 large web browse output (>1200 chars) IS compacted
    const recentBrowseMsg = out.find(m => m.tool_call_id === 'call_browse');
    expect(recentBrowseMsg!.content).toContain('[Compacted browse_schedule_online output');
  });

  it('evicts oldest 25% of turn blocks when exceeding budget and repairs orphaned tool messages', () => {
    const t0 = Date.UTC(2026, 10, 19, 8, 0, 0);
    const messages: ChatMessage[] = [
      { role: 'tool', tool_call_id: 'orphan_1', content: 'should be dropped' }
    ];
    for (let i = 0; i < 8; i++) {
      messages.push(
        { role: 'user', content: `Turn ${i}: ${'x'.repeat(120)}`, timestamp: t0 + i * 60_000 },
        { role: 'assistant', content: `Reply ${i}: ${'y'.repeat(120)}` }
      );
    }

    const out = buildContextWindowMessages(messages, makeBridge(), {
      maxMessages: 10,
      maxTotalChars: 2000
    });

    expect(out[0].role).toBe('user');
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out.some(m => m.tool_call_id === 'orphan_1')).toBe(false);
  });

  it('rejects duplicate tool_call_ids, drops empty assistant messages, and compacts multi-step single-turn tool loops', () => {
    const t0 = Date.UTC(2026, 10, 19, 12, 0, 0);
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Import both schedules', timestamp: t0 },
      // Empty assistant message (must be stripped)
      { role: 'assistant', content: null },
      // Duplicate tool_call_id for call_1 when call_1 and call_2 were expected (must drop incomplete tool_calls)
      {
        role: 'assistant',
        content: 'Checking first link',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'get_events', arguments: '{}' } },
          { id: 'call_2', type: 'function', function: { name: 'get_events', arguments: '{}' } }
        ]
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'result 1' },
      { role: 'tool', tool_call_id: 'call_1', content: 'duplicate result 1' },
      // Valid completed tool loop 1 (huge output) + loop 2 (last tool output stays intact)
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_scrape_1',
            type: 'function',
            function: { name: 'browse_schedule_online', arguments: '{}' }
          }
        ]
      },
      { role: 'tool', tool_call_id: 'call_scrape_1', content: 'First schedule '.repeat(120) },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_scrape_2',
            type: 'function',
            function: { name: 'browse_schedule_online', arguments: '{}' }
          }
        ]
      },
      { role: 'tool', tool_call_id: 'call_scrape_2', content: 'Latest schedule '.repeat(60) }
    ];

    const out = buildContextWindowMessages(messages, makeBridge(), {
      maxTotalChars: 2_000
    });

    // Empty assistant message removed
    expect(out.some(m => m.role === 'assistant' && m.content === null && !m.tool_calls)).toBe(
      false
    );
    // Incomplete duplicate-tool-call message stripped tool_calls while preserving prose
    const repaired = out.find(m => m.content === 'Checking first link');
    expect(repaired).toBeDefined();
    expect(repaired!.tool_calls).toBeUndefined();
    // Earlier large tool output compacted when single turn exceeds maxTotalChars, while last tool kept intact
    const firstScrape = out.find(m => m.tool_call_id === 'call_scrape_1');
    expect(firstScrape!.content).toContain('[Compacted browse_schedule_online output');
    const lastScrape = out.find(m => m.tool_call_id === 'call_scrape_2');
    expect(lastScrape!.content).toBe('Latest schedule '.repeat(60));
  });
});
