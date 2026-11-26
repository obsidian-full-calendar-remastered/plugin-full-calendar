/**
 * @file ProposalApprovalCard.ts
 * @brief Modern, compact approval card UI for staged calendar mutations.
 */

import { setIcon } from 'obsidian';
import { t } from '../../i18n/i18n';
import { computeProposalApprovalHash } from '../domain/crypto/sha256';
import type { EventProposal, ProposalStatus } from '../types';
import { setCssProps } from './domUtils';
import {
  extractBatchItemDisplay,
  extractProposalCategory,
  extractProposalHeadingTitle,
  extractProposalSchedule,
  formatDiffFieldValue,
  readProposalDisplayContext,
  type ProposalDisplayContext
} from './proposalFormatters';

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
  onStatusChange?: (proposalId: string, status: ProposalStatus) => void;
  onSelectionChange?: (proposalId: string) => void;
  actionable?: boolean;
}

function isPermanentFailureMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('expired') ||
    lower.includes('not found') ||
    lower.includes('no longer exists') ||
    lower.includes('changed since preview') ||
    lower.includes('categorization is disabled')
  );
}

export class ProposalApprovalCard {
  private containerEl: HTMLElement;
  private proposal: EventProposal;
  private callbacks: ProposalApprovalCardCallbacks;
  private rootEl: HTMLElement;
  private isProcessing = false;
  private errorMessage: string | null = null;
  private actionable: boolean;

  constructor(
    containerEl: HTMLElement,
    proposal: EventProposal,
    callbacks: ProposalApprovalCardCallbacks
  ) {
    this.containerEl = containerEl;
    this.proposal = proposal;
    this.callbacks = callbacks;
    this.actionable = callbacks.actionable !== false;
    this.rootEl = this.containerEl.createDiv({ cls: 'ofc-proposal-card' });
    this.render();
  }

  public getElement(): HTMLElement {
    return this.rootEl;
  }

  public getProposal(): EventProposal {
    return this.proposal;
  }

  public isActionablePending(): boolean {
    return this.proposal.status === 'PENDING' && this.actionable;
  }

  /**
   * Re-renders card display in place without changing proposal status (e.g., on batch toggle or settings change).
   */
  public refreshDisplay(): void {
    this.render();
  }

  /**
   * Updates status and optionally error state in place without rebuilding parent scroll containers.
   */
  public syncStatus(
    status: ProposalStatus = this.proposal.status,
    errorMessage: string | null = null,
    actionable?: boolean
  ): void {
    this.proposal.status = status;
    this.errorMessage = errorMessage;
    if (actionable !== undefined) {
      this.actionable = actionable;
    }
    this.render();
  }

  private render(): void {
    this.rootEl.empty();
    this.rootEl.className = 'ofc-proposal-card';
    this.rootEl.addClass(this.getTypeClass());

    const ctx = readProposalDisplayContext();
    const status = this.proposal.status;

    if (status === 'APPLIED' || status === 'APPROVED' || status === 'REJECTED') {
      this.renderResolvedRow(ctx, status);
      return;
    }

    this.renderHeaderRow(ctx);
    this.renderBodyContent(ctx);
    this.renderFooterActions(ctx, status);
  }

  private getTypeClass(): string {
    switch (this.proposal.type) {
      case 'CREATE':
        return 'ofc-proposal-type-create';
      case 'UPDATE':
        return 'ofc-proposal-type-update';
      case 'DELETE':
        return 'ofc-proposal-type-delete';
      case 'BATCH_CREATE':
        return 'ofc-proposal-type-batch';
    }
  }

  private getTypeBadgeLabel(): string {
    switch (this.proposal.type) {
      case 'CREATE':
        return t('agent.proposals.createBadge');
      case 'UPDATE':
        return t('agent.proposals.updateBadge');
      case 'DELETE':
        return t('agent.proposals.deleteBadge');
      case 'BATCH_CREATE':
        return t('agent.proposals.batchBadge', { count: this.proposal.items.length });
    }
  }

