/**
 * @file ViewSettingsHandler.ts
 * @brief Handles live updates to calendar views when plugin settings are changed.
 * @license See LICENSE.md
 */

import { EventRef, Workspace } from 'obsidian';
import { FullCalendarSettings } from '../../types/settings';
import { ViewContext } from './ViewContext';
import { resolveCalendarRenderConfig, ResolvedCalendarProps } from './CalendarViewConfigResolver';

type WorkspaceWithCustomEvents = Workspace & {
  on(
    name: 'full-calendar:settings-updated',
    callback: (settings: FullCalendarSettings) => void,
    ctx?: unknown
  ): EventRef;
};

export class ViewSettingsHandler {
  private eventRef: EventRef | null = null;

  constructor(
    private ctx: ViewContext,
    private getRenderConfig: () => ResolvedCalendarProps | null
  ) {}

  /**
   * Registers the event listener for plugin settings changes.
   */
  public register(): void {
    const customWorkspace = this.ctx.app.workspace as WorkspaceWithCustomEvents;

    this.eventRef = customWorkspace.on('full-calendar:settings-updated', updatedSettings => {
      const cal = this.ctx.fullCalendarView;
      const renderConfig = this.getRenderConfig();
      if (!cal || !renderConfig || !this.ctx.viewEnhancer) {
        return;
      }

      this.ctx.viewEnhancer.updateSettings(updatedSettings);
      const calendarConfig = this.ctx.viewEnhancer.getCalendarConfig();

      const resolvedProps = resolveCalendarRenderConfig(calendarConfig, updatedSettings, {
        forceNarrow: this.ctx.inSidebar,
        initialView: calendarConfig.initialView,
        slotMinTime: calendarConfig.slotMinTime,
        slotMaxTime: calendarConfig.slotMaxTime,
        allDaySlot: calendarConfig.allDaySlot,
        timeGridDayHeaderFormat: calendarConfig.timeGridDayHeaderFormat,
        weekends: calendarConfig.weekends,
        hiddenDays: calendarConfig.hiddenDays,
        dayMaxEvents: calendarConfig.dayMaxEvents,
        slotDuration: calendarConfig.slotDuration,
        slotLabelInterval: calendarConfig.slotLabelInterval,
        headerToolbar: calendarConfig.headerToolbar,
        footerToolbar: calendarConfig.footerToolbar,
        height: calendarConfig.height,
        weatherHide: calendarConfig.weatherHide
      });

      // Mutate the original config reference so callbacks/closures see the new settings
      Object.assign(renderConfig, resolvedProps);

      // Apply updated options dynamically to FullCalendar
      cal.setOption('timeZone', resolvedProps.timeZone);
      cal.setOption('firstDay', resolvedProps.firstDay);

      if (resolvedProps.timeFormat24h) {
        cal.setOption('eventTimeFormat', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: false
        });
        cal.setOption('slotLabelFormat', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: false
        });
      } else {
        cal.setOption('eventTimeFormat', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        cal.setOption('slotLabelFormat', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
      }

      cal.setOption('businessHours', resolvedProps.businessHours);

      if (resolvedProps.weekends !== undefined) {
        cal.setOption('weekends', resolvedProps.weekends);
      }
      if (resolvedProps.hiddenDays !== undefined) {
        cal.setOption('hiddenDays', resolvedProps.hiddenDays);
      }
      if (resolvedProps.dayMaxEvents !== undefined) {
        cal.setOption('dayMaxEvents', resolvedProps.dayMaxEvents);
      }

      // Re-render FullCalendar view to apply layout/header formatting updates
      cal.render();

      // Update highlight current/next event highlights live
      const calWithHighlight = cal as unknown as {
        updateCurrentOrNextEventHighlight?: () => void;
      };
      if (calWithHighlight.updateCurrentOrNextEventHighlight) {
        calWithHighlight.updateCurrentOrNextEventHighlight();
      }
    });

    this.ctx.plugin.registerEvent(this.eventRef);
  }
}
