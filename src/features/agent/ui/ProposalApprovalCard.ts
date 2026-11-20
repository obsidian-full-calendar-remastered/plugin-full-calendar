/**
 * @file ProposalApprovalCard.ts
 * @brief Interactive UI approval card for staged calendar proposals.
 *
 * @description
 * Enforces the write-approval gate by presenting proposed event changes to the user.
 * Updates card state strictly in-place so multi-proposal approvals never cause scroll jumps.
 *
 * @license See LICENSE.md
 */

import type {
  EventProposal,
  CreateEventProposal,
  UpdateEventProposal,
  DeleteEventProposal,
  BatchCreateProposal,
  ProposalStatus
} from '../types';
import { computeProposalApprovalHash } from '../domain/crypto/sha256';
import { t } from '../../i18n/i18n';

export interface ProposalApproveResult {
  success: boolean;
  message?: string;
}

export interface ProposalApprovalCardCallbacks {
  onApprove: (
    proposalId: string,
    overrideCalendarId?: string,
    expectedApprovalHash?: string
  ) => Promise<ProposalApproveResult>;
  onReject: (proposalId: string) => void;
  onEditInModal?: (proposal: EventProposal) => void;
  onStatusChange?: () => void;
  actionable?: boolean;
}

export class ProposalApprovalCard {
  private containerEl: HTMLElement;
  private cardEl: HTMLElement;
  private proposal: EventProposal;
  private onApprove: (
    proposalId: string,
    overrideCalendarId?: string,
    expectedApprovalHash?: string
  ) => Promise<ProposalApproveResult>;
  private onReject: (proposalId: string) => void;
  private onEditInModal?: (proposal: EventProposal) => void;
  private onStatusChange?: () => void;
  private actionable: boolean;
  private errorMessage?: string;
  private approveBtn?: HTMLButtonElement;

  constructor(
    containerEl: HTMLElement,
    proposal: EventProposal,
    callbacks: ProposalApprovalCardCallbacks
  ) {
    this.containerEl = containerEl;
    this.proposal = proposal;
    this.onApprove = callbacks.onApprove;
    this.onReject = callbacks.onReject;
    this.onEditInModal = callbacks.onEditInModal;
    this.onStatusChange = callbacks.onStatusChange;
    this.actionable = callbacks.actionable ?? proposal.status === 'PENDING';
    this.cardEl = this.containerEl.createDiv({ cls: 'ofc-proposal-card' });
    this.render();
  }

  public getProposal(): EventProposal {
    return this.proposal;
  }

  public isActionablePending(): boolean {
    return this.actionable && this.proposal.status === 'PENDING';
  }

  public syncStatus(status?: ProposalStatus, errorMessage?: string, actionable?: boolean): void {
    if (status !== undefined) {
      this.proposal.status = status;
    }
    if (actionable !== undefined) {
      this.actionable = actionable;
    } else if (status === 'APPROVED' || status === 'REJECTED') {
      this.actionable = false;
    }
    this.errorMessage = errorMessage;
    this.render();
    this.onStatusChange?.();
  }

  private getSummaryTitle(): string {
    if (this.proposal.type === 'CREATE') {
      return this.proposal.eventData.title;
    }
    if (this.proposal.type === 'UPDATE') {
      return this.proposal.updatedEvent.title;
    }
    if (this.proposal.type === 'DELETE') {
      return this.proposal.eventTitle;
    }
    return t('agent.proposals.foundBatch', {
      count: this.proposal.items.length,
      calendar: this.proposal.calendarName
    });
  }

  private isResolvedOrStale(): boolean {
    if (this.proposal.status === 'APPROVED' || this.proposal.status === 'REJECTED') {
      return true;
    }
    return this.proposal.status === 'PENDING' && !this.actionable;
  }

