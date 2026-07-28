/**
 * @file showLoadDebugLogModal.ts
 * @brief Utility function for displaying, copying, and re-benchmarking load debug timings using CopyTextModal.
 * @license See LICENSE.md
 */

import { App } from 'obsidian';
import { CopyTextModal } from './CopyTextModal';
import { LoadDebugProfiler } from '../../utils/LoadDebugProfiler';
import { PluginState } from '../../core/PluginState';
import { showNotice } from '../../utils/showNotice';

async function runBenchmarkAndGetReport(noticeMsg: string) {
  LoadDebugProfiler.setEnabled(true);
  showNotice(noticeMsg, 2000);
  const cache = PluginState.getCache();
  if (cache) {
    await cache.populate();
  }
  LoadDebugProfiler.setEnabled(false);
  return {
    report: LoadDebugProfiler.getLastReport(),
    text: LoadDebugProfiler.getFormattedReport() || 'No log data available.'
  };
}

export async function showLoadDebugLogModal(app: App): Promise<void> {
  let report = LoadDebugProfiler.getLastReport();
  let text = LoadDebugProfiler.getFormattedReport();

  if (!report || !text) {
    const result = await runBenchmarkAndGetReport('Running Full Calendar load timing benchmark...');
    report = result.report;
    text = result.text;
  }

  const timestampStr = report ? new Date(report.timestamp).toLocaleString() : '';

  new CopyTextModal(app, {
    titleText: '⏱️ full calendar load debug timing log',
    descriptionText: report
      ? `Last run: ${timestampStr} | Total population: ${report.totalPopulateDurationMs ?? 0} ms | Stages: ${report.stages.length}`
      : 'No timing benchmark recorded yet.',
    valueToCopy: text,
    multiline: true,
    autoCloseOnCopy: false,
    copyButtonLabel: '📋 Copy log to clipboard',
    copiedButtonLabel: '✓ copied',
    closeButtonLabel: 'Close',
    secondaryButtonLabel: '🔄 Re-run & benchmark now',
    onSecondaryClick: () => {
      void (async () => {
        await runBenchmarkAndGetReport('Re-running load benchmark...');
        void showLoadDebugLogModal(app);
      })();
    }
  }).open();
}
