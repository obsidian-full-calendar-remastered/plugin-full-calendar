/**
 * @file index.ts
 * @brief Public interface and coordinator for the Full Calendar Agent feature.
 *
 * @license See LICENSE.md
 */

import type FullCalendarPlugin from '../../main';
import { PluginState } from '../../core/PluginState';
import { AgentStorage } from './core/AgentStorage';
import { AgentAuditLogger } from './core/AgentAuditLogger';
import { AgentCalendarBridge } from './tools/AgentCalendarBridge';
import { SpecLoader } from './core/SpecLoader';
import { AgentClient } from './core/AgentClient';
import { AgentEngine } from './core/AgentEngine';
import {
  buildByokClientOptions,
  ensureAgentSettings,
  persistManagedSession
} from './core/agentSettings';
import type { IAgentClient } from './domain/contracts/IAgentClient';
import {
  type ManagedAgentSubsystem,
  createManagedAgentSubsystem,
  promptManagedOnboarding
} from './infrastructure/managed';
import {
  MANAGED_PLAN_CATALOG,
  type ManagedPlanTier
} from './infrastructure/managed/protocol/managedTypes';
import { startTrialWithVerification } from './infrastructure/managed/ui/ExternalVerificationModal';
import { microcreditsToWtc } from './domain/Usage';
import { AgentWriteBar } from './ui/AgentWriteBar';
import { AgentCommandModal } from './ui/AgentCommandModal';
import { AgentSidebarView, FULL_CALENDAR_AGENT_VIEW } from './ui/AgentSidebarView';
import { AgentChatComponent } from './ui/AgentChatComponent';
import { openAgentSidebarLeaf } from './ui/openAgentSidebar';
import { openAgentSettingsModal, renderAgentSettings } from './ui/renderAgentSettings';
import { t } from '../i18n/i18n';
import './ui/styles/agent.css';

export class AgentManager {
  private plugin: FullCalendarPlugin;
  public storage: AgentStorage;
  public logger: AgentAuditLogger;
  public bridge: AgentCalendarBridge;
  public specLoader: SpecLoader;
  private byokClient: AgentClient;
  public engine: AgentEngine;
  private managedSubsystem: ManagedAgentSubsystem | null = null;

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
    this.storage = new AgentStorage(plugin);
    this.logger = new AgentAuditLogger(this.storage);
    this.bridge = new AgentCalendarBridge(this.logger);
    this.specLoader = new SpecLoader(this.storage, this.bridge, this.logger);
    this.byokClient = new AgentClient(buildByokClientOptions(), this.logger);

