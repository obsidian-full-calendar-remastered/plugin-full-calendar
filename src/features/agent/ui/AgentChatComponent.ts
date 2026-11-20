/**
 * @file AgentChatComponent.ts
 * @brief Reusable, modular conversation component for the Full Calendar Agent.
 *
 * @description
 * Single source of truth for the Calendar Agent chat interface across all views
 * (Right Sidebar View, Left Cockpit HUD, and Command Modal).
 * Delegates welcome screen, live process trace, bulk proposal actions, and dynamic
 * follow-up suggestion chips to dedicated child view components.
 *
 * @license See LICENSE.md
 */

import { App, Component, setIcon, MarkdownRenderer } from 'obsidian';
import type { AgentEngine } from '../core/AgentEngine';
import type { AgentCalendarBridge } from '../tools/AgentCalendarBridge';
import type { AgentAuditLogger } from '../core/AgentAuditLogger';
import type { EventProposal, ProposalStatus } from '../types';
import {
  extractFollowUpSuggestions,
  StreamingSuggestionsFilter
} from '../domain/suggestionsParser';
import { ProposalApprovalCard, type ProposalApproveResult } from './ProposalApprovalCard';
import { AgentWelcomeView } from './AgentWelcomeView';
import { AgentStepTraceView } from './AgentStepTraceView';
import { ProposalBulkActionBar } from './ProposalBulkActionBar';
import { FollowUpChipsView } from './FollowUpChipsView';
import { openAgentSidebarLeaf } from './openAgentSidebar';
import { showNotice } from '../../../utils/showNotice';
import { t } from '../../i18n/i18n';

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
  beforeSend?: () => Promise<boolean>;
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
  private bulkActionBar!: ProposalBulkActionBar;
  private inputEl!: HTMLTextAreaElement;
  private submitBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;

  private abortController: AbortController | null = null;
  private activeTrace: AgentStepTraceView | null = null;
  private welcomeView: AgentWelcomeView | null = null;
  private activeFollowUps: FollowUpChipsView | null = null;
  private proposalCards = new Map<string, ProposalApprovalCard>();
  private scrollRafId: number | null = null;

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

  public cancelActiveRequest(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.activeTrace) {
      this.activeTrace.finish('cancelled');
      this.activeTrace = null;
    }
    if (this.stopBtn && this.submitBtn) {
      this.stopBtn.addClass('is-hidden');
      this.submitBtn.removeClass('is-hidden');
    }
  }

  public destroy(): void {
    this.cancelActiveRequest();
    if (this.scrollRafId !== null) {
      window.cancelAnimationFrame(this.scrollRafId);
      this.scrollRafId = null;
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
    if (this.inputEl) {
      const len = this.inputEl.value.length;
      this.inputEl.setSelectionRange(len, len);
    }
  }

  public getMessagesContainer(): HTMLElement {
    return this.messagesContainer;
  }

  public render(): void {
    this.wrapperEl.empty();

    // 1. Scrollable Messages Container
    this.messagesContainer = this.wrapperEl.createDiv({ cls: 'ofc-agent-sidebar-messages' });

    // 2. Sticky Bulk Approval Bar (shown when 2+ actionable proposals are pending)
    this.bulkActionBar = new ProposalBulkActionBar(this.wrapperEl, {
      onApproveAll: onProgress => this.handleBulkApproveAll(onProgress),
      onRejectAll: () => this.handleBulkRejectAll()
    });

    this.renderMessages();

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
      text: t('agent.sidebar.stop'),
      attr: { type: 'button' }
    });
    this.stopBtn.addEventListener('click', () => {
      this.cancelActiveRequest();
    });

    // Clear history button
    if (this.options.showClearBtn) {
      const clearBtn = actionsRow.createEl('button', {
        cls: 'clickable-icon ofc-agent-icon-btn',
        attr: {
          type: 'button',
          title: t('agent.writeBar.clearHistory'),
          'aria-label': t('agent.writeBar.clearHistory')
        }
      });
      setIcon(clearBtn, 'trash-2');
      clearBtn.addEventListener('click', () => {
        void (async () => {
          this.cancelActiveRequest();
          await this.options.engine.clearHistory();
          this.renderMessages();
          this.options.onSessionUpdated?.();
          showNotice(t('agent.settings.historyClearedNotice'));
        })();
      });
    }

    // Open full-fledged agent panel button
    if (this.options.showOpenPanelBtn) {
      const openPanelBtn = actionsRow.createEl('button', {
        cls: 'clickable-icon ofc-agent-icon-btn',
        attr: {
          type: 'button',
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
      attr: {
        type: 'button',
        'aria-label': t('agent.sidebar.sendAria')
      }
    });
    setIcon(this.submitBtn, 'send');
    this.submitBtn.addEventListener('click', () => {
      void this.handleSubmit();
    });
  }

  private submitStarterPrompt(prompt: string): void {
    this.setPrompt(prompt);
    void this.handleSubmit();
  }

  private fillStarterPrompt(prompt: string): void {
    this.setPrompt(prompt);
    this.focus();
  }

  private mountFollowUpChips(containerEl: HTMLElement, suggestions: string[]): void {
    this.activeFollowUps?.remove();
    this.activeFollowUps = null;
    if (!suggestions || suggestions.length === 0) {
      return;
    }
    this.activeFollowUps = new FollowUpChipsView(containerEl, suggestions, prompt => {
      this.activeFollowUps = null;
      this.setPrompt(prompt);
      void this.handleSubmit();
    });
  }

  private refreshBulkActionBar(): void {
    let pendingCount = 0;
    for (const card of this.proposalCards.values()) {
      const p = card.getProposal();
      const actionable =
        this.options.bridge.isProposalActionable?.(p) ?? card.isActionablePending();
      if (actionable && p.status === 'PENDING') {
        pendingCount++;
      }
    }
    this.bulkActionBar?.updateCount(pendingCount);
  }

  public renderMessages(): void {
    this.proposalCards.clear();
    this.welcomeView = null;
    this.activeFollowUps = null;
    this.messagesContainer.empty();

    const messages = this.options.engine.getMessages();
    const proposals = this.options.engine.getProposals();

    if (messages.length === 0 && proposals.length === 0) {
      this.welcomeView = new AgentWelcomeView(this.messagesContainer, {
        compact: Boolean(this.options.compact),
        onSendPrompt: prompt => this.submitStarterPrompt(prompt),
        onFillPrompt: prompt => this.fillStarterPrompt(prompt)
      });
      this.bulkActionBar?.updateCount(0);
      return;
    }

    const hasStructuredToolTraces = messages.some(
      m => m.role === 'assistant' && Array.isArray(m.toolSteps) && m.toolSteps.length > 0
    );

    let lastAssistantIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (
        messages[i].role === 'assistant' &&
        (messages[i].content || (messages[i].suggestions?.length ?? 0) > 0)
      ) {
        lastAssistantIdx = i;
        break;
      }
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'user') {
        const userMsg = this.messagesContainer.createDiv({
          cls: 'ofc-agent-msg ofc-agent-msg-user'
        });
        userMsg.createDiv({ cls: 'ofc-agent-msg-content', text: msg.content || '' });
      } else if (msg.role === 'assistant') {
        if (msg.toolSteps && msg.toolSteps.length > 0) {
          AgentStepTraceView.renderStatic(this.messagesContainer, msg.toolSteps);
        }

        const parsed = msg.content ? extractFollowUpSuggestions(msg.content) : null;
        const cleanText = parsed?.cleanText || '';
        const chips =
          msg.suggestions && msg.suggestions.length > 0
            ? msg.suggestions
            : (parsed?.suggestions ?? []);

        if (cleanText) {
          const assistantMsg = this.messagesContainer.createDiv({
            cls: 'ofc-agent-msg ofc-agent-msg-assistant'
          });
          const assistantContent = assistantMsg.createDiv({ cls: 'ofc-agent-msg-content' });
          void this.renderAssistantMarkdown(assistantContent, cleanText);
        }

        if (i === lastAssistantIdx && chips.length > 0) {
          this.mountFollowUpChips(this.messagesContainer, chips);
        }
      } else if (msg.role === 'tool' && !hasStructuredToolTraces) {
        const toolBadge = this.messagesContainer.createDiv({ cls: 'ofc-agent-tool-badge' });
        toolBadge.createSpan({ text: t('agent.sidebar.toolExecuted') });
      }
    }

    // Render proposals attached to this session
    for (const proposal of proposals) {
      this.mountProposalCard(proposal);
    }

    this.refreshBulkActionBar();
    this.scrollToBottom();
  }

  private mountProposalCard(proposal: EventProposal): void {
    const actionable =
      this.options.bridge.isProposalActionable?.(proposal) ?? proposal.status === 'PENDING';
    const card = new ProposalApprovalCard(this.messagesContainer, proposal, {
      ...this.getProposalCardCallbacks(),
      actionable
    });
    this.proposalCards.set(proposal.id, card);
    this.refreshBulkActionBar();
  }

  private getProposalCardCallbacks() {
    return {
      onApprove: async (
        proposalId: string,
        overrideCalendarId?: string,
        expectedApprovalHash?: string
      ): Promise<ProposalApproveResult> => {
        try {
          const res = await this.options.bridge.commitProposal(
            proposalId,
            overrideCalendarId,
            expectedApprovalHash
          );
          if (res.success) {
            showNotice(t('agent.notices.eventApplied'));
            await this.options.engine.saveCurrentSession();
            this.options.onEventMutated?.();
          } else {
            showNotice(res.message);
          }
          this.refreshBulkActionBar();
          return res;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          showNotice(t('agent.notices.failedToApply', { error: msg }));
          this.refreshBulkActionBar();
          return { success: false, message: msg };
        }
      },
      onReject: (proposalId: string) => {
        this.options.bridge.rejectProposal(proposalId);
        showNotice(t('agent.notices.proposalRejected'));
        void this.options.engine.saveCurrentSession();
        this.refreshBulkActionBar();
      },
      onStatusChange: () => {
        this.refreshBulkActionBar();
      }
    };
  }

  private async handleBulkApproveAll(
    onProgress: (current: number, total: number) => void
  ): Promise<void> {
    const pendingCards = Array.from(this.proposalCards.values()).filter(card => {
      const p = card.getProposal();
      return (
        p.status === 'PENDING' &&
        (this.options.bridge.isProposalActionable?.(p) ?? card.isActionablePending())
      );
    });

    if (pendingCards.length === 0) {
      this.refreshBulkActionBar();
      return;
    }

    let applied = 0;
    let failed = 0;

    for (let i = 0; i < pendingCards.length; i++) {
      onProgress(i + 1, pendingCards.length);
      const card = pendingCards[i];
      const proposal = card.getProposal();
      try {
        const res = await this.options.bridge.commitProposal(
          proposal.id,
          undefined,
          proposal.approvalHash
        );
        if (res.success) {
          applied++;
          card.syncStatus('APPROVED');
        } else {
          failed++;
          const msg = res.message || '';
          const isStaleOrMissing =
            msg.includes('expired') ||
            msg.includes('not found') ||
            msg.includes('no longer exists') ||
            msg.includes('changed since preview');
          const nextStatus: ProposalStatus = proposal.status === 'FAILED' ? 'FAILED' : 'PENDING';
          card.syncStatus(
            isStaleOrMissing ? proposal.status : nextStatus,
            msg,
            isStaleOrMissing ? false : undefined
          );
        }
      } catch (err) {
        failed++;
        card.syncStatus('FAILED', err instanceof Error ? err.message : String(err));
      }
    }

    await this.options.engine.saveCurrentSession();
    if (applied > 0) {
      this.options.onEventMutated?.();
    }
    this.refreshBulkActionBar();

    if (failed === 0) {
      showNotice(
        t('agent.proposals.bulkAppliedSummary', {
          applied,
          total: pendingCards.length
        })
      );
    } else {
      showNotice(
        t('agent.proposals.bulkAppliedPartial', {
          applied,
          total: pendingCards.length,
          failed
        })
      );
    }
  }

  private async handleBulkRejectAll(): Promise<void> {
    const pendingCards = Array.from(this.proposalCards.values()).filter(card => {
      const p = card.getProposal();
      return (
        p.status === 'PENDING' &&
        (this.options.bridge.isProposalActionable?.(p) ?? card.isActionablePending())
      );
    });

    if (pendingCards.length === 0) {
      this.refreshBulkActionBar();
      return;
    }

    for (const card of pendingCards) {
      this.options.bridge.rejectProposal(card.getProposal().id);
      card.syncStatus('REJECTED');
    }

    await this.options.engine.saveCurrentSession();
    this.refreshBulkActionBar();
    showNotice(t('agent.proposals.bulkRejectedSummary', { count: pendingCards.length }));
  }

  private isNearBottom(): boolean {
    const { scrollHeight, scrollTop, clientHeight } = this.messagesContainer;
    if (scrollHeight <= clientHeight) {
      return true;
    }
    return scrollHeight - scrollTop - clientHeight <= 64;
  }

  public scrollToBottom(): void {
    if (this.scrollRafId !== null) {
      window.cancelAnimationFrame(this.scrollRafId);
    }
    this.scrollRafId = window.requestAnimationFrame(() => {
      this.scrollRafId = null;
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
    if (this.abortController) {
      return;
    }

    const text = this.inputEl.value.trim();
    if (!text) return;

    if (this.options.beforeSend) {
      const allowed = await this.options.beforeSend();
      if (!allowed) return;
    }

    this.inputEl.value = '';
    setCssProps(this.inputEl, { height: 'auto' });

    // Remove empty welcome notice and previous follow-up chips
    this.welcomeView?.remove();
    this.welcomeView = null;
    this.activeFollowUps?.remove();
    this.activeFollowUps = null;

    // Render user bubble immediately
    const userMsg = this.messagesContainer.createDiv({ cls: 'ofc-agent-msg ofc-agent-msg-user' });
    userMsg.createDiv({ cls: 'ofc-agent-msg-content', text });

    // Mount live process & step trace
    const trace = new AgentStepTraceView(this.messagesContainer);
    this.activeTrace = trace;

    this.submitBtn.addClass('is-hidden');
    this.stopBtn.removeClass('is-hidden');
    this.scrollToBottom();

    const controller = new AbortController();
    this.abortController = controller;

    let currentBubbleEl: HTMLElement | null = null;
    let currentContentEl: HTMLElement | null = null;
    let currentVisibleText = '';
    let filter = new StreamingSuggestionsFilter();
    let turnCompleted = false;
    let errorRendered = false;
    let hadError = false;
    const pendingMarkdownRenders: Promise<void>[] = [];

    const ensureAssistantBubble = (): HTMLElement => {
      if (!currentBubbleEl || !currentContentEl) {
        currentBubbleEl = this.messagesContainer.createDiv({
          cls: 'ofc-agent-msg ofc-agent-msg-assistant'
        });
        currentContentEl = currentBubbleEl.createDiv({ cls: 'ofc-agent-msg-content' });
      }
      return currentContentEl;
    };

    try {
      await this.options.engine.prompt(
        text,
        {
          onUserMessageRecorded: () => {
            this.options.onSessionUpdated?.();
          },
          onTurnStart: turn => {
            currentBubbleEl = null;
            currentContentEl = null;
            currentVisibleText = '';
            filter = new StreamingSuggestionsFilter();
            turnCompleted = false;
            trace.setPhase(turn === 1 ? t('agent.sidebar.thinking') : t('agent.trace.working'));
          },
          onChunk: delta => {
            const visibleDelta = filter.push(delta);
            if (!visibleDelta) {
              return;
            }
            const shouldFollow = this.isNearBottom();
            const contentEl = ensureAssistantBubble();
            currentVisibleText += visibleDelta;
            contentEl.setText(currentVisibleText);
            if (shouldFollow) {
              this.scrollToBottom();
            }
          },
          onTurnComplete: (_turn, cleanContent, suggestions) => {
            turnCompleted = true;
            const shouldFollow = this.isNearBottom();
            const finalText = cleanContent || filter.finish().fullCleanText;
            if (finalText.trim().length > 0) {
              const contentEl = ensureAssistantBubble();
              pendingMarkdownRenders.push(this.renderAssistantMarkdown(contentEl, finalText));
            } else if (currentBubbleEl && currentVisibleText.trim().length === 0) {
              currentBubbleEl.remove();
              currentBubbleEl = null;
              currentContentEl = null;
            }

            if (suggestions.length > 0) {
              this.mountFollowUpChips(this.messagesContainer, suggestions);
            }
            if (shouldFollow) {
              this.scrollToBottom();
            }
          },
          onToolCallStart: info => {
            const shouldFollow = this.isNearBottom();
            trace.addToolStart(info.id, info.label);
            if (shouldFollow) {
              this.scrollToBottom();
            }
          },
          onToolCallEnd: step => {
            const shouldFollow = this.isNearBottom();
            trace.finishTool(step);
            if (shouldFollow) {
              this.scrollToBottom();
            }
          },
          onStatus: statusText => {
            if (statusText) {
              trace.setPhase(statusText);
            }
          },
          onProposal: proposal => {
            const shouldFollow = this.isNearBottom();
            this.mountProposalCard(proposal);
            if (shouldFollow) {
              this.scrollToBottom();
            }
          },
          onError: err => {
            hadError = true;
            if (!errorRendered) {
              errorRendered = true;
              const errEl = this.messagesContainer.createDiv({
                cls: 'ofc-agent-msg ofc-agent-msg-error'
              });
              this.renderErrorCard(errEl, err);
              this.scrollToBottom();
            }
          },
          onDone: () => {
            this.options.onSessionUpdated?.();
          }
        },
        controller.signal
      );

      if (!turnCompleted && currentContentEl && currentVisibleText.trim().length > 0) {
        const finished = filter.finish();
        if (finished.fullCleanText.trim().length > 0) {
          pendingMarkdownRenders.push(
            this.renderAssistantMarkdown(currentContentEl, finished.fullCleanText)
          );
        }
        if (finished.suggestions.length > 0) {
          this.mountFollowUpChips(this.messagesContainer, finished.suggestions);
        }
      }

      await Promise.all(pendingMarkdownRenders);
    } catch (err) {
      hadError = true;
      if (!controller.signal.aborted && !errorRendered) {
        errorRendered = true;
        const msg = err instanceof Error ? err.message : String(err);
        const errEl = this.messagesContainer.createDiv({
          cls: 'ofc-agent-msg ofc-agent-msg-error'
        });
        this.renderErrorCard(errEl, msg);
        this.scrollToBottom();
      }
    } finally {
      const traceState = controller.signal.aborted ? 'cancelled' : hadError ? 'error' : 'done';
      trace.finish(traceState);
      if (this.activeTrace === trace) {
        this.activeTrace = null;
      }
      if (this.abortController === controller) {
        this.abortController = null;
      }
      this.submitBtn.removeClass('is-hidden');
      this.stopBtn.addClass('is-hidden');
    }
  }

  public async openFullPanel(): Promise<void> {
    const prompt = this.inputEl?.value?.trim();
    if (this.options.onOpenSidebar) {
      this.options.onOpenSidebar(prompt);
      return;
    }

    await openAgentSidebarLeaf(this.options.app, prompt);
  }
}