  private isCategoryOnlyUpdateDisabled(ctx: ProposalDisplayContext): boolean {
    if (this.proposal.type !== 'UPDATE' || ctx.enableAdvancedCategorization) {
      return false;
    }
    const keys = Object.keys(this.proposal.changedFields || {});
    return keys.length > 0 && keys.every(k => k === 'category' || k === 'subCategory');
  }

  private renderResolvedRow(
    ctx: ProposalDisplayContext,
    status: 'APPLIED' | 'APPROVED' | 'REJECTED'
  ): void {
    this.rootEl.addClass('ofc-proposal-card-resolved');
    this.rootEl.addClass(`is-${status.toLowerCase()}`);

    const rowEl = this.rootEl.createDiv({ cls: 'ofc-proposal-resolved' });
    const iconEl = rowEl.createSpan({ cls: 'ofc-proposal-resolved-icon' });
    setIcon(iconEl, status === 'REJECTED' ? 'x-circle' : 'check-circle');

    const titleText =
      this.proposal.type === 'BATCH_CREATE'
        ? this.getTypeBadgeLabel()
        : extractProposalHeadingTitle(this.proposal, ctx);
    rowEl.createSpan({ cls: 'ofc-proposal-resolved-title', text: titleText });

    const scheduleText = extractProposalSchedule(
      this.proposal,
      ctx,
      t('agent.proposals.allDay'),
      t('agent.proposals.recurring'),
      true
    );
    if (scheduleText) {
      rowEl.createSpan({ cls: 'ofc-proposal-resolved-schedule', text: scheduleText });
    }

    const pillText =
      status === 'REJECTED' ? t('agent.proposals.rejected') : t('agent.proposals.applied');
    rowEl.createSpan({
      cls: `ofc-proposal-status-tag ${status === 'REJECTED' ? 'ofc-proposal-status-rejected' : 'ofc-proposal-status-approved'}`,
      text: pillText
    });
  }

  private renderHeaderRow(ctx: ProposalDisplayContext): void {
    const headerEl = this.rootEl.createDiv({ cls: 'ofc-proposal-header' });
    const leftEl = headerEl.createDiv({ cls: 'ofc-proposal-header-left' });
    leftEl.createSpan({
      cls: 'ofc-proposal-badge',
      text: this.getTypeBadgeLabel()
    });

    if (this.proposal.calendarName) {
      leftEl.createSpan({
        cls: 'ofc-proposal-cal',
        text: this.proposal.calendarName
      });
    }

    const scheduleText = extractProposalSchedule(
      this.proposal,
      ctx,
      t('agent.proposals.allDay'),
      t('agent.proposals.recurring'),
      false
    );
    if (scheduleText) {
      headerEl.createSpan({
        cls: 'ofc-proposal-schedule',
        text: scheduleText
      });
    }
  }

