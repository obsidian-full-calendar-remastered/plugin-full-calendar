import { ISidebarModule, SidebarContext } from '../types';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { SidebarStateStore } from '../SidebarStateStore';
import { EmbeddedTaskBacklog } from '../../task-backlogs/EmbeddedTaskBacklog';

export class TaskBacklogModule implements ISidebarModule {
  public readonly id = 'task-backlog';
  public readonly title = 'Task Backlog';
  public readonly icon = 'list-todo';
  public readonly defaultCollapsed = false;

  private context!: SidebarContext;
  private section!: CollapsibleSection;
  private store!: SidebarStateStore;
  private embeddedBacklog: EmbeddedTaskBacklog | null = null;
  private updateCallbacks: (() => void)[] = [];

  constructor(store: SidebarStateStore) {
    this.store = store;
  }

  public mount(containerEl: HTMLElement, context: SidebarContext): void {
    this.context = context;

    this.section = new CollapsibleSection(containerEl, {
      id: this.id,
      title: this.title,
      icon: this.icon,
      store: this.store,
      defaultCollapsed: this.defaultCollapsed
    });

    const bodyEl = this.section.getBodyEl();
    const backlogMountEl = bodyEl.createDiv({ cls: 'ofc-sidebar-backlog-container' });

    this.embeddedBacklog = new EmbeddedTaskBacklog(
      context.plugin,
      backlogMountEl,
      {
        showSearch: true,
        showFooter: false,
        showDateSelector: false,
        showHeaderTitle: false,
        onTaskCountChange: count => {
          this.section.setBadge(count > 0 ? String(count) : null);
        }
      },
      cb => {
        this.updateCallbacks.push(cb);
      }
    );

    context.parentComponent.addChild(this.embeddedBacklog);
  }

  public setCollapsed(collapsed: boolean): void {
    this.section.setCollapsed(collapsed);
  }

  public isCollapsed(): boolean {
    return this.section.getIsCollapsed();
  }

  public onCacheUpdate(): void {
    this.updateCallbacks.forEach(cb => cb());
  }

  public destroy(): void {
    if (this.embeddedBacklog) {
      this.context.parentComponent.removeChild(this.embeddedBacklog);
      this.embeddedBacklog = null;
    }
    this.updateCallbacks = [];
    this.section.destroy();
  }
}
