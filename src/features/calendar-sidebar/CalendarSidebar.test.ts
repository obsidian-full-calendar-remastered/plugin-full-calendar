// Augment HTMLElement prototype for testing Obsidian DOM methods
const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
if (!proto.empty) {
  proto.empty = function (this: HTMLElement) {
    this.innerHTML = '';
  };
}
if (!proto.addClass) {
  proto.addClass = function (this: HTMLElement, cls: string) {
    this.classList.add(cls);
  };
}
if (!proto.removeClass) {
  proto.removeClass = function (this: HTMLElement, cls: string) {
    this.classList.remove(cls);
  };
}
if (!proto.toggleClass) {
  proto.toggleClass = function (this: HTMLElement, cls: string, force?: boolean) {
    this.classList.toggle(cls, force);
  };
}
if (!proto.setText) {
  proto.setText = function (this: HTMLElement, val: string) {
    this.textContent = val;
  };
}
if (!proto.createEl) {
  proto.createEl = function (
    this: HTMLElement,
    tag: string,
    options?: { text?: string; cls?: string; attr?: Record<string, string> }
  ) {
    const el = document.createElement(tag);
    if (options?.text) el.textContent = options.text;
    if (options?.cls) el.className = options.cls;
    if (options?.attr) {
      for (const [k, v] of Object.entries(options.attr)) {
        el.setAttribute(k, v);
      }
    }
    this.appendChild(el);
    return el;
  };
}
if (!proto.createDiv) {
  proto.createDiv = function (this: HTMLElement, options?: { cls?: string; text?: string }) {
    return (this as unknown as { createEl: (tag: string, opts?: unknown) => HTMLElement }).createEl(
      'div',
      options
    );
  };
}
if (!proto.createSpan) {
  proto.createSpan = function (this: HTMLElement, options?: { cls?: string; text?: string }) {
    return (this as unknown as { createEl: (tag: string, opts?: unknown) => HTMLElement }).createEl(
      'span',
      options
    );
  };
}
if (!proto.setCssProps) {
  proto.setCssProps = function (this: HTMLElement, props: Record<string, string>) {
    Object.assign(this.style, props);
  };
}

(window as unknown as Record<string, unknown>).createDiv = (options?: { cls?: string }) => {
  const el = document.createElement('div');
  if (options?.cls) el.className = options.cls;
  return el;
};

jest.mock('@fullcalendar/interaction', () => ({
  Draggable: jest.fn().mockImplementation(() => ({
    destroy: jest.fn()
  }))
}));
jest.mock('@fullcalendar/core', () => ({}));
jest.mock('../task-backlogs/EmbeddedTaskBacklog', () => ({
  EmbeddedTaskBacklog: class {
    onload() {}
    onunload() {}
  }
}));

import { SidebarStateStore } from './SidebarStateStore';
import { SidebarResizer } from './SidebarResizer';
import { CollapsibleSection } from './components/CollapsibleSection';
import { SidebarModuleRegistry } from './modules/SidebarModuleRegistry';
import { MiniMonthModule } from './modules/MiniMonthModule';
import { UpNextWeatherModule } from './modules/UpNextWeatherModule';
import { PluginState } from '../../core/PluginState';
import { DEFAULT_SETTINGS, FullCalendarSettings } from '../../types/settings';
import { SidebarContext } from './types';
import { Component } from 'obsidian';
import FullCalendarPlugin from '../../main';

