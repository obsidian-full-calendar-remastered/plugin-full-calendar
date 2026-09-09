/**
 * @file ProposalApprovalCard.ts
 * @brief Interactive UI approval card for staged calendar proposals.
 *
 * @description
 * Enforces the write-approval gate by presenting proposed event changes to the user.
 * The user can inspect details, select target calendars, toggle batch items,
 * and explicitly approve or reject before any changes touch the calendar.
 *
 * @license See LICENSE.md
 */

import type {
  EventProposal,
  CreateEventProposal,
  UpdateEventProposal,
  DeleteEventProposal,
  BatchCreateProposal
} from '../types';

export class ProposalApprovalCard {
  private containerEl: HTMLElement;
  private cardEl: HTMLElement;
  private proposal: EventProposal;
  private onApprove: (proposalId: string, overrideCalendarId?: string) => Promise<void>;
  private onReject: (proposalId: string) => void;
  private onEditInModal?: (proposal: EventProposal) => void;

  constructor(
    containerEl: HTMLElement,
    proposal: EventProposal,
    callbacks: {
      onApprove: (proposalId: string, overrideCalendarId?: string) => Promise<void>;
      onReject: (proposalId: string) => void;
      onEditInModal?: (proposal: EventProposal) => void;
    }
  ) {
    this.containerEl = containerEl;
    this.proposal = proposal;
    this.onApprove = callbacks.onApprove;
    this.onReject = callbacks.onReject;
    this.onEditInModal = callbacks.onEditInModal;
    this.cardEl = this.containerEl.createDiv({ cls: 'ofc-proposal-card' });
    this.render();
  }

  private render(): void {
    this.cardEl.empty();

    // 1. Header
    const header = this.cardEl.createDiv({ cls: 'ofc-proposal-header' });
    const badge = header.createSpan({ cls: 'ofc-proposal-badge' });

    if (this.proposal.type === 'CREATE') {
      badge.setText('Proposal: create event');
    } else if (this.proposal.type === 'UPDATE') {
      badge.addClass('ofc-proposal-badge-update');
      badge.setText('Proposal: update event');
    } else if (this.proposal.type === 'DELETE') {
      badge.addClass('ofc-proposal-badge-delete');
      badge.setText('Proposal: delete event');
    } else if (this.proposal.type === 'BATCH_CREATE') {
      badge.addClass('ofc-proposal-badge-batch');
      badge.setText(`Proposal: batch import (${this.proposal.items.length})`);
    }

    // 2. Body
    const body = this.cardEl.createDiv({ cls: 'ofc-proposal-body' });

    if (this.proposal.type === 'CREATE') {
      this.renderCreateBody(body, this.proposal);
    } else if (this.proposal.type === 'UPDATE') {
      this.renderUpdateBody(body, this.proposal);
    } else if (this.proposal.type === 'DELETE') {
      this.renderDeleteBody(body, this.proposal);
    } else if (this.proposal.type === 'BATCH_CREATE') {
      this.renderBatchBody(body, this.proposal);
    }

    // 3. Footer Action Buttons
    this.renderFooter();
  }

  private renderCreateBody(body: HTMLElement, proposal: CreateEventProposal): void {
    body.createDiv({ cls: 'ofc-proposal-title', text: proposal.eventData.title });

    const chips = body.createDiv({ cls: 'ofc-proposal-chips' });
    if (proposal.category) {
      chips.createSpan({
        cls: 'ofc-proposal-chip ofc-proposal-chip-category',
        text: proposal.subCategory
          ? `${proposal.category} / ${proposal.subCategory}`
          : proposal.category
      });
    }

    const dateStr = proposal.eventData.type === 'single' ? proposal.eventData.date : '';
    chips.createSpan({
      cls: 'ofc-proposal-chip',
      text: proposal.eventData.allDay
        ? `📅 ${dateStr} (All Day)`
        : `📅 ${dateStr} ⏰ ${proposal.eventData.startTime || ''} - ${proposal.eventData.endTime || ''}`
    });

    chips.createSpan({
      cls: 'ofc-proposal-chip',
      text: `📁 ${proposal.calendarName}`
    });

    if (proposal.eventData.description) {
      body.createDiv({
        cls: 'ofc-proposal-desc',
        text: `Notes: ${proposal.eventData.description}`
      });
    }
  }

