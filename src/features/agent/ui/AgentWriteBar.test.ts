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

import { App } from 'obsidian';
import { AgentWriteBar } from './AgentWriteBar';
import { AgentSidebarView } from './AgentSidebarView';
import type { AgentEngine } from '../core/AgentEngine';
import type { AgentAuditLogger } from '../core/AgentAuditLogger';
import type { AgentCalendarBridge } from '../tools/AgentCalendarBridge';
import { initializeI18n, t } from '../../i18n/i18n';

describe('AgentWriteBar', () => {
  let containerEl: HTMLElement;
  let mockApp: App;
  let revealLeafMock: jest.Mock;
  let mockEngine: Partial<AgentEngine>;
  let mockLogger: Partial<AgentAuditLogger>;
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
    revealLeafMock = jest.fn();
    mockApp = {
      workspace: {
        getLeavesOfType: jest.fn().mockReturnValue([]),
        getRightLeaf: jest.fn().mockReturnValue({
          setViewState: jest.fn().mockResolvedValue(undefined),
          view: null
        }),
        revealLeaf: revealLeafMock
      }
    } as unknown as App;

    mockEngine = {
      getMessages: jest.fn().mockReturnValue([]),
      getProposals: jest.fn().mockReturnValue([]),
      clearHistory: jest.fn().mockResolvedValue(undefined),
      prompt: jest.fn().mockResolvedValue(undefined)
    };

    mockLogger = {};
    mockBridge = {};
  });

  afterEach(() => {
    (containerEl as HTMLElement & { empty: () => void }).empty();
  });

  it('renders the open panel button instead of the audit logs button', () => {
    const writeBar = new AgentWriteBar(
      containerEl,
      mockApp,
      mockEngine as AgentEngine,
      mockLogger as AgentAuditLogger,
      mockBridge as AgentCalendarBridge
    );

    // Ensure audit button (scroll-text) is NOT present
    const auditBtn = containerEl.querySelector(`[title="${t('agent.sidebar.viewAuditLogs')}"]`);
    expect(auditBtn).toBeNull();

    // Ensure open panel button is present
    const openPanelBtn = containerEl.querySelector(
      `[title="${t('agent.writeBar.openAgentPanel')}"]`
    );
    expect(openPanelBtn).not.toBeNull();
    expect(openPanelBtn?.getAttribute('aria-label')).toBe(t('agent.writeBar.openAgentPanel'));

    writeBar.destroy();
  });

  it('calls onOpenSidebar callback with the prompt when open panel button is clicked', () => {
    const onOpenSidebar = jest.fn();
    const writeBar = new AgentWriteBar(
      containerEl,
      mockApp,
      mockEngine as AgentEngine,
      mockLogger as AgentAuditLogger,
      mockBridge as AgentCalendarBridge,
      undefined,
      onOpenSidebar
    );

    const input = containerEl.querySelector('textarea');
    expect(input).not.toBeNull();
    if (input) {
      input.value = 'Review my quarterly goals';
    }

    const openPanelBtn = containerEl.querySelector(
      `[title="${t('agent.writeBar.openAgentPanel')}"]`
    ) as HTMLButtonElement;
    expect(openPanelBtn).not.toBeNull();
    openPanelBtn.click();

    expect(onOpenSidebar).toHaveBeenCalledWith('Review my quarterly goals');

    writeBar.destroy();
  });

  it('reveals existing right sidebar leaf if onOpenSidebar is not provided', async () => {
    const mockView = {
      setPrompt: jest.fn(),
      focus: jest.fn()
    };
    Object.setPrototypeOf(mockView, AgentSidebarView.prototype);

    const existingLeaf = {
      view: mockView
    };
    (mockApp.workspace.getLeavesOfType as jest.Mock).mockReturnValue([existingLeaf]);

    const writeBar = new AgentWriteBar(
      containerEl,
      mockApp,
      mockEngine as AgentEngine,
      mockLogger as AgentAuditLogger,
      mockBridge as AgentCalendarBridge
    );

    const input = containerEl.querySelector('textarea');
    if (input) {
      input.value = 'Help me schedule';
    }

    const openPanelBtn = containerEl.querySelector(
      `[title="${t('agent.writeBar.openAgentPanel')}"]`
    ) as HTMLButtonElement;
    openPanelBtn.click();

    // Allow promise tick
    await Promise.resolve();

    expect(revealLeafMock).toHaveBeenCalledWith(existingLeaf);
    expect(mockView.setPrompt).toHaveBeenCalledWith('Help me schedule');
    expect(mockView.focus).toHaveBeenCalled();

    writeBar.destroy();
  });
});
