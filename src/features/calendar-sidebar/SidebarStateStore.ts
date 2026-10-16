import { PluginState } from '../../core/PluginState';
import { SidebarSettings, DEFAULT_SETTINGS } from '../../types/settings';

export class SidebarStateStore {
  public getSettings(): SidebarSettings {
    const current = PluginState.getSettings().sidebarConfig;
    if (!current) {
      return { ...DEFAULT_SETTINGS.sidebarConfig };
    }
    return {
      enabled: current.enabled ?? DEFAULT_SETTINGS.sidebarConfig.enabled,
      width: current.width ?? DEFAULT_SETTINGS.sidebarConfig.width,
      isCollapsed: current.isCollapsed ?? DEFAULT_SETTINGS.sidebarConfig.isCollapsed,
      collapsedModules: {
        ...DEFAULT_SETTINGS.sidebarConfig.collapsedModules,
        ...(current.collapsedModules ?? {})
      },
      moduleOrder: (() => {
        const order = current.moduleOrder;
        if (!order || order.length === 0) {
          return [...DEFAULT_SETTINGS.sidebarConfig.moduleOrder];
        }
        // Automatically upgrade legacy default order to include the new 'agent' module
        if (
          order.length === 3 &&
          order[0] === 'mini-month' &&
          order[1] === 'up-next' &&
          order[2] === 'task-backlog'
        ) {
          return [...DEFAULT_SETTINGS.sidebarConfig.moduleOrder];
        }
        return order;
      })()
    };
  }

  public setWidth(width: number): void {
    const clamped = Math.max(200, Math.min(520, Math.round(width)));
    const current = this.getSettings();
    if (current.width !== clamped) {
      current.width = clamped;
      this.persist(current);
    }
  }

  public setCollapsed(collapsed: boolean): void {
    const current = this.getSettings();
    if (current.isCollapsed !== collapsed) {
      current.isCollapsed = collapsed;
      this.persist(current);
    }
  }

  public setModuleCollapsed(moduleId: string, collapsed: boolean): void {
    const current = this.getSettings();
    current.collapsedModules[moduleId] = collapsed;
    this.persist(current);
  }

  public isModuleCollapsed(moduleId: string, fallback = false): boolean {
    const current = this.getSettings();
    if (moduleId in current.collapsedModules) {
      return current.collapsedModules[moduleId];
    }
    return fallback;
  }

  public setModuleOrder(order: string[]): void {
    const current = this.getSettings();
    current.moduleOrder = [...order];
    this.persist(current);
  }

  private persist(newConfig: SidebarSettings): void {
    const fullSettings = PluginState.getSettings();
    fullSettings.sidebarConfig = newConfig;
    void PluginState.saveSettings(false);
  }

  public destroy(): void {
    void PluginState.saveSettings(true);
  }
}
