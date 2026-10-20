import { ISidebarModule, SidebarContext, SidebarModuleFactory } from '../types';
import { SidebarStateStore } from '../SidebarStateStore';
import { MiniMonthModule } from './MiniMonthModule';
import { UpNextWeatherModule } from './UpNextWeatherModule';

export class SidebarModuleRegistry {
  private factories = new Map<string, SidebarModuleFactory>();
  private activeModules: ISidebarModule[] = [];
  private store: SidebarStateStore;

  constructor(store: SidebarStateStore) {
    this.store = store;
    this.registerBuiltinModules();
  }

  private registerBuiltinModules(): void {
    this.registerModuleFactory('mini-month', () => new MiniMonthModule(this.store));
    this.registerModuleFactory('up-next', () => new UpNextWeatherModule(this.store));
    this.registerModuleFactory('task-backlog', async () => {
      const { TaskBacklogModule } = await import('./TaskBacklogModule');
      return new TaskBacklogModule(this.store);
    });
    this.registerModuleFactory('agent', async () => {
      const { AgentHudModule } = await import('./AgentHudModule');
      return new AgentHudModule(this.store);
    });
  }

  public registerModuleFactory(id: string, factory: SidebarModuleFactory): void {
    this.factories.set(id, factory);
  }

  public async mountAll(containerEl: HTMLElement, context: SidebarContext): Promise<void> {
    this.destroyAll();

    const order = this.store.getSettings().moduleOrder;

    for (const id of order) {
      const factory = this.factories.get(id);
      if (factory) {
        try {
          const mod = await factory();
          mod.mount(containerEl, context);
          this.activeModules.push(mod);
        } catch (err) {
          console.error(`Full Calendar Sidebar: Failed to mount module "${id}"`, err);
        }
      }
    }
  }

  public notifyDateChange(date: Date): void {
    this.activeModules.forEach(mod => {
      try {
        mod.onDateChange?.(date);
      } catch (err) {
        console.error(`Full Calendar Sidebar: Error in ${mod.id}.onDateChange`, err);
      }
    });
  }

  public notifyDateRangeChange(range: { start: Date; end: Date }): void {
    this.activeModules.forEach(mod => {
      try {
        mod.onDateRangeChange?.(range);
      } catch (err) {
        console.error(`Full Calendar Sidebar: Error in ${mod.id}.onDateRangeChange`, err);
      }
    });
  }

  public notifyCacheUpdate(): void {
    this.activeModules.forEach(mod => {
      try {
        mod.onCacheUpdate?.();
      } catch (err) {
        console.error(`Full Calendar Sidebar: Error in ${mod.id}.onCacheUpdate`, err);
      }
    });
  }

  public setAllCollapsed(collapsed: boolean): void {
    this.activeModules.forEach(mod => {
      try {
        mod.setCollapsed?.(collapsed);
      } catch (err) {
        console.error(`Full Calendar Sidebar: Error setting collapsed on ${mod.id}`, err);
      }
    });
  }

  public areAllCollapsed(): boolean {
    if (this.activeModules.length === 0) return false;
    return this.activeModules.every(mod => (mod.isCollapsed ? mod.isCollapsed() : true));
  }

  public destroyAll(): void {
    this.activeModules.forEach(mod => {
      try {
        mod.destroy();
      } catch (err) {
        console.error(`Full Calendar Sidebar: Error destroying ${mod.id}`, err);
      }
    });
    this.activeModules = [];
  }
}
