/**
 * @file writableCalendars.ts
 * @brief Shared lookup for calendar sources that can accept newly created events.
 *
 * @description
 * The create-event modal, the global default-calendar setting, and the
 * per-workspace default-calendar override all need the same list: sources whose
 * provider reports the `canCreate` capability, in settings order. Keeping one
 * implementation avoids the three copies drifting apart as providers change
 * their capabilities.
 *
 * @license See LICENSE.md
 */

import { PluginState } from '../core/PluginState';
import { CalendarInfo } from '../types/calendar_settings';
import { getActiveWorkspace } from '../types/settings';
import { resolveDefaultCalendarIndex } from '../ui/modals/resolveDefaultCalendar';

export interface WritableCalendarOption {
  id: string;
  type: CalendarInfo['type'];
  name: string;
}

/**
 * Lists calendar sources that can create events, in settings order.
 *
 * @returns Writable sources; empty when no configured calendar accepts writes.
 */
export function listWritableCalendars(): WritableCalendarOption[] {
  const registry = PluginState.getProviderRegistry();
  return registry
    .getAllSources()
    .filter(source => source.type !== 'FOR_TEST_ONLY')
    .map(info => {
      const instance = registry.getInstance(info.id);
      if (!instance) return null;
      if (!instance.getCapabilities().canCreate) return null;

      return {
        id: info.id,
        type: info.type,
        name: info.name || ''
      };
    })
    .filter(option => option !== null);
}

export interface DefaultCalendarSelection {
  /** Writable calendars, in settings order. */
  candidates: WritableCalendarOption[];
  /** Index into `candidates`, or -1 when there are none. */
  index: number;
  /** The selected calendar's ID, or null when no calendar can accept events. */
  id: string | null;
}

/**
 * Applies the default-calendar resolution ladder against current settings.
 *
 * Shared by every entry point that creates an event without the user having
 * picked a calendar — the create modal and the NLP dispatcher — so all of them
 * honor the global default, the active workspace's override, and that
 * workspace's visibility filter identically.
 *
 * @param explicitId A calendar named by the caller, which outranks configuration.
 */
export function selectDefaultCalendar(explicitId?: string | null): DefaultCalendarSelection {
  const candidates = listWritableCalendars();
  if (candidates.length === 0) {
    return { candidates, index: -1, id: null };
  }

  const settings = PluginState.getSettings();
  const activeWorkspace = getActiveWorkspace(settings);

  const index = resolveDefaultCalendarIndex({
    candidates,
    explicitId,
    workspaceDefaultId: activeWorkspace?.defaultCalendarId,
    globalDefaultId: settings.defaultCalendarId,
    visibleCalendarIds: activeWorkspace?.visibleCalendars
  });

  return { candidates, index, id: candidates[index].id };
}