  private render(): void {
    this.cardEl.empty();
    this.approveBtn = undefined;

    const resolvedOrStale = this.isResolvedOrStale();
    this.cardEl.toggleClass('ofc-proposal-card-resolved', resolvedOrStale);

    // 1. Header
    const header = this.cardEl.createDiv({ cls: 'ofc-proposal-header' });
    const badge = header.createSpan({ cls: 'ofc-proposal-badge' });

    if (this.proposal.type === 'CREATE') {
      badge.setText(t('agent.proposals.createTitle'));
    } else if (this.proposal.type === 'UPDATE') {
      badge.addClass('ofc-proposal-badge-update');
      badge.setText(t('agent.proposals.updateTitle'));
    } else if (this.proposal.type === 'DELETE') {
      badge.addClass('ofc-proposal-badge-delete');
      badge.setText(t('agent.proposals.deleteTitle'));
    } else if (this.proposal.type === 'BATCH_CREATE') {
      badge.addClass('ofc-proposal-badge-batch');
      badge.setText(t('agent.proposals.batchTitle', { count: this.proposal.items.length }));
    }

    if (resolvedOrStale) {
      this.renderCompactResolvedBody();
      this.renderFooter();
      return;
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

    if (this.errorMessage) {
      this.cardEl.createDiv({ cls: 'ofc-proposal-error', text: this.errorMessage });
    }

    // 3. Footer Action Buttons
    this.renderFooter();
  }

  private renderCompactResolvedBody(): void {
    const body = this.cardEl.createDiv({ cls: 'ofc-proposal-body' });
    body.createDiv({ cls: 'ofc-proposal-title', text: this.getSummaryTitle() });
    if (this.errorMessage) {
      body.createDiv({ cls: 'ofc-proposal-error', text: this.errorMessage });
    }
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
        ? `📅 ${dateStr} (${t('agent.proposals.allDay')})`
        : `📅 ${dateStr} ⏰ ${proposal.eventData.startTime || ''} - ${proposal.eventData.endTime || ''}`
    });

    chips.createSpan({
      cls: 'ofc-proposal-chip',
      text: `📁 ${proposal.calendarName}`
    });

