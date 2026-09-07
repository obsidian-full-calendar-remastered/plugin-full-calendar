/**
 * @file resolveDefaultCalendar.ts
 * @brief Resolves which calendar the event creation modal should pre-select.
 *
 * @description
 * Deliberately kept free of Obsidian and plugin-state imports so it stays a pure,
 * directly testable function. Note that this precedence is *not* folded into
 * `WorkspaceManager.getCalendarConfig()`: that method builds the configuration
 * handed to FullCalendar for rendering, and the default calendar never reaches
 * the view layer.
 *
 * A workspace override takes precedence over the global value, and each candidate
 * is validated before it is used, so a default pointing at a calendar that was
 * deleted, turned read-only, or hidden by the active workspace degrades to the
 * next rule instead of failing.
 *
 * The final fallback is index 0 — the first writable calendar in settings order —
 * which is the behavior that shipped before a default was configurable.
 *
 * @license See LICENSE.md
 */

export interface DefaultCalendarCandidate {
  id: string;
}

export interface DefaultCalendarResolution {
  /**
   * Writable calendars offered by the modal, in settings order. This is already
   * filtered to sources whose provider reports `canCreate`.
   */
  candidates: readonly DefaultCalendarCandidate[];

  /**
   * Calendar named explicitly by the caller of `launchCreateModal`. Outranks
   * configuration, and is not subject to workspace visibility filtering.
   */
  explicitId?: string | null;

  /**
   * The active workspace's default calendar, when a workspace is active and sets one.
   */
  workspaceDefaultId?: string | null;

  /**
   * The global default calendar, used when no workspace override applies.
   */
  globalDefaultId?: string | null;

  /**
   * The active workspace's `visibleCalendars`. Absent or empty means every
   * calendar is visible, matching the documented semantics of that field.
   */
  visibleCalendarIds?: readonly string[] | null;
}

const FIRST_WRITABLE_CALENDAR = 0;

function indexOfCalendar(
  candidates: readonly DefaultCalendarCandidate[],
  id: string | null | undefined
): number {
  if (!id) return -1;
  return candidates.findIndex(candidate => candidate.id === id);
}

function isVisible(id: string, visibleCalendarIds?: readonly string[] | null): boolean {
  if (!visibleCalendarIds || visibleCalendarIds.length === 0) return true;
  return visibleCalendarIds.includes(id);
}

/**
 * Determines the index into `candidates` that the create modal should select.
 *
 * Resolution order:
 *   1. An explicit calendar named by the caller.
 *   2. The active workspace's default, when writable and visible.
 *   3. The global default, when writable and visible.
 *   4. The first writable calendar the active workspace can display.
 *   5. The first writable calendar, when the workspace hides all of them.
 *
 * Rule 4 keeps the documented promise that a calendar hidden by a workspace is
 * never chosen for it. Rule 5 exists only for the degenerate case where a
 * workspace hides every calendar that could accept the event; selecting
 * something the user can act on beats selecting nothing.
 *
 * @returns An index into `candidates`; always 0 when nothing else resolves.
 */
export function resolveDefaultCalendarIndex(resolution: DefaultCalendarResolution): number {
  const { candidates, explicitId, workspaceDefaultId, globalDefaultId, visibleCalendarIds } =
    resolution;

  // A caller naming a calendar outranks configuration and presentation filtering.
  const explicitIndex = indexOfCalendar(candidates, explicitId);
  if (explicitIndex !== -1) return explicitIndex;

  for (const configuredId of [workspaceDefaultId, globalDefaultId]) {
    const index = indexOfCalendar(candidates, configuredId);
    if (index !== -1 && isVisible(candidates[index].id, visibleCalendarIds)) {
      return index;
    }
  }

  const firstVisibleIndex = candidates.findIndex(candidate =>
    isVisible(candidate.id, visibleCalendarIds)
  );
  if (firstVisibleIndex !== -1) return firstVisibleIndex;

  return FIRST_WRITABLE_CALENDAR;
}
