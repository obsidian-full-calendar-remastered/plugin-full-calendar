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
import { AgentChatComponent } from './AgentChatComponent';
import type { AgentEngine, EngineCallbacks } from '../core/AgentEngine';
import type { AgentCalendarBridge } from '../tools/AgentCalendarBridge';
import type { EventProposal, UpdateEventProposal } from '../types';
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
});
