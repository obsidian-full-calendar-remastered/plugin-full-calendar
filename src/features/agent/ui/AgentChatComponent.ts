/**
 * @file AgentChatComponent.ts
 * @brief Reusable, modular conversation component for the Full Calendar Agent.
 *
 * @description
 * Single source of truth for the Calendar Agent chat interface across all views
 * (Right Sidebar View, Left Cockpit HUD, and Command Modal).
 * Features:
 * - Rich token-by-token streaming response bubble with abort capability.
 * - Full markdown formatting for tables, lists, and code via MarkdownRenderer.
 * - Interactive event proposal cards with live approval/rejection.
 * - Quick action suggestion pills.
 * - Auto-expanding prompt textarea with desktop-native shortcuts.
 *
 * @license See LICENSE.md
 */

import { App, Component, setIcon, MarkdownRenderer } from 'obsidian';
import type { AgentEngine } from '../core/AgentEngine';
import type { AgentCalendarBridge } from '../tools/AgentCalendarBridge';
import type { AgentAuditLogger } from '../core/AgentAuditLogger';
import { ProposalApprovalCard } from './ProposalApprovalCard';
import { showNotice } from '../../../utils/showNotice';
import { t } from '../../i18n/i18n';
import { FULL_CALENDAR_AGENT_VIEW } from '../types';

export interface AgentChatComponentOptions {
  app: App;
  engine: AgentEngine;
  bridge: AgentCalendarBridge;
  logger?: AgentAuditLogger;
  parentComponent?: Component;
  compact?: boolean;
  showClearBtn?: boolean;
  showOpenPanelBtn?: boolean;
  onEventMutated?: () => void;
  onOpenSidebar?: (initialPrompt?: string) => void;
  onSessionUpdated?: () => void;
}

const setCssProps = (element: HTMLElement, props: Record<string, string>): void => {
  Object.entries(props).forEach(([key, value]) => {
    element.style.setProperty(key, value);
  });
};

export class AgentChatComponent extends Component {
  private containerEl: HTMLElement;
  private wrapperEl: HTMLElement;
  private options: AgentChatComponentOptions;

  private messagesContainer!: HTMLElement;
  private statusEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private submitBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;
  private abortController: AbortController | null = null;

  constructor(containerEl: HTMLElement, options: AgentChatComponentOptions) {
    super();
    this.containerEl = containerEl;
    this.options = options;

    if (this.options.parentComponent) {
      this.options.parentComponent.addChild(this);
    }

    this.wrapperEl = this.containerEl.createDiv({
      cls: `ofc-agent-chat-view ${this.options.compact ? 'ofc-agent-chat-view-compact' : ''}`
    });

    this.render();
  }

