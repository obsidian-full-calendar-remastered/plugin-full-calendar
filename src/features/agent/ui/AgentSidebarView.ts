/**
 * @file AgentSidebarView.ts
 * @brief Dedicated Right Sidebar ItemView for Full Calendar Agent automations.
 *
 * @description
 * Replaces modal dialogs with a persistent, dockable right sidebar view.
 * Features:
 * 1. Multi-session history dropdown (+ New session, Delete session).
 * 2. Interactive proposal cards for staged mutations.
 * 3. Token-by-token streaming response bubble with abort capability.
 * 4. Quick action suggestion pills.
 * 5. Full audit logging access.
 *
 * @license See LICENSE.md
 */

import { ItemView, WorkspaceLeaf, setIcon, MarkdownRenderer } from 'obsidian';
import type FullCalendarPlugin from '../../../main';
import type { AgentEngine } from '../core/AgentEngine';
import type { AgentAuditLogger } from '../core/AgentAuditLogger';
import type { AgentCalendarBridge } from '../tools/AgentCalendarBridge';
import { ProposalApprovalCard } from './ProposalApprovalCard';
import { AgentAuditModal } from './AgentAuditModal';
import { ConfirmModal } from '../../../ui/modals/ConfirmModal';
import { showNotice } from '../../../utils/showNotice';
import { t } from '../../i18n/i18n';

export const FULL_CALENDAR_AGENT_VIEW = 'full-calendar-agent-view';

const setCssProps = (element: HTMLElement, props: Record<string, string>): void => {
  Object.entries(props).forEach(([key, value]) => {
    element.style.setProperty(key, value);
  });
};

export class AgentSidebarView extends ItemView {
  private plugin: FullCalendarPlugin;
  private engine: AgentEngine;
  private logger: AgentAuditLogger;
  private bridge: AgentCalendarBridge;

  private headerEl!: HTMLElement;
  private sessionSelectEl!: HTMLSelectElement;
  private messagesContainer!: HTMLElement;
  private statusEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private submitBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;
  private abortController: AbortController | null = null;
  private onEventMutated?: () => void;

  constructor(
    leaf: WorkspaceLeaf,
    plugin: FullCalendarPlugin,
    engine: AgentEngine,
    logger: AgentAuditLogger,
    bridge: AgentCalendarBridge,
    onEventMutated?: () => void
  ) {
    super(leaf);
    this.plugin = plugin;
    this.engine = engine;
    this.logger = logger;
    this.bridge = bridge;
    this.onEventMutated = onEventMutated;
  }

  public getViewType(): string {
    return FULL_CALENDAR_AGENT_VIEW;
  }

  public getDisplayText(): string {
    return t('agent.sidebar.viewTitle');
  }

  public getIcon(): string {
    return 'bot';
  }

  public async onOpen(): Promise<void> {
    await this.engine.init();
    this.render();
  }

  public async onClose(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.contentEl.empty();
  }

