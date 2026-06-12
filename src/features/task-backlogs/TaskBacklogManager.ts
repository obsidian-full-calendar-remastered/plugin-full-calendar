import { WorkspaceLeaf } from 'obsidian';
import FullCalendarPlugin from '../../main';
import { TaskBacklogView, TASK_BACKLOG_VIEW_TYPE } from './TaskBacklogView';

const LEGACY_TASKS_BACKLOG_VIEW_TYPE = 'tasks-backlog-view';
const LEGACY_CALDAV_TASK_INBOX_VIEW_TYPE = 'caldav-task-inbox-view';

export class TaskBacklogManager {
  private plugin: FullCalendarPlugin;
  private isLoaded = false;

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
  }

  public onload(): void {
    if (this.isLoaded) {
      return;
    }

    this.isLoaded = true;

    this.plugin.registerView(
      TASK_BACKLOG_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new TaskBacklogView(leaf, this.plugin)
    );
    this.plugin.registerView(
      LEGACY_TASKS_BACKLOG_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new TaskBacklogView(leaf, this.plugin)
    );
    this.plugin.registerView(
      LEGACY_CALDAV_TASK_INBOX_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new TaskBacklogView(leaf, this.plugin)
    );

    this.plugin.addCommand({
      id: 'open-task-backlog',
      name: 'Open task backlog',
      callback: () => {
        void this.openBacklogView();
      }
    });

    this.plugin.addRibbonIcon('list-todo', 'Task backlog', () => {
      void this.openBacklogView();
    });
  }

  public onunload(): void {
    if (!this.isLoaded) {
      return;
    }

    this.isLoaded = false;
    this.closeAllBacklogViews();
  }

  public refreshViews(): void {
    const leaves = this.plugin.app.workspace.getLeavesOfType(TASK_BACKLOG_VIEW_TYPE);
    const legacyTasksLeaves = this.plugin.app.workspace.getLeavesOfType(
      LEGACY_TASKS_BACKLOG_VIEW_TYPE
    );
    const legacyCalDAVLeaves = this.plugin.app.workspace.getLeavesOfType(
      LEGACY_CALDAV_TASK_INBOX_VIEW_TYPE
    );

    for (const leaf of [...leaves, ...legacyTasksLeaves, ...legacyCalDAVLeaves]) {
      const view = leaf.view;
      if (view instanceof TaskBacklogView) {
        void view.refresh();
      }
    }

    this.plugin.app.workspace.trigger('full-calendar:backlog-changed');
  }

  public getIsLoaded(): boolean {
    return this.isLoaded;
  }

  private async openBacklogView(): Promise<void> {
    const workspace = this.plugin.app.workspace;
    const existingLeaf = workspace.getLeavesOfType(TASK_BACKLOG_VIEW_TYPE)[0];
    const legacyTasksLeaf = workspace.getLeavesOfType(LEGACY_TASKS_BACKLOG_VIEW_TYPE)[0];
    const legacyCalDAVLeaf = workspace.getLeavesOfType(LEGACY_CALDAV_TASK_INBOX_VIEW_TYPE)[0];
    const leafToReveal = existingLeaf ?? legacyTasksLeaf ?? legacyCalDAVLeaf;
    if (leafToReveal) {
      void workspace.revealLeaf(leafToReveal);
      return;
    }

    const leaf = workspace.getRightLeaf(false);
    if (!leaf) {
      return;
    }

    await leaf.setViewState({
      type: TASK_BACKLOG_VIEW_TYPE,
      active: true
    });

    void workspace.revealLeaf(leaf);
  }

  private closeAllBacklogViews(): void {
    const leaves = [
      ...this.plugin.app.workspace.getLeavesOfType(TASK_BACKLOG_VIEW_TYPE),
      ...this.plugin.app.workspace.getLeavesOfType(LEGACY_TASKS_BACKLOG_VIEW_TYPE),
      ...this.plugin.app.workspace.getLeavesOfType(LEGACY_CALDAV_TASK_INBOX_VIEW_TYPE)
    ];
    for (const leaf of leaves) {
      leaf.detach();
    }
  }
}
