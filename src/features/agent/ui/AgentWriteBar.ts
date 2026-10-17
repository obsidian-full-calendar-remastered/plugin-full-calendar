/**
 * @file AgentWriteBar.ts
 * @brief Docked interactive write bar component for the Full Calendar view and Cockpit HUD.
 *
 * @description
 * Integrates the modular AgentChatComponent into compact views (Cockpit HUD, Command Modal).
 * Strictly DRY: reuses the exact same conversation history, MarkdownRenderer formatting,
 * suggestion pills, proposal cards, and streaming logic as the Right Sidebar view.
 *
 * @license See LICENSE.md
 */

import { App, Component } from 'obsidian';
import type { AgentEngine } from '../core/AgentEngine';
import type { AgentAuditLogger } from '../core/AgentAuditLogger';
import type { AgentCalendarBridge } from '../tools/AgentCalendarBridge';
import { AgentChatComponent } from './AgentChatComponent';

export class AgentWriteBar {
  private containerEl: HTMLElement;
  private chatComponent: AgentChatComponent;

  constructor(
    containerEl: HTMLElement,
    app: App,
    engine: AgentEngine,
    logger: AgentAuditLogger,
    bridge: AgentCalendarBridge,
    onEventMutated?: () => void,
    onOpenSidebar?: (initialPrompt?: string) => void,
    parentComponent?: Component
  ) {
    this.containerEl = containerEl;
    this.chatComponent = new AgentChatComponent(this.containerEl, {
      app,
      engine,
      logger,
      bridge,
      parentComponent,
      compact: true,
      showClearBtn: true,
      showOpenPanelBtn: true,
      onEventMutated,
      onOpenSidebar
    });
  }

  public destroy(): void {
    this.chatComponent.unload();
  }

  public toggleDrawer(open?: boolean): void {
    const el = this.chatComponent.getMessagesContainer();
    if (el) {
      if (open === undefined) {
        el.classList.toggle('is-hidden');
      } else if (open) {
        el.classList.remove('is-hidden');
      } else {
        el.classList.add('is-hidden');
      }
    }
  }

  public focus(): void {
    this.chatComponent.focus();
  }

  public async openAgentSidebar(): Promise<void> {
    await this.chatComponent.openFullPanel();
  }
}
