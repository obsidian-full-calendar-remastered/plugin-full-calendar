import { Component, setIcon, Menu, App } from 'obsidian';
import { Draggable } from '@fullcalendar/interaction';
import FullCalendarPlugin from '../../main';
import { PluginState } from '../../core/PluginState';
import { EventFilterSortEngine } from '../../core/EventFilterSortEngine';
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

type BacklogProviderInstance = CalendarProvider<unknown> & TaskBacklogProvider;

type ProviderTaskBacklogItem = TaskBacklogItem & {
  provider: BacklogProviderInstance;
  providerInfo: TaskBacklogInfo;
};

export interface BacklogWidgetConfig {
  calendars?: string[];
  searchQuery?: string;
  showSearch?: boolean;
  showFooter?: boolean;
  showDateSelector?: boolean;
}

export class EmbeddedTaskBacklog extends Component {
  private app: App;
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
  private showAdvancedFilters = false;

  private backlogWrapper!: HTMLElement;

  constructor(
    private plugin: FullCalendarPlugin,
    private containerEl: HTMLElement,
    private config: BacklogWidgetConfig,
    private onUpdateCallback: (cb: () => void) => void
  ) {
    super();
    this.app = plugin.app;
    this.searchQuery = config.searchQuery || '';
  }

  onload(): void {
    // Create child wrapper to isolate styling and prevent breaking container elements
    this.backlogWrapper = this.containerEl.createDiv({
      cls: 'fcr-task-backlog tasks-backlog-view'
    });

    void this.refresh();

    // Register updater callback
    this.onUpdateCallback(() => {
      void this.refresh();
    });
  }

  onunload(): void {
    this.draggable?.destroy();
    this.draggable = null;
    this.backlogWrapper.remove();
  }

  public async refresh(): Promise<void> {
    await this.loadTasks();
    this.render();
  }

