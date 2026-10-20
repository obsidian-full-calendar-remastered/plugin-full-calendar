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

  constructor(store: SidebarStateStore) {
    this.store = store;
  }

  public mount(containerEl: HTMLElement, context: SidebarContext): void {
    this.context = context;

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
    const contentEl = this.section.getBodyEl();
    contentEl.empty();
    contentEl.addClass('ofc-sidebar-agent-wrapper');

    const agentSettings = PluginState.getSettings().agent;
    if (agentSettings?.enabled === false) {
      const disabledMsg = contentEl.createDiv({ cls: 'ofc-sidebar-empty-state' });
      disabledMsg.createSpan({
        text: 'Calendar agent is disabled in plugin settings.'
      });
      return;
    }

    if (this.context?.plugin.agentManager) {
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
      window.setTimeout(() => {
        if (!this.writeBar && this.context?.plugin.agentManager) {
          this.renderContent();
        }
      }, 500);
    }
  }

  public onCacheUpdate(): void {
    // When cache or settings update, revalidate agent state if needed
    if (!this.writeBar && this.context?.plugin.agentManager) {
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
    if (this.writeBar) {
      this.writeBar.destroy();
      this.writeBar = null;
    }
    this.section?.destroy();
  }
}