  private renderBodyContent(ctx: ProposalDisplayContext): void {
    const bodyEl = this.rootEl.createDiv({ cls: 'ofc-proposal-body' });

    if (this.proposal.type === 'BATCH_CREATE') {
      this.renderBatchBody(bodyEl, ctx);
      return;
    }

    const headingTitle = extractProposalHeadingTitle(this.proposal, ctx);
    bodyEl.createDiv({ cls: 'ofc-proposal-title', text: headingTitle });

    const catMeta = extractProposalCategory(this.proposal, ctx);
    if (catMeta.category) {
      const catRow = bodyEl.createDiv({ cls: 'ofc-proposal-cat-row' });
      const dotEl = catRow.createSpan({ cls: 'ofc-proposal-cat-dot' });
      if (catMeta.color) {
        setCssProps(dotEl, { '--ofc-cat-color': catMeta.color });
      }
      catRow.createSpan({ cls: 'ofc-proposal-cat-name', text: catMeta.category });
      if (catMeta.subCategory) {
        const sepEl = catRow.createSpan({ cls: 'ofc-proposal-cat-sep', text: '\u203a' });
        sepEl.setAttribute('aria-hidden', 'true');
        catRow.createSpan({ cls: 'ofc-proposal-subcat-name', text: catMeta.subCategory });
      }
    }

    if (this.proposal.type === 'CREATE') {
      if (this.proposal.eventData.location) {
        bodyEl.createDiv({
          cls: 'ofc-proposal-meta-line',
          text: this.proposal.eventData.location
        });
      }
      if (this.proposal.eventData.description) {
        bodyEl.createDiv({
          cls: 'ofc-proposal-meta-line',
          text: t('agent.proposals.notes', { notes: this.proposal.eventData.description })
        });
      }
      return;
    }

    if (this.proposal.type === 'UPDATE') {
      this.renderUpdateDiffBox(bodyEl, ctx);
      return;
    }

    if (this.proposal.reason) {
      bodyEl.createDiv({ cls: 'ofc-proposal-meta-line', text: this.proposal.reason });
    }
    bodyEl.createDiv({
      cls: 'ofc-proposal-delete-warn',
      text: t('agent.proposals.deleteWarning')
    });
  }

  private formatDiffFieldName(field: string): string {
    switch (field) {
      case 'title':
        return t('agent.proposals.fieldTitle');
      case 'date':
        return t('agent.proposals.fieldDate');
      case 'startTime':
        return t('agent.proposals.fieldStartTime');
      case 'endTime':
        return t('agent.proposals.fieldEndTime');
      case 'allDay':
        return t('agent.proposals.fieldAllDay');
      case 'category':
        return t('agent.proposals.fieldCategory');
      case 'subCategory':
        return t('agent.proposals.fieldSubCategory');
      case 'description':
        return t('agent.proposals.fieldDescription');
      default:
        return field;
    }
  }

  private renderUpdateDiffBox(bodyEl: HTMLElement, ctx: ProposalDisplayContext): void {
    if (this.proposal.type !== 'UPDATE') {
      return;
    }
    if (this.isCategoryOnlyUpdateDisabled(ctx)) {
      bodyEl.createDiv({
        cls: 'ofc-proposal-meta-line',
        text: t('agent.proposals.categorizationDisabledNotice')
      });
      return;
    }

    const entries = Object.entries(this.proposal.changedFields || {}).filter(([field]) => {
      if (!ctx.enableAdvancedCategorization && (field === 'category' || field === 'subCategory')) {
        return false;
      }
      return true;
    });
    if (entries.length === 0) {
      return;
    }

    const diffListEl = bodyEl.createDiv({ cls: 'ofc-proposal-diff-list' });
    const noneLabel = t('agent.proposals.noneValue');
    const allDayLabel = t('agent.proposals.allDay');
    const timedLabel = t('agent.proposals.timedEvent');

    for (const [field, change] of entries) {
      const rowEl = diffListEl.createDiv({ cls: 'ofc-proposal-diff-row' });
      rowEl.createDiv({
        cls: 'ofc-proposal-diff-field',
        text: this.formatDiffFieldName(field)
      });

      const stackEl = rowEl.createDiv({ cls: 'ofc-proposal-diff-values' });
      const oldRowEl = stackEl.createDiv({ cls: 'ofc-proposal-diff-old' });
      oldRowEl.createSpan({ cls: 'ofc-proposal-diff-sign', text: '\u2212' });
      oldRowEl.createSpan({
        cls: 'ofc-proposal-diff-text',
        text: formatDiffFieldValue(field, change.old, ctx, noneLabel, allDayLabel, timedLabel)
      });

      const newRowEl = stackEl.createDiv({ cls: 'ofc-proposal-diff-new' });
      newRowEl.createSpan({ cls: 'ofc-proposal-diff-sign', text: '+' });
      newRowEl.createSpan({
        cls: 'ofc-proposal-diff-text',
        text: formatDiffFieldValue(field, change.new, ctx, noneLabel, allDayLabel, timedLabel)
      });
    }
  }

