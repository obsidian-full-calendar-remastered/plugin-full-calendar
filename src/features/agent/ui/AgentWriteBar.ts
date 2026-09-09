/**
 * @file AgentWriteBar.ts
 * @brief Docked interactive write bar component for the Full Calendar view.
 *
 * @description
 * Integrates an expandable assistant drawer and prompt input into the calendar view.
 * Supports streaming responses, suggestion pills, interactive proposal cards,
 * and direct inspection of session audit trails.
 *
 * @license See LICENSE.md
 */

import { App, setIcon } from 'obsidian';
import type { AgentEngine } from '../core/AgentEngine';
import type { AgentAuditLogger } from '../core/AgentAuditLogger';
import type { AgentCalendarBridge } from '../tools/AgentCalendarBridge';
import type { EventProposal } from '../types';
import { ProposalApprovalCard } from './ProposalApprovalCard';
import { AgentAuditModal } from './AgentAuditModal';
import { showNotice } from '../../../utils/showNotice';

export class AgentWriteBar {
  private app: App;
  private engine: AgentEngine;
  private logger: AgentAuditLogger;
  private bridge: AgentCalendarBridge;
  private containerEl: HTMLElement;
  private wrapperEl: HTMLElement;
  private drawerEl: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private submitBtn!: HTMLButtonElement;
  private statusEl!: HTMLElement;
  private messagesContainer!: HTMLElement;
  private isDrawerOpen = false;
  private abortController: AbortController | null = null;
  private onEventMutated?: () => void;

  constructor(
    containerEl: HTMLElement,
    app: App,
    engine: AgentEngine,
    logger: AgentAuditLogger,
    bridge: AgentCalendarBridge,
    onEventMutated?: () => void
  ) {
    this.containerEl = containerEl;
    this.app = app;
    this.engine = engine;
    this.logger = logger;
    this.bridge = bridge;
    this.onEventMutated = onEventMutated;

    this.wrapperEl = this.containerEl.createDiv({ cls: 'ofc-agent-write-bar-wrapper' });
    this.drawerEl = this.wrapperEl.createDiv({ cls: 'ofc-agent-drawer is-hidden' });
    this.render();
  }

