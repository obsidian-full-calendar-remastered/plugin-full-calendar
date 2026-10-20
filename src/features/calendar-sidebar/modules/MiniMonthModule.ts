import { setIcon } from 'obsidian';
import { ISidebarModule, SidebarContext } from '../types';
import { PluginState } from '../../../core/PluginState';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { SidebarStateStore } from '../SidebarStateStore';

export class MiniMonthModule implements ISidebarModule {
  public readonly id = 'mini-month';
  public readonly title = 'Mini Calendar';
  public readonly icon = 'calendar';
  public readonly defaultCollapsed = false;

  private context!: SidebarContext;
  private containerEl!: HTMLElement;
  private section!: CollapsibleSection;
  private store!: SidebarStateStore;

  private displayedYear!: number;
  private displayedMonth!: number; // 0-indexed
  private selectedDate!: Date;

  private monthTitleEl!: HTMLElement;
  private gridEl!: HTMLElement;

  constructor(store: SidebarStateStore) {
    this.store = store;
  }

  public mount(containerEl: HTMLElement, context: SidebarContext): void {
    this.containerEl = containerEl;
    this.context = context;

    const initialDate = context.getActiveDate ? context.getActiveDate() : new Date();
    this.selectedDate = new Date(initialDate);
    this.displayedYear = this.selectedDate.getFullYear();
    this.displayedMonth = this.selectedDate.getMonth();

    this.section = new CollapsibleSection(containerEl, {
      id: this.id,
      title: this.title,
      icon: this.icon,
      store: this.store,
      defaultCollapsed: this.defaultCollapsed
    });

    this.renderHeaderActions(this.section.getActionsEl());
    this.renderContent(this.section.getBodyEl());
  }

