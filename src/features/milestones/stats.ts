import { MilestoneAction, MilestoneState, ProviderType, MilestoneProgress } from './types';
import { PluginState } from '../../core/PluginState';
import { OFCEvent } from '../../types';

export const REMOTE_PROVIDER_TYPES: ProviderType[] = ['ical', 'caldav', 'google', 'outlook'];
export const LOCAL_TRACKED_PROVIDER_TYPES: ProviderType[] = [
  'local',
  'dailynote',
  'tasks',
  'tasknotes',
  'bases'
];
export const ALL_PROVIDER_TYPES: ProviderType[] = [
  'local',
  'dailynote',
  'ical',
  'caldav',
  'google',
  'outlook',
  'tasks',
  'tasknotes',
  'bases'
];

export function counterFor(action: MilestoneAction, scope: 'total' | ProviderType): string {
  return `${action}.${scope}`;
}

export function getCounter(state: MilestoneState, key: string): number {
  return state.counters[key] ?? 0;
}

export function getActionCounter(
  state: MilestoneState,
  action: MilestoneAction,
  scope: 'total' | ProviderType
): number {
  return getCounter(state, counterFor(action, scope));
}

export function getSumByProviders(
  state: MilestoneState,
  action: MilestoneAction,
  providers: ProviderType[]
): number {
  return providers.reduce((sum, provider) => sum + getActionCounter(state, action, provider), 0);
}

export function countProvidersAtOrAbove(
  state: MilestoneState,
  action: MilestoneAction,
  threshold: number
): number {
  return ALL_PROVIDER_TYPES.filter(
    provider => getActionCounter(state, action, provider) >= threshold
  ).length;
}

export function computeTotalOps(state: MilestoneState): number {
  return (
    getActionCounter(state, 'created', 'total') +
    getActionCounter(state, 'deleted', 'total') +
    getActionCounter(state, 'updated', 'total') +
    getActionCounter(state, 'moved', 'total')
  );
}

export function dayKeyToUtcMs(dayKey: string): number {
  const [y, m, d] = dayKey.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function dayCountFromMs(a: number, b: number): number {
  return Math.floor(Math.abs(b - a) / 86400000);
}

export function extractDayCounts(state: MilestoneState, prefix: string): Map<string, number> {
  const out = new Map<string, number>();
  const start = `${prefix}.`;
  for (const [key, value] of Object.entries(state.counters)) {
    if (!key.startsWith(start)) continue;
    const dayKey = key.slice(start.length);
    out.set(dayKey, value);
  }
  return out;
}

export function computeActionStreakDays(state: MilestoneState): number {
  const actionDays = extractDayCounts(state, 'day.action');
  if (actionDays.size === 0) return 0;

  const sorted = Array.from(actionDays.keys()).sort();
  let best = 1;
  let run = 1;

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = dayKeyToUtcMs(sorted[i - 1]);
    const curr = dayKeyToUtcMs(sorted[i]);
    const diff = dayCountFromMs(prev, curr);
    if (diff === 1) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > best) best = run;
  }

  return best;
}

export function computeDedicatedDays(state: MilestoneState): number {
  const first = getCounter(state, 'meta.firstActionAt');
  const last = getCounter(state, 'meta.lastActionAt');
  if (!first || !last || last < first) return 0;
  return dayCountFromMs(first, last);
}

export function computeDistinctTimezones(state: MilestoneState): number {
  let count = 0;
  for (const key of Object.keys(state.counters)) {
    if (key.startsWith('tz.')) count += 1;
  }
  return count;
}

export function computeRemoteActiveCount(): number {
  const sources = PluginState.getSettings().calendarSources;
  return sources.filter(source => REMOTE_PROVIDER_TYPES.includes(source.type as ProviderType))
    .length;
}

export function computePerfectWeekProgress(state: MilestoneState): MilestoneProgress {
  const createdDays = extractDayCounts(state, 'day.created');
  if (createdDays.size === 0) return { current: 0, target: 7 };

  const sorted = Array.from(createdDays.keys()).sort();
  const firstMs = dayKeyToUtcMs(sorted[0]);
  const lastMs = dayKeyToUtcMs(sorted[sorted.length - 1]);

  const oneDay = 86400000;
  let best = 0;

  for (let ms = firstMs; ms <= lastMs; ms += oneDay) {
    const d = new Date(ms);
    const day = d.getUTCDay();
    if (day !== 1) continue; // Monday

    let weekScore = 0;
    for (let offset = 0; offset < 7; offset += 1) {
      const current = new Date(ms + offset * oneDay);
      const yyyy = current.getUTCFullYear();
      const mm = String(current.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(current.getUTCDate()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd}`;
      const count = createdDays.get(key) ?? 0;
      if (count >= 3) weekScore += 1;
    }

    if (weekScore > best) best = weekScore;
    if (best >= 7) break;
  }

  return { current: best, target: 7 };
}

export function computeLocalLiveEventCount(): number {
  const registry = PluginState.getProviderRegistry();
  const allSources = PluginState.getCache().getAllEvents();
  let total = 0;

  for (const source of allSources) {
    const info = registry.getSource(source.id);
    if (!info) continue;
    if (!LOCAL_TRACKED_PROVIDER_TYPES.includes(info.type as ProviderType)) continue;
    total += source.events.length;
  }

  return total;
}

export function getWorkspacesCount(): number {
  return PluginState.getSettings().workspaces?.length ?? 0;
}

export function getCalendarSourcesCount(): number {
  return PluginState.getSettings().calendarSources?.length ?? 0;
}

export function getDistinctSourceTypesCount(): number {
  const sources = PluginState.getSettings().calendarSources ?? [];
  const distinctTypes = new Set(sources.map(s => s.type));
  return distinctTypes.size;
}

export function currentDayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function isRecurringSeries(event: OFCEvent | undefined): boolean {
  if (!event) return false;
  return event.type === 'recurring' || event.type === 'rrule';
}

export function resolveTimezone(event: OFCEvent | undefined): string | null {
  if (!event || event.allDay) return null;
  if (event.timezone && event.timezone.trim().length > 0) return event.timezone.trim();
  const displayTimezone = PluginState.getSettings().displayTimezone;
  if (displayTimezone && displayTimezone.trim().length > 0) return displayTimezone.trim();
  return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
}