  private renderBatchBody(bodyEl: HTMLElement, ctx: ProposalDisplayContext): void {
    if (this.proposal.type !== 'BATCH_CREATE') {
      return;
    }

    bodyEl.createDiv({
      cls: 'ofc-proposal-meta-line',
      text: t('agent.proposals.foundBatch', {
        count: this.proposal.items.length,
        calendar: this.proposal.calendarName
      })
    });

    const listEl = bodyEl.createDiv({ cls: 'ofc-proposal-batch-list' });
    const allDayLabel = t('agent.proposals.allDay');
    const recurringLabel = t('agent.proposals.recurring');

    for (const item of this.proposal.items) {
      const itemRow = listEl.createDiv({ cls: 'ofc-proposal-batch-row' });
      const checkbox = itemRow.createEl('input', { attr: { type: 'checkbox' } });
      checkbox.checked = item.selected;

      const infoEl = itemRow.createDiv({ cls: 'ofc-proposal-batch-info' });
      const itemDisplay = extractBatchItemDisplay(item, ctx, allDayLabel, recurringLabel);
      infoEl.createDiv({ cls: 'ofc-proposal-batch-title', text: itemDisplay.title });

      const subRow = infoEl.createDiv({ cls: 'ofc-proposal-batch-meta' });
      if (itemDisplay.schedule) {
        subRow.createSpan({ text: itemDisplay.schedule });
      }

      if (itemDisplay.category) {
        const catTag = subRow.createSpan({ cls: 'ofc-proposal-batch-cat' });
        const dotEl = catTag.createSpan({ cls: 'ofc-proposal-cat-dot' });
        if (itemDisplay.color) {
          setCssProps(dotEl, { '--ofc-cat-color': itemDisplay.color });
        }
        catTag.createSpan({
          text: itemDisplay.subCategory
            ? `${itemDisplay.category} \u203a ${itemDisplay.subCategory}`
            : itemDisplay.category
        });
      }

      checkbox.addEventListener('change', () => {
        item.selected = checkbox.checked;
        if (this.proposal.type === 'BATCH_CREATE') {
          this.proposal.approvalHash = computeProposalApprovalHash(this.proposal);
        }
        this.updateBatchApproveButtonLabel();
        this.callbacks.onSelectionChange?.(this.proposal.id);
      });
    }
  }

  private renderFooterActions(ctx: ProposalDisplayContext, status: ProposalStatus): void {
    if (this.errorMessage || status === 'FAILED') {
      const errorBox = this.rootEl.createDiv({
        cls: 'ofc-proposal-error',
        text: this.errorMessage || t('agent.proposals.failedStatus')
      });
      errorBox.setAttribute('role', 'alert');
    }

    const footerEl = this.rootEl.createDiv({ cls: 'ofc-proposal-footer' });

    if (!this.actionable && (status === 'PENDING' || status === 'FAILED')) {
      footerEl.createSpan({
        cls: 'ofc-proposal-status-tag ofc-proposal-status-expired',
        text: t('agent.proposals.expired')
      });
      return;
    }

    if (this.proposal.type === 'CREATE' && this.callbacks.onEditInModal && status === 'PENDING') {
      const editBtn = footerEl.createEl('button', {
        cls: 'ofc-agent-btn ofc-agent-btn-secondary ofc-proposal-btn-ghost',
        text: t('agent.proposals.editInModal')
      });
      editBtn.type = 'button';
      editBtn.disabled = this.isProcessing;
      editBtn.addEventListener('click', () => {
        this.callbacks.onEditInModal?.(this.proposal);
      });
    }

    const rejectBtn = footerEl.createEl('button', {
      cls: 'ofc-agent-btn ofc-agent-btn-danger',
      text: t('agent.proposals.reject')
    });
    rejectBtn.type = 'button';
    rejectBtn.disabled = this.isProcessing;

    const approveLabel = this.getApproveLabel(status);
    const approveBtn = footerEl.createEl('button', {
      cls: 'ofc-agent-btn ofc-agent-btn-primary',
      text: approveLabel
    });
    approveBtn.type = 'button';
    approveBtn.disabled =
      this.isProcessing || this.isBatchEmptySelection() || this.isCategoryOnlyUpdateDisabled(ctx);

    rejectBtn.addEventListener('click', () => {
      this.handleReject(rejectBtn, approveBtn);
    });

    approveBtn.addEventListener('click', () => {
      void this.handleApprove(rejectBtn, approveBtn);
    });
  }

