import { ItemView, setIcon, WorkspaceLeaf } from 'obsidian';
import { Draggable } from '@fullcalendar/interaction';
import FullCalendarPlugin from '../../main';
import { PluginState } from '../../core/PluginState';
import {
  CalendarProvider,
  TaskBacklogInfo,
  TaskBacklogItem,
  TaskBacklogProvider
} from '../../providers/Provider';
import { TasksBacklogDateTarget } from '../../types/settings';
import { t } from '../i18n/i18n';
import { createDocsLinksFragment } from '../../ui/settings/docsLinks';
import './task-backlog.css';

export const TASK_BACKLOG_VIEW_TYPE = 'task-backlog-view';

type BacklogProviderInstance = CalendarProvider<unknown> & TaskBacklogProvider;

type ProviderTaskBacklogItem = TaskBacklogItem & {
  provider: BacklogProviderInstance;
  providerInfo: TaskBacklogInfo;
};

function isTaskBacklogProvider(
  provider: CalendarProvider<unknown>
): provider is BacklogProviderInstance {
  const maybeProvider = provider as Partial<TaskBacklogProvider>;
  return (
    typeof maybeProvider.getTaskBacklogInfo === 'function' &&
    typeof maybeProvider.getTaskBacklogItems === 'function'
  );
}

