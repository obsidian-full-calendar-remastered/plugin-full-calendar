/**
 * @file index.ts
 * @brief Public interface and coordinator for the Full Calendar Agent feature.
 *
 * @license See LICENSE.md
 */

import type FullCalendarPlugin from '../../main';
import { PluginState } from '../../core/PluginState';
import { CredentialStore } from '../credentials/CredentialStore';
import { AgentStorage } from './core/AgentStorage';
import { AgentAuditLogger } from './core/AgentAuditLogger';
import { AgentCalendarBridge } from './tools/AgentCalendarBridge';
import { SpecLoader } from './core/SpecLoader';
import { AgentClient } from './core/AgentClient';
import { AgentEngine } from './core/AgentEngine';
import { AgentWriteBar } from './ui/AgentWriteBar';
import { AgentCommandModal } from './ui/AgentCommandModal';
import { AgentSidebarView, FULL_CALENDAR_AGENT_VIEW } from './ui/AgentSidebarView';
import { renderAgentSettings } from './ui/renderAgentSettings';
import { t } from '../i18n/i18n';
import './ui/styles/agent.css';

export class AgentManager {
  private plugin: FullCalendarPlugin;
  public storage: AgentStorage;
  public logger: AgentAuditLogger;
  public bridge: AgentCalendarBridge;
  public specLoader: SpecLoader;
  public client: AgentClient;
  public engine: AgentEngine;

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
    this.storage = new AgentStorage(plugin);
    this.logger = new AgentAuditLogger(this.storage);
    this.bridge = new AgentCalendarBridge(this.logger);
    this.specLoader = new SpecLoader(this.storage, this.bridge, this.logger);

    const settings = PluginState.getSettings().agent;
    const apiKey = CredentialStore.getAgentApiKey() || settings?.apiKey || '';

    this.client = new AgentClient(
      {
        endpointUrl: settings?.endpointUrl || 'https://api.openai.com/v1',
        apiKey,
        model: settings?.model || 'gpt-4o-mini',
        temperature: settings?.temperature ?? 0.2,
        maxRetries: settings?.maxRetries ?? 3,
        timeoutMs: settings?.timeoutMs ?? 60000
      },
      this.logger
    );

    this.engine = new AgentEngine(
      this.client,
      this.storage,
      this.logger,
      this.bridge,
      this.specLoader
    );
  }

  public async init(): Promise<void> {
    await this.storage.ensureDir();
    await this.engine.init();
    this.registerViewsAndCommands();
  }

  private registerViewsAndCommands(): void {
    // 1. Encapsulate Sidebar View registration
    this.plugin.registerView(
      FULL_CALENDAR_AGENT_VIEW,
      leaf => new AgentSidebarView(leaf, this.plugin, this.engine, this.logger, this.bridge)
    );

    // 2. Encapsulate Ribbon Icon
    this.plugin.addRibbonIcon('bot', t('commands.openCalendarAgent'), async () => {
      await this.openSidebarView();
    });

    // 3. Encapsulate Command Palette action
    this.plugin.addCommand({
      id: 'full-calendar-agent-bar',
      name: t('commands.openCalendarAgent'),
      callback: async () => {
        await this.openSidebarView();
      }
    });

    // 4. Encapsulate Settings Update subscription
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
    const settings = PluginState.getSettings().agent;
    const apiKey = CredentialStore.getAgentApiKey() || settings?.apiKey || '';

    this.client.updateOptions({
      endpointUrl: settings?.endpointUrl || 'https://api.openai.com/v1',
      apiKey,
      model: settings?.model || 'gpt-4o-mini',
      temperature: settings?.temperature ?? 0.2,
      maxRetries: settings?.maxRetries ?? 3,
      timeoutMs: settings?.timeoutMs ?? 60000
    });
  }

  public createWriteBar(containerEl: HTMLElement, onEventMutated?: () => void): AgentWriteBar {
    return new AgentWriteBar(
      containerEl,
      this.plugin.app,
      this.engine,
      this.logger,
      this.bridge,
      onEventMutated
    );
  }

  public async openSidebarView(): Promise<void> {
    const workspace = this.plugin.app.workspace;
    const existing = workspace.getLeavesOfType(FULL_CALENDAR_AGENT_VIEW)[0];
    if (existing) {
      void workspace.revealLeaf(existing);
      return;
    }

    const leaf = workspace.getRightLeaf(false);
    if (!leaf) return;

    await leaf.setViewState({
      type: FULL_CALENDAR_AGENT_VIEW,
      active: true
    });

    void workspace.revealLeaf(leaf);
  }

  public openCommandModal(onEventMutated?: () => void): void {
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
  FULL_CALENDAR_AGENT_VIEW
};
export type {
  ChatMessage,
  EventProposal,
  AuditEntry,
  AgentSession,
  AgentSessionSummary
} from './types';
