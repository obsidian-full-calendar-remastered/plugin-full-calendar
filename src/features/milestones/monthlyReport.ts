import { App, MarkdownView, TFile, normalizePath, requestUrl, Platform } from 'obsidian';
import { PluginState } from '../../core/PluginState';
import {
  getMonthlyActivitySummary,
  getLifetimeMilestoneStats,
  LifetimeMilestoneStats
} from './milestones';
import type FullCalendarPlugin from '../../main';
import baseTemplate from './assets/template.md';
import { FullCalendarSettings } from '../../types/settings';
import { CalendarInfo } from '../../types/calendar_settings';

const REMOTE_TEMPLATE_URL = 'https://fcr-cdn.plugin-fcr.workers.dev/assets/milestones/template.md';
const TEMP_FILE_NAME = 'Full Calendar - Monthly Milestones (Temp).md';

let trackedTempFilePath: string | null = null;

export function trackTemporaryReport(filePath: string) {
  trackedTempFilePath = filePath;
}

export function getTrackedReportPath(): string | null {
  return trackedTempFilePath;
}

export function untrackTemporaryReport() {
  trackedTempFilePath = null;
}

function getTemplateCachePath(app: App, pluginId: string): string {
  return normalizePath(`${app.vault.configDir}/plugins/${pluginId}/milestones/assets/template.md`);
}

/**
 * Downloads the milestone markdown template asset from the Cloudflare worker CDN and caches it.
 */
export async function downloadMilestoneTemplate(app: App, pluginId: string): Promise<string> {
  const cachePath = getTemplateCachePath(app, pluginId);
  const folderPath = normalizePath(`${app.vault.configDir}/plugins/${pluginId}/milestones/assets`);
  try {
    const response = await requestUrl(REMOTE_TEMPLATE_URL);
    const templateText = response.text;
    if (templateText && templateText.trim().length > 0) {
      if (!(await app.vault.adapter.exists(folderPath))) {
        await app.vault.adapter.mkdir(folderPath);
      }
      await app.vault.adapter.write(cachePath, templateText);
      return templateText;
    }
  } catch (error) {
    console.warn('[Full Calendar] Failed to download milestones template asset from CDN.', error);
  }
  return '';
}

/**
 * Returns the cached template or fetches it. Falls back to a simple, lightweight offline template on failure.
 */
export async function getMilestoneTemplate(app: App, pluginId: string): Promise<string> {
  const cachePath = getTemplateCachePath(app, pluginId);

  // Try reading from cache
  try {
    if (await app.vault.adapter.exists(cachePath)) {
      return await app.vault.adapter.read(cachePath);
    }
  } catch (error) {
    console.warn('[Full Calendar] Failed to read cached milestones template.', error);
  }

  // Try downloading from CDN
  // const downloaded = await downloadMilestoneTemplate(app, pluginId);
  // if (downloaded) {
  //   return downloaded;
  // }

  // Fallback to minimal, lightweight template to prevent source bloat
  return getFallbackTemplate();
}

/**
 * Builds a clean Markdown table summarizing calendar configurations and activity (governed by Obsidian native styles).
 */