  public destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.wrapperEl.remove();
  }

  public toggleDrawer(open?: boolean): void {
    this.isDrawerOpen = open !== undefined ? open : !this.isDrawerOpen;
    if (this.isDrawerOpen) {
      this.drawerEl.removeClass('is-hidden');
    } else {
      this.drawerEl.addClass('is-hidden');
    }
  }

  public focus(): void {
    this.toggleDrawer(true);
    this.inputEl.focus();
  }

  private render(): void {
    // 1. Drawer: Message history and status
    this.messagesContainer = this.drawerEl.createDiv({ cls: 'ofc-agent-messages-container' });
    this.statusEl = this.drawerEl.createDiv({ cls: 'ofc-agent-status-indicator' });

    this.renderHistory();

    // 2. Suggestion pills
    const pillsRow = this.wrapperEl.createDiv({ cls: 'ofc-agent-pills-row' });
    const suggestions = [
      { text: "What's my schedule today?", prompt: 'What events do I have scheduled for today?' },
      { text: 'Events this week', prompt: 'Summarize my events for the next 7 days.' },
      { text: 'Add event...', prompt: 'Add a meeting ' },
      {
        text: 'Import from URL...',
        prompt: 'Browse the schedule at this URL and extract the events: '
      }
    ];

    for (const item of suggestions) {
      const pill = pillsRow.createSpan({ cls: 'ofc-agent-pill', text: item.text });
      pill.addEventListener('click', () => {
        this.inputEl.value = item.prompt;
        this.focus();
      });
    }

    // 3. Write Bar Input Row
    const barRow = this.wrapperEl.createDiv({ cls: 'ofc-agent-bar-row' });

    // Icon toggle
    const iconBtn = barRow.createDiv({
      cls: 'ofc-agent-icon-badge',
      attr: { title: 'Toggle Agent Chat History' }
    });
    setIcon(iconBtn, 'bot');
    iconBtn.addEventListener('click', () => this.toggleDrawer());

    // Textarea input
    this.inputEl = barRow.createEl('textarea', {
      cls: 'ofc-agent-input',
      attr: {
        placeholder: 'Ask agent or automate schedule...',
        rows: '1'
      }
    });

    this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.handleSubmit();
      }
    });

    // Action buttons container
    const actions = barRow.createDiv({ cls: 'ofc-agent-actions' });

    // Audit log button
    const auditBtn = actions.createEl('button', {
      cls: 'ofc-agent-btn',
      attr: { title: 'View agent audit trail & logs' }
    });
    setIcon(auditBtn, 'scroll-text');
    auditBtn.addEventListener('click', () => {
      new AgentAuditModal(this.app, this.logger).open();
    });

    // Clear history button
    const clearBtn = actions.createEl('button', {
      cls: 'ofc-agent-btn',
      attr: { title: 'Clear chat history' }
    });
    setIcon(clearBtn, 'trash-2');
    clearBtn.addEventListener('click', () => {
      void (async () => {
        await this.engine.clearHistory();
        this.messagesContainer.empty();
        showNotice('Agent history cleared.');
      })();
    });

    // Send / Stop button
    this.submitBtn = actions.createEl('button', {
      cls: 'ofc-agent-btn ofc-agent-btn-primary',
      text: 'Send'
    });
    this.submitBtn.addEventListener('click', () => void this.handleSubmit());
  }

  private renderHistory(): void {
    this.messagesContainer.empty();
    const messages = this.engine.getMessages();

    for (const msg of messages) {
      if (msg.role === 'user') {
        this.messagesContainer.createDiv({
          cls: 'ofc-agent-msg ofc-agent-msg-user',
          text: msg.content || ''
        });
      } else if (msg.role === 'assistant' && msg.content) {
        this.messagesContainer.createDiv({
          cls: 'ofc-agent-msg ofc-agent-msg-assistant',
          text: msg.content
        });
      }
    }
  }

  private async handleSubmit(): Promise<void> {
    if (this.abortController) {
      // Abort active execution
      this.abortController.abort();
      this.abortController = null;
      this.submitBtn.setText('Send');
      this.statusEl.setText('Cancelled.');
      return;
    }

    const val = this.inputEl.value.trim();
    if (!val) return;

    this.inputEl.value = '';
    this.toggleDrawer(true);

    // Render user message bubble
    this.messagesContainer.createDiv({
      cls: 'ofc-agent-msg ofc-agent-msg-user',
      text: val
    });

    // Create assistant streaming bubble
    const assistantBubble = this.messagesContainer.createDiv({
      cls: 'ofc-agent-msg ofc-agent-msg-assistant',
      text: ''
    });

    this.abortController = new AbortController();
    this.submitBtn.setText('Stop');
    this.submitBtn.addClass('ofc-agent-btn-danger');

    try {
      await this.engine.prompt(
        val,
        {
          onStatus: status => {
            this.statusEl.setText(status);
            this.scrollDrawerToBottom();
          },
          onChunk: delta => {
            assistantBubble.setText(assistantBubble.getText() + delta);
            this.scrollDrawerToBottom();
          },
          onProposal: proposal => {
            this.renderProposalCard(proposal);
          },
          onError: err => {
            assistantBubble.setText(`Error: ${err}`);
            this.scrollDrawerToBottom();
          },
          onDone: () => {
            this.statusEl.setText('');
          }
        },
        this.abortController.signal
      );
    } catch {
      // Error handled in engine callback
    } finally {
      this.abortController = null;
      this.submitBtn.setText('Send');
      this.submitBtn.removeClass('ofc-agent-btn-danger');
      this.scrollDrawerToBottom();
    }
  }

  private renderProposalCard(proposal: EventProposal): void {
    new ProposalApprovalCard(this.messagesContainer, proposal, {
      onApprove: async (id, overrideCalId) => {
        const res = await this.bridge.commitProposal(id, overrideCalId);
        if (res.success) {
          showNotice(res.message);
          this.onEventMutated?.();
        } else {
          showNotice(res.message);
          throw new Error(res.message);
        }
      },
      onReject: id => {
        this.bridge.rejectProposal(id);
        showNotice('Proposal rejected.');
      }
    });
    this.scrollDrawerToBottom();
  }

  private scrollDrawerToBottom(): void {
    window.requestAnimationFrame(() => {
      this.drawerEl.scrollTop = this.drawerEl.scrollHeight;
    });
  }
}
