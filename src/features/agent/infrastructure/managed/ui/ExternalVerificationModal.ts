/**
 * @file ExternalVerificationModal.ts
 * @brief Out-of-band browser verification modal for Cloudflare Turnstile trial escalation.
 *
 * @license See LICENSE.md
 */

import { type App, Modal } from 'obsidian';
import { openExternalUrl } from '../../../../../utils/openExternalUrl';
import { showNotice } from '../../../../../utils/showNotice';
import {
  type AccountUsageSnapshot,
  type IManagedAccountService,
  MANAGED_PLAN_CATALOG
} from '../protocol/managedTypes';

/**
 * Shared trial registration + Turnstile verification orchestration used by
 * both ManagedOnboardingModal and ManagedSettingsSection.
 * Resolves true if trial was activated, false if browser verification was cancelled.
 */
export async function startTrialWithVerification(
  app: App,
  accountService: IManagedAccountService,
  onActivated: (usage?: AccountUsageSnapshot) => void
): Promise<boolean> {
  const outcome = await accountService.startAnonymousTrial();
  if (outcome.status === 'active') {
    const creditsFormatted = MANAGED_PLAN_CATALOG.trial.grantWtc.toLocaleString('en-US');
    showNotice(`Free trial activated (${creditsFormatted} credits).`);
    onActivated(outcome.usage);
    return true;
  }

  return new Promise<boolean>(resolve => {
    let verified = false;
    const modal = new ExternalVerificationModal(
      app,
      outcome.verificationUrl,
      outcome.transactionId,
      accountService,
      () => {
        verified = true;
        onActivated();
        resolve(true);
      },
      () => {
        if (!verified) {
          resolve(false);
        }
      }
    );
    modal.open();
  });
}

export class ExternalVerificationModal extends Modal {
  private readonly verificationUrl: string;
  private readonly transactionId: string;
  private readonly accountService: IManagedAccountService;
  private readonly onVerified: () => void;
  private readonly onDismissed?: () => void;
  private abortController: AbortController | null = null;

  constructor(
    app: App,
    verificationUrl: string,
    transactionId: string,
    accountService: IManagedAccountService,
    onVerified: () => void,
    onDismissed?: () => void
  ) {
    super(app);
    this.verificationUrl = verificationUrl;
    this.transactionId = transactionId;
    this.accountService = accountService;
    this.onVerified = onVerified;
    this.onDismissed = onDismissed;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h3', { text: 'Verify trial registration' });
    contentEl.createEl('p', {
      text: 'Complete the quick security check in your browser to activate your free trial.'
    });

    const btnRow = contentEl.createDiv({ cls: 'modal-button-container' });

    const openBtn = btnRow.createEl('button', {
      cls: 'mod-cta',
      text: 'Open verification page'
    });
    openBtn.addEventListener('click', () => {
      openExternalUrl(this.verificationUrl);
    });

    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => {
      this.close();
    });

    this.abortController = new AbortController();
    openExternalUrl(this.verificationUrl);

    void this.accountService
      .pollVerification(this.transactionId, this.abortController.signal)
      .then(() => {
        showNotice('Free trial activated.');
        this.onVerified();
        this.close();
      })
      .catch(err => {
        if (this.abortController?.signal.aborted) return;
        const msg = err instanceof Error ? err.message : String(err);
        showNotice(`Verification did not complete: ${msg}`);
        this.close();
      });
  }

  onClose(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.contentEl.empty();
    this.onDismissed?.();
  }
}
