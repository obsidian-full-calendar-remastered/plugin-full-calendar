/**
 * @file AgentEngine.test.ts
 * @brief Unit tests for AgentEngine multi-turn summary continuation, structured traces, and cancellation.
 */

import { AgentEngine } from './AgentEngine';
import type { IAgentClient } from '../domain/contracts/IAgentClient';
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
});
