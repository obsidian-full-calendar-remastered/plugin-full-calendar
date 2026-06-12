import { ItemView, WorkspaceLeaf, EventRef } from 'obsidian';
import FullCalendarPlugin from '../../main';
import { EmbeddedTaskBacklog } from './EmbeddedTaskBacklog';

export const TASK_BACKLOG_VIEW_TYPE = 'task-backlog-view';

export class TaskBacklogView extends ItemView {
  private plugin: FullCalendarPlugin;
  private backlogWidget: EmbeddedTaskBacklog | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: FullCalendarPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return TASK_BACKLOG_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Task backlog';
  }

  getIcon(): string {
    return 'list-todo';
  }

  onOpen(): Promise<void> {
    return (async () => {
      this.contentEl.empty();
      this.backlogWidget = new EmbeddedTaskBacklog(this.plugin, this.contentEl, {}, callback => {
        interface AppWorkspaceEvents {
          on(
            name: 'full-calendar:backlog-changed' | 'full-calendar:settings-updated',
            callback: () => void
          ): EventRef;
        }
        const workspace = this.app.workspace as unknown as AppWorkspaceEvents;
        this.registerEvent(workspace.on('full-calendar:backlog-changed', callback));
        this.registerEvent(workspace.on('full-calendar:settings-updated', callback));
      });
      this.addChild(this.backlogWidget);
    })();
  }

  onClose(): Promise<void> {
    if (this.backlogWidget) {
      this.backlogWidget.unload();
      this.backlogWidget = null;
    }
    return Promise.resolve();
  }

  public async refresh(): Promise<void> {
    if (this.backlogWidget) {
      await this.backlogWidget.refresh();
    }
  }
}
