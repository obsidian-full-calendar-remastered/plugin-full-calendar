import { CalendarInfo } from '../../types/calendar_settings';
import { OFCEvent } from '../../types/schema';

export type MilestoneAction = 'created' | 'deleted' | 'updated' | 'moved';
export type ProviderType = Exclude<CalendarInfo['type'], 'FOR_TEST_ONLY'>;

export interface MilestoneCard {
  id: string;
  title: string;
  description: string;
  targetLabel: string;
  current: number;
  percent: number;
  unlocked: boolean;
}

export interface NewlyUnlockedMilestone {
  id: string;
  title: string;
  description: string;
}

export interface MilestoneProgress {
  current: number;
  target: number;
}

export interface MilestoneState {
  counters: Record<string, number>;
  unlockedAt: Record<string, number>;
  shown: Record<string, number>;
}

export interface MilestoneDefinition {
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