function buildCalendarsTable(
  settings: FullCalendarSettings,
  stats: LifetimeMilestoneStats
): string {
  const sources = settings.calendarSources ?? [];
  const typesMap: Record<string, number> = {};
  for (const source of sources) {
    typesMap[source.type] = (typesMap[source.type] ?? 0) + 1;
  }

  let markdown =
    '| Calendar Type | Configured | Created (Lifetime) | Updated (Lifetime) | Deleted (Lifetime) | Moved (Lifetime) |\n';
  markdown += '| :--- | :---: | :---: | :---: | :---: | :---: |\n';

  const friendlyNames: Record<string, string> = {
    local: 'Local Vault Files',
    dailynote: 'Daily Notes Calendar',
    journals: 'Journals Calendar',
    ical: 'iCal External Feeds',
    caldav: 'CalDAV Calendar',
    google: 'Google Calendar',
    googletasks: 'Google Tasks Integration',
    outlook: 'Outlook Calendar',
    tasks: 'Obsidian Tasks Integration',
    tasknotes: 'Task Notes',
    bases: 'Bases Databases',
    holidays: 'Holidays Calendar'
  };

  const allTypes: string[] = Array.from(
    new Set([
      ...sources.map((s: CalendarInfo) => s.type),
      'local',
      'google',
      'ical',
      'caldav',
      'tasks'
    ])
  );

  let hasRows = false;
  for (const type of allTypes) {
    const count = typesMap[type] ?? 0;
    const providerOps = stats.operationsByCalendarType[type] ?? {
      created: 0,
      updated: 0,
      deleted: 0,
      moved: 0
    };

    if (
      count > 0 ||
      providerOps.created > 0 ||
      providerOps.updated > 0 ||
      providerOps.deleted > 0 ||
      providerOps.moved > 0
    ) {
      const label = friendlyNames[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
      markdown += `| **${label}** | ${count} | ${providerOps.created} | ${providerOps.updated} | ${providerOps.deleted} | ${providerOps.moved} |\n`;
      hasRows = true;
    }
  }

  return hasRows ? markdown : '*No calendar source activity recorded.*';
}

/**
 * Builds the fully anonymized telemetry JSON object matching the developer parameters.
 */
function buildTelemetryPayload(
  monthKey: string,
  settings: FullCalendarSettings,
  stats: LifetimeMilestoneStats
): string {
  const sources = settings.calendarSources ?? [];
  const calendarsByType: Record<string, number> = {};
  for (const source of sources) {
    calendarsByType[source.type] = (calendarsByType[source.type] ?? 0) + 1;
  }

  const payload = {
    pluginId: 'obsidian-full-calendar-remastered',
    isMobile: Boolean(Platform.isMobile),
    month: monthKey,
    totalCalendars: sources.length,
    calendarsByType,
    operations: stats.operations,
    operationsByCalendarType: stats.operationsByCalendarType,
    meta: stats.meta
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Formats a monthKey (e.g. '2026-04') into a readable string (e.g. 'April 2026')
 */
function formatMonthName(monthKey: string): string {
  try {
    const [year, month] = monthKey.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  } catch {
    return monthKey;
  }
}

/**
 * Generates the monthly report content by replacing template placeholders.
 */
export async function compileMonthlyReport(
  app: App,
  pluginId: string,
  monthKey: string
): Promise<string> {
  const template = await getMilestoneTemplate(app, pluginId);
  const settings = PluginState.getSettings();
  const lifetimeStats = getLifetimeMilestoneStats();
  const priorMonthSummary = getMonthlyActivitySummary(monthKey);

  const monthName = formatMonthName(monthKey);
  const calendarsTable = buildCalendarsTable(settings, lifetimeStats);
  const jsonPayload = buildTelemetryPayload(monthKey, settings, lifetimeStats);

  let output = template;
  output = output.replace(/\{\{MONTH\}\}/g, monthName);
  output = output.replace(
    /\{\{TOTAL_CALENDARS\}\}/g,
    String(settings.calendarSources?.length ?? 0)
  );
  output = output.replace(
    /\{\{LIFETIME_OPS\}\}/g,
    String(
      lifetimeStats.operations.created +
        lifetimeStats.operations.updated +
        lifetimeStats.operations.deleted +
        lifetimeStats.operations.moved
    )
  );
  output = output.replace(/\{\{PREV_MONTH_OPS\}\}/g, String(priorMonthSummary.totalOps));
  output = output.replace(/\{\{PREV_MONTH_CREATED\}\}/g, String(priorMonthSummary.createdCount));
  output = output.replace(/\{\{LIFETIME_STREAK\}\}/g, String(lifetimeStats.meta.bestStreak));
  output = output.replace(/\{\{LIFETIME_TZ\}\}/g, String(lifetimeStats.meta.distinctTimezones));
  output = output.replace(/\{\{CALENDARS_TABLE\}\}/g, calendarsTable);
  output = output.replace(/\{\{NLP_CREATED\}\}/g, String(lifetimeStats.meta.createdViaNlp));
  output = output.replace(
    /\{\{RECURRING_CREATED\}\}/g,
    String(lifetimeStats.meta.recurringCreated)
  );
  output = output.replace(/\{\{WORKSPACES_COUNT\}\}/g, String(lifetimeStats.meta.workspacesCount));
  output = output.replace(/\{\{NIGHT_OWL_OPS\}\}/g, String(lifetimeStats.meta.nightOwlOps));
  output = output.replace(/\{\{EARLY_BIRD_OPS\}\}/g, String(lifetimeStats.meta.earlyBirdOps));
  output = output.replace(/\{\{WEEKEND_OPS\}\}/g, String(lifetimeStats.meta.weekendWarriorOps));
  output = output.replace(/\{\{JSON_PAYLOAD\}\}/g, jsonPayload);

  return output;
}

/**
 * Creates the temporary report note in the vault and opens it in a new tab.
 */
export async function generateAndOpenMonthlyReport(
  app: App,
  plugin: FullCalendarPlugin,
  monthKey: string
): Promise<void> {
  try {
    // If a temporary report was already open, let's delete/cleanup first
    await startupCleanupTempNote(app);

    const reportContent = await compileMonthlyReport(app, plugin.manifest.id, monthKey);
    const file = await app.vault.create(TEMP_FILE_NAME, reportContent);

    trackTemporaryReport(file.path);

    // Open in a new tab
    const leaf = app.workspace.getLeaf(true);
    await leaf.openFile(file);
  } catch (error) {
    console.warn('[Full Calendar] Failed to generate or open monthly usage report note.', error);
  }
}

/**
 * Actively monitors layout changes to clean up the temporary milestones note if closed.
 */
export async function checkAndCleanupTempNote(app: App): Promise<void> {
  if (!trackedTempFilePath) return;

  const leaves = app.workspace.getLeavesOfType('markdown');
  const isFileOpen = leaves.some(leaf => {
    const view = leaf.view;
    if (view instanceof MarkdownView) {
      return view.file?.path === trackedTempFilePath;
    }
    return false;
  });

  if (!isFileOpen) {
    const file = app.vault.getAbstractFileByPath(trackedTempFilePath);
    if (file instanceof TFile) {
      untrackTemporaryReport();
      try {
        await app.fileManager.trashFile(file);
      } catch (error) {
        console.warn('[Full Calendar] Failed to delete closed temporary usage note.', error);
      }
    }
  }
}

/**
 * Tidy up any residual temporary reports at startup.
 */
export async function startupCleanupTempNote(app: App): Promise<void> {
  const file = app.vault.getAbstractFileByPath(TEMP_FILE_NAME);
  if (file instanceof TFile) {
    try {
      await app.fileManager.trashFile(file);
    } catch (error) {
      console.warn('[Full Calendar] Startup temp file cleanup failed.', error);
    }
  }
  untrackTemporaryReport();
}

/**
 * Triggered by the monthly probability scheduler.
 */
export async function runMonthlyReportScheduler(
  app: App,
  plugin: FullCalendarPlugin
): Promise<void> {
  const settings = PluginState.getSettings();
  if (settings.enableMonthlyStatsReport === false) {
    return;
  }

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Calculate prior month in 'yyyy-mm'
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

  if (settings.lastMonthlyMilestonesGeneratedMonth === prevMonthStr) {
    return;
  }

  const dayOfMonth = now.getDate();
  if (dayOfMonth < 1 || dayOfMonth > 5) {
    return;
  }

  if (settings.lastMonthlyMilestonesCheckDate === todayStr) {
    return;
  }

  // Mark today as checked
  settings.lastMonthlyMilestonesCheckDate = todayStr;
  await PluginState.saveSettings();

  // Randomized trigger (days 1-4: 50% chance, day 5: 100% chance)
  const shouldTrigger = dayOfMonth === 5 || Math.random() < 0.5;
  if (shouldTrigger) {
    settings.lastMonthlyMilestonesGeneratedMonth = prevMonthStr;
    await PluginState.saveSettings();
    await generateAndOpenMonthlyReport(app, plugin, prevMonthStr);
  }
}

/**
 * Registers the Obsidian Protocol Action handler for keep and delete actions.
 */
export function registerMilestoneProtocolHandler(plugin: FullCalendarPlugin): void {
  plugin.registerObsidianProtocolHandler('full-calendar-milestones', async params => {
    const { action } = params;
    const app = plugin.app;

    if (action === 'keep') {
      const file = app.vault.getAbstractFileByPath(TEMP_FILE_NAME);
      if (file instanceof TFile) {
        // Move and rename to root vault as permanent file
        const now = new Date();
        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevMonthStr = prevMonthDate.toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric'
        });

        const newPath = `Full Calendar Milestones - ${prevMonthStr}.md`;

        try {
          untrackTemporaryReport();
          await app.fileManager.renameFile(file, newPath);

          // Show celebration notice
          const { showNotice } = await import('../../utils/showNotice');
          showNotice('Monthly Milestones report saved permanently to your vault root! 📂');
        } catch (error) {
          console.warn('[Full Calendar] Failed to save milestones report permanently.', error);
        }
      }
    } else if (action === 'delete') {
      const file = app.vault.getAbstractFileByPath(TEMP_FILE_NAME);
      if (file instanceof TFile) {
        untrackTemporaryReport();

        // Find and close leaves with this file open
        const leaves = app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
          const view = leaf.view;
          if (view instanceof MarkdownView && view.file?.path === file.path) {
            leaf.detach();
          }
        }

        try {
          await app.fileManager.trashFile(file);
          const { showNotice } = await import('../../utils/showNotice');
          showNotice('Temporary milestones report deleted.');
        } catch (error) {
          console.warn('[Full Calendar] Failed to delete milestones report.', error);
        }
      }
    }
  });
}

function getFallbackTemplate(): string {
  return baseTemplate;
}
