/**
 * @file IcsExportModal.ts
 * @brief Modal UI for configuring and executing ICS exports.
 * @license See LICENSE.md
 */

import { Modal, Setting, TFile } from 'obsidian';
import { DateTime } from 'luxon';
import { PluginState } from '../../core/PluginState';
import { eventsToIcs } from '../../providers/ics/formatter';
import { CalendarInfo } from '../../types/calendar_settings';
import { OFCEvent } from '../../types';
import { t } from '../i18n/i18n';
import { showNotice } from '../../utils/showNotice';

export class IcsExportModal extends Modal {
  private fileNameVal: string = `full-calendar-export-${DateTime.now().toFormat('yyyyMMdd-HHmmss')}.ics`;
  private targetFolderVal: string = '';
  private selectedCalendars: Set<string> = new Set<string>();

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    // Set custom class on parent container for styling
    contentEl.parentElement?.addClass('ofc-ics-export-modal');

    // Title
    this.titleEl.setText(t('exportModal.title') || 'Export Event Cache');

    // Initial value for target folder
    this.targetFolderVal = PluginState.getSettings().icsExportPath || '';

    // --- Configuration Section ---
    const configSection = contentEl.createDiv({ cls: 'ofc-ics-export-config-section' });

    // 1. File Name Setting
    new Setting(configSection)
      .setName(t('exportModal.fileName') || 'Export File Name')
      .setDesc(t('exportModal.fileNameDesc') || 'Name of the generated .ics file.')
      .addText(text => {
        text.setValue(this.fileNameVal).onChange(val => {
          this.fileNameVal = val.trim();
        });
      });

    // 2. Target Folder Setting
    new Setting(configSection)
      .setName(t('exportModal.targetFolder') || 'Target Vault Folder')
      .setDesc(
        t('exportModal.targetFolderDesc') || 'Folder in your vault where the file will be saved.'
      )
      .addText(text => {
        text
          .setValue(this.targetFolderVal)
          .setPlaceholder('E.g., calendars/exports')
          .onChange(async val => {
            this.targetFolderVal = val.trim();
            PluginState.getSettings().icsExportPath = this.targetFolderVal;
            await PluginState.saveSettings();
          });
      });

    // 3. Calendars to Include Section
    const calendarSection = configSection.createDiv({ cls: 'ofc-workspace-modal-section' });
    calendarSection.createEl('h3', {
      text: t('exportModal.calendarsTitle') || 'Calendars to Include'
    });

    const sources = PluginState.getProviderRegistry().getAllSources();
    if (sources.length === 0) {
      calendarSection.createEl('p', {
        text: t('exportModal.noCalendars') || 'No calendars available for export.'
      });
    } else {
      sources.forEach((source: CalendarInfo) => {
        this.selectedCalendars.add(source.id); // Select by default

        let displayName: string;
        switch (source.type) {
          case 'local':
            displayName = `${t('modals.workspace.calendarTypes.local') || 'Local:'} ${source.name}`;
            break;
          case 'dailynote':
            displayName = `${t('modals.workspace.calendarTypes.dailyNotes') || 'Daily Notes:'} ${source.name}`;
            break;
          case 'ical':
            displayName = `${t('modals.workspace.calendarTypes.ics') || 'ICS:'} ${source.name}`;
            break;
          case 'caldav':
            displayName = `${t('modals.workspace.calendarTypes.caldav') || 'CalDAV:'} ${source.name}`;
            break;
          case 'google':
            displayName = `${t('modals.workspace.calendarTypes.google') || 'Google:'} ${source.name}`;
            break;
          case 'outlook':
            displayName = `${t('modals.workspace.calendarTypes.outlook') || 'Outlook:'} ${source.name}`;
            break;
          default:
            displayName = `${source.type}: ${source.name || source.id}`;
        }

        new Setting(calendarSection).setName(displayName).addToggle(toggle => {
          toggle.setValue(true).onChange(val => {
            if (val) {
              this.selectedCalendars.add(source.id);
            } else {
              this.selectedCalendars.delete(source.id);
            }
          });
        });
      });
    }

