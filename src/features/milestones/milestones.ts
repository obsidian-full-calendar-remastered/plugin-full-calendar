import { PluginState } from '../../core/PluginState';
import type { CalendarInfo } from '../../types/calendar_settings';
import type { OFCEvent } from '../../types/schema';
import { t } from '../i18n/i18n';
import { activeDocument } from 'obsidian';

type MilestoneAction = 'created' | 'deleted' | 'updated' | 'moved';
type ProviderType = Exclude<CalendarInfo['type'], 'FOR_TEST_ONLY'>;

export interface MilestoneCard {
  id: string;
  title: string;
  description: string;
  targetLabel: string;
  current: number;
  percent: number;
  unlocked: boolean;
}

interface NewlyUnlockedMilestone {
  id: string;
  title: string;
  description: string;
}

interface MilestoneProgress {
  current: number;
  target: number;
}

interface MilestoneDefinition {
  id: string;
  titleKey: string;
  descriptionKey: string;
  targetKey: string;
  compute: (state: MilestoneState) => MilestoneProgress;
}

export interface MilestoneMeta {
  viaNlp?: boolean;
  event?: OFCEvent;
}

export interface MilestoneRecordOptions {
  trackMilestone?: boolean;
  silent?: boolean;
  force?: boolean;
  milestoneMeta?: MilestoneMeta;
}

interface MilestoneState {
  counters: Record<string, number>;
  unlockedAt: Record<string, number>;
}

