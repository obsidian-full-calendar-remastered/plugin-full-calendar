// Augment HTMLElement prototype for testing Obsidian DOM methods
const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
if (!proto.empty) {
  proto.empty = function (this: HTMLElement) {
    this.innerHTML = '';
  };
}
if (!proto.addClass) {
  proto.addClass = function (this: HTMLElement, cls: string) {
    this.classList.add(cls);
  };
}
if (!proto.removeClass) {
  proto.removeClass = function (this: HTMLElement, cls: string) {
    this.classList.remove(cls);
  };
}
if (!proto.toggleClass) {
  proto.toggleClass = function (this: HTMLElement, cls: string, force?: boolean) {
    this.classList.toggle(cls, force);
  };
}
if (!proto.setText) {
  proto.setText = function (this: HTMLElement, val: string) {
    this.textContent = val;
  };
}
if (!proto.getText) {
  proto.getText = function (this: HTMLElement) {
    return this.textContent || '';
  };
}
if (!proto.createEl) {
  proto.createEl = function (
    this: HTMLElement,
    tag: string,
    options?: { text?: string; cls?: string; attr?: Record<string, string> }
  ) {
    const el = document.createElement(tag);
    if (options?.text) el.textContent = options.text;
    if (options?.cls) el.className = options.cls;
    if (options?.attr) {
      for (const [k, v] of Object.entries(options.attr)) {
        el.setAttribute(k, v);
      }
    }
    this.appendChild(el);
    return el;
  };
}
if (!proto.createDiv) {
  proto.createDiv = function (this: HTMLElement, options?: { cls?: string; text?: string }) {
    return (this as unknown as { createEl: (tag: string, opts?: unknown) => HTMLElement }).createEl(
      'div',
      options
    );
  };
}
if (!proto.createSpan) {
  proto.createSpan = function (this: HTMLElement, options?: { cls?: string; text?: string }) {
    return (this as unknown as { createEl: (tag: string, opts?: unknown) => HTMLElement }).createEl(
      'span',
      options
    );
  };
}

import { App, MarkdownRenderer } from 'obsidian';
import { PluginState } from '../../../core/PluginState';
import { DEFAULT_SETTINGS } from '../../../types/settings';
import type EventCache from '../../../core/EventCache';
import type { ProviderRegistry } from '../../../providers/ProviderRegistry';
import { AgentChatComponent } from './AgentChatComponent';
import { AgentStepTraceView } from './AgentStepTraceView';
import { AgentEngine, type EngineCallbacks } from '../core/AgentEngine';
import type { AgentStorage } from '../core/AgentStorage';
import type { AgentAuditLogger } from '../core/AgentAuditLogger';
import type { SpecLoader } from '../core/SpecLoader';
import type { ChatCompletionRequestConfig, IAgentClient } from '../domain/contracts/IAgentClient';
import { AgentCalendarBridge } from '../tools/AgentCalendarBridge';
import type {
  AgentSession,
  DeleteEventProposal,
  EventProposal,
  UpdateEventProposal
} from '../types';
import { initializeI18n, t } from '../../i18n/i18n';

function makeProposal(
  id: string,
  title: string,
  status: 'PENDING' | 'APPROVED' = 'PENDING'
): UpdateEventProposal {
  const baseEvent = {
    title: `Old ${title}`,
    type: 'single' as const,
    date: '2026-11-16',
    endDate: null,
    allDay: true as const,
    category: 'Wellness',
    subCategory: 'YouTube'
  };
  return {
    id,
    type: 'UPDATE',
    status,
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    approvalHash: `hash_${id}`,
    calendarId: 'daily',
    calendarName: 'Daily Note',
    eventId: `ev_${id}`,
    originalEvent: baseEvent,
    updatedEvent: { ...baseEvent, title },
    changedFields: {
      title: { old: `Old ${title}`, new: title }
    }
  };
}

async function waitForCondition(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise(r => window.setTimeout(r, 5));
  }
}

