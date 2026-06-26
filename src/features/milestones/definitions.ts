import { MilestoneDefinition } from './types';
import {
  getActionCounter,
  getCounter,
  getSumByProviders,
  countProvidersAtOrAbove,
  computeTotalOps,
  computeActionStreakDays,
  computeDedicatedDays,
  computeDistinctTimezones,
  computeRemoteActiveCount,
  computePerfectWeekProgress,
  computeLocalLiveEventCount,
  getWorkspacesCount,
  getDistinctSourceTypesCount
} from './stats';

export const MILESTONE_DEFINITIONS: MilestoneDefinition[] = [
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
      current: getSumByProviders(state, 'created', ['ical', 'caldav', 'google', 'outlook']),
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
    compute: _state => ({ current: getWorkspacesCount(), target: 5 })
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
    compute: _state => ({ current: getDistinctSourceTypesCount(), target: 3 })
  },
  {
    id: 'nightOwl.100',
    titleKey: 'settings.appearance.milestones.definitions.nightOwl100.title',
    descriptionKey: 'settings.appearance.milestones.definitions.nightOwl100.description',
    targetKey: 'settings.appearance.milestones.definitions.nightOwl100.target',
    compute: state => ({ current: getCounter(state, 'meta.nightOwlOps'), target: 100 })
  },
  {
    id: 'earlyBird.100',
    titleKey: 'settings.appearance.milestones.definitions.earlyBird100.title',
    descriptionKey: 'settings.appearance.milestones.definitions.earlyBird100.description',
    targetKey: 'settings.appearance.milestones.definitions.earlyBird100.target',
    compute: state => ({ current: getCounter(state, 'meta.earlyBirdOps'), target: 100 })
  },
  {
    id: 'weekendWarrior.250',
    titleKey: 'settings.appearance.milestones.definitions.weekendWarrior250.title',
    descriptionKey: 'settings.appearance.milestones.definitions.weekendWarrior250.description',
    targetKey: 'settings.appearance.milestones.definitions.weekendWarrior250.target',
    compute: state => ({ current: getCounter(state, 'meta.weekendWarriorOps'), target: 250 })
  },
  {
    id: 'nlpWhisperer.200',
    titleKey: 'settings.appearance.milestones.definitions.nlpWhisperer200.title',
    descriptionKey: 'settings.appearance.milestones.definitions.nlpWhisperer200.description',
    targetKey: 'settings.appearance.milestones.definitions.nlpWhisperer200.target',
    compute: state => ({ current: getCounter(state, 'meta.createdViaNlp'), target: 200 })
  },
  {
    id: 'superOrganizer.10',
    titleKey: 'settings.appearance.milestones.definitions.superOrganizer10.title',
    descriptionKey: 'settings.appearance.milestones.definitions.superOrganizer10.description',
    targetKey: 'settings.appearance.milestones.definitions.superOrganizer10.target',
    compute: _state => ({ current: getWorkspacesCount(), target: 10 })
  },
  {
    id: 'syncSpecialist.8',
    titleKey: 'settings.appearance.milestones.definitions.syncSpecialist8.title',
    descriptionKey: 'settings.appearance.milestones.definitions.syncSpecialist8.description',
    targetKey: 'settings.appearance.milestones.definitions.syncSpecialist8.target',
    compute: _state => ({ current: computeRemoteActiveCount(), target: 8 })
  },
  {
    id: 'created.total.25000',
    titleKey: 'settings.appearance.milestones.definitions.createdTotal25000.title',
    descriptionKey: 'settings.appearance.milestones.definitions.createdTotal25000.description',
    targetKey: 'settings.appearance.milestones.definitions.createdTotal25000.target',
    compute: state => ({ current: getActionCounter(state, 'created', 'total'), target: 25000 })
  },
  {
    id: 'created.total.100000',
    titleKey: 'settings.appearance.milestones.definitions.createdTotal100000.title',
    descriptionKey: 'settings.appearance.milestones.definitions.createdTotal100000.description',
    targetKey: 'settings.appearance.milestones.definitions.createdTotal100000.target',
    compute: state => ({ current: getActionCounter(state, 'created', 'total'), target: 100000 })
  },
  {
    id: 'habitualPlanner.100',
    titleKey: 'settings.appearance.milestones.definitions.habitualPlanner100.title',
    descriptionKey: 'settings.appearance.milestones.definitions.habitualPlanner100.description',
    targetKey: 'settings.appearance.milestones.definitions.habitualPlanner100.target',
    compute: state => ({ current: computeActionStreakDays(state), target: 100 })
  },
  {
    id: 'dedicated.365days',
    titleKey: 'settings.appearance.milestones.definitions.dedicated365.title',
    descriptionKey: 'settings.appearance.milestones.definitions.dedicated365.description',
    targetKey: 'settings.appearance.milestones.definitions.dedicated365.target',
    compute: state => ({ current: computeDedicatedDays(state), target: 365 })
  },
  {
    id: 'totalOps.250000',
    titleKey: 'settings.appearance.milestones.definitions.totalOps250000.title',
    descriptionKey: 'settings.appearance.milestones.definitions.totalOps250000.description',
    targetKey: 'settings.appearance.milestones.definitions.totalOps250000.target',
    compute: state => ({ current: computeTotalOps(state), target: 250000 })
  },
  {
    id: 'totalOps.1000000',
    titleKey: 'settings.appearance.milestones.definitions.totalOps1000000.title',
    descriptionKey: 'settings.appearance.milestones.definitions.totalOps1000000.description',
    targetKey: 'settings.appearance.milestones.definitions.totalOps1000000.target',
    compute: state => ({ current: computeTotalOps(state), target: 1000000 })
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
