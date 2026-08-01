/**
 * @file BlankViewDiagnostic.ts
 * @brief Reactive diagnostic for blank time-grid views.
 *
 * @description
 * When a Week/Day/3-Day time-grid view renders zero events while the event
 * store holds at least one event, this module fires a structured console
 * warning and a brief Obsidian Notice.  It enumerates every active filter
 * that could cause the blank — time-window, hidden days, weekend toggle,
 * workspace calendar/category filters, active search query, and timezone —
 * so the user (or a support conversation) has a single, actionable thread
 * to pull on rather than a blank screen with no explanation.
 *
 * Design constraints:
 *  - Pure function at the call site: no side-effects except the warn/Notice.
 *  - Debounced at module level (2 s) so rapid view switches do not spam Notices.
 *  - Never throws; all access is guarded.
 *  - Does NOT fire on Month/List views (not within scope).
 *  - Does NOT fire when the store is also empty (legitimate "nothing this week").
 *
 * @license See LICENSE.md
 */

import type { Calendar } from '@fullcalendar/core';
import { showNotice } from '../../utils/showNotice';
import type { ExtraRenderProps } from '../settings/sections/calendars/calendar';
import type { WorkspaceSettings } from '../../types/settings';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single diagnostic finding. */
export interface DiagnosticFinding {
  /** Machine-readable key, e.g. "zeroWidthTimeWindow". */
  key: string;
  /** Human-readable label shown in the console block. */
  label: string;
  /** String value of the filter as currently configured. */
  value: string;
  /**
   * True when this filter is the likely primary culprit
   * (e.g. slotMaxTime <= slotMinTime).
   */
  isCritical: boolean;
}

/** The complete diagnostic snapshot. Exposed on `window.FCR_DIAG` for console inspection. */
export interface DiagnosticReport {
  /** ISO timestamp of when the diagnostic fired. */
  timestamp: string;
  /** The FullCalendar view type at time of diagnosis, e.g. "timeGridWeek". */
  viewType: string;
  /** Number of events in the plugin's in-memory store. */
  storeEventCount: number;
  /** Number of events FullCalendar rendered (always 0 when this fires). */
  renderedEventCount: number;
  /** All findings, in display order. */
  findings: DiagnosticFinding[];
}

