/**
 * @file ManagedSettingsSection.ts
 * @brief Settings UI for Managed AI plan overview, WTC balance transparency, free trial, and Paddle activation.
 *
 * @license See LICENSE.md
 */

import { type App, Setting } from 'obsidian';
import { microcreditsToWtc } from '../../../domain/Usage';
import { bindAsyncButtonAction } from '../../../ui/uiButtonUtils';
import { showNotice } from '../../../../../utils/showNotice';
import type { ManagedAgentSettings } from '../../../../../types/settings';
import {
  type AccountUsageSnapshot,
  type IManagedAccountService,
  type IManagedActivationService,
  type IManagedUsageService,
  getBuildEnvironment
} from '../protocol/managedTypes';
import { startTrialWithVerification } from './ExternalVerificationModal';

export interface ManagedSettingsSectionDeps {
  app: App;
  accountService: IManagedAccountService;
  activationService: IManagedActivationService;
  usageService: IManagedUsageService;
  getManagedSettings: () => ManagedAgentSettings;
  saveSettings: () => Promise<void>;
  onStateChanged?: () => void;
}

interface PlanCardSpec {
  id: 'trial' | 'pro' | 'power';
  title: string;
  price: string;
  allowance: string;
  details: string[];
}

const PLAN_CARDS: PlanCardSpec[] = [
  {
    id: 'trial',
    title: 'Free trial',
    price: '$0',
    allowance: '500,000 credits (lifetime)',
    details: [
      'Up to 500k input, 5M cached, or 125k output tokens',
      '1 active device · 16k token context',
      'No signup required'
    ]
  },
  {
    id: 'pro',
    title: 'Pro',
    price: '$7 / month',
    allowance: '10,000,000 credits / month',
    details: [
      'Up to 10M input, 100M cached, or 2.5M output tokens',
      '3 active devices · 32k token context',
      'Resets every billing cycle'
    ]
  },
  {
    id: 'power',
    title: 'Power',
    price: '$11 / month',
    allowance: '24,000,000 credits / month',
    details: [
      'Up to 24M input, 240M cached, or 6M output tokens',
      '5 active devices · 32k token context',
      'High-volume allowance with prorated upgrades'
    ]
  }
];

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export function renderManagedSettingsSection(
  containerEl: HTMLElement,
  deps: ManagedSettingsSectionDeps
): void {
  containerEl.empty();

  // 1. Visual Plan & Free Trial Comparison Grid
  const plansGrid = containerEl.createDiv({ cls: 'ofc-managed-plans-grid' });
  const activeTier =
    deps.usageService.getUsageSnapshot()?.planTier ?? deps.getManagedSettings().planTier;

  for (const plan of PLAN_CARDS) {
    const card = plansGrid.createDiv({
      cls:
        activeTier === plan.id
          ? 'ofc-managed-plan-card ofc-managed-plan-card-active'
          : 'ofc-managed-plan-card'
    });

    const header = card.createDiv({ cls: 'ofc-managed-plan-header' });
    header.createSpan({ cls: 'ofc-managed-plan-title', text: plan.title });
    header.createSpan({ cls: 'ofc-managed-plan-price', text: plan.price });

    card.createDiv({ cls: 'ofc-managed-plan-allowance', text: plan.allowance });

    const list = card.createEl('ul', { cls: 'ofc-managed-plan-features' });
    for (const item of plan.details) {
      list.createEl('li', { text: item });
    }
  }

  // 2. Live Account & Credit Balance Banner
  const statusContainer = containerEl.createDiv({ cls: 'ofc-managed-status-panel' });
  const renderSummary = (snapshot: AccountUsageSnapshot | null) => {
    statusContainer.empty();
    const meta = deps.getManagedSettings();

    if (!deps.activationService.hasActiveSession() || !snapshot) {
      statusContainer.createEl('p', {
        cls: 'ofc-managed-status-line',
        text: meta.planTier
          ? `Configured plan: ${meta.planTier}. Click "Refresh balance" or activate a license key below.`
          : 'No active session yet. Click "Start free trial" below for 500,000 free credits or paste a license key.'
      });
      statusContainer.createEl('p', {
        cls: 'ofc-managed-status-sub',
        text: 'Credit weights: 1 uncached input token = 1 credit · 1 cached input token = 0.1 credits · 1 output token = 4 credits.'
      });
      return;
    }

    const remainingWtc = microcreditsToWtc(snapshot.remainingMicrocredits);
    const totalWtc = microcreditsToWtc(snapshot.totalMicrocredits);

    statusContainer.createEl('p', {
      cls: 'ofc-managed-status-line',
      text: `Active plan: ${snapshot.planTier.toUpperCase()} (${snapshot.status}) · Remaining credits: ${formatNumber(remainingWtc)} / ${formatNumber(totalWtc)}`
    });
    statusContainer.createEl('p', {
      cls: 'ofc-managed-status-sub',
      text: `Billing period: ${snapshot.periodStart.slice(0, 10)} to ${snapshot.periodEnd.slice(0, 10)} · Tokens used — uncached input: ${formatNumber(snapshot.uncachedInputTokensUsed)}, cached input: ${formatNumber(snapshot.cachedInputTokensUsed)}, output: ${formatNumber(snapshot.outputTokensUsed)} (4x rate).`
    });
  };

  renderSummary(deps.usageService.getUsageSnapshot());

  // 3. Free trial registration
  new Setting(containerEl)
    .setName('Free trial')
    .setDesc('Activate your one-time 500,000-credit lifetime free trial on this device.')
    .addButton(btn => {
      btn.setCta();
      bindAsyncButtonAction(
        btn,
        {
          idleText: 'Start free trial',
          busyText: 'Registering...',
          fallbackError: 'Unable to start trial.'
        },
        async () => {
          await startTrialWithVerification(deps.app, deps.accountService, usage => {
            renderSummary(usage ?? deps.usageService.getUsageSnapshot());
            deps.onStateChanged?.();
          });
        }
      );
    });

  // 4. License key activation (Pro $7 / Power $11)
  let rawLicenseInput = '';
  const currentMasked = deps.getManagedSettings().licenseKeyMasked;
  new Setting(containerEl)
    .setName('License key activation')
    .setDesc(
      currentMasked
        ? `Active license: ${currentMasked}. Paste a new key to switch plans or devices.`
        : 'Paste your Pro ($7/mo) or Power ($11/mo) license key from your purchase email.'
    )
    .addText(text => {
      text.inputEl.type = 'password';
      text.setPlaceholder('Paste license key').onChange(val => {
        rawLicenseInput = val.trim();
      });
    })
    .addButton(btn => {
      bindAsyncButtonAction(
        btn,
        {
          idleText: 'Activate key',
          busyText: 'Activating...',
          fallbackError: 'Activation failed.'
        },
        async () => {
          if (!rawLicenseInput) {
            showNotice('Please enter your license key.');
            return;
          }
          await deps.activationService.activateLicense(rawLicenseInput);
          rawLicenseInput = '';
          showNotice('Device activated successfully.');
          renderSummary(deps.usageService.getUsageSnapshot());
          deps.onStateChanged?.();
        }
      );
    });

  // 5. Usage sync & deactivation
  new Setting(containerEl)
    .setName('Account synchronization')
    .setDesc('Refresh server-authoritative credit balance or release this device activation.')
    .addButton(btn => {
      bindAsyncButtonAction(
        btn,
        {
          idleText: 'Refresh balance',
          fallbackError: 'Unable to refresh balance.'
        },
        async () => {
          const fresh = await deps.usageService.refreshUsage();
          renderSummary(fresh);
          showNotice('Balance refreshed.');
        }
      );
    })
    .addButton(btn => {
      btn.setClass('mod-warning');
      bindAsyncButtonAction(
        btn,
        {
          idleText: 'Deactivate device',
          fallbackError: 'Deactivation failed.'
        },
        async () => {
          await deps.activationService.deactivateDevice();
          renderSummary(null);
          showNotice('Device deactivated and local credentials cleared.');
          deps.onStateChanged?.();
        }
      );
    });

  // 6. Non-production gateway override (hidden in production builds)
  if (getBuildEnvironment() !== 'production') {
    new Setting(containerEl)
      .setName('Staging gateway endpoint')
      .setDesc('Non-production builds only. Production builds always use the official gateway.')
      .addText(text => {
        text
          .setPlaceholder('https://staging-gateway.full-calendar-remastered.in')
          .setValue(deps.getManagedSettings().gatewayUrl || '')
          .onChange(async val => {
            deps.getManagedSettings().gatewayUrl = val.trim();
            await deps.saveSettings();
          });
      });
  }
}
