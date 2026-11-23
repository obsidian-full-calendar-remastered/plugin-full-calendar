/**
 * @file AgentChatComponent.ts
 * @brief Reusable, synchronized conversation component for the Full Calendar Agent.
 *
 * @description
 * Single source of truth for the Calendar Agent chat interface across all views
 * (Right Sidebar View, Left Cockpit HUD, and Command Modal).
 * Subscribes to `AgentEngine` pub/sub lifecycle events so all mounted panels
 * mirror active runs, streamed text, traces, proposals, selection changes,
 * settings updates, and session switches in real time.
 *
 * @license See LICENSE.md
 */

import { App, Component, setIcon, MarkdownRenderer } from 'obsidian';
import type { AgentActiveRunSnapshot, AgentEngine, AgentEngineEvent } from '../core/AgentEngine';
import type { AgentCalendarBridge } from '../tools/AgentCalendarBridge';
import type { AgentAuditLogger } from '../core/AgentAuditLogger';
import { generateRandomId } from '../domain/crypto/randomId';
import type {
  AgentChartAttachment,
  AgentToolStepRecord,
  EventProposal,
  ProposalStatus
} from '../types';
import {
  extractFollowUpSuggestions,
  StreamingSuggestionsFilter
} from '../domain/suggestionsParser';
import {
  splitContentByChartAnchors,
  stripChartAnchors,
  StreamingChartAnchorFilter
} from '../domain/chartAnchorParser';
import type { ChatAnalyticsCard } from './ChatAnalyticsCard';
import { ProposalApprovalCard, type ProposalApproveResult } from './ProposalApprovalCard';
import { AgentWelcomeView } from './AgentWelcomeView';
import { AgentStepTraceView } from './AgentStepTraceView';
import { AgentLiveActivityBar } from './AgentLiveActivityBar';
import { ProposalBulkActionBar } from './ProposalBulkActionBar';
import { FollowUpChipsView } from './FollowUpChipsView';
import { setCssProps } from './domUtils';
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

interface LiveRunState {
  runId: string;
  trace: AgentStepTraceView;
  currentBubbleEl: HTMLElement | null;
  currentContentEl: HTMLElement | null;
  currentVisibleText: string;
  filter: StreamingSuggestionsFilter;
  chartFilter: StreamingChartAnchorFilter;
  turnCompleted: boolean;
  errorRendered: boolean;
  hadError: boolean;
  pendingMarkdownRenders: Promise<void>[];
}

export class AgentChatComponent extends Component {
  private readonly panelId = generateRandomId('panel');
  private containerEl: HTMLElement;
  private wrapperEl: HTMLElement;
  private options: AgentChatComponentOptions;

  private messagesContainer!: HTMLElement;
  private bulkActionBar!: ProposalBulkActionBar;
  private liveActivityBar!: AgentLiveActivityBar;
  private inputEl!: HTMLTextAreaElement;
  private submitBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;

  private unsubscribeEngine: (() => void) | null = null;
  private abortController: AbortController | null = null;
  private liveRun: LiveRunState | null = null;
  private lastRunErrorRendered = false;
  private lastRunMarkdownRenders: Promise<void>[] = [];
  private welcomeView: AgentWelcomeView | null = null;
  private activeFollowUps: FollowUpChipsView | null = null;
  private proposalCards = new Map<string, ProposalApprovalCard>();
  private analyticsCards: ChatAnalyticsCard[] = [];
  private scrollRafId: number | null = null;
  private renderEpoch = 0;
  private destroyed = false;
  private isSubmitting = false;

  constructor(containerEl: HTMLElement, options: AgentChatComponentOptions) {
    super();
    this.containerEl = containerEl;
    this.options = options;

    if (this.options.parentComponent) {
      this.options.parentComponent.addChild(this);
    } else {
      this.load();
    }

    this.wrapperEl = this.containerEl.createDiv({
      cls: `ofc-agent-chat-view ${this.options.compact ? 'ofc-agent-chat-view-compact' : ''}`
    });

    this.unsubscribeEngine =
      this.options.engine.subscribe?.(event => {
        this.handleEngineEvent(event);
      }) ?? null;

    this.render();
  }