  public renderHeaderActions(actionsEl: HTMLElement): void {
    const todayBtn = actionsEl.createEl('button', {
      cls: 'ofc-sidebar-action-btn ofc-mini-month-today-btn',
      text: 'Today'
    });
    todayBtn.setAttribute('title', 'Go to today');
    todayBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      const now = new Date();
      this.selectedDate = new Date(now);
      this.displayedYear = now.getFullYear();
      this.displayedMonth = now.getMonth();
      this.updateView();
      this.context.gotoDate(now);
    });
  }

  private renderContent(bodyEl: HTMLElement): void {
    const miniMonthEl = bodyEl.createDiv({ cls: 'ofc-mini-month' });

    // Navigation bar (< Month Year >)
    const navBar = miniMonthEl.createDiv({ cls: 'ofc-mini-month-nav' });
    const prevBtn = navBar.createEl('button', {
      cls: 'ofc-sidebar-icon-btn ofc-mini-month-prev',
      attr: { 'aria-label': 'Previous month' }
    });
    setIcon(prevBtn, 'chevron-left');
    prevBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      this.changeMonth(-1);
    });

    this.monthTitleEl = navBar.createSpan({
      cls: 'ofc-mini-month-title ofc-clickable',
      attr: { title: 'Jump to current date' }
    });
    this.monthTitleEl.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      const now = new Date();
      this.selectedDate = new Date(now);
      this.displayedYear = now.getFullYear();
      this.displayedMonth = now.getMonth();
      this.updateView();
      this.context.gotoDate(now);
    });

    const nextBtn = navBar.createEl('button', {
      cls: 'ofc-sidebar-icon-btn ofc-mini-month-next',
      attr: { 'aria-label': 'Next month' }
    });
    setIcon(nextBtn, 'chevron-right');
    nextBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      this.changeMonth(1);
    });

    // Calendar grid
    this.gridEl = miniMonthEl.createDiv({ cls: 'ofc-mini-month-grid' });

    this.updateView();
  }

  private changeMonth(delta: number): void {
    this.displayedMonth += delta;
    if (this.displayedMonth < 0) {
      this.displayedMonth = 11;
      this.displayedYear -= 1;
    } else if (this.displayedMonth > 11) {
      this.displayedMonth = 0;
      this.displayedYear += 1;
    }
    this.updateView();
  }

  private updateView(): void {
    if (!this.monthTitleEl || !this.gridEl) return;

    const monthDate = new Date(this.displayedYear, this.displayedMonth, 1);
    const monthName = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    this.monthTitleEl.setText(monthName);

    this.renderDaysGrid();
  }

  private renderDaysGrid(): void {
    this.gridEl.empty();

    const firstDaySetting = PluginState.getSettings().firstDay ?? 0; // 0=Sun, 1=Mon
    const daysOfWeek = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const rotatedDays = [
      ...daysOfWeek.slice(firstDaySetting),
      ...daysOfWeek.slice(0, firstDaySetting)
    ];

    // Day headers
    const headerRow = this.gridEl.createDiv({ cls: 'ofc-mini-month-day-headers' });
    rotatedDays.forEach(dayName => {
      headerRow.createSpan({ cls: 'ofc-mini-month-day-header', text: dayName });
    });

    // Days grid
    const daysContainer = this.gridEl.createDiv({ cls: 'ofc-mini-month-cells' });

    const firstDayOfMonth = new Date(this.displayedYear, this.displayedMonth, 1).getDay();
    const leadingBlanks = (firstDayOfMonth - firstDaySetting + 7) % 7;
    const daysInCurrentMonth = new Date(this.displayedYear, this.displayedMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(this.displayedYear, this.displayedMonth, 0).getDate();

    const today = new Date();
    const isCurrentYearAndMonth =
      today.getFullYear() === this.displayedYear && today.getMonth() === this.displayedMonth;

    // Retrieve events map for busy indicators
    const busyDates = this.getBusyDatesForMonth(this.displayedYear, this.displayedMonth);

    // Leading days from previous month
    for (let i = leadingBlanks - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const cellDate = new Date(this.displayedYear, this.displayedMonth - 1, dayNum);
      const cell = daysContainer.createDiv({
        cls: 'ofc-mini-month-cell is-other-month',
        text: String(dayNum),
        attr: {
          title: cellDate.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })
        }
      });
      cell.addEventListener('click', () => {
        this.selectDate(cellDate);
      });
    }

    // Days of the month
    for (let day = 1; day <= daysInCurrentMonth; day++) {
      const cellDate = new Date(this.displayedYear, this.displayedMonth, day);
      const cell = daysContainer.createDiv({
        cls: 'ofc-mini-month-cell',
        text: String(day),
        attr: {
          title: cellDate.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })
        }
      });

      const isToday = isCurrentYearAndMonth && today.getDate() === day;
      if (isToday) {
        cell.addClass('is-today');
      }

      const isSelected =
        this.selectedDate.getFullYear() === this.displayedYear &&
        this.selectedDate.getMonth() === this.displayedMonth &&
        this.selectedDate.getDate() === day;
      if (isSelected) {
        cell.addClass('is-selected');
      }

      if (busyDates.has(day)) {
        cell.createSpan({ cls: 'ofc-mini-month-dot' });
      }

      cell.addEventListener('click', () => {
        this.selectDate(cellDate);
      });
    }

    // Trailing days from next month to fill grid (total 35 or 42 cells)
    const totalRendered = leadingBlanks + daysInCurrentMonth;
    const trailingBlanks = totalRendered <= 35 ? 35 - totalRendered : 42 - totalRendered;
    for (let day = 1; day <= trailingBlanks; day++) {
      const cellDate = new Date(this.displayedYear, this.displayedMonth + 1, day);
      const cell = daysContainer.createDiv({
        cls: 'ofc-mini-month-cell is-other-month',
        text: String(day),
        attr: {
          title: cellDate.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })
        }
      });
      cell.addEventListener('click', () => {
        this.selectDate(cellDate);
      });
    }
  }

  private selectDate(date: Date): void {
    this.selectedDate = new Date(date);
    this.displayedYear = date.getFullYear();
    this.displayedMonth = date.getMonth();
    this.updateView();
    this.context.gotoDate(date);
  }

  private getBusyDatesForMonth(year: number, month: number): Set<number> {
    const busy = new Set<number>();
    try {
      const cache = PluginState.getCache();
      if (!cache) return busy;

      // Check occurrences (covers single and recurring events)
      try {
        const occurrences = cache.getOccurrenceCache();
        if (occurrences) {
          occurrences.forEach(occ => {
            const jsDate = occ.start.toJSDate();
            if (jsDate.getFullYear() === year && jsDate.getMonth() === month) {
              busy.add(jsDate.getDate());
            }
          });
        }
      } catch {
        // Ignore if occurrences are still building
      }

      // Check stored single events
      if (cache.store) {
        const events = cache.store.getAllEvents();
        events.forEach(item => {
          const ev = item.event;
          if (ev.type === 'single' && ev.date) {
            const [y, m, d] = ev.date.split('-').map(Number);
            if (y === year && m === month + 1 && d) {
              busy.add(d);
            }
          }
        });
      }
    } catch {
      // Fallback gracefully if cache isn't accessible
    }
    return busy;
  }

  public onDateChange(date: Date): void {
    this.selectedDate = new Date(date);
    if (
      this.selectedDate.getFullYear() !== this.displayedYear ||
      this.selectedDate.getMonth() !== this.displayedMonth
    ) {
      this.displayedYear = this.selectedDate.getFullYear();
      this.displayedMonth = this.selectedDate.getMonth();
    }
    this.updateView();
  }

  public onCacheUpdate(): void {
    this.updateView();
  }

  public setCollapsed(collapsed: boolean): void {
    this.section.setCollapsed(collapsed);
  }

  public isCollapsed(): boolean {
    return this.section.getIsCollapsed();
  }

  public destroy(): void {
    this.section.destroy();
  }
}
