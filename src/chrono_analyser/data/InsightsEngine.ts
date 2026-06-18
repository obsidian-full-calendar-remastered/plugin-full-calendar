// src/chrono_analyser/data/InsightsEngine.ts

import { TimeRecord } from './types';
import { InsightsConfig } from '../ui/ui';
import { FilterPayload } from '../ui/UIService';

const BATCH_SIZE = 500;

// --- NEW: Structured data type for rich text ---
interface TextFragment {
  text: string;
  bold: boolean;
}

export interface InsightPayloadItem {
  project: string;
  detailsFragments: TextFragment[]; // MODIFIED: from details: string
  action: FilterPayload | null;
  subItems?: InsightPayloadItem[]; // For nested breakdowns
}

export interface Insight {
  displayTextFragments: TextFragment[]; // MODIFIED: from displayText: string
  category: string;
  sentiment: 'neutral' | 'positive' | 'warning';
  payload?: InsightPayloadItem[] | null;
  action: FilterPayload | null;
}

export class InsightsEngine {
  constructor() {}

  public async generateInsights(
    allRecords: TimeRecord[],
    config: InsightsConfig
  ): Promise<Insight[]> {
    const taggedRecords = await this._tagRecordsInBatches(allRecords, config);
    const insights: Insight[] = [];

    // --- 1. ALWAYS RUN GLOBAL INSIGHTS ---
    // These run on ALL data, regardless of personas.

    const globalSnapshot = this._createHierarchyExtremesInsight(allRecords);
    if (globalSnapshot) {
      globalSnapshot.category = '🌐 GLOBAL SNAPSHOT';
      insights.push(globalSnapshot);
    }

    const activityOverview = this._calculateGroupDistribution(taggedRecords);
    if (activityOverview) {
      insights.push(activityOverview);
    }

    // --- 2. RUN NEW PERSONA-BASED INSIGHTS ---
    const groupPersonas = new Map<string, string>();
    if (config && config.insightGroups) {
      for (const groupName in config.insightGroups) {
        groupPersonas.set(groupName, config.insightGroups[groupName].persona);
      }
    }

    // --- FIXED LOGIC: allow records to contribute to both personas ---
    const productivityRecords: TimeRecord[] = [];
    const wellnessRecords: TimeRecord[] = [];
    let totalProductivityHours = 0;
    // let totalWellnessHours = 0;

    for (const record of taggedRecords) {
      const tags = record._semanticTags || [];
      const duration = record.duration;
      if (tags.some((tag: string) => groupPersonas.get(tag) === 'productivity')) {
        productivityRecords.push(record);
        totalProductivityHours += duration;
      }
      if (tags.some((tag: string) => groupPersonas.get(tag) === 'wellness')) {
        wellnessRecords.push(record);
        // totalWellnessHours += duration;
      }
    }

    if (productivityRecords.length > 0) {
      insights.push(...this._generateProductivityInsights(productivityRecords));
    }
    if (wellnessRecords.length > 0) {
      // Pass correct productivity total for balance calculation
      insights.push(...this._generateWellnessInsights(wellnessRecords, totalProductivityHours));
    }

    // --- 3. Final Check ---
    if (insights.length === 0) {
      return [
        {
          displayTextFragments: [
            // MODIFIED
            {
              text: 'No insights found. Log more activities or configure your Insight Groups with Personas to unlock powerful analytics.',
              bold: false
            }
          ],
          category: 'Getting Started',
          sentiment: 'neutral',
          payload: null,
          action: null
        }
      ];
    }

    return insights;
  }

  // --- REPLACED: _formatText is now _buildTextFragments and returns structured data ---
  private _buildTextFragments(text: string): TextFragment[] {
    const fragments: TextFragment[] = [];
    // Regex to find content inside **'...'**
    const regex = /\*\*'(.+?)'\*\*/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Add the text before the match (if any)
      if (match.index > lastIndex) {
        fragments.push({ text: text.substring(lastIndex, match.index), bold: false });
      }
      // Add the bolded text (the content of the capture group)
      fragments.push({ text: match[1], bold: true });
      lastIndex = regex.lastIndex;
    }

    // Add any remaining text after the last match
    if (lastIndex < text.length) {
      fragments.push({ text: text.substring(lastIndex), bold: false });
    }

