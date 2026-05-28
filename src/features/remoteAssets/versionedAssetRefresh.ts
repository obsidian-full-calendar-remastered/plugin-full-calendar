import { App } from 'obsidian';
// import { refreshCachedChronoDemoAsset } from '../../chrono_analyser/data/demoRemoteAsset';
import { refreshCurrentI18nLocaleForVersionUpdate } from '../i18n/i18n';
import { refreshCurrentNLPPayloadForVersionUpdate } from '../nlp/loader';
import { downloadMilestoneTemplate } from '../milestones/monthlyReport';

export type VersionedAssetRefreshStatus = 'refreshed' | 'skipped' | 'failed';

export interface VersionedAssetRefreshResult {
  id: string;
  status: VersionedAssetRefreshStatus;
  error?: unknown;
}

interface VersionedAssetRefreshTask {
  id: string;
  refresh: () => Promise<boolean>;
}

export async function runVersionedAssetRefreshTasks(
  tasks: VersionedAssetRefreshTask[]
): Promise<VersionedAssetRefreshResult[]> {
  const results: VersionedAssetRefreshResult[] = [];

  for (const task of tasks) {
    try {
      const refreshed = await task.refresh();
      results.push({
        id: task.id,
        status: refreshed ? 'refreshed' : 'skipped'
      });
    } catch (error) {
      console.warn(`[Full Calendar] Versioned asset refresh failed for "${task.id}".`, error);
      results.push({
        id: task.id,
        status: 'failed',
        error
      });
    }
  }

  return results;
}

export async function refreshRemoteAssetsForVersionUpdate(
  app: App,
  pluginId: string
): Promise<VersionedAssetRefreshResult[]> {
  return runVersionedAssetRefreshTasks([
    // {
    //   id: 'chrono-analyser-demo',
    //   refresh: () => refreshCachedChronoDemoAsset(app)
    // },
    {
      id: 'i18n-current-locale',
      refresh: () => refreshCurrentI18nLocaleForVersionUpdate(app, pluginId)
    },
    {
      id: 'nlp-current-locale',
      refresh: () => refreshCurrentNLPPayloadForVersionUpdate(app, pluginId)
    },
    {
      id: 'milestones-template',
      refresh: async () => {
        const text = await downloadMilestoneTemplate(app, pluginId);
        return text.length > 0;
      }
    }
  ]);
}