  public cancelActiveRequest(): void {
    this.options.engine.abortActiveRun?.();
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (!this.unsubscribeEngine && this.liveRun) {
      this.finishLiveRun('cancelled', this.liveRun.runId);
    }
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.renderEpoch++;
    this.unsubscribeEngine?.();
    this.unsubscribeEngine = null;
    this.destroyAnalyticsCards();
    this.liveActivityBar?.destroy();
    if (!this.options.engine.subscribe) {
      this.cancelActiveRequest();
    } else {
      this.liveRun?.trace.destroy();
      this.liveRun = null;
    }
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
    this.liveActivityBar?.destroy();
    this.wrapperEl.empty();

    // 1. Scrollable Messages Container
    this.messagesContainer = this.wrapperEl.createDiv({ cls: 'ofc-agent-sidebar-messages' });

    // 2. Sticky Bulk Approval Bar (shown when 2+ actionable proposals are pending)
    this.bulkActionBar = new ProposalBulkActionBar(this.wrapperEl, {
      onApproveAll: onProgress => this.handleBulkApproveAll(onProgress),
      onRejectAll: () => this.handleBulkRejectAll()
    });

    // 3. Docked Live Activity Bar (visible whenever a run is active, even if scrolled up)
    this.liveActivityBar = new AgentLiveActivityBar(this.wrapperEl, () => {
      this.scrollToBottom();
    });

    // 4. Input Area at Bottom (created before renderMessages so buttons exist for hydration)
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

    this.stopBtn = actionsRow.createEl('button', {
      cls: 'mod-warning ofc-agent-btn-stop is-hidden',
      text: t('agent.sidebar.stop'),
      attr: { type: 'button' }
    });
    this.stopBtn.addEventListener('click', () => {
      this.cancelActiveRequest();
    });

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
          if (!this.unsubscribeEngine) {
            this.renderMessages();
            this.options.onSessionUpdated?.();
          }
          showNotice(t('agent.settings.historyClearedNotice'));
        })();
      });
    }

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

    this.renderMessages();
  }

  private syncRunButtons(running: boolean): void {
    if (!this.submitBtn || !this.stopBtn) {
      return;
    }
    if (running) {
      this.submitBtn.addClass('is-hidden');
      this.stopBtn.removeClass('is-hidden');
    } else {
      this.stopBtn.addClass('is-hidden');
      this.submitBtn.removeClass('is-hidden');
    }
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

  private destroyAnalyticsCards(): void {
    for (const card of this.analyticsCards) {
      card.destroy();
    }
    this.analyticsCards = [];
  }

  public renderMessages(): void {
    this.renderEpoch++;
    this.proposalCards.clear();
    this.destroyAnalyticsCards();
    this.welcomeView = null;
    this.activeFollowUps = null;
    this.liveRun?.trace.destroy();
    this.liveRun = null;
    this.messagesContainer.empty();

    const messages = this.options.engine.getMessages();
    const proposals = this.options.engine.getProposals();
    const activeSnapshot = this.options.engine.getActiveRunSnapshot?.() ?? null;

    if (messages.length === 0 && proposals.length === 0 && !activeSnapshot) {
      this.welcomeView = new AgentWelcomeView(this.messagesContainer, {
        compact: Boolean(this.options.compact),
        onSendPrompt: prompt => this.submitStarterPrompt(prompt),
        onFillPrompt: prompt => this.fillStarterPrompt(prompt)
      });
      this.bulkActionBar?.updateCount(0);
      this.syncRunButtons(false);
      this.liveActivityBar?.hide();
      return;
    }

    const hasStructuredToolTraces =
      Boolean(activeSnapshot) ||
      messages.some(
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

        if (cleanText || (msg.charts && msg.charts.length > 0)) {
          const assistantMsg = this.messagesContainer.createDiv({
            cls: 'ofc-agent-msg ofc-agent-msg-assistant'
          });
          const assistantContent = assistantMsg.createDiv({ cls: 'ofc-agent-msg-content' });
          void this.renderAssistantBubbleWithCharts(assistantContent, cleanText, msg.charts, true);
        }

        if (i === lastAssistantIdx && chips.length > 0) {
          this.mountFollowUpChips(this.messagesContainer, chips);
        }
      } else if (msg.role === 'tool' && !hasStructuredToolTraces) {
        const toolBadge = this.messagesContainer.createDiv({ cls: 'ofc-agent-tool-badge' });
        toolBadge.createSpan({ text: t('agent.sidebar.toolExecuted') });
      }
    }

    for (const proposal of proposals) {
      this.mountProposalCard(proposal);
    }

    if (activeSnapshot) {
      this.hydrateLiveRun(activeSnapshot);
    } else {
      this.syncRunButtons(false);
      this.liveActivityBar?.hide();
    }

    this.refreshBulkActionBar();
    this.scrollToBottom();
  }

  private mountProposalCard(proposal: EventProposal): void {
    if (this.proposalCards.has(proposal.id)) {
      return;
    }
    const actionable =
      this.options.bridge.isProposalActionable?.(proposal) ??
      (proposal.status === 'PENDING' || proposal.status === 'FAILED');
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
            this.options.engine.notifyProposalUpdated?.(
              proposalId,
              'APPROVED',
              undefined,
              this.panelId
            );
            await this.options.engine.saveCurrentSession();
            this.options.onEventMutated?.();
          } else {
            showNotice(res.message);
            const stillActionable = this.options.bridge.getProposal
              ? Boolean(this.options.bridge.getProposal(proposalId))
              : true;
            this.options.engine.notifyProposalUpdated?.(
              proposalId,
              'FAILED',
              res.message,
              this.panelId
            );
            if (!stillActionable) {
              await this.options.engine.saveCurrentSession();
            }
          }
          this.refreshBulkActionBar();
          return res;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          showNotice(t('agent.notices.failedToApply', { error: msg }));
          this.options.engine.notifyProposalUpdated?.(proposalId, 'FAILED', msg, this.panelId);
          this.refreshBulkActionBar();
          return { success: false, message: msg };
        }
      },
      onReject: (proposalId: string) => {
        this.options.bridge.rejectProposal(proposalId);
        showNotice(t('agent.notices.proposalRejected'));
        this.options.engine.notifyProposalUpdated?.(
          proposalId,
          'REJECTED',
          undefined,
          this.panelId
        );
        void this.options.engine.saveCurrentSession();
        this.refreshBulkActionBar();
      },
      onSelectionChange: (proposalId: string) => {
        this.options.engine.notifyProposalSelectionChanged?.(proposalId, this.panelId);
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
          this.options.engine.notifyProposalUpdated?.(
            proposal.id,
            'APPROVED',
            undefined,
            this.panelId
          );
        } else {
          failed++;
          const msg = res.message || '';
          const isStaleOrMissing =
            msg.includes('expired') ||
            msg.includes('not found') ||
            msg.includes('no longer exists') ||
            msg.includes('changed since preview') ||
            msg.includes('categorization is disabled');
          const nextStatus: ProposalStatus =
            isStaleOrMissing || proposal.status === 'FAILED' ? 'FAILED' : 'PENDING';
          card.syncStatus(nextStatus, msg, isStaleOrMissing ? false : undefined);
          this.options.engine.notifyProposalUpdated?.(proposal.id, nextStatus, msg, this.panelId);
        }
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        card.syncStatus('FAILED', msg);
        this.options.engine.notifyProposalUpdated?.(proposal.id, 'FAILED', msg, this.panelId);
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
      const id = card.getProposal().id;
      this.options.bridge.rejectProposal(id);
      card.syncStatus('REJECTED');
      this.options.engine.notifyProposalUpdated?.(id, 'REJECTED', undefined, this.panelId);
    }

    await this.options.engine.saveCurrentSession();
    this.refreshBulkActionBar();
    showNotice(t('agent.proposals.bulkRejectedSummary', { count: pendingCards.length }));
  }

  private isNearBottom(): boolean {
    if (this.scrollRafId !== null) {
      return true;
    }
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

  public async renderAssistantMarkdown(
    container: HTMLElement,
    markdown: string,
    followScroll = false
  ): Promise<void> {
    container.empty();
    await MarkdownRenderer.render(
      this.options.app,
      stripChartAnchors(markdown),
      container,
      '',
      this
    );
    if (followScroll) {
      this.scrollToBottom();
    }
  }

  public async renderAssistantBubbleWithCharts(
    container: HTMLElement,
    markdown: string,
    charts?: AgentChartAttachment[],
    followScroll = false
  ): Promise<void> {
    if (!charts || charts.length === 0) {
      await this.renderAssistantMarkdown(container, markdown, followScroll);
      return;
    }

    const epoch = this.renderEpoch;
    const { ChatAnalyticsCard } = await import('./ChatAnalyticsCard');
    if (this.destroyed || epoch !== this.renderEpoch) {
      return;
    }

    container.empty();
    const chartMap = new Map<string, AgentChartAttachment>();
    for (const c of charts) {
      chartMap.set(c.chartId, c);
    }

    const segments = splitContentByChartAnchors(markdown, new Set(chartMap.keys()));
    const mountedIds = new Set<string>();

    for (const seg of segments) {
      if (this.destroyed || epoch !== this.renderEpoch) {
        return;
      }
      if (seg.type === 'markdown') {
        const mdEl = container.createDiv({ cls: 'ofc-agent-msg-md-segment' });
        await MarkdownRenderer.render(this.options.app, seg.text, mdEl, '', this);
      } else {
        const chart = chartMap.get(seg.chartId);
        if (chart && !mountedIds.has(chart.chartId)) {
          mountedIds.add(chart.chartId);
          this.analyticsCards.push(new ChatAnalyticsCard(this.options.app, container, chart));
        }
      }
    }

    if (this.destroyed || epoch !== this.renderEpoch) {
      return;
    }

    // Fallback: mount any attached chart that the model did not anchor inline
    for (const chart of charts) {
      if (!mountedIds.has(chart.chartId)) {
        this.analyticsCards.push(new ChatAnalyticsCard(this.options.app, container, chart));
      }
    }

    if (followScroll) {
      this.scrollToBottom();
    }
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

  private ensureLiveAssistantBubble(run: LiveRunState): HTMLElement {
    if (!run.currentBubbleEl || !run.currentContentEl) {
      run.currentBubbleEl = this.messagesContainer.createDiv({
        cls: 'ofc-agent-msg ofc-agent-msg-assistant'
      });
      run.currentContentEl = run.currentBubbleEl.createDiv({ cls: 'ofc-agent-msg-content' });
    }
    return run.currentContentEl;
  }

  private beginLiveRun(runId: string, startedAt: number, userText: string | null): void {
    this.welcomeView?.remove();
    this.welcomeView = null;
    this.activeFollowUps?.remove();
    this.activeFollowUps = null;
    this.liveRun?.trace.destroy();

    if (userText !== null) {
      const userMsg = this.messagesContainer.createDiv({
        cls: 'ofc-agent-msg ofc-agent-msg-user'
      });
      userMsg.createDiv({ cls: 'ofc-agent-msg-content', text: userText });
    }

    const trace = new AgentStepTraceView(this.messagesContainer, startedAt);
    this.liveRun = {
      runId,
      trace,
      currentBubbleEl: null,
      currentContentEl: null,
      currentVisibleText: '',
      filter: new StreamingSuggestionsFilter(),
      chartFilter: new StreamingChartAnchorFilter(),
      turnCompleted: false,
      errorRendered: false,
      hadError: false,
      pendingMarkdownRenders: []
    };

    this.syncRunButtons(true);
    this.liveActivityBar.show(startedAt, t('agent.sidebar.thinking'), 0);
    this.scrollToBottom();
  }

  private hydrateLiveRun(snapshot: AgentActiveRunSnapshot): void {
    this.beginLiveRun(snapshot.runId, snapshot.startedAt, null);
    const run = this.liveRun;
    if (!run) {
      return;
    }

    for (const step of snapshot.steps) {
      run.trace.finishTool(step);
    }
    for (const tool of snapshot.inFlightTools) {
      run.trace.addToolStart(tool.id, tool.label);
    }
    const totalSteps = snapshot.steps.length + snapshot.inFlightTools.length;
    this.liveActivityBar.update(snapshot.statusText || t('agent.trace.working'), totalSteps);
    if (snapshot.statusText) {
      run.trace.setPhase(snapshot.statusText);
    }
    if (snapshot.streamingText) {
      this.appendLiveChunk(snapshot.runId, snapshot.streamingText, false);
    }
  }

  private beginLiveTurn(runId: string, turn: number): void {
    const run = this.liveRun;
    if (!run || run.runId !== runId) {
      return;
    }
    if (turn > 1) {
      this.messagesContainer.appendChild(run.trace.getElement());
    }
    run.currentBubbleEl = null;
    run.currentContentEl = null;
    run.currentVisibleText = '';
    run.filter = new StreamingSuggestionsFilter();
    run.chartFilter = new StreamingChartAnchorFilter();
    run.turnCompleted = false;
    const turnLabel = turn === 1 ? t('agent.sidebar.thinking') : t('agent.trace.working');
    run.trace.setPhase(turnLabel);
    this.liveActivityBar.update(turnLabel);
  }

  private appendLiveChunk(runId: string, delta: string, autoScroll = true): void {
    const run = this.liveRun;
    if (!run || run.runId !== runId) {
      return;
    }
    const suggestionClean = run.filter.push(delta);
    const visibleDelta = suggestionClean ? run.chartFilter.push(suggestionClean) : '';
    if (!visibleDelta) {
      return;
    }
    const shouldFollow = autoScroll && this.isNearBottom();
    const isFirstChunk = !run.currentBubbleEl;
    const contentEl = this.ensureLiveAssistantBubble(run);
    if (isFirstChunk && autoScroll) {
      const label = t('agent.trace.working');
      run.trace.setPhase(label);
      this.liveActivityBar.update(label);
    }
    run.currentVisibleText += visibleDelta;
    contentEl.setText(run.currentVisibleText);
    if (shouldFollow) {
      this.scrollToBottom();
    }
  }

  private completeLiveTurn(
    runId: string,
    cleanContent: string,
    suggestions: string[],
    charts?: AgentChartAttachment[]
  ): void {
    const run = this.liveRun;
    if (!run || run.runId !== runId) {
      return;
    }
    run.turnCompleted = true;
    run.chartFilter.finish();
    const shouldFollow = this.isNearBottom();
    const finalText = cleanContent || run.filter.finish().fullCleanText;
    if (finalText.trim().length > 0 || (charts && charts.length > 0)) {
      const contentEl = this.ensureLiveAssistantBubble(run);
      run.pendingMarkdownRenders.push(
        this.renderAssistantBubbleWithCharts(contentEl, finalText, charts, shouldFollow)
      );
    } else if (run.currentBubbleEl && run.currentVisibleText.trim().length === 0) {
      run.currentBubbleEl.remove();
      run.currentBubbleEl = null;
      run.currentContentEl = null;
    }

    if (suggestions.length > 0) {
      this.mountFollowUpChips(this.messagesContainer, suggestions);
    }
    if (shouldFollow) {
      this.scrollToBottom();
    }
  }

  private handleLiveToolStart(
    runId: string,
    info: { id: string; name: string; label: string }
  ): void {
    const run = this.liveRun;
    if (!run || run.runId !== runId) {
      return;
    }
    if (run.currentBubbleEl) {
      this.messagesContainer.appendChild(run.trace.getElement());
      run.currentBubbleEl = null;
      run.currentContentEl = null;
      run.currentVisibleText = '';
    }
    const shouldFollow = this.isNearBottom();
    run.trace.addToolStart(info.id, info.label);
    this.liveActivityBar.incrementStep(info.label);
    if (shouldFollow) {
      this.scrollToBottom();
    }
  }

  private handleLiveToolEnd(runId: string, step: AgentToolStepRecord): void {
    const run = this.liveRun;
    if (!run || run.runId !== runId) {
      return;
    }
    const shouldFollow = this.isNearBottom();
    run.trace.finishTool(step);
    if (shouldFollow) {
      this.scrollToBottom();
    }
  }

  private updateLiveStatus(runId: string, statusText: string): void {
    const run = this.liveRun;
    if (!run || run.runId !== runId || !statusText) {
      return;
    }
    run.trace.setPhase(statusText);
    this.liveActivityBar.update(statusText);
  }

  private handleLiveProposal(runId: string, proposal: EventProposal): void {
    const run = this.liveRun;
    if (!run || run.runId !== runId) {
      return;
    }
    const shouldFollow = this.isNearBottom();
    this.mountProposalCard(proposal);
    if (shouldFollow) {
      this.scrollToBottom();
    }
  }

  private renderLiveError(runId: string, errorText: string): void {
    const run = this.liveRun;
    if (run && run.runId === runId) {
      run.hadError = true;
      if (run.errorRendered) {
        return;
      }
      run.errorRendered = true;
    }
    const errEl = this.messagesContainer.createDiv({
      cls: 'ofc-agent-msg ofc-agent-msg-error'
    });
    this.renderErrorCard(errEl, errorText);
    this.scrollToBottom();
  }

  private finishLiveRun(outcome: 'done' | 'cancelled' | 'error', runId?: string): void {
    const run = this.liveRun;
    if (!run || (runId && run.runId !== runId)) {
      this.syncRunButtons(false);
      this.liveActivityBar.hide();
      return;
    }

    if (outcome === 'cancelled') {
      if (!run.turnCompleted && run.currentBubbleEl) {
        run.currentBubbleEl.remove();
        run.currentBubbleEl = null;
        run.currentContentEl = null;
      }
    } else if (
      !run.turnCompleted &&
      run.currentContentEl &&
      run.currentVisibleText.trim().length > 0
    ) {
      const finished = run.filter.finish();
      if (finished.fullCleanText.trim().length > 0) {
        run.pendingMarkdownRenders.push(
          this.renderAssistantMarkdown(
            run.currentContentEl,
            finished.fullCleanText,
            this.isNearBottom()
          )
        );
      }
      if (finished.suggestions.length > 0) {
        this.mountFollowUpChips(this.messagesContainer, finished.suggestions);
      }
    }

    const traceState = outcome === 'done' && run.hadError ? 'error' : outcome;
    run.trace.finish(traceState);
    this.lastRunMarkdownRenders = [...run.pendingMarkdownRenders];
    this.liveRun = null;
    this.syncRunButtons(false);
    this.liveActivityBar.hide();
  }

  private handleEngineEvent(event: AgentEngineEvent): void {
    switch (event.type) {
      case 'run-start':
        this.lastRunErrorRendered = false;
        this.lastRunMarkdownRenders = [];
        this.beginLiveRun(event.runId, event.startedAt, event.userMessage.content || '');
        this.options.onSessionUpdated?.();
        return;
      case 'status':
        this.updateLiveStatus(event.runId, event.statusText);
        return;
      case 'turn-start':
        this.beginLiveTurn(event.runId, event.turn);
        return;
      case 'chunk':
        this.appendLiveChunk(event.runId, event.chunk);
        return;
      case 'turn-complete':
        this.completeLiveTurn(event.runId, event.cleanContent, event.suggestions, event.charts);
        return;
      case 'tool-start':
        this.handleLiveToolStart(event.runId, event.info);
        return;
      case 'tool-end':
        this.handleLiveToolEnd(event.runId, event.step);
        return;
      case 'proposal-staged':
        this.handleLiveProposal(event.runId, event.proposal);
        return;
      case 'proposal-updated': {
        if (event.originPanelId && event.originPanelId === this.panelId) {
          return;
        }
        const card = this.proposalCards.get(event.proposalId);
        if (card) {
          let actionable = false;
          if (event.status === 'PENDING') {
            actionable = this.options.bridge.isProposalActionable?.(card.getProposal()) ?? true;
          } else if (event.status === 'FAILED') {
            actionable = this.options.bridge.getProposal
              ? Boolean(this.options.bridge.getProposal(event.proposalId))
              : true;
          }
          card.syncStatus(event.status, event.errorMessage ?? null, actionable);
          this.refreshBulkActionBar();
        }
        return;
      }
      case 'proposal-selection-changed':
        if (event.originPanelId && event.originPanelId === this.panelId) {
          return;
        }
        this.proposalCards.get(event.proposalId)?.refreshDisplay();
        return;
      case 'settings-changed':
        for (const card of this.proposalCards.values()) {
          card.refreshDisplay();
        }
        this.refreshBulkActionBar();
        return;
      case 'session-changed':
        this.renderMessages();
        this.options.onSessionUpdated?.();
        return;
      case 'run-end':
        if (event.outcome === 'error' && event.error) {
          this.renderLiveError(event.runId, event.error);
          this.lastRunErrorRendered = true;
        }
        this.finishLiveRun(event.outcome, event.runId);
        this.options.onSessionUpdated?.();
        return;
    }
  }

  private async handleSubmit(): Promise<void> {
    if (
      this.isSubmitting ||
      this.abortController ||
      this.liveRun ||
      this.options.engine.isRunning?.()
    ) {
      return;
    }

    const text = this.inputEl.value.trim();
    if (!text) return;

    if (this.options.beforeSend) {
      this.isSubmitting = true;
      try {
        const allowed = await this.options.beforeSend();
        if (!allowed) return;
      } finally {
        this.isSubmitting = false;
      }
    }

    this.inputEl.value = '';
    setCssProps(this.inputEl, { height: 'auto' });

    if (this.unsubscribeEngine) {
      this.lastRunErrorRendered = false;
      this.lastRunMarkdownRenders = [];
      try {
        await this.options.engine.prompt(text);
      } catch (err) {
        if (!this.lastRunErrorRendered) {
          this.lastRunErrorRendered = true;
          const active = this.liveRun as LiveRunState | null;
          this.renderLiveError(
            active?.runId ?? '',
            err instanceof Error ? err.message : String(err)
          );
        }
      }
      if (this.lastRunMarkdownRenders.length > 0) {
        try {
          await Promise.all(this.lastRunMarkdownRenders);
        } catch (renderErr) {
          this.options.logger?.warn(
            'Failed to render markdown response',
            {},
            renderErr instanceof Error ? renderErr.message : String(renderErr)
          );
        } finally {
          this.lastRunMarkdownRenders = [];
        }
      }
      return;
    }

    // Legacy non-observable mock fallback (used by isolated unit tests)
    const legacyRunId = 'legacy';
    this.beginLiveRun(legacyRunId, Date.now(), text);
    const controller = new AbortController();
    this.abortController = controller;

    try {
      await this.options.engine.prompt(
        text,
        {
          onUserMessageRecorded: () => {
            this.options.onSessionUpdated?.();
          },
          onTurnStart: turn => {
            this.beginLiveTurn(legacyRunId, turn);
          },
          onChunk: delta => {
            this.appendLiveChunk(legacyRunId, delta);
          },
          onTurnComplete: (_turn, cleanContent, suggestions, charts) => {
            this.completeLiveTurn(legacyRunId, cleanContent, suggestions, charts);
          },
          onToolCallStart: info => {
            this.handleLiveToolStart(legacyRunId, info);
          },
          onToolCallEnd: step => {
            this.handleLiveToolEnd(legacyRunId, step);
          },
          onStatus: statusText => {
            this.updateLiveStatus(legacyRunId, statusText);
          },
          onProposal: proposal => {
            this.handleLiveProposal(legacyRunId, proposal);
          },
          onError: err => {
            this.renderLiveError(legacyRunId, err);
          },
          onDone: () => {
            this.options.onSessionUpdated?.();
          }
        },
        controller.signal
      );

      const currentRun = this.liveRun as LiveRunState | null;
      if (currentRun && currentRun.pendingMarkdownRenders.length > 0) {
        try {
          await Promise.all(currentRun.pendingMarkdownRenders);
        } catch (renderErr) {
          this.options.logger?.warn(
            'Failed to render markdown response',
            {},
            renderErr instanceof Error ? renderErr.message : String(renderErr)
          );
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const msg = err instanceof Error ? err.message : String(err);
        this.renderLiveError(legacyRunId, msg);
      }
    } finally {
      const currentRun = this.liveRun as LiveRunState | null;
      const outcome = controller.signal.aborted
        ? 'cancelled'
        : currentRun?.hadError
          ? 'error'
          : 'done';
      this.finishLiveRun(outcome, legacyRunId);
      if (this.abortController === controller) {
        this.abortController = null;
      }
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