// Extend Window so TypeScript knows about FCR_DIAG.
declare global {
  interface Window {
    FCR_DIAG?: DiagnosticReport;
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Convert "HH:MM" into total minutes for easy comparison. */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Map day-of-week numbers (0–6) to readable names. */
const DAY_NAMES: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday'
};

function formatDays(days: number[]): string {
  return days.map(d => DAY_NAMES[d] ?? String(d)).join(', ');
}

// ─── Debounce guard ───────────────────────────────────────────────────────────

const DEBOUNCE_MS = 2000;
let lastFiredAt = 0;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Checks whether the diagnostic should fire and, if so, builds the report,
 * logs it to the console, shows a Notice, and exposes it on `window.FCR_DIAG`.
 *
 * @param cal            The live FullCalendar instance.
 * @param renderProps    The resolved props that were passed to `renderCalendar`.
 * @param storeEventCount  Total events in the plugin's EventStore (pre-filter count).
 * @param activeWorkspace  The currently active WorkspaceSettings, or null.
 */
export function runBlankViewDiagnostic(
  cal: Calendar,
  renderProps: ExtraRenderProps,
  storeEventCount: number,
  activeWorkspace: WorkspaceSettings | null
): void {
  try {
    // ── Guard: calendar instance must be valid and mounted ───────────────────
    if (!cal || !cal.el || (cal.el.ownerDocument && !cal.el.ownerDocument.contains(cal.el))) {
      return;
    }

    // ── Guard: only time-grid views ──────────────────────────────────────────
    const viewType = cal.view?.type ?? '';
    if (!viewType.startsWith('timeGrid')) {
      return;
    }

    // ── Guard: rendered count must be 0 ─────────────────────────────────────
    // We filter out shadow events so they don't mask a real blank.
    const renderedEvents = cal.getEvents().filter(e => !e.extendedProps?.isShadow);
    if (renderedEvents.length > 0) {
      return;
    }

    // ── Guard: store must have events (otherwise it's legitimately empty) ────
    if (storeEventCount === 0) {
      return;
    }

    // ── Debounce ─────────────────────────────────────────────────────────────
    const now = Date.now();
    if (now - lastFiredAt < DEBOUNCE_MS) {
      return;
    }
    lastFiredAt = now;

    // ── Build report ─────────────────────────────────────────────────────────
    const report = buildReport(cal, renderProps, storeEventCount, activeWorkspace);

    // ── Expose on window for console power users ─────────────────────────────
    window.FCR_DIAG = report;

    // ── Console output ───────────────────────────────────────────────────────
    logReport(report);

    // ── Obsidian Notice ──────────────────────────────────────────────────────
    showDiagnosticNotice(report);
  } catch (err) {
    // Never let the diagnostic break the view.
    console.error('[FCR] BlankViewDiagnostic internal error:', err);
  }
}

// ─── Report builder ───────────────────────────────────────────────────────────

/**
 * Pure function: builds the DiagnosticReport from the current render state.
 * Exported for unit testing.
 */
export function buildReport(
  cal: Calendar,
  renderProps: ExtraRenderProps,
  storeEventCount: number,
  activeWorkspace: WorkspaceSettings | null
): DiagnosticReport {
  const findings: DiagnosticFinding[] = [];

  // ── 1. Time window ───────────────────────────────────────────────────────
  const slotMin = renderProps.slotMinTime ?? '00:00';
  const slotMax = renderProps.slotMaxTime ?? '24:00';
  const minMins = timeToMinutes(slotMin);
  const maxMins = timeToMinutes(slotMax);
  const windowMinutes = maxMins - minMins;
  const isZeroOrNegativeWindow = windowMinutes <= 0;
  const isNarrowWindow = windowMinutes > 0 && windowMinutes < 60; // < 1 hour

  findings.push({
    key: isZeroOrNegativeWindow
      ? 'zeroWidthTimeWindow'
      : isNarrowWindow
        ? 'narrowTimeWindow'
        : 'timeWindow',
    label: 'Time window (slotMinTime → slotMaxTime)',
    value: `${slotMin} → ${slotMax}${isZeroOrNegativeWindow ? '  ⚠ ZERO-WIDTH — all timed events are hidden' : isNarrowWindow ? `  ⚠ NARROW (${windowMinutes} min) — events outside this band are hidden` : ''}`,
    isCritical: isZeroOrNegativeWindow
  });

  // ── 2. Hidden days ───────────────────────────────────────────────────────
  const hiddenDays = renderProps.hiddenDays ?? [];
  if (hiddenDays.length > 0) {
    findings.push({
      key: 'hiddenDays',
      label: 'Hidden days (hiddenDays)',
      value: `[${hiddenDays.join(', ')}] = ${formatDays(hiddenDays)}`,
      isCritical: false
    });
  }

  // ── 3. Weekends toggle ───────────────────────────────────────────────────
  if (renderProps.weekends === false) {
    findings.push({
      key: 'weekendsHidden',
      label: 'Weekends (weekends)',
      value: 'false — Saturday & Sunday are hidden',
      isCritical: false
    });
  }

  // ── 4. Workspace filters ─────────────────────────────────────────────────
  if (activeWorkspace) {
    findings.push({
      key: 'activeWorkspace',
      label: 'Active workspace',
      value: `"${activeWorkspace.name}"`,
      isCritical: false
    });

    // 4a. Calendar source filter
    const visible = activeWorkspace.visibleCalendars ?? [];
    if (visible.length > 0) {
      findings.push({
        key: 'workspaceCalendarFilter',
        label: '  ↳ Visible calendars (workspace.visibleCalendars)',
        value: `${visible.length} calendar ID(s) selected: [${visible.join(', ')}]`,
        isCritical: false
      });
    }

    // 4b. Category filter
    const catFilter = activeWorkspace.categoryFilter;
    if (catFilter) {
      const { mode, categories } = catFilter;
      const isProblematic = mode === 'show-only' && categories.length === 0;
      // Note: show-only with empty list is actually a no-op (returns all events),
      // but hide with all-categories list could blank the view.
      findings.push({
        key: 'workspaceCategoryFilter',
        label: '  ↳ Category filter (workspace.categoryFilter)',
        value: `mode="${mode}", categories=[${categories.join(', ') || 'none'}]${isProblematic ? '  ⚠ show-only with empty list (no-op, but check hide mode)' : ''}`,
        isCritical: false
      });
    }

    // 4c. Workspace-level slot time overrides (may differ from global)
    if (activeWorkspace.slotMinTime || activeWorkspace.slotMaxTime) {
      findings.push({
        key: 'workspaceSlotTimeOverride',
        label: '  ↳ Workspace time window override',
        value: `slotMinTime=${activeWorkspace.slotMinTime ?? '(none)'}, slotMaxTime=${activeWorkspace.slotMaxTime ?? '(none)'}`,
        isCritical: false
      });
    }
  }

  // ── 5. Active search/text filter ─────────────────────────────────────────
  const searchQuery = renderProps.initialSearchQuery;
  if (searchQuery && searchQuery.trim().length > 0) {
    findings.push({
      key: 'activeSearchQuery',
      label: 'Active search/text filter',
      value: `"${searchQuery}"  — events not matching this query are hidden`,
      isCritical: false
    });
  }

  // ── 6. Display timezone ──────────────────────────────────────────────────
  const timezone = renderProps.timeZone;
  if (timezone) {
    const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzDiffers = timezone !== systemTz;
    findings.push({
      key: 'displayTimezone',
      label: 'Display timezone',
      value: `"${timezone}"${tzDiffers ? `  (system: "${systemTz}") — events may be shifted outside the visible time window` : ''}`,
      isCritical: false
    });
  }

  // ── 7. Slot duration / label interval (informational) ────────────────────
  if (renderProps.slotDuration) {
    findings.push({
      key: 'slotDuration',
      label: 'Slot duration',
      value: renderProps.slotDuration,
      isCritical: false
    });
  }

  return {
    timestamp: new Date().toISOString(),
    viewType: cal.view?.type ?? 'unknown',
    storeEventCount,
    renderedEventCount: 0,
    findings
  };
}

// ─── Console logger ───────────────────────────────────────────────────────────

function logReport(report: DiagnosticReport): void {
  const criticalFindings = report.findings.filter(f => f.isCritical);
  const hasCritical = criticalFindings.length > 0;

  const header = `[FCR] ⚠ Blank time-grid view — ${report.storeEventCount} event(s) in store, 0 rendered in "${report.viewType}"`;

  const lines: string[] = [header, '      Active filters that may explain this:'];

  for (const finding of report.findings) {
    lines.push(`      • ${finding.label}:`);
    lines.push(`          ${finding.value}`);
  }

  lines.push('');
  lines.push('      Inspect the full report object: window.FCR_DIAG');
  if (hasCritical) {
    lines.push(
      '      To fix: open Settings → Appearance → View Time Range and ensure Latest > Earliest.'
    );
  }

  console.warn(lines.join('\n'));
}

// ─── Notice ───────────────────────────────────────────────────────────────────

function showDiagnosticNotice(report: DiagnosticReport): void {
  const criticalFindings = report.findings.filter(f => f.isCritical);

  let message: string;

  if (criticalFindings.length > 0) {
    // Highlight the most actionable problem.
    const first = criticalFindings[0];
    message =
      `⚠ Full Calendar: No events visible in ${report.viewType}.\n` +
      `Critical: ${first.label} → ${first.value}\n` +
      `Open Settings → Appearance → View Time Range to fix.\n` +
      `(See console for full diagnostic — Ctrl+Shift+I)`;
  } else {
    message =
      `⚠ Full Calendar: No events visible in ${report.viewType}, ` +
      `but ${report.storeEventCount} event(s) exist in the store.\n` +
      `Open the developer console (Ctrl+Shift+I) to see which active ` +
      `filters may be hiding them.`;
  }

  // 10-second notice so there's time to read it, but it doesn't linger forever.
  showNotice(message, 10000);
}