  public destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.wrapperEl.remove();
  }

  public onunload(): void {
    this.destroy();
  }

  public setPrompt(prompt: string): void {
    if (this.inputEl) {
      this.inputEl.value = prompt;
      setCssProps(this.inputEl, { height: 'auto' });
      setCssProps(this.inputEl, {
        height: `${Math.min(this.inputEl.scrollHeight, 120)}px`
      });
    }
  }

  public focus(): void {
    this.inputEl?.focus({ preventScroll: true });
  }

  public getMessagesContainer(): HTMLElement {
    return this.messagesContainer;
  }

  public render(): void {
    this.wrapperEl.empty();

    // 1. Scrollable Messages Container
    this.messagesContainer = this.wrapperEl.createDiv({ cls: 'ofc-agent-sidebar-messages' });
    this.statusEl = this.wrapperEl.createDiv({ cls: 'ofc-agent-status-indicator is-hidden' });
    this.renderMessages();

    // 2. Suggestion Pills
    const pillsRow = this.wrapperEl.createDiv({ cls: 'ofc-agent-pills-row' });
    const suggestions = [
      { text: t('agent.suggestions.today'), prompt: t('agent.suggestions.todayPrompt') },
      { text: t('agent.suggestions.thisWeek'), prompt: t('agent.suggestions.thisWeekPrompt') },
      { text: t('agent.suggestions.addEvent'), prompt: t('agent.suggestions.addEventPrompt') },
      {
        text: t('agent.suggestions.importUrl'),
        prompt: t('agent.suggestions.importUrlPrompt')
      }
    ];

    for (const item of suggestions) {
      const pill = pillsRow.createSpan({ cls: 'ofc-agent-pill', text: item.text });
      pill.addEventListener('click', () => {
        this.inputEl.value = item.prompt;
        this.focus();
      });
    }

    // 3. Input Area at Bottom
    const inputArea = this.wrapperEl.createDiv({ cls: 'ofc-agent-sidebar-input-area' });
    const inputWrapper = inputArea.createDiv({ cls: 'ofc-agent-input-wrapper' });

    const robotIcon = inputWrapper.createSpan({ cls: 'ofc-agent-input-icon' });
    setIcon(robotIcon, 'bot');

    this.inputEl = inputWrapper.createEl('textarea', {
      cls: 'ofc-agent-textarea',
      attr: {
        placeholder: t('agent.sidebar.inputPlaceholder'),
        rows: '1'
      }
    });

    this.inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.handleSubmit();
      }
    });

    this.inputEl.addEventListener('input', () => {
      setCssProps(this.inputEl, { height: 'auto' });
      setCssProps(this.inputEl, {
        height: `${Math.min(this.inputEl.scrollHeight, 120)}px`
      });
    });

    const actionsRow = inputWrapper.createDiv({ cls: 'ofc-agent-actions-row' });

    // Stop button
    this.stopBtn = actionsRow.createEl('button', {
      cls: 'mod-warning ofc-agent-btn-stop is-hidden',
      text: t('agent.sidebar.stop')
    });
    this.stopBtn.addEventListener('click', () => {
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
        this.stopBtn.addClass('is-hidden');
        this.submitBtn.removeClass('is-hidden');
        this.statusEl.addClass('is-hidden');
      }
    });

    // Clear history button
    if (this.options.showClearBtn) {
      const clearBtn = actionsRow.createEl('button', {
        cls: 'clickable-icon ofc-agent-icon-btn',
        attr: {
          title: t('agent.writeBar.clearHistory'),
          'aria-label': t('agent.writeBar.clearHistory')
        }
      });
      setIcon(clearBtn, 'trash-2');
      clearBtn.addEventListener('click', () => {
        void (async () => {
          await this.options.engine.clearHistory();
          this.renderMessages();
          showNotice(t('agent.settings.historyClearedNotice'));
        })();
      });
    }

    // Open full-fledged agent panel button
    if (this.options.showOpenPanelBtn) {
      const openPanelBtn = actionsRow.createEl('button', {
        cls: 'clickable-icon ofc-agent-icon-btn',
        attr: {
          title: t('agent.writeBar.openAgentPanel'),
          'aria-label': t('agent.writeBar.openAgentPanel')
        }
      });
      setIcon(openPanelBtn, 'panel-right-open');
      openPanelBtn.addEventListener('click', () => {
        void this.openFullPanel();
      });
    }

    // Send button
    this.submitBtn = actionsRow.createEl('button', {
      cls: 'mod-cta ofc-agent-btn-send',
      attr: { 'aria-label': t('agent.sidebar.sendAria') }
    });
    setIcon(this.submitBtn, 'send');
    this.submitBtn.addEventListener('click', () => {
      void this.handleSubmit();
    });
  }

  public renderMessages(): void {
    this.messagesContainer.empty();
    const messages = this.options.engine.getMessages();
    const proposals = this.options.engine.getProposals();

    if (messages.length === 0) {
      const emptyNotice = this.messagesContainer.createDiv({ cls: 'ofc-agent-empty-notice' });
      const botIcon = emptyNotice.createDiv({ cls: 'ofc-agent-empty-icon' });
      setIcon(botIcon, 'bot');
      emptyNotice.createEl('p', {
        cls: 'ofc-agent-empty-title',
        text: t('agent.sidebar.emptyTitle')
      });
      emptyNotice.createEl('p', {
        cls: 'ofc-agent-empty-desc',
        text: t('agent.sidebar.emptyDesc')
      });
      return;
    }

    for (const msg of messages) {
      if (msg.role === 'user') {
        const userMsg = this.messagesContainer.createDiv({
          cls: 'ofc-agent-msg ofc-agent-msg-user'
        });
        userMsg.createDiv({ cls: 'ofc-agent-msg-content', text: msg.content || '' });
      } else if (msg.role === 'assistant') {
        if (msg.content) {
          const assistantMsg = this.messagesContainer.createDiv({
            cls: 'ofc-agent-msg ofc-agent-msg-assistant'
          });
          const assistantContent = assistantMsg.createDiv({ cls: 'ofc-agent-msg-content' });
          void this.renderAssistantMarkdown(assistantContent, msg.content);
        }
      } else if (msg.role === 'tool') {
        const toolBadge = this.messagesContainer.createDiv({ cls: 'ofc-agent-tool-badge' });
        toolBadge.createSpan({ text: t('agent.sidebar.toolExecuted') });
      }
    }

    // Render proposals attached to this session
    for (const proposal of proposals) {
      new ProposalApprovalCard(this.messagesContainer, proposal, this.getProposalCardCallbacks());
    }

    this.scrollToBottom();
  }

  private getProposalCardCallbacks() {
    return {
      onApprove: async (proposalId: string, overrideCalendarId?: string) => {
        try {
          const res = await this.options.bridge.commitProposal(proposalId, overrideCalendarId);
          if (res.success) {
            showNotice(t('agent.notices.eventApplied'));
            await this.options.engine.saveCurrentSession();
            this.options.onEventMutated?.();
            this.renderMessages();
          } else {
            showNotice(res.message);
          }
        } catch (err) {
          showNotice(
            t('agent.notices.failedToApply', {
              error: err instanceof Error ? err.message : String(err)
            })
          );
        }
      },
      onReject: async (proposalId: string) => {
        this.options.bridge.rejectProposal(proposalId);
        showNotice(t('agent.notices.proposalRejected'));
        await this.options.engine.saveCurrentSession();
        this.renderMessages();
      }
    };
  }

  public scrollToBottom(): void {
    window.requestAnimationFrame(() => {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    });
  }

  public async renderAssistantMarkdown(container: HTMLElement, markdown: string): Promise<void> {
    container.empty();
    await MarkdownRenderer.render(this.options.app, markdown, container, '', this);
  }

  public renderErrorCard(container: HTMLElement, errorText: string): void {
    container.empty();
    container.removeClass('ofc-agent-msg-assistant');
    container.addClass('ofc-agent-msg-error');

    const header = container.createDiv({ cls: 'ofc-agent-error-header' });
    const iconSpan = header.createSpan({ cls: 'ofc-agent-error-icon' });
    setIcon(iconSpan, 'alert-circle');
    header.createSpan({
      cls: 'ofc-agent-error-title',
      text: t('agent.sidebar.errorTitle') || 'Request failed'
    });

    const body = container.createDiv({ cls: 'ofc-agent-error-body' });
    const message =
      (errorText || '').trim() ||
      'An unexpected error occurred while communicating with the model.';
    body.setText(message);
  }

  private async handleSubmit(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text) return;

    this.inputEl.value = '';
    setCssProps(this.inputEl, { height: 'auto' });

    // Remove empty notice if present
    const emptyNotice = this.messagesContainer.querySelector('.ofc-agent-empty-notice');
    if (emptyNotice) {
      emptyNotice.remove();
    }

    // Render user bubble immediately
    const userMsg = this.messagesContainer.createDiv({ cls: 'ofc-agent-msg ofc-agent-msg-user' });
    userMsg.createDiv({ cls: 'ofc-agent-msg-content', text });

    // Render assistant streaming placeholder
    const assistantMsg = this.messagesContainer.createDiv({
      cls: 'ofc-agent-msg ofc-agent-msg-assistant'
    });
    const assistantContent = assistantMsg.createDiv({ cls: 'ofc-agent-msg-content' });

    this.statusEl.removeClass('is-hidden');
    this.statusEl.setText(t('agent.sidebar.thinking'));
    this.submitBtn.addClass('is-hidden');
    this.stopBtn.removeClass('is-hidden');
    this.scrollToBottom();

    this.abortController = new AbortController();
    let accumulatedText = '';
    let hasReceivedChunk = false;

    try {
      await this.options.engine.prompt(
        text,
        {
          onChunk: delta => {
            if (!hasReceivedChunk) {
              hasReceivedChunk = true;
              this.statusEl.addClass('is-hidden');
            }
            accumulatedText += delta;
            assistantContent.setText(accumulatedText);
            this.scrollToBottom();
          },
          onStatus: statusText => {
            if (statusText && !hasReceivedChunk) {
              this.statusEl.removeClass('is-hidden');
              this.statusEl.setText(statusText);
            } else {
              this.statusEl.addClass('is-hidden');
            }
          },
          onProposal: proposal => {
            new ProposalApprovalCard(
              this.messagesContainer,
              proposal,
              this.getProposalCardCallbacks()
            );
            this.scrollToBottom();
          },
          onError: err => {
            this.renderErrorCard(assistantMsg, err);
            this.scrollToBottom();
          },
          onDone: () => {
            this.options.onSessionUpdated?.();
          }
        },
        this.abortController.signal
      );

      // Once generation finishes, render formatted markdown
      if (accumulatedText.trim().length > 0) {
        await this.renderAssistantMarkdown(assistantContent, accumulatedText);
        this.scrollToBottom();
      }
    } catch (err) {
      if (!this.abortController?.signal.aborted) {
        const msg = err instanceof Error ? err.message : String(err);
        this.renderErrorCard(assistantMsg, msg);
      }
    } finally {
      this.abortController = null;
      this.submitBtn.removeClass('is-hidden');
      this.stopBtn.addClass('is-hidden');
      this.statusEl.addClass('is-hidden');
      this.statusEl.setText('');
      this.scrollToBottom();
    }
  }

  public async openFullPanel(): Promise<void> {
    const prompt = this.inputEl?.value?.trim();
    if (this.options.onOpenSidebar) {
      this.options.onOpenSidebar(prompt);
      return;
    }

    const workspace = this.options.app.workspace;
    let leaf = workspace.getLeavesOfType(FULL_CALENDAR_AGENT_VIEW)[0];
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({
          type: FULL_CALENDAR_AGENT_VIEW,
          active: true
        });
        leaf = rightLeaf;
      }
    }

    if (leaf) {
      void workspace.revealLeaf(leaf);
      const leafView = leaf.view as { setPrompt?: (p: string) => void; focus?: () => void };
      if (typeof leafView?.setPrompt === 'function' && prompt) {
        leafView.setPrompt(prompt);
      }
      if (typeof leafView?.focus === 'function') {
        leafView.focus();
      }
    }
  }
}