export class TaskBacklogView extends ItemView {
  private plugin: FullCalendarPlugin;
  private tasks: ProviderTaskBacklogItem[] = [];
  private filteredTasks: ProviderTaskBacklogItem[] = [];
  private displayedTasks: ProviderTaskBacklogItem[] = [];
  private readonly TASKS_PER_PAGE = 200;
  private currentPage = 1;
  private searchQuery = '';
  private shouldRestoreSearchFocus = false;
  private searchSelectionStart: number | null = null;
  private searchSelectionEnd: number | null = null;
  private draggable: Draggable | null = null;
  private newTaskTitle = '';
  private selectedProviderId = '';
  private isCreatingTask = false;

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
      await this.loadTasks();
      this.render();
    })();
  }

  onClose(): Promise<void> {
    this.draggable?.destroy();
    this.draggable = null;
    return Promise.resolve();
  }

  public async refresh(): Promise<void> {
    await this.loadTasks();
    this.render();
  }

  private getBacklogProviders(): BacklogProviderInstance[] {
    return PluginState.getProviderRegistry().getTaskBacklogProviders();
  }

  private async loadTasks(): Promise<void> {
    const providers = this.getBacklogProviders();
    const results = await Promise.allSettled(
      providers.map(async provider => {
        const providerInfo = provider.getTaskBacklogInfo();
        const tasks = await provider.getTaskBacklogItems();
        return tasks.map(task => ({
          ...task,
          sourceId: task.sourceId ?? providerInfo.id,
          provider,
          providerInfo
        }));
      })
    );

    this.tasks = results.flatMap(result => (result.status === 'fulfilled' ? result.value : []));
    this.ensureSelectedProvider(providers);
    this.updateDisplayedTasks();
  }

  private ensureSelectedProvider(providers = this.getBacklogProviders()): void {
    const createProviders = providers.filter(
      provider =>
        provider.getTaskBacklogInfo().supportsCreate &&
        typeof provider.createTaskBacklogItem === 'function'
    );
    const settings = PluginState.getSettings();
    const persistedProviderId =
      settings.taskBacklogLastProviderId || settings.caldavTaskInboxLastCalendarId;

    if (
      this.selectedProviderId &&
      createProviders.some(provider => provider.getTaskBacklogInfo().id === this.selectedProviderId)
    ) {
      return;
    }

    if (
      persistedProviderId &&
      createProviders.some(provider => provider.getTaskBacklogInfo().id === persistedProviderId)
    ) {
      this.selectedProviderId = persistedProviderId;
      return;
    }

    this.selectedProviderId = createProviders[0]?.getTaskBacklogInfo().id || '';
  }

  private persistSelectedProvider(providerId: string): void {
    const settings = PluginState.getSettings();
    if (settings.taskBacklogLastProviderId === providerId) {
      return;
    }

    settings.taskBacklogLastProviderId = providerId;
    settings.caldavTaskInboxLastCalendarId = providerId;
    void PluginState.saveSettings().catch(err =>
      console.warn('[TaskBacklogView] Failed to save selected task backlog provider.', err)
    );
  }

  private updateDisplayedTasks(): void {
    this.filteredTasks = this.filterTasks(this.tasks, this.searchQuery);
    const startIndex = (this.currentPage - 1) * this.TASKS_PER_PAGE;
    const endIndex = startIndex + this.TASKS_PER_PAGE;
    this.displayedTasks = this.filteredTasks.slice(startIndex, endIndex);
  }

  private filterTasks(tasks: ProviderTaskBacklogItem[], query: string): ProviderTaskBacklogItem[] {
    const trimmed = query.trim();
    if (!trimmed) {
      return tasks;
    }

    const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);

    return tasks.filter(task => {
      const title = task.title.toLowerCase();
      const subtitle = task.subtitle?.toLowerCase() ?? '';
      const providerName = task.providerInfo.name.toLowerCase();
      const haystacks = [title, subtitle, providerName];

      // Extract the last path segment (file name or task source base name) to preserve legacy filename-only search behavior
      const baseName = subtitle.split(/[/\\]/).pop()?.split(':')[0]?.trim() || '';
      if (baseName && baseName !== subtitle) {
        haystacks.push(baseName);
      }

      return tokens.every(token =>
        haystacks.some(
          haystack => haystack.includes(token) || this.isFuzzySubsequence(token, haystack)
        )
      );
    });
  }

  private isFuzzySubsequence(needle: string, haystack: string): boolean {
    if (!needle) return true;
    let i = 0;
    let j = 0;
    while (i < needle.length && j < haystack.length) {
      if (needle[i] === haystack[j]) {
        i++;
      }
      j++;
    }
    return i === needle.length;
  }

  private render(): void {
    const container = this.containerEl;
    this.draggable?.destroy();
    this.draggable = null;
    container.empty();
    container.addClass('tasks-backlog-view');

    const providers = this.getBacklogProviders();

    // Create scrollable content container
    const contentContainer = container.createDiv({ cls: 'tasks-backlog-content' });

    if (providers.length === 0) {
      this.renderNoProviders(contentContainer);
      return;
    }

    const header = contentContainer.createDiv({ cls: 'tasks-backlog-header' });
    const headerTitleRow = header.createDiv({ cls: 'tasks-backlog-title-row' });
    headerTitleRow.createEl('h3', { text: 'Task backlog' });
    if (providers.some(provider => provider.type === 'tasks')) {
      this.renderDateTargetSelector(headerTitleRow);
    }
    this.renderSearchBar(header);

    const countText = this.searchQuery.trim()
      ? `${this.filteredTasks.length} of ${this.tasks.length} unscheduled tasks`
      : `${this.tasks.length} unscheduled ${this.tasks.length === 1 ? 'task' : 'tasks'}`;
    header.createDiv({
      text: countText,
      cls: 'tasks-backlog-count'
    });

    if (this.displayedTasks.length === 0) {
      this.renderEmptyState(contentContainer);
    } else {
      this.renderTasksList(contentContainer);
      this.renderPaginationControls(contentContainer);
    }

    // Render persistent footer at the bottom if any provider supports creation
    this.renderFooterIfNeeded(container, providers);

    this.restoreSearchFocusIfNeeded();
  }

  private renderNoProviders(container: HTMLElement): void {
    container.createDiv({
      text: 'No task backlog providers configured.',
      attr: { class: 'tasks-backlog-empty' }
    });
    container.createDiv({
      text: 'Add a Tasks or CalDAV calendar source to use the backlog view.',
      attr: { class: 'tasks-backlog-help' }
    });
  }

  private renderFooterIfNeeded(
    container: HTMLElement,
    providers = this.getBacklogProviders()
  ): void {
    const createProviders = providers.filter(
      provider =>
        provider.getTaskBacklogInfo().supportsCreate &&
        typeof provider.createTaskBacklogItem === 'function'
    );
    if (createProviders.length === 0) {
      return;
    }

    this.ensureSelectedProvider(providers);

    const footer = container.createDiv({ cls: 'tasks-backlog-footer' });

    // Heading
    footer.createEl('h4', {
      text: t('settings.taskBacklog.addUnscheduledTask'),
      cls: 'tasks-backlog-footer-heading'
    });

    const form = footer.createEl('form', { cls: 'tasks-backlog-create-form' });
    form.addEventListener('submit', event => {
      event.preventDefault();
      void this.createTask();
    });

    const select = form.createEl('select', {
      cls: 'tasks-backlog-create-source',
      attr: {
        'aria-label': t('settings.taskBacklog.sourceLabel')
      }
    });
    select.disabled = createProviders.length === 0 || this.isCreatingTask;

    for (const provider of createProviders) {
      const providerInfo = provider.getTaskBacklogInfo();
      const option = select.createEl('option', {
        text: providerInfo.name,
        attr: { value: providerInfo.id }
      });
      option.selected = providerInfo.id === this.selectedProviderId;
    }

    select.addEventListener('change', () => {
      this.selectedProviderId = select.value;
      this.persistSelectedProvider(select.value);
    });

    const titleInput = form.createEl('input', {
      cls: 'tasks-backlog-new-title',
      attr: {
        type: 'text',
        placeholder: t('settings.taskBacklog.placeholder'),
        'aria-label': t('settings.taskBacklog.newTitleLabel')
      }
    });
    const addButton = form.createEl('button', {
      cls: 'tasks-backlog-add',
      attr: {
        type: 'submit',
        'aria-label': t('settings.taskBacklog.addBtnLabel')
      }
    });
    setIcon(addButton, 'plus');
    addButton.disabled =
      createProviders.length === 0 || this.isCreatingTask || this.newTaskTitle.trim().length === 0;

    titleInput.value = this.newTaskTitle;
    titleInput.disabled = createProviders.length === 0 || this.isCreatingTask;
    titleInput.addEventListener('input', () => {
      this.newTaskTitle = titleInput.value;
      addButton.disabled =
        createProviders.length === 0 ||
        this.isCreatingTask ||
        this.newTaskTitle.trim().length === 0;
    });

    // Documentation Link
    const docRow = footer.createDiv({ cls: 'tasks-backlog-footer-help' });
    docRow.createSpan({ text: t('settings.taskBacklog.helpText') });
    docRow.appendChild(
      createDocsLinksFragment([
        {
          text: t('settings.taskBacklog.learnMore'),
          path: 'user/features/tasks-backlog/'
        }
      ])
    );
  }

  private renderEmptyState(container: HTMLElement): void {
    const emptyState = container.createDiv({ cls: 'tasks-backlog-empty' });
    if (this.tasks.length > 0 && this.searchQuery.trim()) {
      emptyState.createDiv({
        text: `No tasks matched "${this.searchQuery}".`
      });
      emptyState.createDiv({
        text: 'Try fewer keywords or search by part of the task title, source, or location.',
        cls: 'tasks-backlog-help'
      });
      return;
    }

    emptyState.createDiv({ text: 'No unscheduled tasks.' });
    emptyState.createDiv({
      text: 'Tasks missing their scheduling date will appear here.',
      cls: 'tasks-backlog-help'
    });
  }

  private renderSearchBar(container: HTMLElement): void {
    const searchRow = container.createDiv({ cls: 'tasks-backlog-search-row' });
    const input = searchRow.createEl('input', {
      cls: 'tasks-backlog-search-input',
      attr: {
        type: 'search',
        placeholder: 'Filter by task title, source, or location',
        'aria-label': 'Filter task backlog by task title, source, or location'
      }
    });
    input.value = this.searchQuery;
    input.addEventListener('input', () => {
      this.searchQuery = input.value;
      this.searchSelectionStart = input.selectionStart;
      this.searchSelectionEnd = input.selectionEnd;
      this.shouldRestoreSearchFocus = true;
      this.currentPage = 1;
      this.updateDisplayedTasks();
      this.render();
    });
  }

  private restoreSearchFocusIfNeeded(): void {
    if (!this.shouldRestoreSearchFocus) {
      return;
    }

    const input = this.containerEl.querySelector<HTMLInputElement>('.tasks-backlog-search-input');
    if (!input) {
      this.shouldRestoreSearchFocus = false;
      return;
    }

    input.focus();
    if (this.searchSelectionStart !== null && this.searchSelectionEnd !== null) {
      input.setSelectionRange(this.searchSelectionStart, this.searchSelectionEnd);
    }

    this.shouldRestoreSearchFocus = false;
    this.searchSelectionStart = null;
    this.searchSelectionEnd = null;
  }

  private renderDateTargetSelector(container: HTMLElement): void {
    const wrapper = container.createEl('label', { cls: 'tasks-backlog-target' });
    wrapper.createSpan({ text: 'Missing date' });

    const select = wrapper.createEl('select', {
      cls: 'tasks-backlog-target-select',
      attr: { 'aria-label': t('settings.tasksIntegration.backlogDateTarget.label') }
    });

    this.addDateTargetOption(
      select,
      'scheduledDate',
      t('settings.tasksIntegration.backlogDateTarget.scheduled')
    );
    this.addDateTargetOption(
      select,
      'startDate',
      t('settings.tasksIntegration.backlogDateTarget.start')
    );
    this.addDateTargetOption(
      select,
      'dueDate',
      t('settings.tasksIntegration.backlogDateTarget.due')
    );
    select.value = PluginState.getSettings().tasksIntegration.backlogDateTarget;

    select.addEventListener('change', () => {
      PluginState.getSettings().tasksIntegration.backlogDateTarget =
        select.value as TasksBacklogDateTarget;
      this.currentPage = 1;
      void PluginState.saveSettings().then(() => {
        PluginState.getProviderRegistry().refreshBacklogViews();
      });
    });
  }

  private addDateTargetOption(
    select: HTMLSelectElement,
    value: TasksBacklogDateTarget,
    label: string
  ): void {
    select.createEl('option', { text: label, attr: { value } });
  }

  private renderTasksList(container: HTMLElement): void {
    const tasksList = container.createDiv({ cls: 'tasks-backlog-list' });

    for (const task of this.displayedTasks) {
      const taskItem = tasksList.createDiv({
        cls: 'tasks-backlog-item',
        attr: {
          draggable: 'true',
          'data-task-id': task.id
        }
      });

      const titleRow = taskItem.createDiv({ cls: 'tasks-backlog-title-row' });
      const checkbox = titleRow.createEl('input', {
        cls: 'tasks-backlog-checkbox',
        attr: { type: 'checkbox' }
      });
      checkbox.checked = task.completed;
      checkbox.disabled = true;

      titleRow.createSpan({
        text: task.title,
        cls: task.completed ? 'tasks-backlog-title tasks-backlog-done' : 'tasks-backlog-title'
      });

      const metaText = [task.providerInfo.name, task.subtitle].filter(Boolean).join(' - ');
      if (metaText) {
        taskItem.createDiv({
          text: metaText,
          cls: 'tasks-backlog-location'
        });
      }

      if (task.provider.openTaskBacklogItem) {
        const actions = taskItem.createDiv({ cls: 'tasks-backlog-actions' });
        const openButton = actions.createEl('button', {
          cls: 'tasks-backlog-action',
          attr: { 'aria-label': `Open note for ${task.title}` }
        });
        setIcon(openButton, 'file-text');
        openButton.addEventListener('click', event => {
          event.stopPropagation();
          void task.provider.openTaskBacklogItem?.(task.id);
        });
      }
    }

    this.draggable = new Draggable(tasksList, {
      itemSelector: '.tasks-backlog-item'
    });
  }

  private renderPaginationControls(container: HTMLElement): void {
    const totalPages = Math.ceil(this.filteredTasks.length / this.TASKS_PER_PAGE);

    if (totalPages <= 1) return;

    const pagination = container.createDiv({ cls: 'tasks-backlog-pagination' });

    const prevBtn = pagination.createEl('button', {
      text: '< previous',
      cls: 'tasks-backlog-nav-btn'
    });
    prevBtn.disabled = this.currentPage === 1;
    prevBtn.addEventListener('click', () => this.goToPreviousPage());

    pagination.createSpan({
      text: `Page ${this.currentPage} of ${totalPages}`,
      cls: 'tasks-backlog-page-info'
    });

    const nextBtn = pagination.createEl('button', {
      text: 'Next >',
      cls: 'tasks-backlog-nav-btn'
    });
    nextBtn.disabled = this.currentPage === totalPages;
    nextBtn.addEventListener('click', () => this.goToNextPage());

    if (this.currentPage < totalPages) {
      const loadMoreBtn = pagination.createEl('button', {
        text: `Load More (${Math.min(this.TASKS_PER_PAGE, this.filteredTasks.length - this.currentPage * this.TASKS_PER_PAGE)} more)`,
        cls: 'tasks-backlog-load-more'
      });
      loadMoreBtn.addEventListener('click', () => this.loadMore());
    }
  }

  private goToPreviousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updateDisplayedTasks();
      this.render();
    }
  }

  private goToNextPage(): void {
    const totalPages = Math.ceil(this.filteredTasks.length / this.TASKS_PER_PAGE);
    if (this.currentPage < totalPages) {
      this.currentPage++;
      this.updateDisplayedTasks();
      this.render();
    }
  }

  private loadMore(): void {
    const newEndIndex = this.currentPage * this.TASKS_PER_PAGE + this.TASKS_PER_PAGE;
    this.displayedTasks = this.filteredTasks.slice(0, newEndIndex);
    this.render();
  }

  private async createTask(): Promise<void> {
    const title = this.newTaskTitle.trim();
    if (!title || this.isCreatingTask) {
      return;
    }

    const provider = this.getBacklogProviders().find(
      candidate => candidate.getTaskBacklogInfo().id === this.selectedProviderId
    );
    if (!provider?.createTaskBacklogItem) {
      return;
    }

    this.isCreatingTask = true;
    this.render();

    try {
      await provider.createTaskBacklogItem(title);
      this.newTaskTitle = '';
      await this.loadTasks();
    } catch (err) {
      console.warn('[TaskBacklogView] Failed to create task.', err);
    } finally {
      this.isCreatingTask = false;
      this.render();
      this.containerEl.querySelector<HTMLInputElement>('.tasks-backlog-new-title')?.focus();
    }
  }
}

export { isTaskBacklogProvider };