  private renderUpdateBody(body: HTMLElement, proposal: UpdateEventProposal): void {
    body.createDiv({ cls: 'ofc-proposal-title', text: proposal.updatedEvent.title });

    const diffContainer = body.createDiv({ cls: 'ofc-proposal-diff' });
    diffContainer.createEl('strong', { text: 'Changes:' });
    const list = diffContainer.createEl('ul');

    for (const [field, delta] of Object.entries(proposal.changedFields)) {
      const item = list.createEl('li');
      item.createSpan({ text: `${field}: ` });
      const oldStr =
        typeof delta.old === 'string'
          ? delta.old
          : delta.old !== null && delta.old !== undefined
            ? JSON.stringify(delta.old)
            : 'none';
      const newStr =
        typeof delta.new === 'string'
          ? delta.new
          : delta.new !== null && delta.new !== undefined
            ? JSON.stringify(delta.new)
            : 'none';
      item.createEl('s', { text: oldStr, cls: 'ofc-diff-old' });
      item.createSpan({ text: ' → ' });
      item.createEl('strong', { text: newStr, cls: 'ofc-diff-new' });
    }
  }

  private renderDeleteBody(body: HTMLElement, proposal: DeleteEventProposal): void {
    body.createDiv({ cls: 'ofc-proposal-title', text: `Delete: "${proposal.eventTitle}"` });
    if (proposal.reason) {
      body.createDiv({ text: `Reason: ${proposal.reason}` });
    }
    body.createDiv({
      cls: 'ofc-proposal-warning',
      text: '⚠️ This will permanently remove the event from your calendar.'
    });
  }

  private renderBatchBody(body: HTMLElement, proposal: BatchCreateProposal): void {
    body.createDiv({
      cls: 'ofc-proposal-title',
      text: `Found ${proposal.items.length} events for calendar: ${proposal.calendarName}`
    });

    const batchList = body.createDiv({ cls: 'ofc-proposal-batch-list' });

    for (const item of proposal.items) {
      const row = batchList.createDiv({ cls: 'ofc-proposal-batch-row' });
      const cb = row.createEl('input', { attr: { type: 'checkbox' } });
      cb.checked = item.selected;
      cb.addEventListener('change', () => {
        item.selected = cb.checked;
        this.updateBatchApproveBtn();
      });

      const dateStr = item.eventData.type === 'single' ? item.eventData.date : '';
      const timeStr = item.eventData.allDay
        ? 'All Day'
        : `${item.eventData.startTime || ''} - ${item.eventData.endTime || ''}`;

      row.createSpan({
        text: `${dateStr} (${timeStr}) — ${item.cleanTitle}`,
        cls: 'ofc-batch-item-text'
      });

      if (item.category) {
        row.createSpan({
          cls: 'ofc-proposal-chip ofc-proposal-chip-category',
          text: item.category
        });
      }
    }
  }

  private approveBtn?: HTMLButtonElement;

  private updateBatchApproveBtn(): void {
    if (this.proposal.type === 'BATCH_CREATE' && this.approveBtn) {
      const batch = this.proposal;
      const count = batch.items.filter(i => i.selected).length;
      this.approveBtn.setText(`Approve selected (${count})`);
      this.approveBtn.disabled = count === 0;
    }
  }

  private renderFooter(): void {
    const footer = this.cardEl.createDiv({ cls: 'ofc-proposal-footer' });

    // Reject button
    const rejectBtn = footer.createEl('button', {
      cls: 'ofc-agent-btn ofc-agent-btn-danger',
      text: 'Reject'
    });
    rejectBtn.addEventListener('click', () => {
      this.onReject(this.proposal.id);
      this.cardEl.remove();
    });

    // Optional: Edit in Modal button
    if (this.proposal.type === 'CREATE' && this.onEditInModal) {
      const editBtn = footer.createEl('button', {
        cls: 'ofc-agent-btn',
        text: 'Edit in modal'
      });
      editBtn.addEventListener('click', () => {
        this.onEditInModal?.(this.proposal);
      });
    }

    // Approve button
    this.approveBtn = footer.createEl('button', {
      cls: 'ofc-agent-btn ofc-agent-btn-primary',
      text:
        this.proposal.type === 'BATCH_CREATE'
          ? `Approve selected (${this.proposal.items.length})`
          : 'Approve & Apply'
    });

    this.approveBtn.addEventListener('click', () => {
      void (async () => {
        if (this.approveBtn) {
          this.approveBtn.disabled = true;
          this.approveBtn.setText('Applying...');
        }
        try {
          await this.onApprove(this.proposal.id);
          this.cardEl.remove();
        } catch {
          if (this.approveBtn) {
            this.approveBtn.disabled = false;
            this.approveBtn.setText('Retry apply');
          }
        }
      })();
    });
  }
}