    // --- Action Button Row ---
    const buttonRow = contentEl.createDiv({ cls: 'ofc-ics-export-button-row' });
    buttonRow.setCssProps({
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '10px',
      marginTop: '20px'
    });

    // Cancel Button
    buttonRow.createEl('button', { text: t('exportModal.btnCancel') || 'Cancel' }, button => {
      button.addEventListener('click', () => {
        this.close();
      });
    });

    // Save to Vault Button
    buttonRow.createEl(
      'button',
      {
        text: t('exportModal.btnSave') || 'Save to Vault'
      },
      button => {
        button.addEventListener('click', () => {
          this.exportToVault().catch(console.error);
        });
      }
    );

    // Download Button
    buttonRow.createEl(
      'button',
      {
        text: t('exportModal.btnDownload') || 'Download ICS File',
        cls: 'mod-cta'
      },
      button => {
        button.addEventListener('click', () => {
          this.downloadIcsFile();
        });
      }
    );
  }

  /**
   * Helper to compile all events from the selected calendars.
   */
  private compileEvents(): OFCEvent[] {
    if (this.selectedCalendars.size === 0) {
      throw new Error(
        t('exportModal.noticeNoCalendarsSelected') ||
          'Please select at least one calendar to export.'
      );
    }

    const allSources = PluginState.getCache().getAllEvents();
    const events: OFCEvent[] = [];

    for (const source of allSources) {
      if (this.selectedCalendars.has(source.id)) {
        for (const event of source.events) {
          events.push(event.event);
        }
      }
    }

    return events;
  }

  /**
   * Exports the compiled events to a file in the user's vault.
   */
  private async exportToVault(): Promise<void> {
    try {
      const events = this.compileEvents();
      const icsContent = eventsToIcs(events);

      const folder = this.targetFolderVal;
      const filename = this.fileNameVal.endsWith('.ics')
        ? this.fileNameVal
        : `${this.fileNameVal}.ics`;
      const fullPath = folder ? `${folder}/${filename}` : filename;

      // Ensure output directory exists
      if (folder) {
        const folderExists = await this.app.vault.adapter.exists(folder);
        if (!folderExists) {
          await this.app.vault.createFolder(folder);
        }
      }

      // Check if file exists, overwrite if it does
      const fileExists = await this.app.vault.adapter.exists(fullPath);
      if (fileExists) {
        const file = this.app.vault.getAbstractFileByPath(fullPath);
        if (file instanceof TFile) {
          await this.app.vault.modify(file, icsContent);
        } else {
          await this.app.vault.adapter.write(fullPath, icsContent);
        }
      } else {
        await this.app.vault.create(fullPath, icsContent);
      }

      showNotice(
        t('exportModal.noticeSuccessSave', { path: fullPath }) ||
          `Successfully saved calendar export to ${fullPath}`
      );
      this.close();
    } catch (err) {
      console.error(err);
      showNotice(
        t('exportModal.noticeFailedSave', {
          error: err instanceof Error ? err.message : String(err)
        }) || `Failed to save calendar export: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Triggers a standard browser-level download of the compiled events.
   */
  private downloadIcsFile(): void {
    try {
      const events = this.compileEvents();
      const icsContent = eventsToIcs(events);
      const filename = this.fileNameVal.endsWith('.ics')
        ? this.fileNameVal
        : `${this.fileNameVal}.ics`;

      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = activeDocument.createElement('a');
      a.href = url;
      a.download = filename;
      activeDocument.body.appendChild(a);
      a.click();
      activeDocument.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.close();
    } catch (err) {
      console.error(err);
      showNotice(err instanceof Error ? err.message : String(err));
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.parentElement?.removeClass('ofc-ics-export-modal');
    contentEl.empty();
  }
}