    this.engine = new AgentEngine(
      this.resolveActiveClient(),
      this.storage,
      this.logger,
      this.bridge,
      this.specLoader
    );
  }

  public getManagedSubsystem(): ManagedAgentSubsystem {
    if (!this.managedSubsystem) {
      this.managedSubsystem = createManagedAgentSubsystem({
        app: this.plugin.app,
        getGatewayUrl: () => PluginState.getSettings().agent?.managed?.gatewayUrl,
        onSessionUpdated: persistManagedSession
      });
    }
    return this.managedSubsystem;
  }

  private resolveActiveClient(): IAgentClient {
    const mode = PluginState.getSettings().agent?.mode ?? 'managed';
    if (mode === 'managed') {
      return this.getManagedSubsystem().client;
    }
    return this.byokClient;
  }

  public async ensureReadyBeforeSend(): Promise<boolean> {
    const allSettings = PluginState.getSettings();
    const mode = allSettings.agent?.mode ?? 'managed';
    if (mode !== 'managed') {
      return true;
    }

    const subsystem = this.getManagedSubsystem();
    if (subsystem.activationService.hasActiveSession()) {
      return true;
    }

    return promptManagedOnboarding({
      app: this.plugin.app,
      accountService: subsystem.accountService,
      activationService: subsystem.activationService,
      onAcknowledgeTrial: async () => {
        await this.acknowledgeManagedOnboarding(false);
      },
      onSwitchToByok: async () => {
        await this.switchToByokAndOpenSettings();
      }
    });
  }

  private async acknowledgeManagedOnboarding(switchToByok = false): Promise<void> {
    const ag = ensureAgentSettings();
    if (switchToByok) {
      ag.mode = 'byok';
    }
    ag.managed = { ...ag.managed, onboardingAcknowledged: true };
    await PluginState.saveSettings();
    this.updateSettings();
  }

  public openSettings(): void {
    openAgentSettingsModal(this.plugin, this.storage, this.logger, this.bridge);
  }

  public async switchToByokAndOpenSettings(): Promise<void> {
    await this.acknowledgeManagedOnboarding(true);
    this.openSettings();
  }

  private getActiveManagedTier(): ManagedPlanTier | null {
    const mode = PluginState.getSettings().agent?.mode ?? 'managed';
    if (mode !== 'managed') {
      return null;
    }
    const snapshot = this.managedSubsystem?.usageService.getUsageSnapshot();
    if (snapshot) {
      return snapshot.planTier;
    }
    return PluginState.getSettings().agent?.managed?.planTier ?? 'trial';
  }

  private getManagedOnboardingOptions() {
    return {
      shouldShow: () => {
        const mode = PluginState.getSettings().agent?.mode ?? 'managed';
        if (mode !== 'managed') return false;
        return !this.getManagedSubsystem().activationService.hasActiveSession();
      },
      onStartTrial: async () => {
        const subsystem = this.getManagedSubsystem();
        const activated = await startTrialWithVerification(
          this.plugin.app,
          subsystem.accountService,
          () => undefined
        );
        if (activated) {
          await this.acknowledgeManagedOnboarding(false);
        }
        return activated;
      },
      onActivateLicense: async (rawKey: string) => {
        const subsystem = this.getManagedSubsystem();
        await subsystem.activationService.activateLicense(rawKey);
        await this.acknowledgeManagedOnboarding(false);
      },
      onSwitchToByok: async () => {
        await this.switchToByokAndOpenSettings();
      }
    };
  }

  private getPlanStripState(): { label: string; showUpgrade: boolean; isWarning: boolean } {
    const ag = PluginState.getSettings().agent;
    const mode = ag?.mode ?? 'managed';
    if (mode === 'byok') {
      return {
        label: 'BYOK · OpenAI-compatible',
        showUpgrade: false,
        isWarning: false
      };
    }

    const subsystem = this.getManagedSubsystem();
    if (!subsystem.activationService.hasActiveSession()) {
      return {
        label: 'Free trial ready · GDPR EU',
        showUpgrade: false,
        isWarning: false
      };
    }

    const snapshot = subsystem.usageService.getUsageSnapshot();
    if (!snapshot) {
      const tier = ag?.managed?.planTier ?? 'trial';
      const tierLabel = MANAGED_PLAN_CATALOG[tier].title;
      return {
        label: `${tierLabel} · GDPR EU`,
        showUpgrade: false,
        isWarning: false
      };
    }

    const remainingWtc = microcreditsToWtc(snapshot.remainingMicrocredits);
    const totalWtc = Math.max(1, microcreditsToWtc(snapshot.totalMicrocredits));
    const pct = Math.max(0, Math.min(100, Math.round((remainingWtc / totalWtc) * 100)));
    const tierLabel = MANAGED_PLAN_CATALOG[snapshot.planTier].title;
    const isLow = pct <= 20 || snapshot.status !== 'active';

    const creditsLabel =
      remainingWtc >= 999_500
        ? `${(remainingWtc / 1_000_000).toFixed(1)}M`
        : remainingWtc >= 1_000
          ? `${Math.round(remainingWtc / 1_000)}K`
          : String(remainingWtc);

    return {
      label: `${tierLabel} · ${creditsLabel} credits (${pct}%)`,
      showUpgrade: snapshot.planTier === 'trial' && isLow,
      isWarning: isLow
    };
  }

  public async init(): Promise<void> {
    await this.storage.ensureDir();
    await this.engine.init();
    this.registerViewsAndCommands();
  }

  private registerViewsAndCommands(): void {
    this.plugin.registerView(
      FULL_CALENDAR_AGENT_VIEW,
      leaf =>
        new AgentSidebarView(
          leaf,
          this.plugin,
          this.engine,
          this.logger,
          this.bridge,
          undefined,
          () => this.ensureReadyBeforeSend(),
          {
            onOpenSettings: () => this.openSettings(),
            onSwitchToByok: () => this.switchToByokAndOpenSettings(),
            isManagedMode: () => (PluginState.getSettings().agent?.mode ?? 'managed') === 'managed',
            getManagedPlanTier: () => this.getActiveManagedTier(),
            managedOnboarding: this.getManagedOnboardingOptions(),
            getPlanStripState: () => this.getPlanStripState(),
            subscribePlanUpdates: listener => {
              const mode = PluginState.getSettings().agent?.mode ?? 'managed';
              if (mode !== 'managed' && !this.managedSubsystem) {
                return () => undefined;
              }
              return this.getManagedSubsystem().usageService.subscribe(() => listener());
            }
          }
        )
    );

    this.plugin.addRibbonIcon('bot', t('commands.openCalendarAgent'), async () => {
      await this.openSidebarView();
    });

    this.plugin.addCommand({
      id: 'full-calendar-agent-bar',
      name: t('commands.openCalendarAgent'),
      callback: async () => {
        await this.openSidebarView();
      }
    });

    const workspaceEvents = this.plugin.app.workspace as unknown as {
      on: (name: string, cb: () => void) => import('obsidian').EventRef;
    };
    this.plugin.registerEvent(
      workspaceEvents.on('full-calendar:settings-updated', () => {
        this.updateSettings();
      })
    );
  }

  public unload(): void {
    // Safe cleanup hook
  }

  public updateSettings(): void {
    this.byokClient.updateOptions(buildByokClientOptions());
    this.engine.setClient(this.resolveActiveClient());
    this.engine.notifySettingsUpdated();
  }

  public createWriteBar(
    containerEl: HTMLElement,
    onEventMutated?: () => void,
    onOpenSidebar?: (initialPrompt?: string) => void,
    parentComponent?: import('obsidian').Component
  ): AgentWriteBar {
    return new AgentWriteBar(
      containerEl,
      this.plugin.app,
      this.engine,
      this.logger,
      this.bridge,
      onEventMutated,
      onOpenSidebar ?? ((initialPrompt?: string) => void this.openSidebarView(initialPrompt)),
      parentComponent,
      () => this.ensureReadyBeforeSend(),
      () => this.openSettings(),
      () => this.switchToByokAndOpenSettings(),
      () => (PluginState.getSettings().agent?.mode ?? 'managed') === 'managed',
      () => this.getActiveManagedTier()
    );
  }

  public async openSidebarView(initialPrompt?: string): Promise<void> {
    await openAgentSidebarLeaf(this.plugin.app, initialPrompt);
  }

  public openCommandModal(): void {
    void this.openSidebarView();
  }

  public renderSettings(containerEl: HTMLElement): void {
    renderAgentSettings(containerEl, this.plugin, this.storage, this.logger, this.bridge);
  }
}

export {
  AgentStorage,
  AgentAuditLogger,
  AgentCalendarBridge,
  AgentClient,
  AgentEngine,
  AgentWriteBar,
  AgentCommandModal,
  AgentSidebarView,
  AgentChatComponent,
  FULL_CALENDAR_AGENT_VIEW
};
export { NormalizedAgentError, isNormalizedAgentError } from './domain/AgentError';
export type { AgentErrorCode } from './domain/AgentError';
export { computeWeightedMicrocredits, microcreditsToWtc } from './domain/Usage';
export type { TokenUsage, ManagedUsageMetadata } from './domain/Usage';
export type {
  IAgentClient,
  StreamCallbacks,
  CompletionResult,
  ChatCompletionRequestConfig,
  ConnectionTestResult
} from './domain/contracts/IAgentClient';
export type {
  ChatMessage,
  EventProposal,
  AuditEntry,
  AgentSession,
  AgentSessionSummary
} from './types';
