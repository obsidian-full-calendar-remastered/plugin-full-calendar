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
import { AgentWriteBar } from './ui/AgentWriteBar';
import { AgentCommandModal } from './ui/AgentCommandModal';
import { AgentSidebarView, FULL_CALENDAR_AGENT_VIEW } from './ui/AgentSidebarView';
import { AgentChatComponent } from './ui/AgentChatComponent';
import { openAgentSidebarLeaf } from './ui/openAgentSidebar';
import { renderAgentSettings } from './ui/renderAgentSettings';
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
        const ag = ensureAgentSettings();
        ag.managed = { ...ag.managed, onboardingAcknowledged: true };
        await PluginState.saveSettings();
      },
      onSwitchToByok: async () => {
        const ag = ensureAgentSettings();
        ag.mode = 'byok';
        ag.managed = { ...ag.managed, onboardingAcknowledged: true };
        await PluginState.saveSettings();
        this.updateSettings();
      }
    });
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
          () => this.ensureReadyBeforeSend()
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
      () => this.ensureReadyBeforeSend()
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
