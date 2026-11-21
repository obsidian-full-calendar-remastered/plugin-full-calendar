/**
 * @file AgentEngine.test.ts
 * @brief Unit tests for AgentEngine multi-turn summary continuation, structured traces, and cancellation.
 */

import { AgentEngine } from './AgentEngine';
import type { IAgentClient, ChatCompletionRequestConfig } from '../domain/contracts/IAgentClient';
import type { AgentStorage } from './AgentStorage';
import type { AgentAuditLogger } from './AgentAuditLogger';
import type { AgentCalendarBridge } from '../tools/AgentCalendarBridge';
import type { SpecLoader } from './SpecLoader';
import type { AgentSession, AgentToolStepRecord, UpdateEventProposal } from '../types';

function createMockSession(): AgentSession {
  return {
    id: 'session-1',
    title: 'Default session',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
    proposals: []
  };
}

describe('AgentEngine', () => {
  let chatCompletionFn: jest.Mock;
  let mockClient: IAgentClient;
  let mockStorage: Partial<AgentStorage>;
  let mockLogger: Partial<AgentAuditLogger>;
  let mockBridge: Partial<AgentCalendarBridge>;
  let mockSpecLoader: Partial<SpecLoader>;
  let activeSession: AgentSession;

  beforeEach(() => {
    activeSession = createMockSession();

    chatCompletionFn = jest.fn();
    mockClient = {
      chatCompletion: chatCompletionFn
    };

    mockStorage = {
      getActiveSession: jest.fn().mockImplementation(async () => activeSession),
      saveSession: jest.fn().mockResolvedValue(undefined),
      saveHistory: jest.fn().mockResolvedValue(undefined)
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    const fakeProposal: UpdateEventProposal = {
      id: 'prop_upd_1',
      type: 'UPDATE',
      status: 'PENDING',
      createdAt: Date.now(),
      calendarId: 'daily',
      calendarName: 'Daily Note',
      eventId: 'ev-1',
      originalEvent: {
        title: 'YouTube - Watch - Video - YouTube',
        type: 'single',
        date: '2026-11-16',
        endDate: null,
        allDay: true,
        category: 'Wellness',
        subCategory: 'YouTube'
      },
      updatedEvent: {
        title: 'Watch - Video',
        type: 'single',
        date: '2026-11-16',
        endDate: null,
        allDay: true,
        category: 'Wellness',
        subCategory: 'YouTube'
      },
      changedFields: {
        title: { old: 'Watch - Video - YouTube', new: 'Watch - Video' }
      }
    };

    mockBridge = {
      getCurrentTime: jest.fn().mockReturnValue({
        currentIsoTimestamp: '2026-11-20T12:00:00Z',
        currentDate: '2026-11-20',
        currentTime24h: '12:00',
        dayOfWeek: 'Friday',
        displayTimezone: 'UTC',
        timeFormat24h: true
      }),
      getEvents: jest.fn().mockReturnValue([{ id: 'ev-1', title: 'Watch - Video - YouTube' }]),
      stageUpdateEvent: jest.fn().mockReturnValue(fakeProposal)
    };

    mockSpecLoader = {
      buildSystemPrompt: jest.fn().mockResolvedValue('System prompt')
    };
  });

  it('gives the model a follow-up summary turn after Turn 2 stages proposals and extracts suggestions & toolSteps', async () => {
    chatCompletionFn
      .mockResolvedValueOnce({
        content: 'Pulling events first.',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'get_events',
              arguments: JSON.stringify({ startDate: '2026-11-15', endDate: '2026-11-20' })
            }
          }
        ],
        durationMs: 20
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          {
            id: 'call_2',
            type: 'function',
            function: {
              name: 'propose_update_event',
              arguments: JSON.stringify({ eventId: 'ev-1', title: 'Watch - Video' })
            }
          }
        ],
        durationMs: 25
      })
      .mockResolvedValueOnce({
        content:
          'Staged 1 title cleanup below.\n\n<suggestions>["Check older events", "Review today"]</suggestions>',
        toolCalls: [],
        durationMs: 15
      });

    const engine = new AgentEngine(
      mockClient,
      mockStorage as AgentStorage,
      mockLogger as AgentAuditLogger,
      mockBridge as AgentCalendarBridge,
      mockSpecLoader as SpecLoader
    );
    await engine.init();

    const turns: number[] = [];
    const endedSteps: AgentToolStepRecord[] = [];
    let finalSuggestions: string[] = [];
    let userRecorded = false;

    await engine.prompt('Clean up my events', {
      onUserMessageRecorded: () => {
        userRecorded = true;
      },
      onTurnStart: turn => turns.push(turn),
      onToolCallEnd: step => endedSteps.push(step),
      onTurnComplete: (_t, _c, suggs) => {
        finalSuggestions = suggs;
      }
    });

    expect(userRecorded).toBe(true);
    expect(chatCompletionFn).toHaveBeenCalledTimes(3);
    expect(turns).toEqual([1, 2, 3]);
    expect(endedSteps).toHaveLength(2);
    expect(endedSteps[0].summary).toBe('1 event');
    expect(endedSteps[1].summary).toBe('Staged for approval');
    expect(finalSuggestions).toEqual(['Check older events', 'Review today']);

    const msgs = engine.getMessages();
    const finalAssistant = msgs[msgs.length - 1];
    expect(finalAssistant.role).toBe('assistant');
    expect(finalAssistant.content).toBe('Staged 1 title cleanup below.');
    expect(finalAssistant.suggestions).toEqual(['Check older events', 'Review today']);
    expect(finalAssistant.toolSteps).toHaveLength(2);
  });

  it('stops mid-tool-loop when AbortSignal fires before remaining tools execute', async () => {
    const controller = new AbortController();
    chatCompletionFn.mockResolvedValueOnce({
      content: '',
      toolCalls: [
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'get_events',
            arguments: JSON.stringify({ startDate: '2026-11-15', endDate: '2026-11-20' })
          }
        },
        {
          id: 'call_2',
          type: 'function',
          function: {
            name: 'propose_update_event',
            arguments: JSON.stringify({ eventId: 'ev-1', title: 'Watch - Video' })
          }
        }
      ],
      durationMs: 20
    });

    (mockBridge.getEvents as jest.Mock).mockImplementation(() => {
      controller.abort();
      return [];
    });

    const engine = new AgentEngine(
      mockClient,
      mockStorage as AgentStorage,
      mockLogger as AgentAuditLogger,
      mockBridge as AgentCalendarBridge,
      mockSpecLoader as SpecLoader
    );
    await engine.init();

    const statuses: string[] = [];
    await engine.prompt('Clean all events', { onStatus: s => statuses.push(s) }, controller.signal);

    expect(mockBridge.getEvents).toHaveBeenCalledTimes(1);
    expect(mockBridge.stageUpdateEvent).not.toHaveBeenCalled();
    expect(statuses).toContain('Cancelled');
  });

  it('emits full pub/sub lifecycle events, maintains mid-run snapshot, and stops cleanly via abortActiveRun', async () => {
    let midRunSnapshotText = '';
    let snapshotInFlightCount = 0;

    const session2: AgentSession = {
      id: 'session-2',
      title: 'Session 2',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      proposals: []
    };

    const fullStorage = {
      ...mockStorage,
      createSession: jest.fn().mockResolvedValue(session2),
      setActiveSessionId: jest.fn().mockResolvedValue(activeSession),
      clearHistory: jest.fn().mockResolvedValue(undefined)
    } as unknown as AgentStorage;

    const engine = new AgentEngine(
      mockClient,
      fullStorage,
      mockLogger as AgentAuditLogger,
      mockBridge as AgentCalendarBridge,
      mockSpecLoader as SpecLoader
    );
    await engine.init();

    const receivedTypes: string[] = [];
    const unsubscribe = engine.subscribe(ev => {
      receivedTypes.push(ev.type);
    });

    chatCompletionFn
      .mockImplementationOnce(async (_msgs, _tools, config?: ChatCompletionRequestConfig) => {
        config?.callbacks?.onChunk?.('Partial ');
        config?.callbacks?.onChunk?.('thought');
        const snap = engine.getActiveRunSnapshot();
        midRunSnapshotText = snap?.streamingText || '';
        return {
          content: 'Partial thought',
          toolCalls: [
            {
              id: 'call_pub_1',
              type: 'function',
              function: {
                name: 'get_events',
                arguments: JSON.stringify({ startDate: '2026-11-16', endDate: '2026-11-16' })
              }
            }
          ],
          durationMs: 12
        };
      })
      .mockResolvedValueOnce({
        content: 'Updated.\n\n<suggestions>["Next"]</suggestions>',
        toolCalls: [],
        durationMs: 10
      });

    (mockBridge.getEvents as jest.Mock).mockImplementationOnce(() => {
      const snap = engine.getActiveRunSnapshot();
      snapshotInFlightCount = snap?.inFlightTools.length || 0;
      return [{ id: 'ev-1', title: 'Watch - Video - YouTube' }];
    });

    await engine.prompt('Check today');

    expect(midRunSnapshotText).toBe('Partial thought');
    expect(snapshotInFlightCount).toBe(1);
    expect(engine.getActiveRunSnapshot()).toBeNull();
    expect(engine.isRunning()).toBe(false);
    expect(receivedTypes).toContain('run-start');
    expect(receivedTypes).toContain('turn-start');
    expect(receivedTypes).toContain('chunk');
    expect(receivedTypes).toContain('tool-start');
    expect(receivedTypes).toContain('tool-end');
    expect(receivedTypes).toContain('turn-complete');
    expect(receivedTypes).toContain('run-end');

    // Test abortActiveRun across subscribers without external AbortSignal
    chatCompletionFn.mockImplementationOnce(
      async (_msgs, _tools, config?: ChatCompletionRequestConfig) =>
        new Promise((_resolve, reject) => {
          config?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), {
            once: true
          });
        })
    );

    const outcomes: string[] = [];
    const unsubAbort = engine.subscribe(ev => {
      if (ev.type === 'run-end') {
        outcomes.push(ev.outcome);
      }
    });

    const pendingRun = engine.prompt('Slow prompt');
    await new Promise(r => window.setTimeout(r, 10));
    expect(engine.isRunning()).toBe(true);
    engine.abortActiveRun();
    await pendingRun;

    expect(outcomes).toEqual(['cancelled']);
    expect(engine.isRunning()).toBe(false);
    unsubAbort();

    // notifyProposalUpdated broadcasts & keeps getProposals status synced
    const prop = mockBridge.stageUpdateEvent?.('ev-1', { title: 'Clean' });
    expect(prop).toBeDefined();
    if (!prop) {
      throw new Error('Expected mockBridge.stageUpdateEvent to return a proposal');
    }
    activeSession.proposals = [prop];
    const updatedEvents: string[] = [];
    const unsubProp = engine.subscribe(ev => {
      if (ev.type === 'proposal-updated') {
        updatedEvents.push(`${ev.proposalId}:${ev.status}`);
      }
    });
    engine.notifyProposalUpdated(prop.id, 'APPROVED');
    expect(updatedEvents).toEqual([`${prop.id}:APPROVED`]);
    expect(engine.getProposals()[0].status).toBe('APPROVED');
    unsubProp();

    // init() does not clobber active session once initialized, and session mutators emit session-changed
    const sessionEvents: string[] = [];
    const unsubSess = engine.subscribe(ev => {
      if (ev.type === 'session-changed') {
        sessionEvents.push(ev.sessionId || '');
      }
    });
    await engine.init();
    expect(sessionEvents).toEqual([]);

    await engine.createNewSession('Session 2');
    await engine.switchSession('session-1');
    await engine.clearHistory();
    expect(sessionEvents).toEqual(['session-2', 'session-1', 'session-1']);

    unsubSess();
    unsubscribe();
  });

  it('emits deduplicated Reasoning and Preparing tool call status updates during streaming', async () => {
    const engine = new AgentEngine(
      mockClient,
      mockStorage as AgentStorage,
      mockLogger as AgentAuditLogger,
      mockBridge as AgentCalendarBridge,
      mockSpecLoader as SpecLoader
    );
    await engine.init();

    const statusUpdates: string[] = [];
    const unsub = engine.subscribe(ev => {
      if (ev.type === 'status' && ev.statusText) {
        statusUpdates.push(ev.statusText);
      }
    });

    chatCompletionFn
      .mockImplementationOnce(async (_msgs, _tools, config?: ChatCompletionRequestConfig) => {
        config?.callbacks?.onReasoningDelta?.('Step 1');
        config?.callbacks?.onReasoningDelta?.('Step 2');
        config?.callbacks?.onToolCallDelta?.([
          {
            id: 'tc1',
            type: 'function',
            function: { name: 'propose_update_event', arguments: '{"e' }
          }
        ]);
        config?.callbacks?.onToolCallDelta?.([
          {
            id: 'tc1',
            type: 'function',
            function: { name: 'propose_update_event', arguments: '{"eventId":"ev-1"}' }
          }
        ]);
        config?.callbacks?.onToolCallDelta?.([
          {
            id: 'tc1',
            type: 'function',
            function: { name: 'propose_update_event', arguments: '{"eventId":"ev-1"}' }
          },
          {
            id: 'tc2',
            type: 'function',
            function: { name: 'propose_update_event', arguments: '{"eventId":"ev-2"}' }
          }
        ]);
        return {
          content: '',
          toolCalls: [
            {
              id: 'tc1',
              type: 'function',
              function: {
                name: 'propose_update_event',
                arguments: '{"eventId":"ev-1","title":"Clean"}'
              }
            }
          ],
          durationMs: 15
        };
      })
      .mockResolvedValueOnce({
        content: 'Done.',
        toolCalls: [],
        durationMs: 10
      });

    await engine.prompt('Update my event');

    expect(statusUpdates).toContain('Reasoning...');
    expect(statusUpdates.filter(s => s === 'Reasoning...')).toHaveLength(1);
    expect(statusUpdates).toContain('Preparing event update...');
    expect(statusUpdates.filter(s => s === 'Preparing event update...')).toHaveLength(1);
    expect(statusUpdates).toContain('Preparing 2 event updates...');

    unsub();
  });

  it('detaches cancelled run cleanly on createNewSession, deduplicates concurrent init, and distinguishes 5xx retry label', async () => {
    const events: string[] = [];
    let resolveSlowSession!: (s: AgentSession) => void;
    const getActiveSessionSpy = jest.fn().mockImplementationOnce(
      () =>
        new Promise<AgentSession>(resolve => {
          resolveSlowSession = resolve;
        })
    );
    const initStorage = {
      ...mockStorage,
      getActiveSession: getActiveSessionSpy,
      createSession: jest.fn().mockResolvedValue({
        id: 'session-new',
        title: 'Fresh',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        proposals: []
      })
    } as unknown as AgentStorage;

    const engine = new AgentEngine(
      mockClient,
      initStorage,
      mockLogger as AgentAuditLogger,
      mockBridge as AgentCalendarBridge,
      mockSpecLoader as SpecLoader
    );

    const p1 = engine.init();
    const p2 = engine.init();
    resolveSlowSession(activeSession);
    await Promise.all([p1, p2]);
    expect(getActiveSessionSpy).toHaveBeenCalledTimes(1);

    const unsub = engine.subscribe(ev => {
      if (ev.type === 'run-end') {
        events.push(`run-end:${ev.outcome}`);
      } else if (ev.type === 'session-changed') {
        events.push(`session:${ev.sessionId}`);
      } else if (ev.type === 'chunk') {
        events.push(`chunk:${ev.chunk}`);
      } else if (ev.type === 'status' && ev.statusText) {
        events.push(`status:${ev.statusText}`);
      }
    });

    // Hanging run that settles late with late chunks
    let resolveHanging!: (val: unknown) => void;
    chatCompletionFn.mockImplementationOnce(async (_m, _t, cfg?: ChatCompletionRequestConfig) => {
      cfg?.callbacks?.onRetry?.(1, 3, 500, 'Server error (503)');
      return new Promise(resolve => {
        resolveHanging = resolve;
      });
    });

    const hungPrompt = engine.prompt('Old question');
    await new Promise(r => window.setTimeout(r, 10));
    expect(events).toContain('status:Retrying request (1/3)...');
    expect(engine.isRunning()).toBe(true);

    // Switching/creating session while running immediately detaches old run
    await engine.createNewSession('Fresh');
    expect(engine.getActiveRunSnapshot()).toBeNull();
    expect(engine.isRunning()).toBe(false);
    expect(events.indexOf('run-end:cancelled')).toBeGreaterThan(-1);
    expect(events.indexOf('session:session-new')).toBeGreaterThan(
      events.indexOf('run-end:cancelled')
    );

    // Late settlement of old promise never leaks into the new session
    resolveHanging({ content: 'Late zombie reply', toolCalls: [], durationMs: 5 });
    await hungPrompt;
    expect(engine.getMessages()).toEqual([]);
    expect(events.filter(e => e === 'chunk:Late zombie reply')).toHaveLength(0);

    unsub();
  });
});
