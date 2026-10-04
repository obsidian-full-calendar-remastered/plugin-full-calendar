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
  return {
    report: LoadDebugProfiler.getLastReport(),
    text: LoadDebugProfiler.getFormattedReport() || 'No log data available.'
  };
}

export async function showLoadDebugLogModal(app: App): Promise<void> {
  const coldBootReport = LoadDebugProfiler.getColdBootReport();
  const coldBootText = LoadDebugProfiler.getColdBootFormattedReport();
  let lastReport = LoadDebugProfiler.getLastReport();
  let lastText = LoadDebugProfiler.getFormattedReport();

  if (!lastReport || !lastText) {
    const result = await runBenchmarkAndGetReport('Running Full Calendar load timing benchmark...');
    lastReport = result.report;
    lastText = result.text;
  }

  let text = '';
  if (coldBootText && lastText && coldBootText !== lastText) {
    text = `${coldBootText}\n\n${'='.repeat(70)}\n\n${lastText}`;
  } else {
    text = coldBootText || lastText || 'No log data available.';
  }

  const primaryReport = coldBootReport || lastReport;
  const isCold = !!coldBootReport && (!lastReport || primaryReport === lastReport);
  const typeStr = isCold ? 'Cold Boot Startup' : 'On-Demand Benchmark';
  const timestampStr = primaryReport ? new Date(primaryReport.timestamp).toLocaleString() : '';
  const freezeDesc = primaryReport?.freezeStats
    ? ` | UI Freezes: ${primaryReport.freezeStats.totalCount} (Max spike: ${primaryReport.freezeStats.maxDurationMs} ms)`
    : '';

  new CopyTextModal(app, {
    titleText: `⏱️ Full Calendar Load Debug (${typeStr})`,
    descriptionText: primaryReport
      ? `Captured: ${timestampStr} | Total population: ${primaryReport.totalPopulateDurationMs ?? 0} ms | Stages: ${primaryReport.stages.length}${freezeDesc}`
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
