/**
 * @file ProposalBulkActionBar.ts
 * @brief Sticky bulk approval/rejection bar for multi-proposal agent responses.
 *
 * @license See LICENSE.md
 */

import { t } from '../../i18n/i18n';

export interface ProposalBulkActionBarOptions {
  onApproveAll: (onProgress: (current: number, total: number) => void) => Promise<void>;
  onRejectAll: () => Promise<void>;
}

export class ProposalBulkActionBar {
  private barEl: HTMLElement;
  private countEl: HTMLElement;
  private rejectAllBtn: HTMLButtonElement;
  private approveAllBtn: HTMLButtonElement;
  private options: ProposalBulkActionBarOptions;
  private currentCount = 0;
  private isBusy = false;

  constructor(containerEl: HTMLElement, options: ProposalBulkActionBarOptions) {
    this.options = options;
    this.barEl = containerEl.createDiv({ cls: 'ofc-agent-bulk-bar is-hidden' });
    this.countEl = this.barEl.createSpan({ cls: 'ofc-agent-bulk-count' });

    const actions = this.barEl.createDiv({ cls: 'ofc-agent-bulk-actions' });
    this.rejectAllBtn = actions.createEl('button', {
      cls: 'ofc-agent-btn ofc-agent-btn-danger ofc-agent-bulk-btn',
      text: t('agent.proposals.rejectAll'),
      attr: { type: 'button' }
    });
    this.approveAllBtn = actions.createEl('button', {
      cls: 'ofc-agent-btn ofc-agent-btn-primary ofc-agent-bulk-btn',
      attr: { type: 'button' }
    });

    this.rejectAllBtn.addEventListener('click', () => {
      void this.handleRejectAll();
    });
    this.approveAllBtn.addEventListener('click', () => {
      void this.handleApproveAll();
    });
  }

  public updateCount(pendingCount: number): void {
    this.currentCount = pendingCount;
    if (this.isBusy) {
      return;
    }

    if (pendingCount < 2) {
      this.barEl.addClass('is-hidden');
      return;
    }

    this.barEl.removeClass('is-hidden');
    this.countEl.setText(t('agent.proposals.pendingCount', { count: pendingCount }));
    this.approveAllBtn.setText(t('agent.proposals.approveAll', { count: pendingCount }));
    this.approveAllBtn.disabled = false;
    this.rejectAllBtn.disabled = false;
  }

  private async handleApproveAll(): Promise<void> {
    if (this.isBusy || this.currentCount < 2) {
      return;
    }
    this.isBusy = true;
    this.approveAllBtn.disabled = true;
    this.rejectAllBtn.disabled = true;

    try {
      await this.options.onApproveAll((current, total) => {
        this.approveAllBtn.setText(t('agent.proposals.applyingProgress', { current, total }));
      });
    } finally {
      this.isBusy = false;
      this.updateCount(this.currentCount);
    }
  }

  private async handleRejectAll(): Promise<void> {
    if (this.isBusy || this.currentCount < 2) {
      return;
    }
    this.isBusy = true;
    this.approveAllBtn.disabled = true;
    this.rejectAllBtn.disabled = true;

    try {
      await this.options.onRejectAll();
    } finally {
      this.isBusy = false;
      this.updateCount(this.currentCount);
    }
  }
}