describe('AgentChatComponent', () => {
  let containerEl: HTMLElement;
  let mockApp: App;
  let mockEngine: Partial<AgentEngine>;
  let mockBridge: Partial<AgentCalendarBridge>;

  beforeAll(async () => {
    const i18nApp = {
      vault: {
        getConfig: jest.fn().mockReturnValue('en')
      },
      loadLocalStorage: jest.fn().mockReturnValue('en')
    } as unknown as App;
    await initializeI18n(i18nApp, 'full-calendar-remastered');
  });

  beforeEach(() => {
    containerEl = document.createElement('div');
    mockApp = {
      workspace: {
        getLeavesOfType: jest.fn().mockReturnValue([]),
        getRightLeaf: jest.fn().mockReturnValue({
          setViewState: jest.fn().mockResolvedValue(undefined),
          view: null
        }),
        revealLeaf: jest.fn()
      }
    } as unknown as App;

    mockEngine = {
      getMessages: jest.fn().mockReturnValue([]),
      getProposals: jest.fn().mockReturnValue([]),
      clearHistory: jest.fn().mockResolvedValue(undefined),
      saveCurrentSession: jest.fn().mockResolvedValue(undefined),
      prompt: jest.fn().mockResolvedValue(undefined)
    };

    mockBridge = {
      isProposalActionable: jest
        .fn()
        .mockImplementation((p: EventProposal) => p.status === 'PENDING'),
      commitProposal: jest.fn().mockResolvedValue({ success: true, message: 'Applied' }),
      rejectProposal: jest.fn().mockReturnValue(true)
    };
  });

  afterEach(() => {
    (containerEl as HTMLElement & { empty: () => void }).empty();
  });

  it('renders with compact welcome mode when compact is true and omits pinned bottom pills bar', () => {
    const chat = new AgentChatComponent(containerEl, {
      app: mockApp,
      engine: mockEngine as AgentEngine,
      bridge: mockBridge as AgentCalendarBridge,
      compact: true
    });

    const wrapper = containerEl.querySelector('.ofc-agent-chat-view-compact');
    expect(wrapper).not.toBeNull();
    expect(containerEl.querySelector('.ofc-agent-welcome-compact')).not.toBeNull();
    expect(containerEl.querySelector('.ofc-agent-pills-row')).toBeNull();
    chat.destroy();
  });

  it('renders messages using MarkdownRenderer, historical step traces, and latest follow-up chips', () => {
    const markdownSpy = jest.spyOn(MarkdownRenderer, 'render');
    const tableMarkdown = '| Time | Event |\n|---|---|\n| 8:00 | Standup |';

    (mockEngine.getMessages as jest.Mock).mockReturnValue([
      { role: 'user', content: "What's my schedule?" },
      {
        role: 'assistant',
        content: tableMarkdown,
        toolSteps: [
          {
            id: 'tc_1',
            name: 'get_events',
            label: 'Reading events (2026-11-20 to 2026-11-20)',
            summary: '4 events',
            ok: true,
            durationMs: 25
          }
        ],
        suggestions: ['Add focus block', 'Check tomorrow']
      }
    ]);

    const chat = new AgentChatComponent(containerEl, {
      app: mockApp,
      engine: mockEngine as AgentEngine,
      bridge: mockBridge as AgentCalendarBridge,
      compact: false
    });

    expect(markdownSpy).toHaveBeenCalledWith(
      mockApp,
      tableMarkdown,
      expect.anything(),
      '',
      expect.anything()
    );

    expect(containerEl.querySelector('.ofc-agent-msg-user')?.textContent).toContain(
      "What's my schedule?"
    );
    expect(containerEl.querySelector('.ofc-agent-msg-assistant')).not.toBeNull();
    expect(containerEl.querySelector('.ofc-agent-trace-static')).not.toBeNull();
    expect(containerEl.querySelectorAll('.ofc-agent-followup-chip')).toHaveLength(2);

    markdownSpy.mockRestore();
    chat.destroy();
  });

  it('renders Copilot welcome screen on empty chat: auto-sends complete starters and pre-fills template starters', async () => {
    const chat = new AgentChatComponent(containerEl, {
      app: mockApp,
      engine: mockEngine as AgentEngine,
      bridge: mockBridge as AgentCalendarBridge
    });

    expect(containerEl.querySelector('.ofc-agent-welcome')).not.toBeNull();
    expect(containerEl.querySelector('.ofc-agent-welcome-title')?.textContent).toBe(
      t('agent.welcome.greeting')
    );

    const templateCard = containerEl.querySelector(
      '.ofc-agent-welcome-card[data-autosend="false"]'
    ) as HTMLButtonElement;
    expect(templateCard).not.toBeNull();
    templateCard.click();

    const textarea = containerEl.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe(t('agent.suggestions.addEventPrompt'));
    expect(mockEngine.prompt).not.toHaveBeenCalled();

    const autoSendCard = containerEl.querySelector(
      '.ofc-agent-welcome-card[data-autosend="true"]'
    ) as HTMLButtonElement;
    expect(autoSendCard).not.toBeNull();
    autoSendCard.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockEngine.prompt).toHaveBeenCalledWith(
      t('agent.suggestions.todayPrompt'),
      expect.anything(),
      expect.any(AbortSignal)
    );
    expect(containerEl.querySelector('.ofc-agent-welcome')).toBeNull();

    chat.destroy();
  });

  it('shows live multi-turn step trace across tool calls, masks streaming <suggestions>, and renders follow-up chips', async () => {
    (mockEngine.prompt as jest.Mock).mockImplementation(
      async (_input: string, callbacks: EngineCallbacks) => {
        callbacks.onUserMessageRecorded?.();
        callbacks.onTurnStart?.(1, 5);
        callbacks.onChunk?.('Checking your events...');
        callbacks.onTurnComplete?.(1, 'Checking your events...', []);

        callbacks.onToolCallStart?.({
          id: 'tc_1',
          name: 'get_events',
          label: 'Reading events (2026-11-15 to 2026-11-20)'
        });
        callbacks.onToolCallEnd?.({
          id: 'tc_1',
          name: 'get_events',
          label: 'Reading events (2026-11-15 to 2026-11-20)',
          summary: '34 events',
          ok: true,
          durationMs: 40
        });

        callbacks.onTurnStart?.(2, 5);
        callbacks.onStatus?.('Generating response...');

        // Verify trace is still active and visible during Turn 2 (even after Turn 1 emitted text)
        const traceWhileRunning = containerEl.querySelector('.ofc-agent-trace');
        expect(traceWhileRunning?.classList.contains('is-running')).toBe(true);
        expect(traceWhileRunning?.textContent).toContain('Generating response...');

        callbacks.onChunk?.('Found 34 events.\n\n<sug');
        callbacks.onChunk?.('gestions>["Clean YouTube titles", "Summarize week"]</suggestions>');
        callbacks.onTurnComplete?.(2, 'Found 34 events.', [
          'Clean YouTube titles',
          'Summarize week'
        ]);
        callbacks.onDone?.();
      }
    );

    const onSessionUpdated = jest.fn();
    const chat = new AgentChatComponent(containerEl, {
      app: mockApp,
      engine: mockEngine as AgentEngine,
      bridge: mockBridge as AgentCalendarBridge,
      onSessionUpdated
    });

    const textarea = containerEl.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'Check my week';
    const sendBtn = containerEl.querySelector('.ofc-agent-btn-send') as HTMLButtonElement;
    sendBtn.click();

    await new Promise(r => window.setTimeout(r, 10));

    expect(onSessionUpdated).toHaveBeenCalled();

    const assistantBubbles = containerEl.querySelectorAll('.ofc-agent-msg-assistant');
    expect(assistantBubbles).toHaveLength(2);
    expect(assistantBubbles[0].textContent).toBe('Checking your events...');
    expect(assistantBubbles[1].textContent).toBe('Found 34 events.');
    expect(containerEl.textContent).not.toContain('<suggestions>');

    const trace = containerEl.querySelector('.ofc-agent-trace') as HTMLDetailsElement;
    expect(trace.open).toBe(false);
    expect(trace.classList.contains('is-done')).toBe(true);
    expect(containerEl.querySelector('.ofc-agent-trace-step')?.textContent).toContain('34 events');

    const chips = containerEl.querySelectorAll('.ofc-agent-followup-chip');
    expect(chips).toHaveLength(2);
    expect(chips[0].textContent).toBe('Clean YouTube titles');

    // Clicking a follow-up chip removes chips and sends that prompt
    (chips[0] as HTMLButtonElement).click();
    await new Promise(r => window.setTimeout(r, 10));
    expect(mockEngine.prompt).toHaveBeenLastCalledWith(
      'Clean YouTube titles',
      expect.anything(),
      expect.any(AbortSignal)
    );

    chat.destroy();
  });

  it('does not render a false error card when user clicks Stop mid-request', async () => {
    (mockEngine.prompt as jest.Mock).mockImplementation(
      async (_input: string, _callbacks: EngineCallbacks, signal?: AbortSignal) => {
        await new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
        });
      }
    );

    const chat = new AgentChatComponent(containerEl, {
      app: mockApp,
      engine: mockEngine as AgentEngine,
      bridge: mockBridge as AgentCalendarBridge
    });

    const textarea = containerEl.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'Long task';
    (containerEl.querySelector('.ofc-agent-btn-send') as HTMLButtonElement).click();
    await Promise.resolve();

    const stopBtn = containerEl.querySelector('.ofc-agent-btn-stop') as HTMLButtonElement;
    stopBtn.click();

    await new Promise(r => window.setTimeout(r, 10));

    expect(containerEl.querySelector('.ofc-agent-msg-error')).toBeNull();
    const trace = containerEl.querySelector('.ofc-agent-trace');
    expect(trace?.classList.contains('is-cancelled')).toBe(true);

    chat.destroy();
  });

  it('updates individual proposal cards in-place without rebuilding DOM or resetting scrollTop', async () => {
    const p1 = makeProposal('p1', 'Watch - Video 1');
    const p2 = makeProposal('p2', 'Watch - Video 2');
    (mockEngine.getMessages as jest.Mock).mockReturnValue([
      { role: 'user', content: 'Clean titles' },
      { role: 'assistant', content: 'Staged 2 updates.' }
    ]);
    (mockEngine.getProposals as jest.Mock).mockReturnValue([p1, p2]);

    const onEventMutated = jest.fn();
    const chat = new AgentChatComponent(containerEl, {
      app: mockApp,
      engine: mockEngine as AgentEngine,
      bridge: mockBridge as AgentCalendarBridge,
      onEventMutated
    });

    const renderSpy = jest.spyOn(chat, 'renderMessages');
    const messagesEl = chat.getMessagesContainer();
    // Flush the initial renderMessages() scrollToBottom rAF before simulating user scroll up
    await new Promise(r => window.requestAnimationFrame(() => r(undefined)));
    Object.defineProperty(messagesEl, 'scrollHeight', { value: 600, configurable: true });
    messagesEl.scrollTop = 120;

    // Approve first card
    const cards = containerEl.querySelectorAll('.ofc-proposal-card');
    expect(cards).toHaveLength(2);
    const approveBtn1 = cards[0].querySelector('.ofc-agent-btn-primary') as HTMLButtonElement;
    approveBtn1.click();
    await waitForCondition(() => cards[0].classList.contains('ofc-proposal-card-resolved'));

    expect(renderSpy).not.toHaveBeenCalled();
    expect(messagesEl.scrollTop).toBe(120);
    expect(cards[0].textContent).toContain(t('agent.proposals.applied'));
    expect(onEventMutated).toHaveBeenCalledTimes(1);

    // Reject second card
    const rejectBtn2 = cards[1].querySelector('.ofc-agent-btn-danger') as HTMLButtonElement;
    rejectBtn2.click();
    await waitForCondition(() => cards[1].classList.contains('ofc-proposal-card-resolved'));

    expect(renderSpy).not.toHaveBeenCalled();
    expect(messagesEl.scrollTop).toBe(120);
    expect(cards[1].textContent).toContain(t('agent.proposals.rejected'));

    chat.destroy();
  });

  it('shows inline error and Retry apply when commitProposal fails instead of removing or marking Approved', async () => {
    const p1 = makeProposal('p1', 'Watch - Video 1');
    (mockEngine.getMessages as jest.Mock).mockReturnValue([
      { role: 'user', content: 'Update' },
      { role: 'assistant', content: 'Ready.' }
    ]);
    (mockEngine.getProposals as jest.Mock).mockReturnValue([p1]);
    (mockBridge.commitProposal as jest.Mock).mockResolvedValueOnce({
      success: false,
      message: 'Transient cache failure'
    });

    const chat = new AgentChatComponent(containerEl, {
      app: mockApp,
      engine: mockEngine as AgentEngine,
      bridge: mockBridge as AgentCalendarBridge
    });

    const approveBtn = containerEl.querySelector('.ofc-agent-btn-primary') as HTMLButtonElement;
    approveBtn.click();
    await new Promise(r => window.setTimeout(r, 10));

    const card = containerEl.querySelector('.ofc-proposal-card') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.classList.contains('ofc-proposal-card-resolved')).toBe(false);
    expect(card.querySelector('.ofc-proposal-error')?.textContent).toBe('Transient cache failure');
    expect(card.querySelector('.ofc-agent-btn-primary')?.textContent).toBe(
      t('agent.proposals.retryApply')
    );

    chat.destroy();
  });

  it('supports sequential Approve all and Reject all without scroll reset, and marks stale proposals Expired', async () => {
    const p1 = makeProposal('p1', 'Video 1');
    const p2 = makeProposal('p2', 'Video 2');
    const p3 = makeProposal('p3', 'Video 3');
    const stale = makeProposal('p_stale', 'Old Stale');

    (mockEngine.getMessages as jest.Mock).mockReturnValue([
      { role: 'user', content: 'Batch' },
      { role: 'assistant', content: 'Staged.' }
    ]);
    (mockEngine.getProposals as jest.Mock).mockReturnValue([p1, p2, p3, stale]);
    (mockBridge.isProposalActionable as jest.Mock).mockImplementation(
      (p: EventProposal) => p.id !== 'p_stale' && p.status === 'PENDING'
    );

    const executionOrder: string[] = [];
    (mockBridge.commitProposal as jest.Mock).mockImplementation(async (id: string) => {
      executionOrder.push(`start:${id}`);
      await new Promise(r => window.setTimeout(r, 5));
      executionOrder.push(`end:${id}`);
      return { success: true, message: 'OK' };
    });

    const onEventMutated = jest.fn();
    const chat = new AgentChatComponent(containerEl, {
      app: mockApp,
      engine: mockEngine as AgentEngine,
      bridge: mockBridge as AgentCalendarBridge,
      onEventMutated
    });

    const cards = containerEl.querySelectorAll('.ofc-proposal-card');
    expect(cards[3].textContent).toContain(t('agent.proposals.expired'));

    const bulkBar = containerEl.querySelector('.ofc-agent-bulk-bar') as HTMLElement;
    expect(bulkBar.classList.contains('is-hidden')).toBe(false);
    expect(bulkBar.textContent).toContain(t('agent.proposals.pendingCount', { count: 3 }));

    const messagesEl = chat.getMessagesContainer();
    await new Promise(r => window.requestAnimationFrame(() => r(undefined)));
    Object.defineProperty(messagesEl, 'scrollHeight', { value: 600, configurable: true });
    messagesEl.scrollTop = 95;

    const approveAllBtn = bulkBar.querySelector('.ofc-agent-btn-primary') as HTMLButtonElement;
    approveAllBtn.click();

    await waitForCondition(
      () => executionOrder.length === 6 && bulkBar.classList.contains('is-hidden')
    );

    // Strictly sequential order
    expect(executionOrder).toEqual([
      'start:p1',
      'end:p1',
      'start:p2',
      'end:p2',
      'start:p3',
      'end:p3'
    ]);
    expect(onEventMutated).toHaveBeenCalledTimes(1);
    expect(messagesEl.scrollTop).toBe(95);
    expect(bulkBar.classList.contains('is-hidden')).toBe(true);
    expect(cards[0].textContent).toContain(t('agent.proposals.applied'));
    expect(cards[1].textContent).toContain(t('agent.proposals.applied'));
    expect(cards[2].textContent).toContain(t('agent.proposals.applied'));

    chat.destroy();
  });

  it('supports Reject all via the bulk action bar', async () => {
    const p1 = makeProposal('p1', 'Video 1');
    const p2 = makeProposal('p2', 'Video 2');

    (mockEngine.getMessages as jest.Mock).mockReturnValue([
      { role: 'user', content: 'Batch' },
      { role: 'assistant', content: 'Staged.' }
    ]);
    (mockEngine.getProposals as jest.Mock).mockReturnValue([p1, p2]);

    const chat = new AgentChatComponent(containerEl, {
      app: mockApp,
      engine: mockEngine as AgentEngine,
      bridge: mockBridge as AgentCalendarBridge
    });

    const bulkBar = containerEl.querySelector('.ofc-agent-bulk-bar') as HTMLElement;
    const rejectAllBtn = bulkBar.querySelector('.ofc-agent-btn-danger') as HTMLButtonElement;
    rejectAllBtn.click();
    await new Promise(r => window.setTimeout(r, 10));

    expect(mockBridge.rejectProposal).toHaveBeenCalledTimes(2);
    expect(bulkBar.classList.contains('is-hidden')).toBe(true);
    const cards = containerEl.querySelectorAll('.ofc-proposal-card');
    expect(cards[0].textContent).toContain(t('agent.proposals.rejected'));
    expect(cards[1].textContent).toContain(t('agent.proposals.rejected'));

    chat.destroy();
  });

  it('synchronizes two mounted AgentChatComponents in real time including trace, proposals, Stop, and errors', async () => {
    PluginState.setSettings({
      ...DEFAULT_SETTINGS,
      timeFormat24h: true,
      enableAdvancedCategorization: true,
      categorySettings: [{ name: 'Wellness', color: '#88aa00' }]
    });

    const session: AgentSession = {
      id: 'sync-1',
      title: 'Default session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      proposals: []
    };

    const timedUpdateProposal: UpdateEventProposal = {
      ...makeProposal('p_sync', 'Watch - AI News'),
      originalEvent: {
        title: 'Wellness - YouTube - Old AI News',
        type: 'single',
        date: '2026-11-16',
        endDate: null,
        allDay: false,
        startTime: '09:24',
        endTime: '11:14',
        category: 'Wellness',
        subCategory: 'YouTube'
      },
      updatedEvent: {
        title: 'Watch - AI News',
        type: 'single',
        date: '2026-11-16',
        endDate: null,
        allDay: false,
        startTime: '09:24',
        endTime: '11:14',
        category: 'Wellness',
        subCategory: 'YouTube'
      },
      changedFields: {
        title: { old: 'Old AI News', new: 'Watch - AI News' }
      }
    };

    const chatCompletionMock = jest
      .fn()
      .mockImplementationOnce(
        async (_m: unknown, _t: unknown, cfg?: ChatCompletionRequestConfig) => {
          cfg?.callbacks?.onChunk?.('Looking it up...');
          return {
            content: 'Looking it up...',
            toolCalls: [
              {
                id: 'tc_sync_1',
                type: 'function',
                function: {
                  name: 'propose_update_event',
                  arguments: JSON.stringify({ eventId: 'ev_1', title: 'Watch - AI News' })
                }
              }
            ],
            durationMs: 120
          };
        }
      )
      .mockImplementationOnce(
        async (_m: unknown, _t: unknown, cfg?: ChatCompletionRequestConfig) => {
          cfg?.callbacks?.onChunk?.('Staged update.\n\n<suggestions>["Done"]</suggestions>');
          return {
            content: 'Staged update.\n\n<suggestions>["Done"]</suggestions>',
            toolCalls: [],
            durationMs: 50
          };
        }
      );

    const mockClient: IAgentClient = { chatCompletion: chatCompletionMock };
    const storage = {
      getActiveSession: jest.fn().mockResolvedValue(session),
      saveSession: jest.fn().mockResolvedValue(undefined),
      saveHistory: jest.fn().mockResolvedValue(undefined),
      clearHistory: jest.fn().mockResolvedValue(undefined)
    } as unknown as AgentStorage;
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    } as unknown as AgentAuditLogger;
    const syncBridge = {
      getCurrentTime: jest.fn().mockReturnValue({
        currentIsoTimestamp: '2026-11-20T12:00:00Z',
        currentDate: '2026-11-20',
        currentTime24h: '12:00',
        dayOfWeek: 'Friday',
        displayTimezone: 'UTC',
        timeFormat24h: true
      }),
      getEvents: jest.fn().mockReturnValue([]),
      stageUpdateEvent: jest.fn().mockReturnValue(timedUpdateProposal),
      isProposalActionable: jest
        .fn()
        .mockImplementation((p: EventProposal) => p.status === 'PENDING'),
      getProposal: jest
        .fn()
        .mockImplementation((id: string) =>
          timedUpdateProposal.id === id && timedUpdateProposal.status === 'PENDING'
            ? timedUpdateProposal
            : undefined
        ),
      commitProposal: jest.fn().mockImplementation(async () => {
        timedUpdateProposal.status = 'APPROVED';
        return { success: true, message: 'OK' };
      }),
      rejectProposal: jest.fn().mockReturnValue(true)
    } as unknown as AgentCalendarBridge;
    const specLoader = {
      buildSystemPrompt: jest.fn().mockResolvedValue('sys')
    } as unknown as SpecLoader;

    const realEngine = new AgentEngine(mockClient, storage, logger, syncBridge, specLoader);
    await realEngine.init();

    const leftContainer = document.createElement('div');
    const rightContainer = document.createElement('div');

    const leftHud = new AgentChatComponent(leftContainer, {
      app: mockApp,
      engine: realEngine,
      bridge: syncBridge,
      compact: true
    });
    const rightSidebar = new AgentChatComponent(rightContainer, {
      app: mockApp,
      engine: realEngine,
      bridge: syncBridge,
      compact: false
    });

    // Submit from right sidebar
    const rightInput = rightContainer.querySelector('textarea') as HTMLTextAreaElement;
    rightInput.value = 'Fix my event';
    (rightContainer.querySelector('.ofc-agent-btn-send') as HTMLButtonElement).click();

    await waitForCondition(
      () =>
        leftContainer.querySelectorAll('.ofc-proposal-card').length === 1 &&
        rightContainer.querySelectorAll('.ofc-proposal-card').length === 1 &&
        leftContainer.querySelectorAll('.ofc-agent-followup-chip').length === 1
    );

    // Both left cockpit and right sidebar received message, singular trace without duplicate timer, proposal, and follow-up chip
    expect(leftContainer.querySelector('.ofc-agent-msg-user')?.textContent).toContain(
      'Fix my event'
    );
    expect(rightContainer.querySelector('.ofc-agent-msg-user')?.textContent).toContain(
      'Fix my event'
    );
    expect(leftContainer.querySelector('.ofc-agent-followup-chip')?.textContent).toBe('Done');

    const leftTracePhase = leftContainer.querySelector('.ofc-agent-trace-phase')?.textContent || '';
    expect(leftTracePhase).toBe('Completed 1 step');
    expect(leftContainer.querySelector('.ofc-agent-trace-timer')?.textContent).toMatch(
      /^\d+\.\ds$/
    );

    // Approve in right sidebar -> left cockpit card updates in place without scroll reset
    await new Promise(r => window.requestAnimationFrame(() => r(undefined)));
    const leftMsgs = leftHud.getMessagesContainer();
    Object.defineProperty(leftMsgs, 'scrollHeight', { value: 600, configurable: true });
    leftMsgs.scrollTop = 140;

    (rightContainer.querySelector('.ofc-agent-btn-primary') as HTMLButtonElement).click();
    await waitForCondition(() =>
      Boolean(leftContainer.querySelector('.ofc-proposal-card-resolved'))
    );
    expect(leftMsgs.scrollTop).toBe(140);
    expect(leftContainer.querySelector('.ofc-proposal-card-resolved')?.textContent).toContain(
      t('agent.proposals.applied')
    );

    // Cross-panel Stop: start in left HUD, cancel from right sidebar
    chatCompletionMock.mockImplementationOnce(
      async (_m: unknown, _t: unknown, cfg?: ChatCompletionRequestConfig) =>
        new Promise((_resolve, reject) => {
          cfg?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), {
            once: true
          });
        })
    );
    const leftInput = leftContainer.querySelector('textarea') as HTMLTextAreaElement;
    leftInput.value = 'Slow task';
    (leftContainer.querySelector('.ofc-agent-btn-send') as HTMLButtonElement).click();
    await waitForCondition(
      () =>
        !(rightContainer.querySelector('.ofc-agent-btn-stop') as HTMLElement).classList.contains(
          'is-hidden'
        )
    );

    (rightContainer.querySelector('.ofc-agent-btn-stop') as HTMLButtonElement).click();
    await waitForCondition(() => !realEngine.isRunning());
    expect(leftContainer.querySelector('.ofc-agent-msg-error')).toBeNull();
    expect(rightContainer.querySelector('.ofc-agent-msg-error')).toBeNull();

    // Error propagation renders exactly one error card per panel
    chatCompletionMock.mockRejectedValueOnce(new Error('Network down'));
    rightInput.value = 'Fail test';
    (rightContainer.querySelector('.ofc-agent-btn-send') as HTMLButtonElement).click();
    await waitForCondition(() => !realEngine.isRunning());
    expect(leftContainer.querySelectorAll('.ofc-agent-msg-error')).toHaveLength(1);
    expect(rightContainer.querySelectorAll('.ofc-agent-msg-error')).toHaveLength(1);

    leftHud.destroy();
    rightSidebar.destroy();
    PluginState.clear();
  });

  it('hydrates a late-mounted view mid-stream with partial text, steps, and active Stop control', async () => {
    const session: AgentSession = {
      id: 'hyd-1',
      title: 'Default session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      proposals: []
    };

    let releaseTurn2!: () => void;
    const turn2Gate = new Promise<void>(resolve => {
      releaseTurn2 = resolve;
    });

    const chatCompletionMock = jest
      .fn()
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          {
            id: 'tc_hyd_1',
            type: 'function',
            function: {
              name: 'get_events',
              arguments: '{"startDate":"2026-11-16","endDate":"2026-11-16"}'
            }
          }
        ],
        durationMs: 20
      })
      .mockImplementationOnce(
        async (_m: unknown, _t: unknown, cfg?: ChatCompletionRequestConfig) => {
          cfg?.callbacks?.onChunk?.('Streaming partial answer...');
          await turn2Gate;
          return {
            content: 'Streaming partial answer... finished.',
            toolCalls: [],
            durationMs: 25
          };
        }
      );

    const storage = {
      getActiveSession: jest.fn().mockResolvedValue(session),
      saveSession: jest.fn().mockResolvedValue(undefined),
      saveHistory: jest.fn().mockResolvedValue(undefined)
    } as unknown as AgentStorage;
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    } as unknown as AgentAuditLogger;
    const hydBridge = {
      getCurrentTime: jest.fn().mockReturnValue({
        currentIsoTimestamp: '2026-11-20T12:00:00Z',
        currentDate: '2026-11-20',
        currentTime24h: '12:00',
        dayOfWeek: 'Friday',
        displayTimezone: 'UTC',
        timeFormat24h: true
      }),
      getEvents: jest.fn().mockReturnValue([]),
      isProposalActionable: jest.fn().mockReturnValue(true)
    } as unknown as AgentCalendarBridge;
    const specLoader = {
      buildSystemPrompt: jest.fn().mockResolvedValue('sys')
    } as unknown as SpecLoader;

    const realEngine = new AgentEngine(
      { chatCompletion: chatCompletionMock },
      storage,
      logger,
      hydBridge,
      specLoader
    );
    await realEngine.init();

    const firstContainer = document.createElement('div');
    const firstView = new AgentChatComponent(firstContainer, {
      app: mockApp,
      engine: realEngine,
      bridge: hydBridge
    });

    const input = firstContainer.querySelector('textarea') as HTMLTextAreaElement;
    input.value = 'Check schedule';
    (firstContainer.querySelector('.ofc-agent-btn-send') as HTMLButtonElement).click();

    await waitForCondition(
      () => (realEngine.getActiveRunSnapshot()?.streamingText.length ?? 0) > 0
    );

    // Mount second view mid-stream
    const secondContainer = document.createElement('div');
    const lateView = new AgentChatComponent(secondContainer, {
      app: mockApp,
      engine: realEngine,
      bridge: hydBridge
    });

    expect(secondContainer.querySelectorAll('.ofc-agent-msg-user')).toHaveLength(1);
    expect(secondContainer.querySelector('.ofc-agent-tool-badge')).toBeNull();
    expect(secondContainer.querySelectorAll('.ofc-agent-trace-step')).toHaveLength(1);
    expect(secondContainer.textContent).toContain('Streaming partial answer...');
    expect(
      (secondContainer.querySelector('.ofc-agent-btn-stop') as HTMLElement).classList.contains(
        'is-hidden'
      )
    ).toBe(false);

    releaseTurn2();
    await waitForCondition(() => !realEngine.isRunning());

    expect(secondContainer.textContent).toContain('Streaming partial answer... finished.');
    expect(secondContainer.querySelector('.ofc-agent-trace')?.classList.contains('is-done')).toBe(
      true
    );

    // Closing first view does not crash or alter anything already done
    firstView.destroy();
    lateView.destroy();
  });

  it('renders modern schedule & stacked diff cards and toggles category breadcrumbs with enableAdvancedCategorization', () => {
    const timedUpdate: UpdateEventProposal = {
      ...makeProposal('u_modern', 'Watch - AI News'),
      originalEvent: {
        title: 'Wellness - YouTube - Old AI News',
        type: 'single',
        date: '2026-11-16',
        endDate: null,
        allDay: false,
        startTime: '09:24',
        endTime: '11:14',
        category: 'Wellness',
        subCategory: 'YouTube'
      },
      updatedEvent: {
        title: 'Wellness - Watch - AI News',
        type: 'single',
        date: '2026-11-16',
        endDate: null,
        allDay: false,
        startTime: '09:24',
        endTime: '11:14',
        category: 'Wellness',
        subCategory: 'YouTube'
      },
      changedFields: {
        title: { old: 'Old AI News', new: 'Watch - AI News' }
      }
    };

    const timedDelete: DeleteEventProposal = {
      id: 'd_modern',
      type: 'DELETE',
      status: 'PENDING',
      createdAt: Date.now(),
      calendarId: 'daily',
      calendarName: 'Daily Note',
      eventId: 'ev_del',
      eventTitle: 'Wellness - YouTube - Duplicate Watch',
      eventDate: '2026-11-20',
      eventAllDay: false,
      eventStartTime: '13:50',
      eventEndTime: '14:11',
      eventCategory: 'Wellness',
      eventSubCategory: 'YouTube',
      reason: 'Duplicate entry'
    };

    (mockEngine.getMessages as jest.Mock).mockReturnValue([
      { role: 'user', content: 'Review events' },
      { role: 'assistant', content: 'Staged update and delete.' }
    ]);
    (mockEngine.getProposals as jest.Mock).mockReturnValue([timedUpdate, timedDelete]);

    // 1. Advanced categorization ON (24h)
    PluginState.setSettings({
      ...DEFAULT_SETTINGS,
      timeFormat24h: true,
      enableAdvancedCategorization: true,
      categorySettings: [{ name: 'Wellness', color: '#448800' }]
    });

    const onContainer = document.createElement('div');
    const chatOn = new AgentChatComponent(onContainer, {
      app: mockApp,
      engine: mockEngine as AgentEngine,
      bridge: mockBridge as AgentCalendarBridge
    });

    const onCards = onContainer.querySelectorAll('.ofc-proposal-card');
    expect(onCards).toHaveLength(2);
    expect(onCards[0].querySelector('.ofc-proposal-schedule')?.textContent).toBe(
      'Mon, Nov 16 \u00b7 09:24\u201311:14'
    );
    expect(onCards[0].querySelector('.ofc-proposal-cat-row')?.textContent).toContain('Wellness');
    expect(onCards[0].querySelector('.ofc-proposal-cat-row')?.textContent).toContain('YouTube');
    expect(onCards[0].querySelector('.ofc-proposal-diff-old')?.textContent).toContain(
      '\u2212Old AI News'
    );
    expect(onCards[0].querySelector('.ofc-proposal-diff-new')?.textContent).toContain(
      '+Watch - AI News'
    );

    expect(onCards[1].querySelector('.ofc-proposal-schedule')?.textContent).toBe(
      'Fri, Nov 20 \u00b7 13:50\u201314:11'
    );
    expect(onCards[1].querySelector('.ofc-proposal-title')?.textContent).toBe('Duplicate Watch');

    chatOn.destroy();

    // 2. Advanced categorization OFF (12h)
    PluginState.setSettings({
      ...DEFAULT_SETTINGS,
      timeFormat24h: false,
      enableAdvancedCategorization: false,
      categorySettings: [{ name: 'Wellness', color: '#448800' }]
    });

    const offContainer = document.createElement('div');
    const chatOff = new AgentChatComponent(offContainer, {
      app: mockApp,
      engine: mockEngine as AgentEngine,
      bridge: mockBridge as AgentCalendarBridge
    });

    const offCards = offContainer.querySelectorAll('.ofc-proposal-card');
    expect(offCards[0].querySelector('.ofc-proposal-cat-row')).toBeNull();
    expect(offCards[1].querySelector('.ofc-proposal-cat-row')).toBeNull();
    expect(offCards[0].querySelector('.ofc-proposal-title')?.textContent).toBe(
      'Wellness - Watch - AI News'
    );
    expect(offCards[1].querySelector('.ofc-proposal-schedule')?.textContent).toBe(
      'Fri, Nov 20 \u00b7 1:50 PM\u20132:11 PM'
    );

    chatOff.destroy();
    PluginState.clear();
  });

  it('displays docked live status bar across both panels, re-anchors multi-turn traces below intermediate bubbles, and clears interval on destroy', async () => {
    const session: AgentSession = {
      id: 'live-bar-1',
      title: 'Default session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      proposals: []
    };

    let releaseTurn2!: () => void;
    const turn2Gate = new Promise<void>(resolve => {
      releaseTurn2 = resolve;
    });

    const chatCompletionMock = jest
      .fn()
      .mockImplementationOnce(
        async (_m: unknown, _t: unknown, cfg?: ChatCompletionRequestConfig) => {
          cfg?.callbacks?.onChunk?.('Checking history first.');
          cfg?.callbacks?.onToolCallDelta?.([
            { id: 'tc_lb_1', type: 'function', function: { name: 'get_events', arguments: '{}' } }
          ]);
          return {
            content: 'Checking history first.',
            toolCalls: [
              {
                id: 'tc_lb_1',
                type: 'function',
                function: {
                  name: 'get_events',
                  arguments: JSON.stringify({ startDate: '2026-11-15', endDate: '2026-11-20' })
                }
              }
            ],
            durationMs: 25
          };
        }
      )
      .mockImplementationOnce(
        async (_m: unknown, _t: unknown, cfg?: ChatCompletionRequestConfig) => {
          cfg?.callbacks?.onReasoningDelta?.('Analyzing patterns...');
          await turn2Gate;
          return {
            content: 'All done.',
            toolCalls: [],
            durationMs: 30
          };
        }
      );

    const storage = {
      getActiveSession: jest.fn().mockResolvedValue(session),
      saveSession: jest.fn().mockResolvedValue(undefined),
      saveHistory: jest.fn().mockResolvedValue(undefined)
    } as unknown as AgentStorage;
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    } as unknown as AgentAuditLogger;
    const liveBridge = {
      getCurrentTime: jest.fn().mockReturnValue({
        currentIsoTimestamp: '2026-11-20T12:00:00Z',
        currentDate: '2026-11-20',
        currentTime24h: '12:00',
        dayOfWeek: 'Friday',
        displayTimezone: 'UTC',
        timeFormat24h: true
      }),
      getEvents: jest.fn().mockReturnValue([]),
      isProposalActionable: jest.fn().mockReturnValue(true)
    } as unknown as AgentCalendarBridge;
    const specLoader = {
      buildSystemPrompt: jest.fn().mockResolvedValue('sys')
    } as unknown as SpecLoader;

    const realEngine = new AgentEngine(
      { chatCompletion: chatCompletionMock },
      storage,
      logger,
      liveBridge,
      specLoader
    );
    await realEngine.init();

    const leftEl = document.createElement('div');
    const rightEl = document.createElement('div');
    const leftView = new AgentChatComponent(leftEl, {
      app: mockApp,
      engine: realEngine,
      bridge: liveBridge,
      compact: true
    });
    const rightView = new AgentChatComponent(rightEl, {
      app: mockApp,
      engine: realEngine,
      bridge: liveBridge,
      compact: false
    });

    // Initially hidden when idle
    expect(leftEl.querySelector('.ofc-agent-live-bar')?.classList.contains('is-hidden')).toBe(true);
    expect(rightEl.querySelector('.ofc-agent-live-bar')?.classList.contains('is-hidden')).toBe(
      true
    );

    const input = rightEl.querySelector('textarea') as HTMLTextAreaElement;
    input.value = 'Inspect events';
    (rightEl.querySelector('.ofc-agent-btn-send') as HTMLButtonElement).click();

    await waitForCondition(
      () =>
        leftEl.querySelector('.ofc-agent-live-bar-text')?.textContent === 'Reasoning...' &&
        !(leftEl.querySelector('.ofc-agent-live-bar') as HTMLElement).classList.contains(
          'is-hidden'
        )
    );

    // Docked bar shows step count & status on BOTH panels
    expect(leftEl.querySelector('.ofc-agent-live-bar-steps')?.textContent).toBe('1 step');
    expect(rightEl.querySelector('.ofc-agent-live-bar-steps')?.textContent).toBe('1 step');

    // Trace was re-anchored below Turn 1's intermediate bubble inside messagesContainer
    const children = Array.from(rightView.getMessagesContainer().children);
    const turn1BubbleIdx = children.findIndex(
      el =>
        el.classList.contains('ofc-agent-msg-assistant') &&
        el.textContent?.includes('Checking history first.')
    );
    const traceIdx = children.findIndex(el => el.classList.contains('ofc-agent-trace'));
    expect(turn1BubbleIdx).toBeGreaterThan(-1);
    expect(traceIdx).toBeGreaterThan(turn1BubbleIdx);

    // Late-mounted third view mid-run hydrates docked live bar too
    const lateEl = document.createElement('div');
    const lateView = new AgentChatComponent(lateEl, {
      app: mockApp,
      engine: realEngine,
      bridge: liveBridge
    });
    const lateBar = lateEl.querySelector('.ofc-agent-live-bar') as HTMLElement;
    expect(lateBar.classList.contains('is-hidden')).toBe(false);
    expect(lateEl.querySelector('.ofc-agent-live-bar-text')?.textContent).toBe('Reasoning...');
    expect(lateEl.querySelector('.ofc-agent-live-bar-steps')?.textContent).toBe('1 step');

    releaseTurn2();
    await waitForCondition(() => !realEngine.isRunning());

    // Live bars hide cleanly on run completion
    expect(leftEl.querySelector('.ofc-agent-live-bar')?.classList.contains('is-hidden')).toBe(true);
    expect(rightEl.querySelector('.ofc-agent-live-bar')?.classList.contains('is-hidden')).toBe(
      true
    );
    expect(lateEl.querySelector('.ofc-agent-live-bar')?.classList.contains('is-hidden')).toBe(true);

    // Destroying clears any running timer without error
    const clearSpy = jest.spyOn(window, 'clearInterval');
    chatCompletionMock.mockImplementationOnce(
      async (_m: unknown, _t: unknown, cfg?: ChatCompletionRequestConfig) =>
        new Promise((_resolve, reject) => {
          cfg?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), {
            once: true
          });
        })
    );
    input.value = 'Run and unmount';
    (rightEl.querySelector('.ofc-agent-btn-send') as HTMLButtonElement).click();
    await waitForCondition(() => realEngine.isRunning());
    lateView.destroy();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();

    realEngine.abortActiveRun();
    await waitForCondition(() => !realEngine.isRunning());

    leftView.destroy();
    rightView.destroy();
  });

  it('keeps Retry apply and Reject buttons clickable after transient failure and allows successful retry', async () => {
    const p1 = makeProposal('p_retry', 'Watch - Retryable');
    (mockEngine.getMessages as jest.Mock).mockReturnValue([
      { role: 'user', content: 'Update' },
      { role: 'assistant', content: 'Ready.' }
    ]);
    (mockEngine.getProposals as jest.Mock).mockReturnValue([p1]);
    (mockBridge.commitProposal as jest.Mock)
      .mockResolvedValueOnce({ success: false, message: 'Transient error' })
      .mockResolvedValueOnce({ success: true, message: 'Applied OK' });

    const chat = new AgentChatComponent(containerEl, {
      app: mockApp,
      engine: mockEngine as AgentEngine,
      bridge: mockBridge as AgentCalendarBridge
    });

    (containerEl.querySelector('.ofc-agent-btn-primary') as HTMLButtonElement).click();
    await waitForCondition(
      () => containerEl.querySelector('.ofc-proposal-error')?.textContent === 'Transient error'
    );

    const retryBtn = containerEl.querySelector('.ofc-agent-btn-primary') as HTMLButtonElement;
    const rejectBtn = containerEl.querySelector('.ofc-agent-btn-danger') as HTMLButtonElement;
    expect(retryBtn.textContent).toBe(t('agent.proposals.retryApply'));
    expect(retryBtn.disabled).toBe(false);
    expect(rejectBtn.disabled).toBe(false);

    retryBtn.click();
    await waitForCondition(() => Boolean(containerEl.querySelector('.ofc-proposal-card-resolved')));
    expect(containerEl.querySelector('.ofc-proposal-card-resolved')?.textContent).toContain(
      t('agent.proposals.applied')
    );

    chat.destroy();
  });

  it('recomputes approvalHash on partial BATCH_CREATE uncheck, syncs selection across panels, and commits cleanly through real AgentCalendarBridge', async () => {
    const mockCache = {
      getAllEvents: jest.fn().mockReturnValue([]),
      getEventById: jest.fn(),
      addEvent: jest.fn().mockResolvedValue(true),
      updateEventWithId: jest.fn().mockResolvedValue(true),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      store: { getEventDetails: jest.fn() }
    };
    const mockRegistry = {
      getAllSources: jest
        .fn()
        .mockReturnValue([
          { id: 'work-cal', name: 'Work Calendar', color: '#ff0000', type: 'local' }
        ]),
      getInstance: jest.fn().mockReturnValue({
        getCapabilities: () => ({ canCreate: true, canEdit: true })
      })
    };
    PluginState.setCache(mockCache as unknown as EventCache);
    PluginState.setProviderRegistry(mockRegistry as unknown as ProviderRegistry);
    PluginState.setSettings({
      ...DEFAULT_SETTINGS,
      enableAdvancedCategorization: true,
      categorySettings: [{ name: 'Work', color: '#ff0000' }]
    });

    const realBridge = new AgentCalendarBridge();
    const batchProp = realBridge.stageBatchCreateEvents('work-cal', [
      { title: 'Session A', category: 'Work', date: '2026-11-21', allDay: true },
      { title: 'Session B', category: 'Work', date: '2026-11-22', allDay: true }
    ]);

    const session: AgentSession = {
      id: 'batch-sync',
      title: 'Default session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [
        { role: 'user', content: 'Import both' },
        { role: 'assistant', content: 'Staged batch.' }
      ],
      proposals: [batchProp]
    };

    const storage = {
      getActiveSession: jest.fn().mockResolvedValue(session),
      saveSession: jest.fn().mockResolvedValue(undefined)
    } as unknown as AgentStorage;
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    } as unknown as AgentAuditLogger;
    const specLoader = {
      buildSystemPrompt: jest.fn().mockResolvedValue('sys')
    } as unknown as SpecLoader;
    const realEngine = new AgentEngine(
      { chatCompletion: jest.fn() },
      storage,
      logger,
      realBridge,
      specLoader
    );
    await realEngine.init();

    const panelAEl = document.createElement('div');
    const panelBEl = document.createElement('div');
    const panelA = new AgentChatComponent(panelAEl, {
      app: mockApp,
      engine: realEngine,
      bridge: realBridge,
      compact: true
    });
    const panelB = new AgentChatComponent(panelBEl, {
      app: mockApp,
      engine: realEngine,
      bridge: realBridge,
      compact: false
    });

    const hashBefore = batchProp.approvalHash;
    const checkboxesA = panelAEl.querySelectorAll<HTMLInputElement>(
      '.ofc-proposal-batch-row input'
    );
    expect(checkboxesA).toHaveLength(2);
    checkboxesA[1].checked = false;
    checkboxesA[1].dispatchEvent(new Event('change'));

    expect(batchProp.approvalHash).not.toBe(hashBefore);
    const checkboxesB = panelBEl.querySelectorAll<HTMLInputElement>(
      '.ofc-proposal-batch-row input'
    );
    expect(checkboxesB[1].checked).toBe(false);
    expect(panelBEl.querySelector('.ofc-agent-btn-primary')?.textContent).toBe(
      t('agent.proposals.approveSelected', { count: 1 })
    );

    (panelBEl.querySelector('.ofc-agent-btn-primary') as HTMLButtonElement).click();
    await waitForCondition(() => Boolean(panelAEl.querySelector('.ofc-proposal-card-resolved')));

    expect(mockCache.addEvent).toHaveBeenCalledTimes(1);
    expect(panelBEl.querySelector('.ofc-proposal-card-resolved')?.textContent).toContain(
      t('agent.proposals.applied')
    );

    panelA.destroy();
    panelB.destroy();
    PluginState.clear();
  });

  it('renders non-English (de) trace without literal {{seconds}} placeholders', async () => {
    const deApp = {
      vault: { getConfig: jest.fn().mockReturnValue('de') },
      loadLocalStorage: jest.fn().mockReturnValue('de')
    } as unknown as App;
    await initializeI18n(deApp, 'full-calendar-remastered');

    try {
      const doneWrap = document.createElement('div');
      const doneTrace = new AgentStepTraceView(doneWrap);
      doneTrace.addToolStart('s1', 'Step 1');
      doneTrace.addToolStart('s2', 'Step 2');
      doneTrace.finish('done');
      const donePhase = doneWrap.querySelector('.ofc-agent-trace-phase')?.textContent || '';
      expect(donePhase).not.toContain('{{seconds}}');
      expect(donePhase).not.toMatch(/\ds$/);
      doneTrace.destroy();

      const cancelWrap = document.createElement('div');
      const cancelTrace = new AgentStepTraceView(cancelWrap);
      cancelTrace.finish('cancelled');
      expect(cancelWrap.querySelector('.ofc-agent-trace-phase')?.textContent).not.toContain(
        '{{seconds}}'
      );
      cancelTrace.destroy();

      const failWrap = document.createElement('div');
      const failTrace = new AgentStepTraceView(failWrap);
      failTrace.finish('error');
      expect(failWrap.querySelector('.ofc-agent-trace-phase')?.textContent).not.toContain(
        '{{seconds}}'
      );
      failTrace.destroy();
    } finally {
      const enApp = {
        vault: { getConfig: jest.fn().mockReturnValue('en') },
        loadLocalStorage: jest.fn().mockReturnValue('en')
      } as unknown as App;
      await initializeI18n(enApp, 'full-calendar-remastered');
    }
  });

  it('cleans up standalone instances via load(), handles mid-run session reset, discards cancelled partial bubbles, and updates cards on settings change without scroll jump', async () => {
    const loadSpy = jest.spyOn(AgentChatComponent.prototype, 'load');
    const session: AgentSession = {
      id: 'sess-clean',
      title: 'Default session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      proposals: []
    };
    const nextSession: AgentSession = {
      id: 'sess-next',
      title: 'Session 2',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      proposals: []
    };
    const storage = {
      getActiveSession: jest.fn().mockResolvedValue(session),
      createSession: jest.fn().mockResolvedValue(nextSession),
      saveSession: jest.fn().mockResolvedValue(undefined),
      clearHistory: jest.fn().mockResolvedValue(undefined)
    } as unknown as AgentStorage;
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    } as unknown as AgentAuditLogger;
    const bridgeMock = {
      getCurrentTime: jest.fn().mockReturnValue({
        currentIsoTimestamp: '2026-11-20T12:00:00Z',
        currentDate: '2026-11-20',
        currentTime24h: '12:00',
        dayOfWeek: 'Friday',
        displayTimezone: 'UTC',
        timeFormat24h: true
      }),
      isProposalActionable: jest
        .fn()
        .mockImplementation((p: EventProposal) => p.status === 'PENDING')
    } as unknown as AgentCalendarBridge;
    const specLoader = {
      buildSystemPrompt: jest.fn().mockResolvedValue('sys')
    } as unknown as SpecLoader;

    const chatMock = jest
      .fn()
      .mockImplementationOnce(
        async (_m: unknown, _t: unknown, cfg?: ChatCompletionRequestConfig) => {
          cfg?.callbacks?.onChunk?.('Partial aborted answer');
          return new Promise((_resolve, reject) => {
            cfg?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), {
              once: true
            });
          });
        }
      );

    const realEngine = new AgentEngine(
      { chatCompletion: chatMock },
      storage,
      logger,
      bridgeMock,
      specLoader
    );
    await realEngine.init();

    const soloEl = document.createElement('div');
    const soloChat = new AgentChatComponent(soloEl, {
      app: mockApp,
      engine: realEngine,
      bridge: bridgeMock
    });
    expect(loadSpy).toHaveBeenCalledTimes(1);
    loadSpy.mockRestore();

    // Start run, stream partial text, then abort -> cancelled partial bubble removed
    const soloInput = soloEl.querySelector('textarea') as HTMLTextAreaElement;
    soloInput.value = 'Cancel mid stream';
    (soloEl.querySelector('.ofc-agent-btn-send') as HTMLButtonElement).click();
    await waitForCondition(() => (soloEl.textContent || '').includes('Partial aborted answer'));

    realEngine.abortActiveRun();
    await waitForCondition(() => !realEngine.isRunning());
    expect(soloEl.querySelector('.ofc-agent-msg-assistant')).toBeNull();

    // Mid-run createNewSession leaves new session clean with Welcome view & hidden live bar
    chatMock.mockImplementationOnce(
      async (_m: unknown, _t: unknown, cfg?: ChatCompletionRequestConfig) =>
        new Promise((_resolve, reject) => {
          cfg?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), {
            once: true
          });
        })
    );
    soloInput.value = 'Switch away';
    (soloEl.querySelector('.ofc-agent-btn-send') as HTMLButtonElement).click();
    await waitForCondition(() => realEngine.isRunning());

    await realEngine.createNewSession();
    expect(soloEl.querySelector('.ofc-agent-welcome')).not.toBeNull();
    expect(soloEl.querySelector('.ofc-agent-trace')).toBeNull();
    expect(soloEl.querySelector('.ofc-agent-live-bar')?.classList.contains('is-hidden')).toBe(true);

    // Live settings-changed re-renders proposal cards without resetting scrollTop
    PluginState.setSettings({
      ...DEFAULT_SETTINGS,
      enableAdvancedCategorization: true,
      categorySettings: [{ name: 'Wellness', color: '#448800' }]
    });
    const prop = makeProposal('p_live_cfg', 'Watch - News');
    nextSession.messages = [
      { role: 'user', content: 'Show' },
      { role: 'assistant', content: 'Staged.' }
    ];
    nextSession.proposals = [prop];
    soloChat.renderMessages();

    await new Promise(r => window.requestAnimationFrame(() => r(undefined)));
    const msgsEl = soloChat.getMessagesContainer();
    Object.defineProperty(msgsEl, 'scrollHeight', { value: 600, configurable: true });
    msgsEl.scrollTop = 110;

    expect(soloEl.querySelector('.ofc-proposal-cat-row')).not.toBeNull();
    PluginState.setSettings({
      ...DEFAULT_SETTINGS,
      enableAdvancedCategorization: false
    });
    realEngine.notifySettingsUpdated();
    expect(soloEl.querySelector('.ofc-proposal-cat-row')).toBeNull();
    expect(msgsEl.scrollTop).toBe(110);

    soloChat.unload();
    PluginState.clear();
  });
});