  private getApproveLabel(status: ProposalStatus): string {
    if (status === 'FAILED' || Boolean(this.errorMessage)) {
      return t('agent.proposals.retryApply');
    }
    if (this.proposal.type === 'BATCH_CREATE') {
      const selectedCount = this.proposal.items.filter(i => i.selected).length;
      return t('agent.proposals.approveSelected', { count: selectedCount });
    }
    return t('agent.proposals.approveApply');
  }

  private isBatchEmptySelection(): boolean {
    if (this.proposal.type !== 'BATCH_CREATE') {
      return false;
    }
    return this.proposal.items.every(i => !i.selected);
  }

  private updateBatchApproveButtonLabel(): void {
    const primaryBtn = this.rootEl.querySelector<HTMLButtonElement>('.ofc-agent-btn-primary');
    if (!primaryBtn || this.proposal.type !== 'BATCH_CREATE') {
      return;
    }
    const isRetry = this.proposal.status === 'FAILED' || Boolean(this.errorMessage);
    const selectedCount = this.proposal.items.filter(i => i.selected).length;
    if (!isRetry) {
      primaryBtn.setText(t('agent.proposals.approveSelected', { count: selectedCount }));
    }
    primaryBtn.disabled = this.isProcessing || selectedCount === 0;
  }

  private handleReject(rejectBtn: HTMLButtonElement, approveBtn: HTMLButtonElement): void {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    rejectBtn.disabled = true;
    approveBtn.disabled = true;

    try {
      this.callbacks.onReject(this.proposal.id);
      this.proposal.status = 'REJECTED';
      this.errorMessage = null;
      this.isProcessing = false;
      this.callbacks.onStatusChange?.(this.proposal.id, 'REJECTED');
      this.render();
    } catch (err) {
      this.errorMessage = err instanceof Error ? err.message : String(err);
      this.isProcessing = false;
      this.render();
    }
  }

  private async handleApprove(
    rejectBtn: HTMLButtonElement,
    approveBtn: HTMLButtonElement
  ): Promise<void> {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    rejectBtn.disabled = true;
    approveBtn.disabled = true;
    approveBtn.setText(t('agent.proposals.applying'));

    try {
      const result = await this.callbacks.onApprove(
        this.proposal.id,
        undefined,
        this.proposal.approvalHash
      );
      this.isProcessing = false;
      if (result.success) {
        this.proposal.status = 'APPROVED';
        this.errorMessage = null;
        this.callbacks.onStatusChange?.(this.proposal.id, 'APPROVED');
        this.render();
      } else {
        const msg = result.message || t('agent.proposals.failedStatus');
        this.proposal.status = 'FAILED';
        this.errorMessage = msg;
        if (isPermanentFailureMessage(msg)) {
          this.actionable = false;
        }
        this.callbacks.onStatusChange?.(this.proposal.id, 'FAILED');
        this.render();
      }
    } catch (err) {
      this.isProcessing = false;
      this.proposal.status = 'FAILED';
      this.errorMessage = err instanceof Error ? err.message : String(err);
      this.callbacks.onStatusChange?.(this.proposal.id, 'FAILED');
      this.render();
    }
  }
}