describe('Calendar Left Panel (Sidebar) Feature', () => {
  beforeEach(() => {
    // Reset PluginState mock settings
    const mockSettings: FullCalendarSettings = {
      ...DEFAULT_SETTINGS,
      sidebarConfig: { ...DEFAULT_SETTINGS.sidebarConfig }
    };
    PluginState.setSettings(mockSettings);
    PluginState.saveSettings = jest.fn().mockResolvedValue(undefined);
  });

  describe('SidebarStateStore', () => {
    it('initializes with default settings', () => {
      const store = new SidebarStateStore();
      const settings = store.getSettings();

      expect(settings.enabled).toBe(true);
      expect(settings.width).toBe(290);
      expect(settings.isCollapsed).toBe(false);
      expect(settings.moduleOrder).toEqual(['mini-month', 'up-next', 'task-backlog', 'agent']);
    });

    it('clamps width within allowed bounds (200 - 520)', () => {
      const store = new SidebarStateStore();

      store.setWidth(150);
      expect(store.getSettings().width).toBe(200);

      store.setWidth(600);
      expect(store.getSettings().width).toBe(520);

      store.setWidth(350);
      expect(store.getSettings().width).toBe(350);
    });

    it('tracks collapsed state for sidebar and individual modules', () => {
      const store = new SidebarStateStore();

      store.setCollapsed(true);
      expect(store.getSettings().isCollapsed).toBe(true);

      store.setModuleCollapsed('mini-month', true);
      expect(store.isModuleCollapsed('mini-month')).toBe(true);
      expect(store.isModuleCollapsed('up-next')).toBe(false);
    });

    it('updates module order', () => {
      const store = new SidebarStateStore();
      const newOrder = ['up-next', 'mini-month'];
      store.setModuleOrder(newOrder);

      expect(store.getSettings().moduleOrder).toEqual(newOrder);
    });

    it('automatically upgrades legacy 3-module default order to include agent', () => {
      const store = new SidebarStateStore();
      PluginState.getSettings().sidebarConfig.moduleOrder = [
        'mini-month',
        'up-next',
        'task-backlog'
      ];
      expect(store.getSettings().moduleOrder).toEqual([
        'mini-month',
        'up-next',
        'task-backlog',
        'agent'
      ]);
    });
  });

  describe('SidebarResizer', () => {
    it('creates separator element with accessibility attributes', () => {
      const shellEl = document.createElement('div');
      const sidebarEl = document.createElement('div');
      const store = new SidebarStateStore();

      const resizer = new SidebarResizer({
        shellEl,
        sidebarEl,
        store,
        onResize: jest.fn(),
        onResizeEnd: jest.fn(),
        onDoubleClick: jest.fn()
      });

      const el = resizer.getElement();
      expect(el.classList.contains('ofc-calendar-sidebar-resizer')).toBe(true);
      expect(el.getAttribute('role')).toBe('separator');
      expect(el.getAttribute('aria-orientation')).toBe('vertical');

      resizer.destroy();
    });

    it('triggers double-click callback to toggle collapse', () => {
      const shellEl = document.createElement('div');
      const sidebarEl = document.createElement('div');
      const store = new SidebarStateStore();
      const onDoubleClick = jest.fn();

      const resizer = new SidebarResizer({
        shellEl,
        sidebarEl,
        store,
        onResize: jest.fn(),
        onResizeEnd: jest.fn(),
        onDoubleClick
      });

      const el = resizer.getElement();
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

      expect(onDoubleClick).toHaveBeenCalledTimes(1);
      resizer.destroy();
    });
  });

  describe('CollapsibleSection', () => {
    it('creates header and collapsible body with toggle support', () => {
      const containerEl = document.createElement('div');
      const store = new SidebarStateStore();
      const onToggle = jest.fn();

      const section = new CollapsibleSection(containerEl, {
        id: 'test-section',
        title: 'Test Section',
        icon: 'calendar',
        store,
        defaultCollapsed: false,
        onToggle
      });

      expect(section.getIsCollapsed()).toBe(false);
      expect(section.getBodyEl()).toBeDefined();

      // Test badge setting
      section.setBadge('5');
      const badgeEl = containerEl.querySelector('.ofc-sidebar-section-badge');
      expect(badgeEl?.textContent).toBe('5');
      expect(badgeEl?.classList.contains('is-hidden')).toBe(false);

      // Toggle collapsed state
      section.toggle();
      expect(section.getIsCollapsed()).toBe(true);
      expect(onToggle).toHaveBeenCalledWith(true);

      section.destroy();
    });
  });

  describe('SidebarModuleRegistry', () => {
    it('registers built-in modules and mounts them', async () => {
      const store = new SidebarStateStore();
      const registry = new SidebarModuleRegistry(store);
      const containerEl = document.createElement('div');

      const mockGotoDate = jest.fn();
      const mockPlugin = {} as unknown as FullCalendarPlugin;
      const context: SidebarContext = {
        plugin: mockPlugin,
        parentComponent: new Component(),
        calendarApi: () => null,
        sidebarContainerEl: containerEl,
        triggerResize: jest.fn(),
        gotoDate: mockGotoDate,
        getActiveDate: () => new Date(2026, 9, 16)
      };

      await registry.mountAll(containerEl, context);

      const sections = containerEl.querySelectorAll('.ofc-sidebar-section');
      expect(sections.length).toBeGreaterThanOrEqual(2);

      // Test collapsing all and checking state
      registry.setAllCollapsed(true);
      expect(registry.areAllCollapsed()).toBe(true);

      registry.setAllCollapsed(false);
      expect(registry.areAllCollapsed()).toBe(false);

      registry.destroyAll();
    });
  });

  describe('MiniMonthModule', () => {
    it('renders month navigation and responds to date clicks and title clicks', () => {
      const store = new SidebarStateStore();
      const module = new MiniMonthModule(store);
      const containerEl = document.createElement('div');

      const mockGotoDate = jest.fn();
      const mockPlugin = {} as unknown as FullCalendarPlugin;
      const context: SidebarContext = {
        plugin: mockPlugin,
        parentComponent: new Component(),
        calendarApi: () => null,
        sidebarContainerEl: containerEl,
        triggerResize: jest.fn(),
        gotoDate: mockGotoDate,
        getActiveDate: () => new Date(2026, 9, 16)
      };

      module.mount(containerEl, context);

      const cells = containerEl.querySelectorAll('.ofc-mini-month-cell:not(.is-other-month)');
      expect(cells.length).toBe(31); // October has 31 days

      // Day cells have accessibility title
      const cell1 = cells[0];
      expect(cell1.getAttribute('title')).toBeDefined();

      // Click on day 16
      const cell16 = Array.from(cells).find(c => c.textContent?.trim() === '16');
      expect(cell16).toBeDefined();
      cell16?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(mockGotoDate).toHaveBeenCalled();
      const calls = mockGotoDate.mock.calls as [Date][];
      const calledDate = calls[0]?.[0];
      expect(calledDate?.getDate()).toBe(16);

      // Click month title to jump to today
      const titleEl = containerEl.querySelector('.ofc-mini-month-title');
      expect(titleEl).toBeDefined();
      titleEl?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(mockGotoDate).toHaveBeenCalledTimes(2);

      // Test module collapse methods
      expect(module.isCollapsed()).toBe(false);
      module.setCollapsed(true);
      expect(module.isCollapsed()).toBe(true);

      module.destroy();
    });
  });

  describe('UpNextWeatherModule', () => {
    it('mounts clean empty state when no upcoming events exist and supports collapse', () => {
      const store = new SidebarStateStore();
      const module = new UpNextWeatherModule(store);
      const containerEl = document.createElement('div');

      const mockPlugin = {} as unknown as FullCalendarPlugin;
      const context: SidebarContext = {
        plugin: mockPlugin,
        parentComponent: new Component(),
        calendarApi: () => null,
        sidebarContainerEl: containerEl,
        triggerResize: jest.fn(),
        gotoDate: jest.fn(),
        getActiveDate: () => new Date(2026, 9, 16)
      };

      module.mount(containerEl, context);

      const emptyEl = containerEl.querySelector('.ofc-upnext-empty');
      expect(emptyEl).toBeDefined();

      expect(module.isCollapsed()).toBe(false);
      module.setCollapsed(true);
      expect(module.isCollapsed()).toBe(true);

      module.destroy();
    });
  });

  describe('TaskBacklogModule', () => {
    it('mounts and supports collapse and cache updates', async () => {
      const { TaskBacklogModule } = await import('./modules/TaskBacklogModule');
      const store = new SidebarStateStore();
      const module = new TaskBacklogModule(store);
      const containerEl = document.createElement('div');

      const mockPlugin = {
        app: {}
      } as unknown as FullCalendarPlugin;

      const context: SidebarContext = {
        plugin: mockPlugin,
        parentComponent: new Component(),
        calendarApi: () => null,
        sidebarContainerEl: containerEl,
        triggerResize: jest.fn(),
        gotoDate: jest.fn(),
        getActiveDate: () => new Date()
      };

      module.mount(containerEl, context);

      expect(module.isCollapsed()).toBe(false);
      module.setCollapsed(true);
      expect(module.isCollapsed()).toBe(true);

      expect(() => module.onCacheUpdate()).not.toThrow();

      module.destroy();
    });
  });

  describe('AgentHudModule', () => {
    it('mounts inside collapsible section and calls createWriteBar when enabled', async () => {
      const { AgentHudModule } = await import('./modules/AgentHudModule');
      const store = new SidebarStateStore();
      const module = new AgentHudModule(store);
      const containerEl = document.createElement('div');

      const mockCreateWriteBar = jest.fn().mockReturnValue({ destroy: jest.fn() });
      const mockPlugin = {
        agentManager: {
          createWriteBar: mockCreateWriteBar
        }
      } as unknown as FullCalendarPlugin;

      const context: SidebarContext = {
        plugin: mockPlugin,
        parentComponent: new Component(),
        calendarApi: () => null,
        sidebarContainerEl: containerEl,
        triggerResize: jest.fn(),
        gotoDate: jest.fn(),
        getActiveDate: () => new Date()
      };

      module.mount(containerEl, context);
      expect(mockCreateWriteBar).toHaveBeenCalled();

      expect(module.isCollapsed()).toBe(false);
      module.setCollapsed(true);
      expect(module.isCollapsed()).toBe(true);

      module.destroy();
    });

    it('handles deferred initialization via polling retry loop', async () => {
      jest.useFakeTimers();
      try {
        const { AgentHudModule } = await import('./modules/AgentHudModule');
        const store = new SidebarStateStore();
        const module = new AgentHudModule(store);
        const containerEl = document.createElement('div');

        const mockCreateWriteBar = jest.fn().mockReturnValue({ destroy: jest.fn() });
        const mockPlugin: Record<string, unknown> = {
          agentManager: undefined
        };

        const context: SidebarContext = {
          plugin: mockPlugin as unknown as FullCalendarPlugin,
          parentComponent: new Component(),
          calendarApi: () => null,
          sidebarContainerEl: containerEl,
          triggerResize: jest.fn(),
          gotoDate: jest.fn(),
          getActiveDate: () => new Date()
        };

        module.mount(containerEl, context);
        expect(containerEl.textContent).toContain('Agent service is initializing...');

        // Advance timer by one retry step while still undefined
        jest.advanceTimersByTime(200);
        expect(mockCreateWriteBar).not.toHaveBeenCalled();

        // Agent now available, advance next retry
        mockPlugin.agentManager = { createWriteBar: mockCreateWriteBar };
        jest.advanceTimersByTime(200);

        expect(mockCreateWriteBar).toHaveBeenCalled();
        module.destroy();
      } finally {
        jest.useRealTimers();
      }
    });

    it('shows retry button if max attempts exceeded', async () => {
      jest.useFakeTimers();
      try {
        const { AgentHudModule } = await import('./modules/AgentHudModule');
        const store = new SidebarStateStore();
        const module = new AgentHudModule(store);
        const containerEl = document.createElement('div');

        const mockPlugin: Record<string, unknown> = {
          agentManager: undefined
        };

        const context: SidebarContext = {
          plugin: mockPlugin as unknown as FullCalendarPlugin,
          parentComponent: new Component(),
          calendarApi: () => null,
          sidebarContainerEl: containerEl,
          triggerResize: jest.fn(),
          gotoDate: jest.fn(),
          getActiveDate: () => new Date()
        };

        module.mount(containerEl, context);
        expect(containerEl.textContent).toContain('Agent service is initializing...');

        // Advance timers past max attempts (50 * 200ms = 10,000ms)
        jest.advanceTimersByTime(11000);

        expect(containerEl.textContent).toContain(
          'Agent service is taking longer than expected to initialize.'
        );
        const retryBtn = containerEl.querySelector('button');
        expect(retryBtn).not.toBeNull();
        expect(retryBtn?.textContent).toBe('Retry');

        module.destroy();
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
