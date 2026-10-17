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
import type { AgentEngine } from '../core/AgentEngine';
import type { AgentCalendarBridge } from '../tools/AgentCalendarBridge';
import { initializeI18n, t } from '../../i18n/i18n';

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
      prompt: jest.fn().mockResolvedValue(undefined)
    };

    mockBridge = {};
  });

  afterEach(() => {
    (containerEl as HTMLElement & { empty: () => void }).empty();
  });

  it('renders with compact class when compact is true', () => {
    const chat = new AgentChatComponent(containerEl, {
      app: mockApp,
      engine: mockEngine as AgentEngine,
      bridge: mockBridge as AgentCalendarBridge,
      compact: true
    });

    const wrapper = containerEl.querySelector('.ofc-agent-chat-view-compact');
    expect(wrapper).not.toBeNull();
    chat.destroy();
  });

  it('renders messages using MarkdownRenderer for assistant responses', async () => {
    const markdownSpy = jest.spyOn(MarkdownRenderer, 'render');
    const tableMarkdown = '| Time | Event |\n|---|---|\n| 8:00 | Standup |';

    (mockEngine.getMessages as jest.Mock).mockReturnValue([
      { role: 'user', content: "What's my schedule?" },
      { role: 'assistant', content: tableMarkdown }
    ]);

    const chat = new AgentChatComponent(containerEl, {
      app: mockApp,
      engine: mockEngine as AgentEngine,
      bridge: mockBridge as AgentCalendarBridge,
      compact: true
    });

    expect(markdownSpy).toHaveBeenCalledWith(
      mockApp,
      tableMarkdown,
      expect.anything(),
      '',
      expect.anything()
    );

    const userMsg = containerEl.querySelector('.ofc-agent-msg-user');
    expect(userMsg?.textContent).toContain("What's my schedule?");

    const assistantMsg = containerEl.querySelector('.ofc-agent-msg-assistant');
    expect(assistantMsg).not.toBeNull();

    markdownSpy.mockRestore();
    chat.destroy();
  });

  it('populates prompt when suggestion pill is clicked', () => {
    const chat = new AgentChatComponent(containerEl, {
      app: mockApp,
      engine: mockEngine as AgentEngine,
      bridge: mockBridge as AgentCalendarBridge
    });

    const pill = containerEl.querySelector('.ofc-agent-pill') as HTMLElement;
    expect(pill).not.toBeNull();
    pill.click();

    const textarea = containerEl.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe(t('agent.suggestions.todayPrompt'));

    chat.destroy();
  });
});