  private getBacklogProviders(): BacklogProviderInstance[] {
    const allProviders = PluginState.getProviderRegistry().getTaskBacklogProviders();
    const calendars = this.config.calendars;
    if (calendars && calendars.length > 0) {
      return allProviders.filter(provider => {
        const info = provider.getTaskBacklogInfo();
        return calendars.includes(info.id) || calendars.includes(info.name);
      });
    }
    return allProviders;
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
      console.warn('[EmbeddedTaskBacklog] Failed to save selected task backlog provider.', err)
    );
  }

  private updateDisplayedTasks(): void {
    this.filteredTasks = this.filterTasks(this.getOpenTasks(), this.searchQuery);
    const totalPages = Math.max(1, Math.ceil(this.filteredTasks.length / this.TASKS_PER_PAGE));
    this.currentPage = Math.min(this.currentPage, totalPages);
    const startIndex = (this.currentPage - 1) * this.TASKS_PER_PAGE;
    const endIndex = startIndex + this.TASKS_PER_PAGE;
    this.displayedTasks = this.filteredTasks.slice(startIndex, endIndex);
  }

  private getOpenTasks(): ProviderTaskBacklogItem[] {
    return this.tasks.filter(task => !task.completed);
  }

  private filterTasks(tasks: ProviderTaskBacklogItem[], query: string): ProviderTaskBacklogItem[] {
    const trimmed = query.trim();
    if (!trimmed) {
      return tasks;
    }

    return tasks.filter(task => {
      const queryable = EventFilterSortEngine.fromBacklogItem(
        task,
        task.providerInfo.name,
        task.providerInfo.id
      );
      return EventFilterSortEngine.matchEvent(queryable, {
        textSearch: { query, mode: 'backlog' }
      });
    });
  }

  private render(): void {
    this.draggable?.destroy();
    this.draggable = null;
    this.backlogWrapper.empty();

    const providers = this.getBacklogProviders();

    // Create scrollable content container
    const contentContainer = this.backlogWrapper.createDiv({ cls: 'tasks-backlog-content' });

    if (providers.length === 0) {
      this.renderNoProviders(contentContainer);
      return;
    }

    const showSearch = this.config.showSearch !== false;
    const showDateSelector = this.config.showDateSelector !== false;
    const showFooter = this.config.showFooter !== false;
    const hasDateSelector =
      showDateSelector && providers.some(provider => provider.type === 'tasks');

    const openTaskCount = this.getOpenTasks().length;

    if (showSearch || hasDateSelector) {
      const header = contentContainer.createDiv({ cls: 'tasks-backlog-header' });
      const headerTitleRow = header.createDiv({ cls: 'tasks-backlog-title-row' });
      headerTitleRow.createEl('h3', { text: t('settings.taskBacklog.title') });

      if (showSearch) {
        this.renderSearchBar(header, hasDateSelector);
      } else if (hasDateSelector) {
        const controls = header.createDiv({ cls: 'tasks-backlog-controls-row' });
        this.renderAdvancedFiltersToggle(controls);
      }

      if (hasDateSelector && this.showAdvancedFilters) {
        const advanced = header.createDiv({ cls: 'tasks-backlog-advanced-panel' });
        this.renderDateTargetSelector(advanced);
      }
    }

    const countText = this.searchQuery.trim()
      ? t('settings.taskBacklog.countFiltered', {
          shown: this.filteredTasks.length,
          total: openTaskCount
        })
      : openTaskCount === 1
        ? t('settings.taskBacklog.countUnscheduledSingular', { count: openTaskCount })
        : t('settings.taskBacklog.countUnscheduledPlural', { count: openTaskCount });

    contentContainer.createDiv({
      text: countText,
      cls: 'tasks-backlog-count'
    });

    if (this.displayedTasks.length === 0) {
      this.renderEmptyState(contentContainer);
    } else {
      this.renderTasksList(contentContainer);
      this.renderPaginationControls(contentContainer);
    }

    // Render persistent footer at the bottom if configured and creation is supported
    if (showFooter) {
      this.renderFooterIfNeeded(this.backlogWrapper, providers);
    }

    this.restoreSearchFocusIfNeeded();
  }

  private renderNoProviders(container: HTMLElement): void {
    container.createDiv({
      text: t('settings.taskBacklog.noProvidersTitle'),
      attr: { class: 'tasks-backlog-empty' }
    });
    container.createDiv({
      text: t('settings.taskBacklog.noProvidersHelp'),
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
        text: t('settings.taskBacklog.emptyNoMatchesTitle', {
          query: this.searchQuery
        })
      });
      emptyState.createDiv({
        text: t('settings.taskBacklog.emptyNoMatchesHelp'),
        cls: 'tasks-backlog-help'
      });
      return;
    }

    emptyState.createDiv({ text: t('settings.taskBacklog.emptyUnscheduledTitle') });
    emptyState.createDiv({
      text: t('settings.taskBacklog.emptyUnscheduledHelp'),
      cls: 'tasks-backlog-help'
    });
  }

  private renderSearchBar(container: HTMLElement, canShowAdvancedFilters: boolean): void {
    const searchRow = container.createDiv({ cls: 'tasks-backlog-search-row' });
    const searchShell = searchRow.createDiv({ cls: 'tasks-backlog-search-shell' });
    const searchIcon = searchShell.createSpan({ cls: 'tasks-backlog-search-icon' });
    setIcon(searchIcon, 'search');

    const input = searchShell.createEl('input', {
      cls: 'tasks-backlog-search-input',
      attr: {
        type: 'search',
        placeholder: t('settings.taskBacklog.searchPlaceholder'),
        'aria-label': t('settings.taskBacklog.searchAriaLabel')
      }
    });

    const clearButton = searchShell.createEl('button', {
      cls: 'tasks-backlog-search-clear',
      attr: {
        type: 'button',
        'aria-label': t('settings.taskBacklog.clearSearchAriaLabel')
      }
    });
    setIcon(clearButton, 'x');

    input.value = this.searchQuery;
    clearButton.disabled = this.searchQuery.trim().length === 0;

    clearButton.addEventListener('click', () => {
      if (!this.searchQuery.trim()) {
        return;
      }
      this.searchQuery = '';
      this.searchSelectionStart = 0;
      this.searchSelectionEnd = 0;
      this.shouldRestoreSearchFocus = true;
      this.currentPage = 1;
      this.updateDisplayedTasks();
      this.render();
    });

    input.addEventListener('input', () => {
      this.searchQuery = input.value;
      this.searchSelectionStart = input.selectionStart;
      this.searchSelectionEnd = input.selectionEnd;
      this.shouldRestoreSearchFocus = true;
      this.currentPage = 1;
      this.updateDisplayedTasks();
      this.render();
    });

    input.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !this.searchQuery.trim()) {
        return;
      }
      event.preventDefault();
      this.searchQuery = '';
      this.searchSelectionStart = 0;
      this.searchSelectionEnd = 0;
      this.shouldRestoreSearchFocus = true;
      this.currentPage = 1;
      this.updateDisplayedTasks();
      this.render();
    });

    if (canShowAdvancedFilters) {
      this.renderAdvancedFiltersToggle(searchRow);
    }
  }

  private renderAdvancedFiltersToggle(container: HTMLElement): void {
    const advancedToggle = container.createEl('button', {
      cls: 'tasks-backlog-advanced-toggle',
      text: '...',
      attr: {
        type: 'button',
        'aria-label': this.showAdvancedFilters
          ? t('settings.taskBacklog.hideAdvancedFiltersAriaLabel')
          : t('settings.taskBacklog.showAdvancedFiltersAriaLabel'),
        'aria-expanded': this.showAdvancedFilters ? 'true' : 'false'
      }
    });

    advancedToggle.addEventListener('click', () => {
      this.showAdvancedFilters = !this.showAdvancedFilters;
      this.render();
    });
  }

  private restoreSearchFocusIfNeeded(): void {
    if (!this.shouldRestoreSearchFocus) {
      return;
    }

    const input = this.backlogWrapper.querySelector<HTMLInputElement>(
      '.tasks-backlog-search-input'
    );
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
    wrapper.createSpan({ text: t('settings.taskBacklog.missingDateLabel') });

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
      taskItem.addEventListener('contextmenu', event => {
        this.showTaskContextMenu(event, task);
      });

      const titleRow = taskItem.createDiv({ cls: 'tasks-backlog-title-row' });
      const checkbox = titleRow.createEl('input', {
        cls: 'tasks-backlog-checkbox',
        attr: { type: 'checkbox' }
      });
      checkbox.checked = task.completed;
      checkbox.disabled = typeof task.provider.setTaskBacklogItemComplete !== 'function';
      checkbox.addEventListener('click', event => {
        event.stopPropagation();
      });
      checkbox.addEventListener('change', event => {
        event.stopPropagation();
        void this.setTaskCompleted(task, checkbox);
      });

      titleRow.createSpan({
        text: task.title,
        cls: task.completed ? 'tasks-backlog-title tasks-backlog-done' : 'tasks-backlog-title',
        attr: { title: task.title }
      });

      if (task.provider.openTaskBacklogItem) {
        const actions = titleRow.createDiv({ cls: 'tasks-backlog-actions' });
        const openButton = actions.createEl('button', {
          cls: 'tasks-backlog-action',
          attr: {
            type: 'button',
            'aria-label': t('settings.taskBacklog.openNoteAriaLabel', { title: task.title })
          }
        });
        setIcon(openButton, 'file-text');
        openButton.addEventListener('click', event => {
          event.stopPropagation();
          void task.provider.openTaskBacklogItem?.(task.id);
        });
      }

      const metaRow = taskItem.createDiv({ cls: 'tasks-backlog-meta-row' });
      metaRow.createSpan({
        text: task.providerInfo.name,
        cls: 'tasks-backlog-source-badge',
        attr: { title: task.providerInfo.name }
      });
      if (task.subtitle) {
        metaRow.createSpan({
          text: task.subtitle,
          cls: 'tasks-backlog-location',
          attr: { title: task.subtitle }
        });
      }
    }

    this.draggable = new Draggable(tasksList, {
      itemSelector: '.tasks-backlog-item'
    });
  }

  private showTaskContextMenu(event: MouseEvent, task: ProviderTaskBacklogItem): void {
    event.preventDefault();
    const menu = new Menu();
    let hasActions = false;

    if (task.provider.openTaskBacklogItem) {
      menu.addItem(item => {
        item
          .setTitle(t('ui.view.contextMenu.goToNote'))
          .setIcon('file-text')
          .onClick(() => {
            void task.provider.openTaskBacklogItem?.(task.id);
          });
      });
      hasActions = true;
    }

    if (task.provider.deleteTaskBacklogItem) {
      menu.addItem(item => {
        item
          .setTitle(t('ui.view.contextMenu.delete'))
          .setIcon('trash-2')
          .onClick(() => {
            void this.deleteTask(task);
          });
      });
      hasActions = true;
    }

    if (!hasActions) {
      menu.addItem(item => {
        item.setTitle(t('ui.view.contextMenu.noActions')).setIcon('info').setDisabled(true);
      });
    }

    menu.showAtMouseEvent(event);
  }

  private async deleteTask(task: ProviderTaskBacklogItem): Promise<void> {
    if (!task.provider.deleteTaskBacklogItem) {
      return;
    }

    try {
      await task.provider.deleteTaskBacklogItem(task.id);
      await this.loadTasks();
      this.render();
      this.app.workspace.trigger('full-calendar:backlog-changed');
    } catch (err) {
      console.warn('[EmbeddedTaskBacklog] Failed to delete task.', err);
    }
  }

  private async setTaskCompleted(
    task: ProviderTaskBacklogItem,
    checkbox: HTMLInputElement
  ): Promise<void> {
    if (!task.provider.setTaskBacklogItemComplete) {
      checkbox.checked = task.completed;
      return;
    }

    checkbox.disabled = true;
    const nextCompleted = checkbox.checked;
    const previousCompleted = task.completed;

    try {
      const success = await task.provider.setTaskBacklogItemComplete(task.id, nextCompleted);
      if (!success) {
        checkbox.checked = previousCompleted;
        checkbox.disabled = false;
        return;
      }

      task.completed = nextCompleted;
      await this.loadTasks();
      this.render();
      this.app.workspace.trigger('full-calendar:backlog-changed');
    } catch (err) {
      console.warn('[EmbeddedTaskBacklog] Failed to update task completion.', err);
      checkbox.checked = previousCompleted;
      checkbox.disabled = false;
    }
  }

  private renderPaginationControls(container: HTMLElement): void {
    const totalPages = Math.ceil(this.filteredTasks.length / this.TASKS_PER_PAGE);

    if (totalPages <= 1) return;

    const pagination = container.createDiv({ cls: 'tasks-backlog-pagination' });

    const prevBtn = pagination.createEl('button', {
      text: t('settings.taskBacklog.paginationPrevious'),
      cls: 'tasks-backlog-nav-btn'
    });
    prevBtn.disabled = this.currentPage === 1;
    prevBtn.addEventListener('click', () => this.goToPreviousPage());

    pagination.createSpan({
      text: t('settings.taskBacklog.paginationPage', {
        current: this.currentPage,
        total: totalPages
      }),
      cls: 'tasks-backlog-page-info'
    });

    const nextBtn = pagination.createEl('button', {
      text: t('settings.taskBacklog.paginationNext'),
      cls: 'tasks-backlog-nav-btn'
    });
    nextBtn.disabled = this.currentPage === totalPages;
    nextBtn.addEventListener('click', () => this.goToNextPage());

    if (this.currentPage < totalPages) {
      const loadMoreBtn = pagination.createEl('button', {
        text: t('settings.taskBacklog.loadMore', {
          count: Math.min(
            this.TASKS_PER_PAGE,
            this.filteredTasks.length - this.currentPage * this.TASKS_PER_PAGE
          )
        }),
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
      this.app.workspace.trigger('full-calendar:backlog-changed');
    } catch (err) {
      console.warn('[EmbeddedTaskBacklog] Failed to create task.', err);
    } finally {
      this.isCreatingTask = false;
      this.render();
      this.backlogWrapper.querySelector<HTMLInputElement>('.tasks-backlog-new-title')?.focus();
    }
  }
}
