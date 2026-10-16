import { setIcon } from 'obsidian';
import { SidebarStateStore } from '../SidebarStateStore';

export interface CollapsibleSectionOptions {
  id: string;
  title: string;
  icon: string;
  store: SidebarStateStore;
  defaultCollapsed?: boolean;
  onToggle?: (isCollapsed: boolean) => void;
}

export class CollapsibleSection {
  private sectionEl: HTMLElement;
  private headerEl: HTMLElement;
  private chevronEl: HTMLElement;
  private titleEl: HTMLElement;
  private badgeEl: HTMLElement;
  private actionsEl: HTMLElement;
  private bodyEl: HTMLElement;

  private isCollapsed: boolean;
  private id: string;
  private store: SidebarStateStore;
  private onToggle?: (isCollapsed: boolean) => void;

  constructor(parentEl: HTMLElement, options: CollapsibleSectionOptions) {
    this.id = options.id;
    this.store = options.store;
    this.onToggle = options.onToggle;
    this.isCollapsed = this.store.isModuleCollapsed(this.id, options.defaultCollapsed ?? false);

    this.sectionEl = parentEl.createDiv({
      cls: `ofc-sidebar-section ofc-sidebar-section-${this.id}`
    });

    // Header
    this.headerEl = this.sectionEl.createDiv({ cls: 'ofc-sidebar-section-header' });
    this.headerEl.setAttribute('role', 'button');
    this.headerEl.setAttribute('tabindex', '0');
    this.headerEl.setAttribute('aria-expanded', String(!this.isCollapsed));

    const leftGroup = this.headerEl.createDiv({ cls: 'ofc-sidebar-header-left' });

    this.chevronEl = leftGroup.createSpan({ cls: 'ofc-sidebar-chevron' });
    this.updateChevron();

    const iconSpan = leftGroup.createSpan({ cls: 'ofc-sidebar-section-icon' });
    setIcon(iconSpan, options.icon);

    this.titleEl = leftGroup.createSpan({
      cls: 'ofc-sidebar-section-title',
      text: options.title
    });

    this.badgeEl = leftGroup.createSpan({
      cls: 'ofc-sidebar-section-badge is-hidden'
    });

    this.actionsEl = this.headerEl.createDiv({ cls: 'ofc-sidebar-header-actions' });

    // Body
    this.bodyEl = this.sectionEl.createDiv({
      cls: 'ofc-sidebar-section-body'
    });

    if (this.isCollapsed) {
      this.sectionEl.addClass('is-collapsed');
    }

    // Toggle interaction
    this.headerEl.addEventListener('click', (e: MouseEvent) => {
      // Ignore click if it came from actions container
      if ((e.target as HTMLElement).closest('.ofc-sidebar-header-actions')) {
        return;
      }
      this.toggle();
    });

    this.headerEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  public getBodyEl(): HTMLElement {
    return this.bodyEl;
  }

  public getActionsEl(): HTMLElement {
    return this.actionsEl;
  }

  public setBadge(text: string | null): void {
    if (text === null || text === '') {
      this.badgeEl.addClass('is-hidden');
      this.badgeEl.setText('');
    } else {
      this.badgeEl.removeClass('is-hidden');
      this.badgeEl.setText(text);
    }
  }

  public toggle(): void {
    this.setCollapsed(!this.isCollapsed);
  }

  public setCollapsed(collapsed: boolean): void {
    this.isCollapsed = collapsed;
    this.sectionEl.toggleClass('is-collapsed', collapsed);
    this.headerEl.setAttribute('aria-expanded', String(!collapsed));
    this.updateChevron();
    this.store.setModuleCollapsed(this.id, collapsed);
    this.onToggle?.(collapsed);
  }

  public getIsCollapsed(): boolean {
    return this.isCollapsed;
  }

  private updateChevron(): void {
    this.chevronEl.empty();
    setIcon(this.chevronEl, this.isCollapsed ? 'chevron-right' : 'chevron-down');
  }

  public destroy(): void {
    this.sectionEl.remove();
  }
}
