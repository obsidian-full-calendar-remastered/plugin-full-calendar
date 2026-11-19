/**
 * @file ManagedOnboardingModal.ts
 * @brief First-use disclosure modal for Managed AI (GDPR, Zero Data Retention, Free Trial, Plans, and BYOK choice).
 *
 * @license See LICENSE.md
 */

import { type App, Modal } from 'obsidian';
import { showNotice } from '../../../../../utils/showNotice';
import {
  type IManagedAccountService,
  type IManagedActivationService,
  MANAGED_PLAN_CATALOG
} from '../protocol/managedTypes';
import { startTrialWithVerification } from './ExternalVerificationModal';

export interface ManagedOnboardingModalOptions {
  app: App;
  accountService: IManagedAccountService;
  activationService?: IManagedActivationService;
  onAcknowledgeTrial: () => Promise<void>;
  onSwitchToByok: () => Promise<void>;
}

/**
 * Displays a one-time onboarding modal on the user's first Managed AI prompt,
 * clearly disclosing GDPR compliance, Zero Data Retention (ZDR), the
 * free trial, paid plan options ($7 Pro / $11 Power), and the BYOK alternative.
 */
export function promptManagedOnboarding(options: ManagedOnboardingModalOptions): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    const modal = new ManagedOnboardingModal(options, resolve);
    modal.open();
  });
}

class ManagedOnboardingModal extends Modal {
  private readonly options: ManagedOnboardingModalOptions;
  private readonly resolveOutcome: (proceed: boolean) => void;
  private settled = false;

  constructor(options: ManagedOnboardingModalOptions, resolveOutcome: (proceed: boolean) => void) {
    super(options.app);
    this.options = options;
    this.resolveOutcome = resolveOutcome;
  }

  private finish(proceed: boolean): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveOutcome(proceed);
    this.close();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ofc-managed-onboarding-modal');

    contentEl.createEl('h2', { text: 'Welcome to full calendar agent' });

    const intro = contentEl.createDiv({ cls: 'ofc-managed-status-panel' });
    intro.createEl('p', {
      cls: 'ofc-managed-status-line',
      text: 'Strictly gdpr-compliant with zero data retention (zdr)'
    });
    intro.createEl('p', {
      cls: 'ofc-managed-status-sub',
      text: 'Requests run transiently over stateless eu inference endpoints with model training disabled. Neither your prompts nor your calendar events are ever logged or stored on any server. Chat history stays locally in your vault and every calendar edit requires your explicit approval.'
    });

    const trialCredits = MANAGED_PLAN_CATALOG.trial.grantWtc.toLocaleString('en-US');
    const detailsList = contentEl.createEl('ul', { cls: 'ofc-managed-onboarding-list' });
    detailsList.createEl('li', {
      text: `Free trial ($0): Includes ${trialCredits} lifetime credits with no signup required.`
    });
    detailsList.createEl('li', {
      text: 'Paid plans (optional): Upgrade anytime to pro ($7/month · 10m credits · 3 devices) or power ($11/month · 24m credits · 5 devices).'
    });
    detailsList.createEl('li', {
      text: 'Bring your own key (byok): Switch anytime in settings to use your own OpenAI, Anthropic, groq, ollama, or lm studio endpoint.'
    });

    const activationService = this.options.activationService;
    if (activationService) {
      const licenseRow = contentEl.createDiv({ cls: 'ofc-managed-onboarding-license' });
      const licenseInput = licenseRow.createEl('input', {
        attr: {
          type: 'password',
          placeholder: 'Already have a license key? Paste it here'
        }
      });
      const activateBtn = licenseRow.createEl('button', {
        text: 'Activate key and continue'
      });
      activateBtn.addEventListener('click', () => {
        void (async () => {
          const rawKey = licenseInput.value.trim();
          if (!rawKey) {
            showNotice('Please enter a license key.');
            return;
          }
          activateBtn.disabled = true;
          activateBtn.setText('Activating key...');
          try {
            await activationService.activateLicense(rawKey);
            await this.options.onAcknowledgeTrial();
            showNotice('License activated.');
            this.finish(true);
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unable to activate license key.';
            showNotice(msg);
            activateBtn.disabled = false;
            activateBtn.setText('Activate key and continue');
          }
        })();
      });
    }

    const btnRow = contentEl.createDiv({ cls: 'modal-button-container' });

    const trialBtn = btnRow.createEl('button', {
      cls: 'mod-cta',
      text: 'Start free trial and continue'
    });
    trialBtn.addEventListener('click', () => {
      void (async () => {
        trialBtn.disabled = true;
        trialBtn.setText('Activating free trial...');
        try {
          const activated = await startTrialWithVerification(
            this.app,
            this.options.accountService,
            () => undefined
          );
          if (activated) {
            await this.options.onAcknowledgeTrial();
            this.finish(true);
            return;
          }
          trialBtn.disabled = false;
          trialBtn.setText('Start free trial and continue');
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unable to start free trial.';
          showNotice(msg);
          trialBtn.disabled = false;
          trialBtn.setText('Start free trial and continue');
        }
      })();
    });

    const byokBtn = btnRow.createEl('button', {
      text: 'Switch to bring your own key'
    });
    byokBtn.addEventListener('click', () => {
      void (async () => {
        await this.options.onSwitchToByok();
        showNotice(
          'Switched to bring your own key mode. Configure your API key in agent settings.'
        );
        this.finish(false);
      })();
    });

    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => {
      this.finish(false);
    });
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveOutcome(false);
    }
  }
}
