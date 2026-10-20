import { Component } from 'obsidian';
import type { Calendar } from '@fullcalendar/core';
import FullCalendarPlugin from '../../main';
import { SidebarSettings } from '../../types/settings';

export interface SidebarContext {
  plugin: FullCalendarPlugin;
  parentComponent: Component;
  calendarApi: () => Calendar | null;
  sidebarContainerEl: HTMLElement;
  triggerResize: () => void;
  gotoDate: (date: Date) => void;
  getActiveDate: () => Date;
}

export interface ISidebarModule {
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  readonly defaultCollapsed?: boolean;

  mount(containerEl: HTMLElement, context: SidebarContext): void;
  destroy(): void;

  onDateChange?(date: Date): void;
  onDateRangeChange?(range: { start: Date; end: Date }): void;
  onCacheUpdate?(): void;
  renderHeaderActions?(actionsEl: HTMLElement): void;
  setCollapsed?(collapsed: boolean): void;
  isCollapsed?(): boolean;
}

export type SidebarModuleFactory = () => ISidebarModule | Promise<ISidebarModule>;

export type { SidebarSettings };
