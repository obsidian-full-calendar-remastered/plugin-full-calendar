/**
 * @file AgentSidebarView.ts
 * @brief Dedicated Right Sidebar ItemView for Full Calendar Agent automations.
 *
 * @description
 * Replaces modal dialogs with a persistent, dockable right sidebar view.
 * Features:
 * 1. Multi-session history dropdown (+ New session, Delete session).
 * 2. Full audit logging access.
 * 3. Modular AgentChatComponent embedding the rich conversation interface.
 *
 * @license See LICENSE.md
 */

import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import type FullCalendarPlugin from '../../../main';
import type { AgentEngine } from '../core/AgentEngine';
import type { AgentAuditLogger } from '../core/AgentAuditLogger';
import type { AgentCalendarBridge } from '../tools/AgentCalendarBridge';
import { AgentAuditModal } from './AgentAuditModal';
import { ConfirmModal } from '../../../ui/modals/ConfirmModal';
import { t } from '../../i18n/i18n';
import { AgentChatComponent } from './AgentChatComponent';
import { FULL_CALENDAR_AGENT_VIEW } from '../types';

export { FULL_CALENDAR_AGENT_VIEW };

export class AgentSidebarView extends ItemView {
  private plugin: FullCalendarPlugin;
  private engine: AgentEngine;
  private logger: AgentAuditLogger;
  private bridge: AgentCalendarBridge;

  private headerEl!: HTMLElement;
  private sessionSelectEl!: HTMLSelectElement;
  private chatComponent!: AgentChatComponent;
  private onEventMutated?: () => void;

  constructor(
    leaf: WorkspaceLeaf,
    plugin: FullCalendarPlugin,
    engine: AgentEngine,
    logger: AgentAuditLogger,
    bridge: AgentCalendarBridge,
    onEventMutated?: () => void
  ) {
    super(leaf);
    this.plugin = plugin;
    this.engine = engine;
    this.logger = logger;
    this.bridge = bridge;
    this.onEventMutated = onEventMutated;
  }

  public getViewType(): string {
    return FULL_CALENDAR_AGENT_VIEW;
  }

  public getDisplayText(): string {
    return t('agent.sidebar.viewTitle');
  }

  public getIcon(): string {
    return 'bot';
  }

  public async onOpen(): Promise<void> {
    await this.engine.init();
    this.render();
  }

  public async onClose(): Promise<void> {
    this.chatComponent?.unload();
    this.contentEl.empty();
  }

  public setPrompt(prompt: string): void {
    this.chatComponent?.setPrompt(prompt);
  }

  public focus(): void {
    this.chatComponent?.focus();
  }

  private render(): void {
    this.contentEl.empty();
    this.contentEl.addClass('ofc-agent-sidebar-view');

    // 1. Top Header: Session management & Audit
    this.headerEl = this.contentEl.createDiv({ cls: 'ofc-agent-sidebar-header' });
    this.renderHeader();

    // 2. Chat Component (Messages, suggestions, input, streaming, markdown)
    this.chatComponent = new AgentChatComponent(this.contentEl, {
      app: this.plugin.app,
      engine: this.engine,
      bridge: this.bridge,
      logger: this.logger,
      parentComponent: this,
      compact: false,
      onEventMutated: this.onEventMutated,
      onSessionUpdated: () => this.updateSessionDropdown()
    });
  }

  private renderHeader(): void {
    this.headerEl.empty();

    const leftGroup = this.headerEl.createDiv({ cls: 'ofc-agent-header-left' });
    this.sessionSelectEl = leftGroup.createEl('select', {
      cls: 'dropdown ofc-agent-session-select'
    });
    this.updateSessionDropdown();

    this.sessionSelectEl.addEventListener('change', () => {
      const selectedId = this.sessionSelectEl.value;
      if (selectedId) {
        void (async () => {
          await this.engine.switchSession(selectedId);
          this.chatComponent?.renderMessages();
        })();
      }
    });

    const rightGroup = this.headerEl.createDiv({ cls: 'ofc-agent-header-right' });

    // New Session button
    const newSessionBtn = rightGroup.createEl('button', {
      cls: 'clickable-icon ofc-agent-icon-btn',
      attr: { 'aria-label': t('agent.sidebar.newSession') }
    });
    setIcon(newSessionBtn, 'plus');
    newSessionBtn.addEventListener('click', () => {
      void (async () => {
        await this.engine.createNewSession();
        this.updateSessionDropdown();
        this.chatComponent?.renderMessages();
        this.chatComponent?.focus();
      })();
    });

    // Delete Current Session button
    const deleteSessionBtn = rightGroup.createEl('button', {
      cls: 'clickable-icon ofc-agent-icon-btn',
      attr: { 'aria-label': t('agent.sidebar.deleteSession') }
    });
    setIcon(deleteSessionBtn, 'trash');
    deleteSessionBtn.addEventListener('click', () => {
      void (async () => {
        const active = await this.engine.getActiveSession();
        new ConfirmModal(
          this.app,
          t('agent.sidebar.confirmDeleteTitle'),
          t('agent.sidebar.confirmDeleteBody'),
          () => {
            void (async () => {
              await this.engine.deleteSession(active.id);
              this.updateSessionDropdown();
              this.chatComponent?.renderMessages();
            })();
          },
          t('agent.sidebar.confirmDeleteBtn'),
          'Cancel',
          true
        ).open();
      })();
    });

    // Audit Log button
    const auditBtn = rightGroup.createEl('button', {
      cls: 'clickable-icon ofc-agent-icon-btn',
      attr: { 'aria-label': t('agent.sidebar.viewAuditLogs') }
    });
    setIcon(auditBtn, 'scroll-text');
    auditBtn.addEventListener('click', () => {
      new AgentAuditModal(this.app, this.logger).open();
    });
  }

  private updateSessionDropdown(): void {
    void (async () => {
      const sessions = await this.engine.listSessions();
      const active = await this.engine.getActiveSession();

      this.sessionSelectEl.empty();
      for (const s of sessions) {
        const option = this.sessionSelectEl.createEl('option', {
          text: `${s.title} (${s.messageCount} ${t('agent.sidebar.msgsCount')})`
        });
        option.value = s.id;
        if (s.id === active.id) {
          option.selected = true;
        }
      }
    })();
  }
}
