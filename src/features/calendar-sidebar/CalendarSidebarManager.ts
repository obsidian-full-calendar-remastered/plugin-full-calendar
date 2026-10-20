import { Component, setIcon } from 'obsidian';
import FullCalendarPlugin from '../../main';
import { SidebarContext } from './types';
import { SidebarStateStore } from './SidebarStateStore';
import { SidebarResizer } from './SidebarResizer';
import { SidebarModuleRegistry } from './modules/SidebarModuleRegistry';
import './styles/calendar-sidebar.css';

export interface CalendarSidebarManagerOptions {
  plugin: FullCalendarPlugin;
  shellEl: HTMLElement;
  calendarEl: HTMLElement;
  calendarApi: () => import('@fullcalendar/core').Calendar | null;
  triggerResize: () => void;
  gotoDate: (date: Date) => void;
  getActiveDate: () => Date;
}

export class CalendarSidebarManager extends Component {
  private plugin: FullCalendarPlugin;
  private shellEl: HTMLElement;
  private calendarEl: HTMLElement;
  private options: CalendarSidebarManagerOptions;

  private sidebarEl!: HTMLElement;
  private expandTabEl!: HTMLElement;
  private resizer!: SidebarResizer;
  private store: SidebarStateStore;
  private registry: SidebarModuleRegistry;

  private isCollapsed = false;

  constructor(options: CalendarSidebarManagerOptions) {
    super();
    this.options = options;
    this.plugin = options.plugin;
    this.shellEl = options.shellEl;
    this.calendarEl = options.calendarEl;

    this.store = new SidebarStateStore();
    this.registry = new SidebarModuleRegistry(this.store);
  }

  public onload(): void {
    const config = this.store.getSettings();

    // Set initial width CSS variable
    this.shellEl.style.setProperty('--sidebar-width', `${config.width}px`);

    // Create sidebar container before calendarEl
    this.sidebarEl = createDiv({ cls: 'ofc-calendar-sidebar' });
    this.shellEl.insertBefore(this.sidebarEl, this.calendarEl);

    // Build Top Bar
    this.renderTopBar();

    // Scroll container for module cards
    const scrollContainer = this.sidebarEl.createDiv({ cls: 'ofc-sidebar-scroll-container' });

    // Expand tab (visible when collapsed)
    this.expandTabEl = this.shellEl.createDiv({ cls: 'ofc-sidebar-expand-tab is-hidden' });
    this.expandTabEl.setAttribute('title', 'Expand cockpit');
    this.expandTabEl.setAttribute('aria-label', 'Expand cockpit');
    setIcon(this.expandTabEl, 'chevron-right');
    this.expandTabEl.addEventListener('click', () => {
      this.setCollapsed(false);
    });

    // Create Resizer
    this.resizer = new SidebarResizer({
      shellEl: this.shellEl,
      sidebarEl: this.sidebarEl,
      store: this.store,
      onResize: width => {
        this.shellEl.style.setProperty('--sidebar-width', `${width}px`);
      },
      onResizeEnd: () => {
        this.options.triggerResize();
      },
      onDoubleClick: () => {
        this.toggleCollapse();
      }
    });
    this.shellEl.insertBefore(this.resizer.getElement(), this.calendarEl);

    // Prepare Context & Mount Modules
    const context: SidebarContext = {
      plugin: this.plugin,
      parentComponent: this,
      calendarApi: this.options.calendarApi,
      sidebarContainerEl: this.sidebarEl,
      triggerResize: this.options.triggerResize,
      gotoDate: this.options.gotoDate,
      getActiveDate: this.options.getActiveDate
    };

    void this.registry.mountAll(scrollContainer, context);

    // Apply collapsed state
    this.setCollapsed(config.isCollapsed, false);
  }

  private renderTopBar(): void {
    const topBar = this.sidebarEl.createDiv({ cls: 'ofc-sidebar-top-bar' });

    const brand = topBar.createDiv({ cls: 'ofc-sidebar-brand' });
    const brandIcon = brand.createSpan({ cls: 'ofc-sidebar-section-icon' });
    setIcon(brandIcon, 'layout-sidebar-left');
    brand.createSpan({ text: 'Cockpit' });

    const actions = topBar.createDiv({ cls: 'ofc-sidebar-top-actions' });

    // 1. Toggle all sections (Expand/Collapse all)
    const toggleAllBtn = actions.createEl('button', {
      cls: 'ofc-sidebar-icon-btn ofc-sidebar-toggle-all-btn',
      attr: { 'aria-label': 'Collapse all sections', title: 'Collapse all sections' }
    });
    setIcon(toggleAllBtn, 'chevrons-up-down');
    toggleAllBtn.addEventListener('click', () => {
      const allCollapsed = this.registry.areAllCollapsed();
      this.registry.setAllCollapsed(!allCollapsed);
      const nextLabel = allCollapsed ? 'Collapse all sections' : 'Expand all sections';
      toggleAllBtn.setAttribute('aria-label', nextLabel);
      toggleAllBtn.setAttribute('title', nextLabel);
    });

    // 2. Refresh cockpit data
    const refreshBtn = actions.createEl('button', {
      cls: 'ofc-sidebar-icon-btn ofc-sidebar-refresh-btn',
      attr: { 'aria-label': 'Refresh cockpit', title: 'Refresh cockpit' }
    });
    setIcon(refreshBtn, 'refresh-cw');
    refreshBtn.addEventListener('click', () => {
      refreshBtn.addClass('is-spinning');
      this.notifyCacheUpdate();
      window.setTimeout(() => {
        refreshBtn.removeClass('is-spinning');
      }, 500);
    });

    // 3. Collapse Cockpit sidebar
    const collapseBtn = actions.createEl('button', {
      cls: 'ofc-sidebar-icon-btn ofc-sidebar-collapse-btn',
      attr: {
        'aria-label': 'Collapse cockpit (double-click border to toggle)',
        title: 'Collapse cockpit (double-click border to toggle)'
      }
    });
    setIcon(collapseBtn, 'panel-left-close');
    collapseBtn.addEventListener('click', () => {
      this.setCollapsed(true);
    });
  }

  public toggleCollapse(): void {
    this.setCollapsed(!this.isCollapsed);
  }

  public setCollapsed(collapsed: boolean, notify = true): void {
    this.isCollapsed = collapsed;
    this.sidebarEl.toggleClass('is-collapsed', collapsed);
    this.expandTabEl.toggleClass('is-hidden', !collapsed);

    this.store.setCollapsed(collapsed);

    if (notify) {
      window.requestAnimationFrame(() => {
        this.options.triggerResize();
      });
    }
  }

  public notifyDateChange(date: Date): void {
    this.registry.notifyDateChange(date);
  }

  public notifyDateRangeChange(range: { start: Date; end: Date }): void {
    this.registry.notifyDateRangeChange(range);
  }

  public notifyCacheUpdate(): void {
    this.registry.notifyCacheUpdate();
  }

  public onunload(): void {
    this.registry.destroyAll();
    this.resizer.destroy();
    this.store.destroy();
    this.expandTabEl.remove();
    this.sidebarEl.remove();
  }
}
