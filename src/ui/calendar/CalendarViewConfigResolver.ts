import { FullCalendarSettings } from '../../types/settings';
import { ExtraRenderProps } from '../settings/sections/calendars/calendar';

export type ResolvedCalendarProps = ExtraRenderProps & {
  enableAdvancedCategorization?: boolean;
};

/**
 * Single Source of Truth (SSOT) configuration resolver for FullCalendar rendering.
 * Merges workspace/view calendar configurations with global plugin settings and view-specific overrides.
 */
export function resolveCalendarRenderConfig(
  calendarConfig: Partial<FullCalendarSettings>,
  globalSettings: FullCalendarSettings,
  overrides: ResolvedCalendarProps = {}
): ResolvedCalendarProps {
  const resolvedTimeZone =
    overrides.timeZone ||
    calendarConfig.displayTimezone ||
    globalSettings.displayTimezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;

  const resolvedEnableAdvancedCategorization =
    overrides.enableAdvancedCategorization !== undefined
      ? overrides.enableAdvancedCategorization
      : calendarConfig.enableAdvancedCategorization !== undefined
        ? calendarConfig.enableAdvancedCategorization
        : globalSettings.enableAdvancedCategorization;

  const resolvedFirstDay =
    overrides.firstDay !== undefined
      ? overrides.firstDay
      : calendarConfig.firstDay !== undefined
        ? calendarConfig.firstDay
        : globalSettings.firstDay;

  const resolvedTimeFormat24h =
    overrides.timeFormat24h !== undefined
      ? overrides.timeFormat24h
      : calendarConfig.timeFormat24h !== undefined
        ? calendarConfig.timeFormat24h
        : globalSettings.timeFormat24h;

  const resolvedHighlight =
    overrides.highlightCurrentOrNextEvent !== undefined
      ? overrides.highlightCurrentOrNextEvent
      : calendarConfig.highlightCurrentOrNextEvent !== undefined
        ? calendarConfig.highlightCurrentOrNextEvent
        : globalSettings.highlightCurrentOrNextEvent;

  const resolvedDayHeaderFormat =
    overrides.timeGridDayHeaderFormat ||
    calendarConfig.timeGridDayHeaderFormat ||
    globalSettings.timeGridDayHeaderFormat;

  const resolvedDayMaxEvents = overrides.dayMaxEvents !== undefined ? overrides.dayMaxEvents : true;

  const baseResolvedProps: ResolvedCalendarProps = {
    timeZone: resolvedTimeZone,
    enableAdvancedCategorization: resolvedEnableAdvancedCategorization,
    firstDay: resolvedFirstDay,
    timeFormat24h: resolvedTimeFormat24h,
    highlightCurrentOrNextEvent: resolvedHighlight,
    dayMaxEvents: resolvedDayMaxEvents,
    timeGridDayHeaderFormat: resolvedDayHeaderFormat,
    businessHours: calendarConfig.businessHours ?? globalSettings.businessHours
  };

  return {
    ...baseResolvedProps,
    ...overrides
  };
}
