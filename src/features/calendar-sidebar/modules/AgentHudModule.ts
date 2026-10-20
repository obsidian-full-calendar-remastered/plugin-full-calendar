import { ISidebarModule, SidebarContext } from '../types';
import { SidebarStateStore } from '../SidebarStateStore';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { PluginState } from '../../../core/PluginState';

export class AgentHudModule implements ISidebarModule {
  public readonly id = 'agent';
  public readonly title = 'Calendar Agent';
  public readonly icon = 'bot';
  public readonly defaultCollapsed = false;

  private store: SidebarStateStore;
  private section!: CollapsibleSection;
  private writeBar: { destroy: () => void } | null = null;
  private context: SidebarContext | null = null;
  private retryTimer: number | null = null;
  private isDestroyed = false;

  constructor(store: SidebarStateStore) {
    this.store = store;
  }

  public mount(containerEl: HTMLElement, context: SidebarContext): void {
    this.context = context;
    this.isDestroyed = false;

    this.section = new CollapsibleSection(containerEl, {
      id: 'agent',
      title: 'Calendar Agent',
      icon: 'bot',
      store: this.store,
      defaultCollapsed: false
    });

    this.renderContent();
  }

  private renderContent(): void {
    if (this.isDestroyed || !this.section) {
      return;
    }

    this.clearRetryTimer();

    const contentEl = this.section.getBodyEl();
    contentEl.empty();
    contentEl.addClass('ofc-sidebar-agent-wrapper');

    const agentSettings = PluginState.getSettings().agent;
    if (agentSettings?.enabled === false) {
      if (this.writeBar) {
        this.writeBar.destroy();
        this.writeBar = null;
      }
      const disabledMsg = contentEl.createDiv({ cls: 'ofc-sidebar-empty-state' });
      disabledMsg.createSpan({
        text: 'Calendar agent is disabled in plugin settings.'
      });
      return;
    }

    if (this.context?.plugin?.agentManager) {
      if (this.writeBar) {
        this.writeBar.destroy();
        this.writeBar = null;
      }
      this.writeBar = this.context.plugin.agentManager.createWriteBar(
        contentEl,
        () => {
          this.context?.triggerResize();
        },
        undefined,
        this.context.parentComponent
      );
    } else {
      const emptyMsg = contentEl.createDiv({ cls: 'ofc-sidebar-empty-state' });
      emptyMsg.createSpan({
        text: 'Agent service is initializing...'
      });

      this.scheduleRetry(0);
    }
  }

  private scheduleRetry(attempt: number): void {
    this.clearRetryTimer();
    if (this.isDestroyed || this.writeBar) {
      return;
    }

    const maxAttempts = 50; // 50 * 200ms = 10 seconds of graceful waiting
    if (attempt >= maxAttempts) {
      const contentEl = this.section?.getBodyEl();
      if (!contentEl) return;
      contentEl.empty();
      const emptyMsg = contentEl.createDiv({ cls: 'ofc-sidebar-empty-state' });
      emptyMsg.createSpan({
        text: 'Agent service is taking longer than expected to initialize.'
      });
      const retryBtn = emptyMsg.createEl('button', {
        cls: 'mod-cta',
        text: 'Retry'
      });
      if (typeof retryBtn.setCssProps === 'function') {
        retryBtn.setCssProps({ marginTop: '8px' });
      }
      retryBtn.addEventListener('click', () => {
        this.renderContent();
      });
      return;
    }

    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      if (!this.isDestroyed && !this.writeBar) {
        if (this.context?.plugin?.agentManager) {
          this.renderContent();
        } else {
          this.scheduleRetry(attempt + 1);
        }
      }
    }, 200);
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  public onCacheUpdate(): void {
    // When cache or settings update, revalidate agent state if needed
    if (!this.isDestroyed && !this.writeBar && this.context?.plugin?.agentManager) {
      this.renderContent();
    }
  }

  public setCollapsed(collapsed: boolean): void {
    this.section?.setCollapsed(collapsed);
  }

  public isCollapsed(): boolean {
    return this.section?.getIsCollapsed() ?? false;
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.clearRetryTimer();

    if (this.writeBar) {
      this.writeBar.destroy();
      this.writeBar = null;
    }
    this.section?.destroy();
  }
}