const REMOTE_PROVIDER_TYPES: ProviderType[] = ['ical', 'caldav', 'google', 'outlook'];
const LOCAL_TRACKED_PROVIDER_TYPES: ProviderType[] = [
  'local',
  'dailynote',
  'tasks',
  'tasknotes',
  'bases'
];
const ALL_PROVIDER_TYPES: ProviderType[] = [
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

function ensureMilestonesState(): MilestoneState {
  const settings = PluginState.getSettings();
  if (!settings.milestones) {
    settings.milestones = { counters: {}, unlockedAt: {} };
  }

  settings.milestones.counters ||= {};
  settings.milestones.unlockedAt ||= {};

  return settings.milestones;
}

function counterFor(action: MilestoneAction, scope: 'total' | ProviderType): string {
  return `${action}.${scope}`;
}

function getCounter(state: MilestoneState, key: string): number {
  return state.counters[key] ?? 0;
}

function getActionCounter(
  state: MilestoneState,
  action: MilestoneAction,
  scope: 'total' | ProviderType
): number {
  return getCounter(state, counterFor(action, scope));
}

function setCounter(state: MilestoneState, key: string, value: number): void {
  state.counters[key] = value;
}

function incrementCounter(state: MilestoneState, key: string, amount = 1): number {
  const next = (state.counters[key] ?? 0) + amount;
  state.counters[key] = next;
  return next;
}

function currentDayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function dayKeyToUtcMs(dayKey: string): number {
  const [y, m, d] = dayKey.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function dayCountFromMs(a: number, b: number): number {
  return Math.floor(Math.abs(b - a) / 86400000);
}

function extractDayCounts(state: MilestoneState, prefix: string): Map<string, number> {
  const out = new Map<string, number>();
  const start = `${prefix}.`;
  for (const [key, value] of Object.entries(state.counters)) {
    if (!key.startsWith(start)) continue;
    const dayKey = key.slice(start.length);
    out.set(dayKey, value);
  }
  return out;
}

function computeActionStreakDays(state: MilestoneState): number {
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

function computeDedicatedDays(state: MilestoneState): number {
  const first = getCounter(state, 'meta.firstActionAt');
  const last = getCounter(state, 'meta.lastActionAt');
  if (!first || !last || last < first) return 0;
  return dayCountFromMs(first, last);
}

function computeTotalOps(state: MilestoneState): number {
  return (
    getActionCounter(state, 'created', 'total') +
    getActionCounter(state, 'deleted', 'total') +
    getActionCounter(state, 'updated', 'total') +
    getActionCounter(state, 'moved', 'total')
  );
}

function computeRemoteActiveCount(): number {
  const sources = PluginState.getSettings().calendarSources;
  return sources.filter(source => REMOTE_PROVIDER_TYPES.includes(source.type as ProviderType))
    .length;
}

function computeDistinctTimezones(state: MilestoneState): number {
  let count = 0;
  for (const key of Object.keys(state.counters)) {
    if (key.startsWith('tz.')) count += 1;
  }
  return count;
}

function getSumByProviders(
  state: MilestoneState,
  action: MilestoneAction,
  providers: ProviderType[]
): number {
  return providers.reduce((sum, provider) => sum + getActionCounter(state, action, provider), 0);
}

function countProvidersAtOrAbove(
  state: MilestoneState,
  action: MilestoneAction,
  threshold: number
): number {
  return ALL_PROVIDER_TYPES.filter(
    provider => getActionCounter(state, action, provider) >= threshold
  ).length;
}

function isRecurringSeries(event: OFCEvent | undefined): boolean {
  if (!event) return false;
  return event.type === 'recurring' || event.type === 'rrule';
}

function resolveTimezone(event: OFCEvent | undefined): string | null {
  if (!event || event.allDay) return null;
  if (event.timezone && event.timezone.trim().length > 0) return event.timezone.trim();
  const displayTimezone = PluginState.getSettings().displayTimezone;
  if (displayTimezone && displayTimezone.trim().length > 0) return displayTimezone.trim();
  return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
}

function computePerfectWeekProgress(state: MilestoneState): MilestoneProgress {
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

function computeLocalLiveEventCount(): number {
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

const MILESTONE_DEFINITIONS: MilestoneDefinition[] = [
  {
    id: 'created.total.100',
    titleKey: 'settings.appearance.milestones.definitions.createdCentury.title',
    descriptionKey: 'settings.appearance.milestones.definitions.createdCentury.description',
    targetKey: 'settings.appearance.milestones.definitions.createdCentury.target',
    compute: state => ({ current: getActionCounter(state, 'created', 'total'), target: 100 })
  },
  {
    id: 'created.total.500',
    titleKey: 'settings.appearance.milestones.definitions.createdMaster.title',
    descriptionKey: 'settings.appearance.milestones.definitions.createdMaster.description',
    targetKey: 'settings.appearance.milestones.definitions.createdMaster.target',
    compute: state => ({ current: getActionCounter(state, 'created', 'total'), target: 500 })
  },
  {
    id: 'created.total.5000',
    titleKey: 'settings.appearance.milestones.definitions.createdLegend.title',
    descriptionKey: 'settings.appearance.milestones.definitions.createdLegend.description',
    targetKey: 'settings.appearance.milestones.definitions.createdLegend.target',
    compute: state => ({ current: getActionCounter(state, 'created', 'total'), target: 5000 })
  },
  {
    id: 'deleted.total.100',
    titleKey: 'settings.appearance.milestones.definitions.deletedCentury.title',
    descriptionKey: 'settings.appearance.milestones.definitions.deletedCentury.description',
    targetKey: 'settings.appearance.milestones.definitions.deletedCentury.target',
    compute: state => ({ current: getActionCounter(state, 'deleted', 'total'), target: 100 })
  },
  {
    id: 'deleted.total.500',
    titleKey: 'settings.appearance.milestones.definitions.deletedMaster.title',
    descriptionKey: 'settings.appearance.milestones.definitions.deletedMaster.description',
    targetKey: 'settings.appearance.milestones.definitions.deletedMaster.target',
    compute: state => ({ current: getActionCounter(state, 'deleted', 'total'), target: 500 })
  },
  {
    id: 'updated.total.500',
    titleKey: 'settings.appearance.milestones.definitions.updatedMaster.title',
    descriptionKey: 'settings.appearance.milestones.definitions.updatedMaster.description',
    targetKey: 'settings.appearance.milestones.definitions.updatedMaster.target',
    compute: state => ({ current: getActionCounter(state, 'updated', 'total'), target: 500 })
  },
  {
    id: 'updated.total.5000',
    titleKey: 'settings.appearance.milestones.definitions.updatedLegend.title',
    descriptionKey: 'settings.appearance.milestones.definitions.updatedLegend.description',
    targetKey: 'settings.appearance.milestones.definitions.updatedLegend.target',
    compute: state => ({ current: getActionCounter(state, 'updated', 'total'), target: 5000 })
  },
  {
    id: 'moved.total.500',
    titleKey: 'settings.appearance.milestones.definitions.movedMaster.title',
    descriptionKey: 'settings.appearance.milestones.definitions.movedMaster.description',
    targetKey: 'settings.appearance.milestones.definitions.movedMaster.target',
    compute: state => ({ current: getActionCounter(state, 'moved', 'total'), target: 500 })
  },
  {
    id: 'created.remote.500',
    titleKey: 'settings.appearance.milestones.definitions.remoteArchitect.title',
    descriptionKey: 'settings.appearance.milestones.definitions.remoteArchitect.description',
    targetKey: 'settings.appearance.milestones.definitions.remoteArchitect.target',
    compute: state => ({
      current: getSumByProviders(state, 'created', REMOTE_PROVIDER_TYPES),
      target: 500
    })
  },
  {
    id: 'created.tasks.1000',
    titleKey: 'settings.appearance.milestones.definitions.taskOrchestrator.title',
    descriptionKey: 'settings.appearance.milestones.definitions.taskOrchestrator.description',
    targetKey: 'settings.appearance.milestones.definitions.taskOrchestrator.target',
    compute: state => ({
      current: getSumByProviders(state, 'created', ['tasks', 'tasknotes']),
      target: 1000
    })
  },
  {
    id: 'created.providers.3x500',
    titleKey: 'settings.appearance.milestones.definitions.polyglotBuilder.title',
    descriptionKey: 'settings.appearance.milestones.definitions.polyglotBuilder.description',
    targetKey: 'settings.appearance.milestones.definitions.polyglotBuilder.target',
    compute: state => ({
      current: countProvidersAtOrAbove(state, 'created', 500),
      target: 3
    })
  },
  {
    id: 'cycle.500x500',
    titleKey: 'settings.appearance.milestones.definitions.cycleMaster.title',
    descriptionKey: 'settings.appearance.milestones.definitions.cycleMaster.description',
    targetKey: 'settings.appearance.milestones.definitions.cycleMaster.target',
    compute: state => ({
      current: Math.min(
        getActionCounter(state, 'created', 'total'),
        getActionCounter(state, 'deleted', 'total')
      ),
      target: 500
    })
  },
  {
    id: 'totalOps.10000',
    titleKey: 'settings.appearance.milestones.definitions.opsLegend.title',
    descriptionKey: 'settings.appearance.milestones.definitions.opsLegend.description',
    targetKey: 'settings.appearance.milestones.definitions.opsLegend.target',
    compute: state => ({ current: computeTotalOps(state), target: 10000 })
  },
  {
    id: 'habitualPlanner.20',
    titleKey: 'settings.appearance.milestones.definitions.habitualPlanner.title',
    descriptionKey: 'settings.appearance.milestones.definitions.habitualPlanner.description',
    targetKey: 'settings.appearance.milestones.definitions.habitualPlanner.target',
    compute: state => ({ current: computeActionStreakDays(state), target: 20 })
  },
  {
    id: 'dedicated.90days',
    titleKey: 'settings.appearance.milestones.definitions.dedicated.title',
    descriptionKey: 'settings.appearance.milestones.definitions.dedicated.description',
    targetKey: 'settings.appearance.milestones.definitions.dedicated.target',
    compute: state => ({ current: computeDedicatedDays(state), target: 90 })
  },
  {
    id: 'marathoner.100000',
    titleKey: 'settings.appearance.milestones.definitions.marathoner.title',
    descriptionKey: 'settings.appearance.milestones.definitions.marathoner.description',
    targetKey: 'settings.appearance.milestones.definitions.marathoner.target',
    compute: state => ({ current: computeTotalOps(state), target: 100000 })
  },
  {
    id: 'nlpSavant.1000',
    titleKey: 'settings.appearance.milestones.definitions.nlpSavant.title',
    descriptionKey: 'settings.appearance.milestones.definitions.nlpSavant.description',
    targetKey: 'settings.appearance.milestones.definitions.nlpSavant.target',
    compute: state => ({ current: getCounter(state, 'meta.createdViaNlp'), target: 1000 })
  },
  {
    id: 'globalCitizen.3',
    titleKey: 'settings.appearance.milestones.definitions.globalCitizen.title',
    descriptionKey: 'settings.appearance.milestones.definitions.globalCitizen.description',
    targetKey: 'settings.appearance.milestones.definitions.globalCitizen.target',
    compute: state => ({ current: computeDistinctTimezones(state), target: 3 })
  },
  {
    id: 'syncSpecialist.5',
    titleKey: 'settings.appearance.milestones.definitions.syncSpecialist.title',
    descriptionKey: 'settings.appearance.milestones.definitions.syncSpecialist.description',
    targetKey: 'settings.appearance.milestones.definitions.syncSpecialist.target',
    compute: _state => ({ current: computeRemoteActiveCount(), target: 5 })
  },
  {
    id: 'recurringMaster.30',
    titleKey: 'settings.appearance.milestones.definitions.recurringMaster.title',
    descriptionKey: 'settings.appearance.milestones.definitions.recurringMaster.description',
    targetKey: 'settings.appearance.milestones.definitions.recurringMaster.target',
    compute: state => ({ current: getCounter(state, 'meta.recurringSeriesCreated'), target: 30 })
  },
  {
    id: 'greatMigration.200',
    titleKey: 'settings.appearance.milestones.definitions.greatMigration.title',
    descriptionKey: 'settings.appearance.milestones.definitions.greatMigration.description',
    targetKey: 'settings.appearance.milestones.definitions.greatMigration.target',
    compute: state => ({ current: getActionCounter(state, 'moved', 'total'), target: 200 })
  },
  {
    id: 'perfectionist.week',
    titleKey: 'settings.appearance.milestones.definitions.perfectionist.title',
    descriptionKey: 'settings.appearance.milestones.definitions.perfectionist.description',
    targetKey: 'settings.appearance.milestones.definitions.perfectionist.target',
    compute: state => computePerfectWeekProgress(state)
  },
  {
    id: 'digitalLibrarian.10000',
    titleKey: 'settings.appearance.milestones.definitions.digitalLibrarian.title',
    descriptionKey: 'settings.appearance.milestones.definitions.digitalLibrarian.description',
    targetKey: 'settings.appearance.milestones.definitions.digitalLibrarian.target',
    compute: _state => ({ current: computeLocalLiveEventCount(), target: 10000 })
  },
  {
    id: 'nightOwl',
    titleKey: 'settings.appearance.milestones.definitions.nightOwl.title',
    descriptionKey: 'settings.appearance.milestones.definitions.nightOwl.description',
    targetKey: 'settings.appearance.milestones.definitions.nightOwl.target',
    compute: state => ({ current: getCounter(state, 'meta.nightOwlOps'), target: 15 })
  },
  {
    id: 'earlyBird',
    titleKey: 'settings.appearance.milestones.definitions.earlyBird.title',
    descriptionKey: 'settings.appearance.milestones.definitions.earlyBird.description',
    targetKey: 'settings.appearance.milestones.definitions.earlyBird.target',
    compute: state => ({ current: getCounter(state, 'meta.earlyBirdOps'), target: 15 })
  },
  {
    id: 'weekendWarrior',
    titleKey: 'settings.appearance.milestones.definitions.weekendWarrior.title',
    descriptionKey: 'settings.appearance.milestones.definitions.weekendWarrior.description',
    targetKey: 'settings.appearance.milestones.definitions.weekendWarrior.target',
    compute: state => ({ current: getCounter(state, 'meta.weekendWarriorOps'), target: 40 })
  },
  {
    id: 'timezoneNomad',
    titleKey: 'settings.appearance.milestones.definitions.timezoneNomad.title',
    descriptionKey: 'settings.appearance.milestones.definitions.timezoneNomad.description',
    targetKey: 'settings.appearance.milestones.definitions.timezoneNomad.target',
    compute: state => ({ current: computeDistinctTimezones(state), target: 5 })
  },
  {
    id: 'superOrganizer',
    titleKey: 'settings.appearance.milestones.definitions.superOrganizer.title',
    descriptionKey: 'settings.appearance.milestones.definitions.superOrganizer.description',
    targetKey: 'settings.appearance.milestones.definitions.superOrganizer.target',
    compute: _state => {
      const workspaces = PluginState.getSettings().workspaces ?? [];
      return { current: workspaces.length, target: 5 };
    }
  },
  {
    id: 'nlpWhisperer',
    titleKey: 'settings.appearance.milestones.definitions.nlpWhisperer.title',
    descriptionKey: 'settings.appearance.milestones.definitions.nlpWhisperer.description',
    targetKey: 'settings.appearance.milestones.definitions.nlpWhisperer.target',
    compute: state => ({ current: getCounter(state, 'meta.createdViaNlp'), target: 50 })
  },
  {
    id: 'powerPlanner',
    titleKey: 'settings.appearance.milestones.definitions.powerPlanner.title',
    descriptionKey: 'settings.appearance.milestones.definitions.powerPlanner.description',
    targetKey: 'settings.appearance.milestones.definitions.powerPlanner.target',
    compute: _state => {
      const sources = PluginState.getSettings().calendarSources ?? [];
      const distinctTypes = new Set(sources.map(s => s.type));
      return { current: distinctTypes.size, target: 3 };
    }
  },
  {
    id: 'devMilestone',
    titleKey: 'settings.appearance.milestones.definitions.devMilestone.title',
    descriptionKey: 'settings.appearance.milestones.definitions.devMilestone.description',
    targetKey: 'settings.appearance.milestones.definitions.devMilestone.target',
    compute: state => ({
      current: state.unlockedAt['devMilestone'] ? 1 : 0,
      target: 1
    })
  }
];

function queueMilestoneToast(milestone: NewlyUnlockedMilestone, index: number): void {
  const delay = index * 220;
  window.setTimeout(() => {
    if (typeof activeDocument === 'undefined') return;

    const existingRoot = activeDocument.getElementById('ofc-milestone-toast-root');
    const root = existingRoot ?? activeDocument.createDiv();
    if (!existingRoot) {
      root.id = 'ofc-milestone-toast-root';
      activeDocument.body.appendChild(root);
    }

    const toast = activeDocument.createDiv();
    toast.className = 'ofc-milestone-toast';

    const titleEl = activeDocument.createDiv();
    titleEl.className = 'ofc-milestone-toast-title';
    titleEl.textContent = t('notices.milestones.unlockedTitle');

    const bodyEl = activeDocument.createDiv();
    bodyEl.className = 'ofc-milestone-toast-body';
    bodyEl.textContent = t('notices.milestones.unlockedBody', {
      title: milestone.title,
      description: milestone.description
    });

    toast.appendChild(titleEl);
    toast.appendChild(bodyEl);
    root.appendChild(toast);

    window.setTimeout(() => {
      toast.classList.add('ofc-milestone-toast-hide');
      window.setTimeout(() => {
        toast.remove();
        if (!root.hasChildNodes()) root.remove();
      }, 280);
    }, 5200);
  }, delay);
}

function updateLifetimeMeta(state: MilestoneState): void {
  const now = Date.now();
  if (!getCounter(state, 'meta.firstActionAt')) {
    setCounter(state, 'meta.firstActionAt', now);
  }
  setCounter(state, 'meta.lastActionAt', now);
}

function updateDayCounters(state: MilestoneState, action: MilestoneAction): void {
  const dayKey = currentDayKey();
  incrementCounter(state, `day.action.${dayKey}`);
  if (action === 'created') {
    incrementCounter(state, `day.created.${dayKey}`);
  }

  const hour = new Date().getHours();
  if (hour >= 22 || hour < 4) {
    incrementCounter(state, 'meta.nightOwlOps');
  }

  if (hour >= 5 && hour < 8) {
    incrementCounter(state, 'meta.earlyBirdOps');
  }

  const dayOfWeek = new Date().getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    incrementCounter(state, 'meta.weekendWarriorOps');
  }
}

function updateCreateMeta(state: MilestoneState, options?: MilestoneRecordOptions): void {
  const event = options?.milestoneMeta?.event;

  if (options?.milestoneMeta?.viaNlp) {
    incrementCounter(state, 'meta.createdViaNlp');
  }

  if (isRecurringSeries(event)) {
    incrementCounter(state, 'meta.recurringSeriesCreated');
  }

  const tz = resolveTimezone(event);
  if (tz) {
    setCounter(state, `tz.${tz}`, 1);
  }
}

function evaluateUnlocks(state: MilestoneState): NewlyUnlockedMilestone[] {
  const unlocked: NewlyUnlockedMilestone[] = [];

  for (const definition of MILESTONE_DEFINITIONS) {
    if (state.unlockedAt[definition.id]) continue;
    const progress = definition.compute(state);
    if (progress.current < progress.target) continue;

    state.unlockedAt[definition.id] = Date.now();
    unlocked.push({
      id: definition.id,
      title: t(definition.titleKey),
      description: t(definition.descriptionKey)
    });
  }

  return unlocked;
}

export async function recordMilestoneAction(
  action: MilestoneAction,
  calendarId: string,
  options?: MilestoneRecordOptions
): Promise<void> {
  const shouldTrack =
    options?.trackMilestone ?? (!(options?.silent ?? false) && !(options?.force ?? false));
  if (!shouldTrack) return;

  try {
    const state = ensureMilestonesState();
    const providerType = PluginState.getProviderRegistry().getSource(calendarId)?.type;

    incrementCounter(state, counterFor(action, 'total'));
    if (providerType && providerType !== 'FOR_TEST_ONLY') {
      incrementCounter(state, counterFor(action, providerType));
    }

    updateLifetimeMeta(state);
    updateDayCounters(state, action);

    if (action === 'created') {
      updateCreateMeta(state, options);
    }

    const unlocked = evaluateUnlocks(state);
    await PluginState.persistData();
    unlocked.forEach((milestone, index) => queueMilestoneToast(milestone, index));
  } catch (error) {
    console.warn('Full Calendar: milestone tracking failed.', error);
  }
}

export function getMilestoneCards(): MilestoneCard[] {
  const state = ensureMilestonesState();
  const cards: MilestoneCard[] = [];

  for (const definition of MILESTONE_DEFINITIONS) {
    const progress = definition.compute(state);
    const unlocked =
      Boolean(state.unlockedAt[definition.id]) || progress.current >= progress.target;
    const normalized = Math.min(progress.current, progress.target);
    const percent = Math.max(0, Math.min(100, (normalized / progress.target) * 100));

    cards.push({
      id: definition.id,
      title: t(definition.titleKey),
      description: t(definition.descriptionKey),
      targetLabel: t(definition.targetKey),
      current: progress.current,
      percent,
      unlocked
    });
  }

  cards.sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    return a.title.localeCompare(b.title);
  });

  return cards;
}

export async function triggerDevMilestoneIfActive(): Promise<void> {
  try {
    const settings = PluginState.getSettings();
    if (settings.dev === 1 || settings.dev === '1') {
      const state = ensureMilestonesState();
      if (!state.unlockedAt['devMilestone']) {
        state.unlockedAt['devMilestone'] = Date.now();
        await PluginState.persistData();
        const definition = MILESTONE_DEFINITIONS.find(d => d.id === 'devMilestone');
        if (definition) {
          queueMilestoneToast(
            {
              id: 'devMilestone',
              title: t(definition.titleKey),
              description: t(definition.descriptionKey)
            },
            0
          );
        }
      }
    }
  } catch (error) {
    console.warn('Full Calendar: failed to trigger developer milestone.', error);
  }
}
