/**
 * @file AgentWelcomeView.ts
 * @brief Empty-state welcome screen with frictionless 2-card onboarding and starter prompt cards.
 *
 * @license See LICENSE.md
 */

import { setIcon } from 'obsidian';
import { showNotice } from '../../../utils/showNotice';
import { t } from '../../i18n/i18n';
import { MANAGED_PLAN_CATALOG } from '../infrastructure/managed/protocol/managedTypes';

interface StarterItem {
  label: string;
  prompt: string;
  autoSend: boolean;
}

export interface AgentWelcomeOnboardingOptions {
  shouldShow: () => boolean;
  onStartTrial: () => Promise<boolean>;
  onActivateLicense: (key: string) => Promise<void>;
  onSwitchToByok: () => Promise<void>;
}

export interface AgentWelcomeViewOptions {
  compact: boolean;
  onSendPrompt: (prompt: string) => void;
  onFillPrompt: (prompt: string) => void;
  onboarding?: AgentWelcomeOnboardingOptions;
  onRefreshView?: () => void;
}

export class AgentWelcomeView {
  private rootEl: HTMLElement;

  constructor(containerEl: HTMLElement, options: AgentWelcomeViewOptions) {
    if (!options.compact && options.onboarding?.shouldShow()) {
      this.rootEl = containerEl.createDiv({
        cls: 'ofc-agent-welcome ofc-agent-welcome-onboarding'
      });
      this.renderOnboarding(options, options.onboarding);
    } else if (options.compact) {
      this.rootEl = containerEl.createDiv({ cls: 'ofc-agent-welcome ofc-agent-welcome-compact' });
      this.renderCompact(options);
    } else {
      this.rootEl = containerEl.createDiv({ cls: 'ofc-agent-welcome' });
      this.renderFull(options);
    }
  }

  public remove(): void {
    this.rootEl.remove();
  }

  private getStarters(): StarterItem[] {
    return [
      {
        label: t('agent.suggestions.today'),
        prompt: t('agent.suggestions.todayPrompt'),
        autoSend: true
      },
      {
        label: t('agent.suggestions.rescheduleAfternoon'),
        prompt: t('agent.suggestions.rescheduleAfternoonPrompt'),
        autoSend: true
      },
      {
        label: t('agent.suggestions.checkWeather'),
        prompt: t('agent.suggestions.checkWeatherPrompt'),
        autoSend: true
      },
      {
        label: t('agent.suggestions.analyzeTime'),
        prompt: t('agent.suggestions.analyzeTimePrompt'),
        autoSend: true
      },
      {
        label: t('agent.suggestions.addEvent'),
        prompt: t('agent.suggestions.addEventPrompt'),
        autoSend: false
      },
      {
        label: t('agent.suggestions.importUrl'),
        prompt: t('agent.suggestions.importUrlPrompt'),
        autoSend: false
      }
    ];
  }

  private bindStarterClick(
    el: HTMLElement,
    item: StarterItem,
    options: AgentWelcomeViewOptions
  ): void {
    el.addEventListener('click', () => {
      if (item.autoSend) {
        options.onSendPrompt(item.prompt);
      } else {
        options.onFillPrompt(item.prompt);
      }
    });
  }