    if (proposal.eventData.description) {
      body.createDiv({
        cls: 'ofc-proposal-desc',
        text: t('agent.proposals.notes', { notes: proposal.eventData.description })
      });
    }
  }

  private renderUpdateBody(body: HTMLElement, proposal: UpdateEventProposal): void {
    body.createDiv({ cls: 'ofc-proposal-title', text: proposal.updatedEvent.title });

    if (proposal.updatedEvent.category) {
      const chips = body.createDiv({ cls: 'ofc-proposal-chips' });
      chips.createSpan({
        cls: 'ofc-proposal-chip ofc-proposal-chip-category',
        text: proposal.updatedEvent.subCategory
          ? `${proposal.updatedEvent.category} / ${proposal.updatedEvent.subCategory}`
          : proposal.updatedEvent.category
      });
    }

    if (proposal.recurrenceScope === 'entire_series') {
      body.createDiv({
        cls: 'ofc-proposal-warning',
        text: 'Scope: Entire recurring series'
      });
    }

    const diffContainer = body.createDiv({ cls: 'ofc-proposal-diff' });
    diffContainer.createEl('strong', { text: t('agent.proposals.changes') });
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
    if (proposal.recurrenceScope === 'entire_series') {
      body.createDiv({
        cls: 'ofc-proposal-warning',
        text: 'Scope: Entire recurring series'
      });
    }
    if (proposal.reason) {
      body.createDiv({ text: `Reason: ${proposal.reason}` });
    }
    body.createDiv({
      cls: 'ofc-proposal-warning',
      text: t('agent.proposals.deleteWarning')
    });
  }

  private renderBatchBody(body: HTMLElement, proposal: BatchCreateProposal): void {
    body.createDiv({
      cls: 'ofc-proposal-title',
      text: t('agent.proposals.foundBatch', {
        count: proposal.items.length,
        calendar: proposal.calendarName
      })
    });

    const batchList = body.createDiv({ cls: 'ofc-proposal-batch-list' });

    for (const item of proposal.items) {
      const row = batchList.createDiv({ cls: 'ofc-proposal-batch-row' });
      const cb = row.createEl('input', { attr: { type: 'checkbox' } });
      cb.checked = item.selected;
      cb.addEventListener('change', () => {
        item.selected = cb.checked;
        this.proposal.approvalHash = computeProposalApprovalHash(this.proposal);
        this.updateBatchApproveBtn();
      });

      const dateStr = item.eventData.type === 'single' ? item.eventData.date : '';
      const timeStr = item.eventData.allDay
        ? t('agent.proposals.allDay')
        : `${item.eventData.startTime || ''} - ${item.eventData.endTime || ''}`;

      row.createSpan({
        text: `${dateStr} (${timeStr}) — ${item.cleanTitle}`,
        cls: 'ofc-batch-item-text'
      });

      if (item.category) {
        row.createSpan({
          cls: 'ofc-proposal-chip ofc-proposal-chip-category',
          text: item.subCategory ? `${item.category} / ${item.subCategory}` : item.category
        });
      }
    }
  }

  private updateBatchApproveBtn(): void {
    if (this.proposal.type === 'BATCH_CREATE' && this.approveBtn) {
      const batch = this.proposal;
      const count = batch.items.filter(i => i.selected).length;
      this.approveBtn.setText(t('agent.proposals.approveSelected', { count }));
      this.approveBtn.disabled = count === 0;
    }
  }

  private renderFooter(): void {
    const footer = this.cardEl.createDiv({ cls: 'ofc-proposal-footer' });

    if (this.proposal.status === 'APPROVED') {
      footer.createSpan({
        cls: 'ofc-proposal-status-tag ofc-proposal-status-approved',
        text: `✓ ${t('agent.proposals.applied')}`
      });
      return;
    }

    if (this.proposal.status === 'REJECTED') {
      footer.createSpan({
        cls: 'ofc-proposal-status-tag ofc-proposal-status-rejected',
        text: `✕ ${t('agent.proposals.rejected')}`
      });
      return;
    }

    if (this.proposal.status === 'PENDING' && !this.actionable) {
      footer.createSpan({
        cls: 'ofc-proposal-status-tag ofc-proposal-status-expired',
        text: t('agent.proposals.expired')
      });
      return;
    }

    // Reject button
    const rejectBtn = footer.createEl('button', {
      cls: 'ofc-agent-btn ofc-agent-btn-danger',
      text: t('agent.proposals.reject'),
      attr: { type: 'button' }
    });
    rejectBtn.addEventListener('click', () => {
      this.onReject(this.proposal.id);
      this.syncStatus('REJECTED');
    });

    // Optional: Edit in Modal button
    if (this.proposal.type === 'CREATE' && this.onEditInModal) {
      const editBtn = footer.createEl('button', {
        cls: 'ofc-agent-btn',
        text: t('agent.proposals.editInModal'),
        attr: { type: 'button' }
      });
      editBtn.addEventListener('click', () => {
        this.onEditInModal?.(this.proposal);
      });
    }

    // Approve button
    const isRetry = this.proposal.status === 'FAILED' || Boolean(this.errorMessage);
    const defaultApproveText =
      this.proposal.type === 'BATCH_CREATE'
        ? t('agent.proposals.approveSelected', {
            count: this.proposal.items.filter(i => i.selected).length
          })
        : isRetry
          ? t('agent.proposals.retryApply')
          : t('agent.proposals.approveApply');

    this.approveBtn = footer.createEl('button', {
      cls: 'ofc-agent-btn ofc-agent-btn-primary',
      text: defaultApproveText,
      attr: { type: 'button' }
    });

    this.approveBtn.addEventListener('click', () => {
      void (async () => {
        if (this.approveBtn) {
          this.approveBtn.disabled = true;
          this.approveBtn.setText(t('agent.proposals.applying'));
        }
        try {
          const res = await this.onApprove(this.proposal.id, undefined, this.proposal.approvalHash);
          if (res.success) {
            this.syncStatus('APPROVED');
            return;
          }

          const msg = res.message || '';
          const isStaleOrMissing =
            msg.includes('expired') ||
            msg.includes('not found') ||
            msg.includes('no longer exists') ||
            msg.includes('changed since preview');
          if (isStaleOrMissing) {
            this.syncStatus(this.proposal.status, msg, false);
          } else {
            const nextStatus: ProposalStatus =
              this.proposal.status === 'FAILED' ? 'FAILED' : 'PENDING';
            this.syncStatus(nextStatus, msg || 'Failed to apply proposal.');
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.syncStatus('FAILED', msg);
        }
      })();
    });
  }
}
