/**
 * @file AgentCommandModal.ts
 * @brief Modal container for the Agent Write Bar, callable from anywhere in Obsidian.
 *
 * @license See LICENSE.md
 */

import { App, Modal } from 'obsidian';
import type { AgentEngine } from '../core/AgentEngine';
import type { AgentAuditLogger } from '../core/AgentAuditLogger';
import type { AgentCalendarBridge } from '../tools/AgentCalendarBridge';
import { AgentWriteBar } from './AgentWriteBar';

export class AgentCommandModal extends Modal {
  private engine: AgentEngine;
  private logger: AgentAuditLogger;
  private bridge: AgentCalendarBridge;
  private writeBar: AgentWriteBar | null = null;
  private onEventMutated?: () => void;

  constructor(
    app: App,
    engine: AgentEngine,
    logger: AgentAuditLogger,
    bridge: AgentCalendarBridge,
    onEventMutated?: () => void
  ) {
    super(app);
    this.engine = engine;
    this.logger = logger;
    this.bridge = bridge;
    this.onEventMutated = onEventMutated;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText('Full calendar agent');
    contentEl.empty();
    contentEl.addClass('ofc-agent-modal-content');

    this.writeBar = new AgentWriteBar(
      contentEl,
      this.app,
      this.engine,
      this.logger,
      this.bridge,
      () => {
        this.onEventMutated?.();
      }
    );

    this.writeBar.toggleDrawer(true);
    this.writeBar.focus();
  }

  onClose() {
    this.writeBar?.destroy();
    this.writeBar = null;
    this.contentEl.empty();
  }
}