  private render(): void {
    this.contentEl.empty();
    this.contentEl.addClass('ofc-agent-sidebar-view');

    // 1. Top Header: Session management & Audit
    this.headerEl = this.contentEl.createDiv({ cls: 'ofc-agent-sidebar-header' });
    this.renderHeader();

    // 2. Scrollable Messages Container
    this.messagesContainer = this.contentEl.createDiv({ cls: 'ofc-agent-sidebar-messages' });
    this.statusEl = this.contentEl.createDiv({ cls: 'ofc-agent-status-indicator is-hidden' });
    this.renderMessages();

    // 3. Suggestion Pills
    const pillsRow = this.contentEl.createDiv({ cls: 'ofc-agent-pills-row' });
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
        this.inputEl.focus();
      });
    }

    // 4. Input Area at Bottom
    const inputArea = this.contentEl.createDiv({ cls: 'ofc-agent-sidebar-input-area' });
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

    this.submitBtn = actionsRow.createEl('button', {
      cls: 'mod-cta ofc-agent-btn-send',
      attr: { 'aria-label': t('agent.sidebar.sendAria') }
    });
    setIcon(this.submitBtn, 'send');
    this.submitBtn.addEventListener('click', () => {
      void this.handleSubmit();
    });
  }

  private renderHeader(): void {
    this.headerEl.empty();

    const leftGroup = this.headerEl.createDiv({ cls: 'ofc-agent-header-left' });
    this.sessionSelectEl = leftGroup.createEl('select', {
      cls: 'dropdown ofc-agent-session-select'
    });
    this.updateSessionDropdown();

    this.sessionSelectEl.addEventListener('change', () => {
      const selectedId = this.sessionSelectEl.value;
      if (selectedId) {
        void (async () => {
          await this.engine.switchSession(selectedId);
          this.renderMessages();
        })();
      }
    });

    const rightGroup = this.headerEl.createDiv({ cls: 'ofc-agent-header-right' });

    // New Session button
    const newSessionBtn = rightGroup.createEl('button', {
      cls: 'clickable-icon ofc-agent-icon-btn',
      attr: { 'aria-label': t('agent.sidebar.newSession') }
    });
    setIcon(newSessionBtn, 'plus');
    newSessionBtn.addEventListener('click', () => {
      void (async () => {
        await this.engine.createNewSession();
        this.updateSessionDropdown();
        this.renderMessages();
        this.inputEl.focus();
      })();
    });

    // Delete Current Session button
    const deleteSessionBtn = rightGroup.createEl('button', {
      cls: 'clickable-icon ofc-agent-icon-btn',
      attr: { 'aria-label': t('agent.sidebar.deleteSession') }
    });
    setIcon(deleteSessionBtn, 'trash');
    deleteSessionBtn.addEventListener('click', () => {
      void (async () => {
        const active = await this.engine.getActiveSession();
        new ConfirmModal(
          this.app,
          t('agent.sidebar.confirmDeleteTitle'),
          t('agent.sidebar.confirmDeleteBody'),
          () => {
            void (async () => {
              await this.engine.deleteSession(active.id);
              this.updateSessionDropdown();
              this.renderMessages();
            })();
          },
          t('agent.sidebar.confirmDeleteBtn'),
          'Cancel',
          true
        ).open();
      })();
    });

    // Audit Log button
    const auditBtn = rightGroup.createEl('button', {
      cls: 'clickable-icon ofc-agent-icon-btn',
      attr: { 'aria-label': t('agent.sidebar.viewAuditLogs') }
    });
    setIcon(auditBtn, 'scroll-text');
    auditBtn.addEventListener('click', () => {
      new AgentAuditModal(this.app, this.logger).open();
    });
  }

  private updateSessionDropdown(): void {
    void (async () => {
      const sessions = await this.engine.listSessions();
      const active = await this.engine.getActiveSession();

      this.sessionSelectEl.empty();
      for (const s of sessions) {
        const option = this.sessionSelectEl.createEl('option', {
          text: `${s.title} (${s.messageCount} ${t('agent.sidebar.msgsCount')})`
        });
        option.value = s.id;
        if (s.id === active.id) {
          option.selected = true;
        }
      }
    })();
  }

  private renderMessages(): void {
    this.messagesContainer.empty();
    const messages = this.engine.getMessages();
    const proposals = this.engine.getProposals();

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
        // Render compact indicator
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
          const res = await this.bridge.commitProposal(proposalId, overrideCalendarId);
          if (res.success) {
            showNotice(t('agent.notices.eventApplied'));
            await this.engine.saveCurrentSession();
            this.onEventMutated?.();
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
        this.bridge.rejectProposal(proposalId);
        showNotice(t('agent.notices.proposalRejected'));
        await this.engine.saveCurrentSession();
        this.renderMessages();
      }
    };
  }

  private scrollToBottom(): void {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  private async renderAssistantMarkdown(container: HTMLElement, markdown: string): Promise<void> {
    container.empty();
    await MarkdownRenderer.render(this.plugin.app, markdown, container, '', this);
  }

  private renderErrorCard(container: HTMLElement, errorText: string): void {
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
      await this.engine.prompt(
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
            this.updateSessionDropdown();
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
}
