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
import { openExternalUrl } from '../../../utils/openExternalUrl';
import {
  getPricingPlanUrl,
  type ManagedPlanTier
} from '../infrastructure/managed/protocol/managedTypes';
import { AgentChatComponent } from './AgentChatComponent';
import type { AgentWelcomeOnboardingOptions } from './AgentWelcomeView';
import { FULL_CALENDAR_AGENT_VIEW } from '../types';

export { FULL_CALENDAR_AGENT_VIEW };

export interface AgentSidebarExtraOptions {
  onOpenSettings?: () => void;
  onSwitchToByok?: () => Promise<void>;
  isManagedMode?: () => boolean;
  getManagedPlanTier?: () => ManagedPlanTier | null;
  managedOnboarding?: AgentWelcomeOnboardingOptions;
  getPlanStripState?: () => { label: string; showUpgrade: boolean; isWarning: boolean };
  subscribePlanUpdates?: (listener: () => void) => () => void;
}

export class AgentSidebarView extends ItemView {
  private plugin: FullCalendarPlugin;
  private engine: AgentEngine;
  private logger: AgentAuditLogger;
  private bridge: AgentCalendarBridge;

  private headerEl!: HTMLElement;
  private planStripEl: HTMLElement | null = null;
  private sessionSelectEl!: HTMLSelectElement;
  private chatComponent!: AgentChatComponent;
  private unsubscribeEngine: (() => void) | null = null;
  private unsubscribePlan: (() => void) | null = null;
  private dropdownRefreshSeq = 0;
  private isViewClosed = false;
  private onEventMutated?: () => void;
  private beforeSend?: () => Promise<boolean>;
  private extraOptions?: AgentSidebarExtraOptions;

  constructor(
    leaf: WorkspaceLeaf,
    plugin: FullCalendarPlugin,
    engine: AgentEngine,
    logger: AgentAuditLogger,
    bridge: AgentCalendarBridge,
    onEventMutated?: () => void,
    beforeSend?: () => Promise<boolean>,
    extraOptions?: AgentSidebarExtraOptions
  ) {
    super(leaf);
    this.plugin = plugin;
    this.engine = engine;
    this.logger = logger;
    this.bridge = bridge;
    this.onEventMutated = onEventMutated;
    this.beforeSend = beforeSend;
    this.extraOptions = extraOptions;
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
    this.isViewClosed = false;
    await this.engine.init();
    if (!this.isViewClosed) {
      this.render();
    }
  }

  public async onClose(): Promise<void> {
    this.isViewClosed = true;
    this.unsubscribeEngine?.();
    this.unsubscribeEngine = null;
    this.unsubscribePlan?.();
    this.unsubscribePlan = null;
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
    this.unsubscribeEngine?.();
    this.unsubscribeEngine = null;
    this.unsubscribePlan?.();
    this.unsubscribePlan = null;
    this.chatComponent?.unload();
    this.contentEl.empty();
    this.contentEl.addClass('ofc-agent-sidebar-view');

    // 1. Top Header: Session management & Audit
    this.headerEl = this.contentEl.createDiv({ cls: 'ofc-agent-sidebar-header' });
    this.renderHeader();

    // 1b. Quiet Plan & Credit Indicator Strip
    if (this.extraOptions?.getPlanStripState) {
      this.planStripEl = this.contentEl.createDiv({ cls: 'ofc-agent-plan-strip' });
      this.renderPlanStrip();
      this.unsubscribePlan =
        this.extraOptions.subscribePlanUpdates?.(() => {
          this.renderPlanStrip();
        }) ?? null;
    }

    // 2. Chat Component (Messages, suggestions, input, streaming, markdown)
    const hasObservableEngine = typeof this.engine.subscribe === 'function';
    this.chatComponent = new AgentChatComponent(this.contentEl, {
      app: this.plugin.app,
      engine: this.engine,
      bridge: this.bridge,
      logger: this.logger,
      parentComponent: this,
      compact: false,
      onEventMutated: this.onEventMutated,
      onSessionUpdated: hasObservableEngine ? undefined : () => this.updateSessionDropdown(),
      beforeSend: this.beforeSend,
      onOpenSettings: this.extraOptions?.onOpenSettings,
      onSwitchToByok: this.extraOptions?.onSwitchToByok,
      isManagedMode: this.extraOptions?.isManagedMode,
      getManagedPlanTier: this.extraOptions?.getManagedPlanTier,
      managedOnboarding: this.extraOptions?.managedOnboarding
    });

    this.unsubscribeEngine =
      this.engine.subscribe?.(event => {
        if (
          event.type === 'session-changed' ||
          event.type === 'run-start' ||
          event.type === 'run-end'
        ) {
          this.updateSessionDropdown();
        }
        if (event.type === 'settings-changed' || event.type === 'run-end') {
          this.renderPlanStrip();
        }
      }) ?? null;
  }

  private renderPlanStrip(): void {
    if (!this.planStripEl || !this.extraOptions?.getPlanStripState) {
      return;
    }
    const state = this.extraOptions.getPlanStripState();
    this.planStripEl.empty();
    this.planStripEl.className = state.isWarning
      ? 'ofc-agent-plan-strip is-warning'
      : 'ofc-agent-plan-strip';

    const statusBtn = this.planStripEl.createEl('button', {
      cls: 'ofc-agent-plan-pill',
      text: state.label,
      attr: {
        type: 'button',
        title: 'Open agent settings'
      }
    });
    statusBtn.addEventListener('click', () => {
      this.extraOptions?.onOpenSettings?.();
    });

    if (state.showUpgrade) {
      const upgradeBtn = this.planStripEl.createEl('button', {
        cls: 'ofc-agent-plan-upgrade-btn',
        text: 'Upgrade',
        attr: { type: 'button' }
      });
      upgradeBtn.addEventListener('click', () => {
        openExternalUrl(getPricingPlanUrl('pro'));
      });
    }
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
          if (!this.engine.subscribe) {
            this.chatComponent?.cancelActiveRequest();
          }
          await this.engine.switchSession(selectedId);
          if (!this.engine.subscribe) {
            this.chatComponent?.renderMessages();
          }
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
        if (!this.engine.subscribe) {
          this.chatComponent?.cancelActiveRequest();
        }
        await this.engine.createNewSession();
        if (!this.engine.subscribe) {
          this.updateSessionDropdown();
          this.chatComponent?.renderMessages();
        }
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
              if (!this.engine.subscribe) {
                this.chatComponent?.cancelActiveRequest();
              }
              await this.engine.deleteSession(active.id);
              if (!this.engine.subscribe) {
                this.updateSessionDropdown();
                this.chatComponent?.renderMessages();
              }
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
    const seq = ++this.dropdownRefreshSeq;
    void (async () => {
      const sessions = await this.engine.listSessions();
      const active = await this.engine.getActiveSession();
      if (this.isViewClosed || seq !== this.dropdownRefreshSeq || !this.sessionSelectEl) {
        return;
      }

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
