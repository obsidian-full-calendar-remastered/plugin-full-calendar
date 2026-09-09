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
import { renderAgentSettings } from './ui/renderAgentSettings';
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

  public openCommandModal(onEventMutated?: () => void): void {
    new AgentCommandModal(
      this.plugin.app,
      this.engine,
      this.logger,
      this.bridge,
      onEventMutated
    ).open();
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
  AgentCommandModal
};
export type { ChatMessage, EventProposal, AuditEntry } from './types';
