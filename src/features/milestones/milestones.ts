import { PluginState } from '../../core/PluginState';
import { t } from '../i18n/i18n';
import {
  MilestoneAction,
  MilestoneCard,
  NewlyUnlockedMilestone,
  MilestoneRecordOptions,
  MilestoneState
} from './types';
import { MILESTONE_DEFINITIONS } from './definitions';
import { queueMilestoneToast } from './toast';
import {
  counterFor,
  getCounter,
  getActionCounter,
  computeActionStreakDays,
  computeDistinctTimezones,
  currentDayKey,
  isRecurringSeries,
  resolveTimezone,
  ALL_PROVIDER_TYPES
} from './stats';

export type {
  MilestoneAction,
  MilestoneCard,
  NewlyUnlockedMilestone,
  MilestoneRecordOptions,
  MilestoneState
};

export function ensureMilestonesState(): MilestoneState {
  const settings = PluginState.getSettings();
  if (!settings.milestones) {
    settings.milestones = { counters: {}, unlockedAt: {}, shown: {} };
  }

  settings.milestones.counters ||= {};
  settings.milestones.unlockedAt ||= {};
  settings.milestones.shown ||= {};

  return settings.milestones;
}

function setCounter(state: MilestoneState, key: string, value: number): void {
  state.counters[key] = value;
}

function incrementCounter(state: MilestoneState, key: string, amount = 1): number {
  const next = (state.counters[key] ?? 0) + amount;
  state.counters[key] = next;
  return next;
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
    const toShow = unlocked.filter(milestone => state.shown[milestone.id] !== 1);
    for (const milestone of toShow) {
      state.shown[milestone.id] = 1;
    }
    await PluginState.persistData();
    toShow.forEach((milestone, index) => queueMilestoneToast(milestone, index));
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
      state.unlockedAt['devMilestone'] = Date.now();
      if (state.shown['devMilestone'] !== 1) {
        state.shown['devMilestone'] = 1;
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
        } else {
          console.warn('Full Calendar: definition for devMilestone not found!');
        }
      } else {
        await PluginState.persistData();
      }
    }
  } catch (error) {
    console.warn('Full Calendar: failed to trigger developer milestone.', error);
  }
}

export interface MonthlyActivitySummary {
  totalOps: number;
  createdCount: number;
}

export function getMonthlyActivitySummary(monthKey: string): MonthlyActivitySummary {
  const state = ensureMilestonesState();
  let totalOps = 0;
  let createdCount = 0;

  const actionPrefix = `day.action.${monthKey}-`;
  const createdPrefix = `day.created.${monthKey}-`;

  for (const [key, value] of Object.entries(state.counters)) {
    if (key.startsWith(actionPrefix)) {
      totalOps += value;
    } else if (key.startsWith(createdPrefix)) {
      createdCount += value;
    }
  }

  return { totalOps, createdCount };
}

export interface LifetimeMilestoneStats {
  operations: {
    created: number;
    updated: number;
    deleted: number;
    moved: number;
  };
  operationsByCalendarType: Record<
    string,
    {
      created: number;
      updated: number;
      deleted: number;
      moved: number;
    }
  >;
  meta: {
    bestStreak: number;
    createdViaNlp: number;
    recurringCreated: number;
    nightOwlOps: number;
    earlyBirdOps: number;
    weekendWarriorOps: number;
    distinctTimezones: number;
    workspacesCount: number;
  };
}

export function getLifetimeMilestoneStats(): LifetimeMilestoneStats {
  const state = ensureMilestonesState();
  const providers = ALL_PROVIDER_TYPES;

  const ops = {
    created: getActionCounter(state, 'created', 'total'),
    updated: getActionCounter(state, 'updated', 'total'),
    deleted: getActionCounter(state, 'deleted', 'total'),
    moved: getActionCounter(state, 'moved', 'total')
  };

  const opsByCalendarType: Record<
    string,
    {
      created: number;
      updated: number;
      deleted: number;
      moved: number;
    }
  > = {};

  for (const provider of providers) {
    opsByCalendarType[provider] = {
      created: getActionCounter(state, 'created', provider),
      updated: getActionCounter(state, 'updated', provider),
      deleted: getActionCounter(state, 'deleted', provider),
      moved: getActionCounter(state, 'moved', provider)
    };
  }

  const meta = {
    bestStreak: computeActionStreakDays(state),
    createdViaNlp: getCounter(state, 'meta.createdViaNlp'),
    recurringCreated: getCounter(state, 'meta.recurringSeriesCreated'),
    nightOwlOps: getCounter(state, 'meta.nightOwlOps'),
    earlyBirdOps: getCounter(state, 'meta.earlyBirdOps'),
    weekendWarriorOps: getCounter(state, 'meta.weekendWarriorOps'),
    distinctTimezones: computeDistinctTimezones(state),
    workspacesCount: PluginState.getSettings().workspaces?.length ?? 0
  };

  return {
    operations: ops,
    operationsByCalendarType: opsByCalendarType,
    meta
  };
}