  private renderOnboarding(
    options: AgentWelcomeViewOptions,
    onboarding: AgentWelcomeOnboardingOptions
  ): void {
    const headerRow = this.rootEl.createDiv({ cls: 'ofc-agent-welcome-header' });
    const iconBadge = headerRow.createSpan({ cls: 'ofc-agent-welcome-icon' });
    setIcon(iconBadge, 'sparkles');
    headerRow.createEl('h3', {
      cls: 'ofc-agent-welcome-title',
      text: 'Choose how to run calendar agent'
    });

    this.rootEl.createEl('p', {
      cls: 'ofc-agent-welcome-subtitle',
      text: '100% of features work free with BYOK — zero paywalls. Reads only your calendar events and optional weather, never your notes.'
    });

    const grid = this.rootEl.createDiv({ cls: 'ofc-agent-onboarding-grid' });
    const trialCredits = MANAGED_PLAN_CATALOG.trial.grantWtc.toLocaleString('en-US');

    // Card 1: Start Instantly (Recommended)
    const instantCard = grid.createDiv({
      cls: 'ofc-agent-onboarding-card ofc-agent-onboarding-card-featured'
    });
    const instantTop = instantCard.createDiv({ cls: 'ofc-agent-onboarding-card-top' });
    instantTop.createSpan({ cls: 'ofc-agent-onboarding-badge', text: 'Recommended' });
    instantCard.createEl('h4', {
      cls: 'ofc-agent-onboarding-card-title',
      text: 'Start instantly'
    });
    instantCard.createEl('p', {
      cls: 'ofc-agent-onboarding-card-desc',
      text: `${trialCredits} free trial credits (${MANAGED_PLAN_CATALOG.trial.estimatedRequestsLabel}). No API key, no signup, no credit card.`
    });
    instantCard.createEl('p', {
      cls: 'ofc-agent-onboarding-card-meta',
      text: 'Strictly GDPR & ZDR on stateless EU inference · pre-tuned for FCR tool-calling.'
    });

    const startBtn = instantCard.createEl('button', {
      cls: 'mod-cta ofc-agent-onboarding-btn',
      text: 'Start free trial',
      attr: { type: 'button' }
    });

    const licenseToggle = instantCard.createEl('button', {
      cls: 'ofc-agent-onboarding-link',
      text: 'Already have a license key?',
      attr: { type: 'button' }
    });
    const licenseRow = instantCard.createDiv({ cls: 'ofc-agent-onboarding-license is-hidden' });
    const licenseInput = licenseRow.createEl('input', {
      attr: {
        type: 'password',
        placeholder: 'Paste license key'
      }
    });
    const activateKeyBtn = licenseRow.createEl('button', {
      cls: 'ofc-agent-btn ofc-agent-btn-secondary',
      text: 'Activate',
      attr: { type: 'button' }
    });

    // Card 2: Bring Your Own Key (Free Forever)
    const byokCard = grid.createDiv({ cls: 'ofc-agent-onboarding-card' });
    const byokTop = byokCard.createDiv({ cls: 'ofc-agent-onboarding-card-top' });
    byokTop.createSpan({
      cls: 'ofc-agent-onboarding-badge ofc-agent-onboarding-badge-free',
      text: 'Free forever'
    });
    byokCard.createEl('h4', {
      cls: 'ofc-agent-onboarding-card-title',
      text: 'Bring your own key (BYOK)'
    });
    byokCard.createEl('p', {
      cls: 'ofc-agent-onboarding-card-desc',
      text: 'Connect any OpenAI-compatible endpoint (cloud or local) directly from your device with zero gateway traffic.'
    });
    byokCard.createEl('p', {
      cls: 'ofc-agent-onboarding-card-meta',
      text: 'Every single feature works free — zero paywalls.'
    });

    const byokBtn = byokCard.createEl('button', {
      cls: 'ofc-agent-onboarding-btn',
      text: 'Use my own key',
      attr: { type: 'button' }
    });

    const setBusy = (busy: boolean) => {
      startBtn.disabled = busy;
      activateKeyBtn.disabled = busy;
      byokBtn.disabled = busy;
    };

    startBtn.addEventListener('click', () => {
      void (async () => {
        setBusy(true);
        startBtn.setText('Activating free trial...');
        try {
          const activated = await onboarding.onStartTrial();
          if (activated) {
            options.onRefreshView?.();
            return;
          }
          setBusy(false);
          startBtn.setText('Start free trial');
        } catch (err) {
          showNotice(err instanceof Error ? err.message : 'Unable to start free trial.');
          setBusy(false);
          startBtn.setText('Start free trial');
        }
      })();
    });

    licenseToggle.addEventListener('click', () => {
      licenseRow.classList.toggle('is-hidden');
      if (!licenseRow.classList.contains('is-hidden')) {
        licenseInput.focus();
      }
    });

    const submitLicense = () => {
      void (async () => {
        const rawKey = licenseInput.value.trim();
        if (!rawKey) {
          showNotice('Please enter a license key.');
          return;
        }
        setBusy(true);
        activateKeyBtn.setText('Activating...');
        try {
          await onboarding.onActivateLicense(rawKey);
          showNotice('License activated.');
          options.onRefreshView?.();
        } catch (err) {
          showNotice(err instanceof Error ? err.message : 'Unable to activate license key.');
          setBusy(false);
          activateKeyBtn.setText('Activate');
        }
      })();
    };

    activateKeyBtn.addEventListener('click', submitLicense);
    licenseInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitLicense();
      }
    });

    byokBtn.addEventListener('click', () => {
      void (async () => {
        setBusy(true);
        try {
          await onboarding.onSwitchToByok();
          options.onRefreshView?.();
        } finally {
          setBusy(false);
        }
      })();
    });
  }

  private renderFull(options: AgentWelcomeViewOptions): void {
    const headerRow = this.rootEl.createDiv({ cls: 'ofc-agent-welcome-header' });
    const iconBadge = headerRow.createSpan({ cls: 'ofc-agent-welcome-icon' });
    setIcon(iconBadge, 'sparkles');
    headerRow.createEl('h3', {
      cls: 'ofc-agent-welcome-title',
      text: t('agent.welcome.greeting')
    });

    this.rootEl.createEl('p', {
      cls: 'ofc-agent-welcome-subtitle',
      text: t('agent.welcome.subtitle')
    });

    const listEl = this.rootEl.createDiv({ cls: 'ofc-agent-welcome-list' });
    for (const item of this.getStarters()) {
      const cardBtn = listEl.createEl('button', {
        cls: 'ofc-agent-welcome-card',
        attr: {
          type: 'button',
          'data-autosend': item.autoSend ? 'true' : 'false'
        }
      });
      cardBtn.createSpan({ text: item.label });
      this.bindStarterClick(cardBtn, item, options);
    }
  }

  private renderCompact(options: AgentWelcomeViewOptions): void {
    this.rootEl.createDiv({
      cls: 'ofc-agent-welcome-compact-title',
      text: t('agent.welcome.greeting')
    });

    const row = this.rootEl.createDiv({ cls: 'ofc-agent-welcome-compact-row' });
    for (const item of this.getStarters().slice(0, 5)) {
      const pillBtn = row.createEl('button', {
        cls: 'ofc-agent-pill',
        text: item.label,
        attr: {
          type: 'button',
          'data-autosend': item.autoSend ? 'true' : 'false'
        }
      });
      this.bindStarterClick(pillBtn, item, options);
    }
  }
}
