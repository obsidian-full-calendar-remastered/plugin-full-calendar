/**
 * @file AgentAuditModal.ts
 * @brief Modal view for inspecting and exporting the agent's audit log and session diagnostics.
 *
 * @license See LICENSE.md
 */

import { App, Modal, Setting } from 'obsidian';
import type { AgentAuditLogger } from '../core/AgentAuditLogger';
import { showNotice } from '../../../utils/showNotice';
import { t } from '../../i18n/i18n';

export class AgentAuditModal extends Modal {
  private logger: AgentAuditLogger;

  constructor(app: App, logger: AgentAuditLogger) {
    super(app);
    this.logger = logger;
  }

  async onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText(t('agent.audit.title'));
    contentEl.empty();
    contentEl.addClass('ofc-audit-modal-content');

    contentEl.createEl('p', {
      text: t('agent.audit.description'),
      cls: 'ofc-audit-modal-desc'
    });

    // Action buttons bar
    const btnBar = new Setting(contentEl);
    btnBar.addButton(btn => {
      btn.setButtonText(t('agent.audit.exportBtn'));
      btn.onClick(async () => {
        const raw = await this.logger.exportLogs();
        if (!raw) {
          showNotice(t('agent.audit.noLogsNotice'));
          return;
        }
        await navigator.clipboard.writeText(raw);
        showNotice(t('agent.audit.copiedNotice'));
      });
    });

    btnBar.addButton(btn => {
      btn.setButtonText(t('agent.audit.clearBtn'));
      btn.setClass('mod-warning');
      btn.onClick(async () => {
        await this.logger.clearLogs();
        showNotice(t('agent.audit.clearedNotice'));
        void this.onOpen();
      });
    });

    const listContainer = contentEl.createDiv({ cls: 'ofc-audit-list' });
    const entries = await this.logger.getRecentEntries(100);

    if (entries.length === 0) {
      listContainer.createDiv({
        text: t('agent.audit.noEntries'),
        cls: 'ofc-audit-empty'
      });
      return;
    }

    for (const entry of entries) {
      const row = listContainer.createDiv({ cls: 'ofc-audit-row' });
      const header = row.createDiv({ cls: 'ofc-audit-row-header' });

      const dateStr = new Date(entry.timestamp).toLocaleTimeString();
      header.createSpan({
        text: `[${dateStr}] [${entry.level}] ${entry.action}`,
        cls: `ofc-audit-level-${entry.level}`
      });

      if (entry.durationMs !== undefined) {
        header.createSpan({
          text: `${entry.durationMs}ms`,
          cls: 'ofc-audit-duration'
        });
      }

      if (entry.error) {
        row.createDiv({
          text: `Error: ${entry.error}`,
          cls: 'ofc-audit-error-text'
        });
      }

      if (entry.details) {
        const detailsEl = row.createEl('details');
        detailsEl.createEl('summary', { text: t('agent.audit.payloadDetails') });
        const pre = detailsEl.createEl('pre');
        pre.setText(JSON.stringify(entry.details, null, 2));
      }
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