    return fragments;
  }

  private async _tagRecordsInBatches(
    records: TimeRecord[],
    config: InsightsConfig
  ): Promise<TimeRecord[]> {
    let taggedRecords: TimeRecord[] = [];
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const processedBatch = batch.map(record => this._tagRecord(record, config));
      taggedRecords = taggedRecords.concat(processedBatch);
      await new Promise(resolve => window.setTimeout(resolve, 0));
    }
    return taggedRecords;
  }

  private _tagRecord(record: TimeRecord, config: InsightsConfig): TimeRecord {
    const tags = new Set<string>();
    let isMuted = false;
    const subprojectLower = record.subproject.toLowerCase();

    for (const groupName in config.insightGroups) {
      const group = config.insightGroups[groupName];
      if (!group || !group.rules) continue;

      const rules = group.rules;

      const isIncluded =
        rules.hierarchies.some(h => h.toLowerCase() === record.hierarchy.toLowerCase()) ||
        rules.projects.some(p => p.toLowerCase() === record.project.toLowerCase()) ||
        rules.subprojectKeywords.some(kw => kw && subprojectLower.includes(kw.toLowerCase()));

      if (isIncluded) {
        tags.add(groupName);

        // Muting logic
        const isMutedForGroup =
          (rules.mutedProjects || []).includes(record.project) ||
          (rules.mutedSubprojectKeywords || []).some(
            kw => kw && subprojectLower.includes(kw.toLowerCase())
          );
        if (isMutedForGroup) {
          isMuted = true;
        }
      }
    }
    record._semanticTags = Array.from(tags);
    record._isMuted = isMuted;
    return record;
  }

  // --- RESTORE THE DELETED FUNCTIONS ---

  private _createHierarchyExtremesInsight(allRecords: TimeRecord[]): Insight | null {
    // Set all boundaries to midnight (local time)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    const thirtySevenDaysAgo = new Date(sevenDaysAgo);
    thirtySevenDaysAgo.setDate(sevenDaysAgo.getDate() - 30);

    const weeklyDistribution = new Map<string, number>();
    const monthlyDistribution = new Map<string, number>();
    let weeklyTotalHours = 0;
    let monthlyTotalHours = 0;

    // For nested breakdowns
    const projectDistribution = new Map<string, Map<string, number>>();

    for (const record of allRecords) {
      if (!record.date) continue;
      const recordDay = new Date(record.date);
      recordDay.setHours(0, 0, 0, 0);

      if (recordDay >= sevenDaysAgo && recordDay <= today) {
        weeklyTotalHours += record.duration;
        weeklyDistribution.set(
          record.hierarchy,
          (weeklyDistribution.get(record.hierarchy) || 0) + record.duration
        );

        if (!projectDistribution.has(record.hierarchy)) {
          projectDistribution.set(record.hierarchy, new Map());
        }
        const projectsInHierarchy = projectDistribution.get(record.hierarchy);
        if (!projectsInHierarchy) {
          continue;
        }
        projectsInHierarchy.set(
          record.project,
          (projectsInHierarchy.get(record.project) || 0) + record.duration
        );
      } else if (recordDay >= thirtySevenDaysAgo && recordDay < sevenDaysAgo) {
        monthlyTotalHours += record.duration;
        monthlyDistribution.set(
          record.hierarchy,
          (monthlyDistribution.get(record.hierarchy) || 0) + record.duration
        );
      }
    }

    if (weeklyDistribution.size < 2 || weeklyTotalHours === 0) return null;

    const sortedHierarchies = Array.from(weeklyDistribution.entries())
      .map(([name, hours]) => ({ name, hours }))
      .sort((a, b) => a.hours - b.hours);
    const least = sortedHierarchies[0];
    const most = sortedHierarchies[sortedHierarchies.length - 1];

    if (least.name === most.name || most.hours === 0) return null;

    const mostPercentage = (most.hours / weeklyTotalHours) * 100;
    const leastPercentage = (least.hours / weeklyTotalHours) * 100;

    let displayText = `Last week, your main focus was **'${most.name}'** for **'${mostPercentage.toFixed(0)}%'**, while **'${least.name}'** for **'${leastPercentage.toFixed(0)}%'** took a backseat.`; // MODIFIED

    if (monthlyTotalHours > 0) {
      const mostHoursLastMonth = monthlyDistribution.get(most.name) || 0;
      const leastHoursLastMonth = monthlyDistribution.get(least.name) || 0;
      if (mostHoursLastMonth > 0 || leastHoursLastMonth > 0) {
        const mostPercentageLastMonth = (mostHoursLastMonth / monthlyTotalHours) * 100;
        const leastPercentageLastMonth = (leastHoursLastMonth / monthlyTotalHours) * 100;
        const comparisonText = ` This compares to last month's **'${mostPercentageLastMonth.toFixed(0)}%'** on **'${most.name}'** and **'${leastPercentageLastMonth.toFixed(0)}%'** on **'${least.name}'**.`; // MODIFIED
        displayText += comparisonText;
      }
    }

    const createProjectSubItems = (hierarchyName: string): InsightPayloadItem[] => {
      const projects = projectDistribution.get(hierarchyName);
      if (!projects) return [];
      return Array.from(projects.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([projectName, projectHours]) => ({
          project: `• ${projectName}`,
          detailsFragments: this._buildTextFragments(`${projectHours.toFixed(1)} hours`), // MODIFIED
          action: {
            analysisTypeSelect: 'time-series',
            projectFilterInput: projectName,
            dateRangePicker: [sevenDaysAgo, new Date()]
          }
        }));
    };

    const payload: InsightPayloadItem[] = [
      {
        project: most.name,
        detailsFragments: this._buildTextFragments(
          // MODIFIED
          `**'${mostPercentage.toFixed(0)}%'** (${most.hours.toFixed(1)} hours last week)`
        ),
        action: {
          analysisTypeSelect: 'pie',
          hierarchyFilterInput: most.name,
          dateRangePicker: [sevenDaysAgo, new Date()],
          levelSelect_pie: 'project'
        },
        subItems: createProjectSubItems(most.name)
      },
      {
        project: least.name,
        detailsFragments: this._buildTextFragments(
          // MODIFIED
          `**'${leastPercentage.toFixed(0)}%'** (${least.hours.toFixed(1)} hours last week)`
        ),
        action: {
          analysisTypeSelect: 'pie',
          hierarchyFilterInput: least.name,
          dateRangePicker: [sevenDaysAgo, new Date()],
          levelSelect_pie: 'project'
        },
        subItems: createProjectSubItems(least.name)
      }
    ];

    return {
      displayTextFragments: this._buildTextFragments(displayText), // MODIFIED
      category: 'WEEKLY SNAPSHOT',
      sentiment: 'neutral',
      payload: payload,
      action: null
    };
  }

  private _calculateGroupDistribution(taggedRecords: TimeRecord[]): Insight | null {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const distribution = new Map<string, number>();
    const projectsByGroup = new Map<string, Map<string, number>>();
    let trueGrandTotalHours = 0;

    for (const record of taggedRecords) {
      const recordDate = record.date;
      if (!recordDate) continue;
      const recordDay = new Date(recordDate);
      recordDay.setHours(0, 0, 0, 0);
      if (recordDay < thirtyDaysAgo) continue;

      trueGrandTotalHours += record.duration;
      const tags = record._semanticTags || [];
      for (const tag of tags) {
        // Add to total group distribution
        distribution.set(tag, (distribution.get(tag) || 0) + record.duration);

        // Add to project-level breakdown for that group
        if (!projectsByGroup.has(tag)) {
          projectsByGroup.set(tag, new Map());
        }
        const projectsInGroup = projectsByGroup.get(tag);
        if (!projectsInGroup) {
          continue;
        }
        projectsInGroup.set(
          record.project,
          (projectsInGroup.get(record.project) || 0) + record.duration
        );
      }
    }

    if (trueGrandTotalHours === 0) return null;

    const sortedGroups = Array.from(distribution.entries())
      .map(([groupName, hours]) => ({ groupName, hours }))
      .sort((a, b) => b.hours - a.hours);

    const topGroups = sortedGroups.slice(0, 3);
    if (topGroups.length === 0) return null;

    const topGroupNames = topGroups.map(g => `**'${g.groupName}'**`);
    let topGroupsText: string;
    if (topGroupNames.length === 1) {
      topGroupsText = topGroupNames[0];
    } else if (topGroupNames.length === 2) {
      topGroupsText = topGroupNames.join(' and ');
    } else {
      const lastGroupName = topGroupNames.slice(-1)[0] ?? '';
      topGroupsText = `${topGroupNames.slice(0, -1).join(', ')}, and ${lastGroupName}`;
    }

    const topGroupsTotalHours = topGroups.reduce((sum, g) => sum + g.hours, 0);
    const topGroupsPercentage = (topGroupsTotalHours / trueGrandTotalHours) * 100;

    const displayText = `Your top ${topGroups.length === 1 ? 'activity was' : 'activities were'} ${topGroupsText}, accounting for **'${topGroupsPercentage.toFixed(0)}%'** of your total logged time.`; // MODIFIED

    const payload: InsightPayloadItem[] = topGroups.map(group => {
      const percentage = (group.hours / trueGrandTotalHours) * 100;
      const projects = projectsByGroup.get(group.groupName);
      const subItems: InsightPayloadItem[] = [];

      if (projects) {
        Array.from(projects.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .forEach(([projectName, projectHours]) => {
            subItems.push({
              project: `• ${projectName}`,
              detailsFragments: this._buildTextFragments(`${projectHours.toFixed(1)} hours`), // MODIFIED
              action: {
                analysisTypeSelect: 'time-series',
                projectFilterInput: projectName,
                dateRangePicker: [thirtyDaysAgo, new Date()]
              }
            });
          });
      }

      return {
        project: group.groupName,
        detailsFragments: this._buildTextFragments(
          // MODIFIED
          `**'${percentage.toFixed(0)}%'** (${group.hours.toFixed(1)} hours)`
        ),
        action: {
          analysisTypeSelect: 'pie',
          hierarchyFilterInput: group.groupName,
          dateRangePicker: [thirtyDaysAgo, new Date()],
          levelSelect_pie: 'project'
        },
        subItems: subItems.length > 0 ? subItems : undefined
      };
    });

    return {
      displayTextFragments: this._buildTextFragments(displayText), // MODIFIED
      category: 'Activity Overview',
      sentiment: 'neutral',
      payload: payload,
      action: null
    };
  }

  private _generateProductivityInsights(records: TimeRecord[]): Insight[] {
    const insights: Insight[] = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastWeekStart = new Date(today);
    lastWeekStart.setDate(today.getDate() - 7);
    const prevWeekStart = new Date(lastWeekStart);
    prevWeekStart.setDate(lastWeekStart.getDate() - 7);

    // Data Aggregation for both new insights
    const lastWeekHoursByProject = new Map<string, number>();
    const prevWeekHoursByProject = new Map<string, number>();
    let lastWeekTotalHours = 0;

    for (const record of records) {
      if (!record.date) continue;
      const recordDay = new Date(record.date);
      recordDay.setHours(0, 0, 0, 0);

      if (recordDay >= lastWeekStart && recordDay <= today) {
        lastWeekHoursByProject.set(
          record.project,
          (lastWeekHoursByProject.get(record.project) || 0) + record.duration
        );
        lastWeekTotalHours += record.duration;
      } else if (recordDay >= prevWeekStart && recordDay < lastWeekStart) {
        prevWeekHoursByProject.set(
          record.project,
          (prevWeekHoursByProject.get(record.project) || 0) + record.duration
        );
      }
    }

    // Insight 1: Focus Score (HHI)
    if (lastWeekTotalHours > 0) {
      let hhi = 0;
      for (const hours of lastWeekHoursByProject.values()) {
        const share = hours / lastWeekTotalHours;
        hhi += share * share;
      }

      const focusText =
        hhi > 0.5
          ? 'highly focused'
          : hhi > 0.25
            ? 'focused'
            : hhi > 0.1
              ? 'balanced'
              : 'scattered';

      const topProjectArr = [...lastWeekHoursByProject.entries()].sort((a, b) => b[1] - a[1]);
      const topProjectName =
        topProjectArr.length > 0 ? `'${topProjectArr[0][0]}'` : 'various projects';

      insights.push({
        displayTextFragments: this._buildTextFragments(
          // MODIFIED
          `Your productive time was **'${focusText}'** this week, with a significant portion dedicated to **${topProjectName}**.`
        ),
        category: '🎯 PRODUCTIVITY',
        sentiment: hhi > 0.25 ? 'positive' : 'neutral',
        payload: null,
        action: null
      });
    }

    // Insight 2: Project Movers & Shakers
    const projectDeltas = new Map<string, number>();
    const allProjects = new Set([
      ...lastWeekHoursByProject.keys(),
      ...prevWeekHoursByProject.keys()
    ]);

    for (const project of allProjects) {
      const lastWeek = lastWeekHoursByProject.get(project) || 0;
      const prevWeek = prevWeekHoursByProject.get(project) || 0;
      projectDeltas.set(project, lastWeek - prevWeek);
    }

    const sortedDeltas = [...projectDeltas.entries()].sort(
      (a, b) => Math.abs(b[1]) - Math.abs(a[1])
    );
    const topMovers = sortedDeltas.slice(0, 2).filter(d => Math.abs(d[1]) > 1);

    if (topMovers.length > 0) {
      const moversPayload: InsightPayloadItem[] = topMovers.map(([project, delta]) => ({
        project: project,
        detailsFragments: this._buildTextFragments(
          // MODIFIED
          `**'${delta > 0 ? '+' : ''}${delta.toFixed(1)}'** hours vs last week`
        ),
        action: {
          analysisTypeSelect: 'time-series',
          projectFilterInput: project,
          dateRangePicker: [prevWeekStart, today]
        }
      }));

      insights.push({
        displayTextFragments: this._buildTextFragments(
          // MODIFIED
          `This week's biggest productivity movers were **'${topMovers.map(p => p[0]).join("'** and **'")}'**`
        ),
        category: '🎯 PRODUCTIVITY',
        sentiment: 'neutral',
        payload: moversPayload,
        action: null
      });
    }

    // Insight 3: Lapsed Projects (re-scoped)
    const lapsedHabitInsight = this._consolidateLapsedHabits(records);
    if (lapsedHabitInsight) {
      lapsedHabitInsight.category = '🎯 PRODUCTIVITY';
      lapsedHabitInsight.sentiment = 'warning';
      lapsedHabitInsight.displayTextFragments = this._buildTextFragments(
        // MODIFIED
        `You have **'${lapsedHabitInsight.payload?.length}'** at-risk initiatives that haven't been logged in over a week.`
      );
      insights.push(lapsedHabitInsight);
    }

    return insights;
  }

  // --- REPLACE the existing _generateWellnessInsights with this new, complete version ---
  private _generateWellnessInsights(
    records: TimeRecord[],
    totalProductiveHoursLast30Days: number
  ): Insight[] {
    if (records.length < 5) return [];
    const insights: Insight[] = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const last7DaysStart = new Date(today);
    last7DaysStart.setDate(today.getDate() - 7);
    const last30DaysStart = new Date(today);
    last30DaysStart.setDate(today.getDate() - 30);

    // Aggregate by hierarchy (e.g., "Sleep", "Exercise", "Cooking")
    const last7DaysByHierarchy = new Map<string, { duration: number; count: number }>();
    const last30DaysByHierarchy = new Map<string, { duration: number; count: number }>();
    // let totalWellnessHoursLast7Days = 0;
    let totalWellnessHoursLast30Days = 0;

    for (const record of records) {
      if (!record.date) continue;
      const recordDay = new Date(record.date);
      recordDay.setHours(0, 0, 0, 0);
      const key = record.hierarchy;

      const init = (map: Map<string, { duration: number; count: number }>, k: string) => {
        if (!map.has(k)) map.set(k, { duration: 0, count: 0 });
        const entry = map.get(k);
        if (!entry) {
          throw new Error(`Failed to initialize insight bucket for key "${k}".`);
        }
        return entry;
      };

      if (recordDay >= last7DaysStart) {
        const entry = init(last7DaysByHierarchy, key);
        entry.duration += record.duration;
        entry.count += 1;
        // totalWellnessHoursLast7Days += record.duration;
      }
      if (recordDay >= last30DaysStart) {
        const entry = init(last30DaysByHierarchy, key);
        entry.duration += record.duration;
        entry.count += 1;
        totalWellnessHoursLast30Days += record.duration;
      }
    }

    // --- Insight 1: Weekly Consistency Report ---
    const consistencyAlerts: InsightPayloadItem[] = [];
    for (const [key, weekData] of last7DaysByHierarchy.entries()) {
      const monthData = last30DaysByHierarchy.get(key);
      if (monthData && monthData.duration > 1 && monthData.count > 3) {
        const weekDailyAvg = weekData.duration / 7;
        const monthDailyAvg = monthData.duration / 30;
        if (weekDailyAvg < monthDailyAvg * 0.8) {
          consistencyAlerts.push({
            project: key,
            detailsFragments: this._buildTextFragments(
              `Time was **${((1 - weekDailyAvg / monthDailyAvg) * 100).toFixed(0)}% lower** than your 30-day average.`
            ), // MODIFIED
            action: null
          });
        }
      }
    }

    if (consistencyAlerts.length > 0) {
      insights.push({
        displayTextFragments: this._buildTextFragments(
          // MODIFIED
          `**Consistency Check:** Found deviations in ${consistencyAlerts.length} of your wellness routines this week.`
        ),
        category: '❤️ WELLNESS & ROUTINE',
        sentiment: 'warning',
        payload: consistencyAlerts,
        action: null
      });
    } else if (last7DaysByHierarchy.size > 0) {
      insights.push({
        displayTextFragments: [
          { text: 'Your wellness routines were consistent this week. Keep it up!', bold: false }
        ], // MODIFIED
        category: '❤️ WELLNESS & ROUTINE',
        sentiment: 'positive',
        payload: null,
        action: null
      });
    }

    // --- Insight 2: Long-Term Balance Trend ---
    // REMOVE: calculation of totalProductiveHoursLast30Days here
    // Use the value passed in from generateInsights

    if (totalWellnessHoursLast30Days > 0 && totalProductiveHoursLast30Days > 0) {
      const totalHours = totalWellnessHoursLast30Days + totalProductiveHoursLast30Days;
      const wellnessPercentage = (totalWellnessHoursLast30Days / totalHours) * 100;

      insights.push({
        displayTextFragments: this._buildTextFragments(
          // MODIFIED
          `This month, wellness and routine activities made up **'${wellnessPercentage.toFixed(0)}%'** of your tracked time.`
        ),
        category: '❤️ WELLNESS & ROUTINE',
        sentiment: 'neutral',
        payload: [
          {
            project: 'Wellness & Routine Hours',
            detailsFragments: this._buildTextFragments(
              `${totalWellnessHoursLast30Days.toFixed(1)} hours`
            ), // MODIFIED
            action: null
          },
          {
            project: 'Productivity Hours',
            detailsFragments: this._buildTextFragments(
              `${totalProductiveHoursLast30Days.toFixed(1)} hours`
            ), // MODIFIED
            action: null
          }
        ],
        action: null
      });
    }

    return insights;
  }

  private _consolidateLapsedHabits(taggedRecords: TimeRecord[]): Insight | null {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    const thirtySevenDaysAgo = new Date(sevenDaysAgo);
    thirtySevenDaysAgo.setDate(sevenDaysAgo.getDate() - 30);

    const recentProjects = new Set<string>();
    const baselineProjects = new Map<string, number>();

    for (const record of taggedRecords) {
      if (record._isMuted) {
        continue;
      }
      const recordDate = record.date;
      if (!recordDate) continue;
      const recordDay = new Date(recordDate);
      recordDay.setHours(0, 0, 0, 0);

      if (recordDay >= sevenDaysAgo) {
        recentProjects.add(record.project);
      } else if (recordDay >= thirtySevenDaysAgo) {
        baselineProjects.set(record.project, (baselineProjects.get(record.project) || 0) + 1);
      }
    }

    const lapsedHabitsPayload: InsightPayloadItem[] = [];
    for (const [project, count] of baselineProjects.entries()) {
      if (count >= 2 && !recentProjects.has(project)) {
        lapsedHabitsPayload.push({
          project,
          detailsFragments: this._buildTextFragments(
            `(logged **'${count}'** times in the month prior)`
          ), // MODIFIED
          action: {
            analysisTypeSelect: 'time-series',
            projectFilterInput: project,
            dateRangePicker: [thirtySevenDaysAgo, new Date()]
          }
        });
      }
    }

    if (lapsedHabitsPayload.length === 0) return null;

    lapsedHabitsPayload.sort((a, b) => {
      // Note: This sort is now less direct but still works by finding the bolded number.
      const countA = parseInt(a.detailsFragments.find(f => f.bold)?.text || '0', 10);
      const countB = parseInt(b.detailsFragments.find(f => f.bold)?.text || '0', 10);
      return countB - countA;
    });

    return {
      displayTextFragments: this._buildTextFragments(
        // MODIFIED
        `You have **'${lapsedHabitsPayload.length} activities'** that you haven't logged in over a week, but were previously consistent.`
      ),
      category: 'Habit Consistency',
      sentiment: 'warning',
      payload: lapsedHabitsPayload,
      action: null
    };
  }
}
