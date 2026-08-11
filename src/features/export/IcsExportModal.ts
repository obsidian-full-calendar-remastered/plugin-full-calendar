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
import { isTask } from '../../types/tasks';
import { t } from '../i18n/i18n';
import { showNotice } from '../../utils/showNotice';

export class IcsExportModal extends Modal {
  private fileNameVal: string = `full-calendar-export-${DateTime.now().toFormat('yyyyMMdd-HHmmss')}.ics`;
  private targetFolderVal: string = '';
  private selectedCalendars: Set<string> = new Set<string>();
  private exportPeriod: 'all' | 'range' = 'all';
  private startDateVal: string = DateTime.now().toISODate() || '';
  private endDateVal: string = DateTime.now().plus({ days: 7 }).toISODate() || '';
  private filterDailyTimeRange: boolean = false;
  private startTimeVal: string = '09:00';
  private endTimeVal: string = '17:00';
  private includeAllDay: boolean = true;
  private excludeWeekends: boolean = false;
  private includeTypes: 'all' | 'events' | 'tasks' = 'all';
  private taskStatus: 'all' | 'incomplete' | 'completed' = 'all';
  private selectedCategories: Set<string> = new Set<string>();

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    // Set custom class on parent container for styling
    contentEl.parentElement?.addClass('ofc-ics-export-modal');

    // Title
    this.titleEl.setText(t('exportModal.title') || 'Export Event Cache');

    // --- Configuration Section ---
    const configSection = contentEl.createDiv({ cls: 'ofc-ics-export-config-section' });

    let fileNameInput: HTMLInputElement | null = null;

    // 1. File Name Setting
    new Setting(configSection)
      .setName(t('exportModal.fileName') || 'Export File Name')
      .setDesc(t('exportModal.fileNameDesc') || 'Name of the generated .ics file.')
      .addText(text => {
        fileNameInput = text.inputEl;
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
          .onChange(val => {
            this.targetFolderVal = val.trim();
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
          case 'journals':
            displayName = `${t('modals.workspace.calendarTypes.journals')} ${source.name}`;
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

    // Initialize selectedCategories with all categories on first load
    const categoriesList = PluginState.getCache().getAllCategories();
    if (this.selectedCategories.size === 0) {
      categoriesList.forEach(cat => this.selectedCategories.add(cat));
    }

    // 4. Filtration Settings Section
    const filterSection = configSection.createDiv({ cls: 'ofc-workspace-modal-section' });
    filterSection.createEl('h3', {
      text: t('exportModal.filterTitle') || 'Filter Events'
    });

    // Dropdown for Export Period
    new Setting(filterSection)
      .setName(t('exportModal.period') || 'Export Period')
      .setDesc(
        t('exportModal.periodDesc') ||
          'Select whether to export all events or a specific date range.'
      )
      .addDropdown(dropdown => {
        dropdown
          .addOption('all', t('exportModal.periodAll') || 'Export All Events')
          .addOption('range', t('exportModal.periodRange') || 'Specific Date Range')
          .setValue(this.exportPeriod)
          .onChange(val => {
            this.exportPeriod = val as 'all' | 'range';
            this.renderDateRangeInputs(dateRangeContainer);
          });
      });

    const dateRangeContainer = filterSection.createDiv({ cls: 'ofc-date-range-container' });
    this.renderDateRangeInputs(dateRangeContainer);

    // Dropdown for Include Types
    new Setting(filterSection)
      .setName(t('exportModal.includeTypes') || 'Include Types')
      .setDesc(
        t('exportModal.includeTypesDesc') || 'Select whether to include events, tasks, or both.'
      )
      .addDropdown(dropdown => {
        dropdown
          .addOption('all', t('exportModal.includeTypesAll') || 'Events and Tasks')
          .addOption('events', t('exportModal.includeTypesEvents') || 'Events Only')
          .addOption('tasks', t('exportModal.includeTypesTasks') || 'Tasks Only')
          .setValue(this.includeTypes)
          .onChange(val => {
            this.includeTypes = val as 'all' | 'events' | 'tasks';
            this.renderTaskStatusSettings(taskStatusContainer);
          });
      });

    const taskStatusContainer = filterSection.createDiv({ cls: 'ofc-task-status-container' });
    this.renderTaskStatusSettings(taskStatusContainer);

    // Toggle for Include All-Day Events
    new Setting(filterSection)
      .setName(t('exportModal.includeAllDay') || 'Include All-Day Events')
      .setDesc(
        t('exportModal.includeAllDayDesc') || 'Toggle whether to include all-day events/tasks.'
      )
      .addToggle(toggle => {
        toggle.setValue(this.includeAllDay).onChange(val => {
          this.includeAllDay = val;
        });
      });

    // Toggle for Exclude Weekends
    new Setting(filterSection)
      .setName(t('exportModal.excludeWeekends') || 'Exclude Weekends')
      .setDesc(
        t('exportModal.excludeWeekendsDesc') ||
          'Filter out events that occur on Saturdays or Sundays.'
      )
      .addToggle(toggle => {
        toggle.setValue(this.excludeWeekends).onChange(val => {
          this.excludeWeekends = val;
        });
      });

    // Toggle for Daily Time Range Filter
    new Setting(filterSection)
      .setName(t('exportModal.filterDailyTimeRange') || 'Filter by Daily Time Range')
      .setDesc(
        t('exportModal.filterDailyTimeRangeDesc') ||
          'Only export timed events occurring between specific hours of the day.'
      )
      .addToggle(toggle => {
        toggle.setValue(this.filterDailyTimeRange).onChange(val => {
          this.filterDailyTimeRange = val;
          this.renderDailyTimeRangeInputs(dailyTimeRangeContainer);
        });
      });

    const dailyTimeRangeContainer = filterSection.createDiv({
      cls: 'ofc-daily-time-range-container'
    });
    this.renderDailyTimeRangeInputs(dailyTimeRangeContainer);

    // Categories Checklist Section
    const categoriesContainer = filterSection.createDiv({ cls: 'ofc-categories-container' });
    this.renderCategoriesChecklist(categoriesContainer, categoriesList);

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

    if (fileNameInput) {
      window.setTimeout(() => {
        fileNameInput?.focus();
        fileNameInput?.select();
      }, 50);
    }
  }

  private renderDateRangeInputs(container: HTMLElement): void {
    container.empty();
    if (this.exportPeriod !== 'range') return;

    const dateSetting = new Setting(container)
      .setClass('ofc-responsive-range-setting')
      .setName(t('exportModal.dateRange') || 'Date Range')
      .setDesc(t('exportModal.dateRangeDesc') || 'Select the start and end dates to export.');

    dateSetting.controlEl.empty();

    const startDateInput = dateSetting.controlEl.createEl('input', { attr: { type: 'date' } });
    startDateInput.value = this.startDateVal;
    startDateInput.addEventListener('change', e => {
      this.startDateVal = (e.target as HTMLInputElement).value;
    });

    dateSetting.controlEl.createSpan({ cls: 'ofc-range-separator', text: ' To ' });

    const endDateInput = dateSetting.controlEl.createEl('input', { attr: { type: 'date' } });
    endDateInput.value = this.endDateVal;
    endDateInput.addEventListener('change', e => {
      this.endDateVal = (e.target as HTMLInputElement).value;
    });
  }

  private renderDailyTimeRangeInputs(container: HTMLElement): void {
    container.empty();
    if (!this.filterDailyTimeRange) return;

    const timeSetting = new Setting(container)
      .setClass('ofc-responsive-range-setting')
      .setName(t('exportModal.dailyTimeRange') || 'Daily Hours')
      .setDesc(t('exportModal.dailyTimeRangeDesc') || 'Select the daily time window.');

    timeSetting.controlEl.empty();

    const startTimeInput = timeSetting.controlEl.createEl('input', { attr: { type: 'time' } });
    startTimeInput.value = this.startTimeVal;
    startTimeInput.addEventListener('change', e => {
      this.startTimeVal = (e.target as HTMLInputElement).value;
    });

    timeSetting.controlEl.createSpan({ cls: 'ofc-range-separator', text: ' To ' });

    const endTimeInput = timeSetting.controlEl.createEl('input', { attr: { type: 'time' } });
    endTimeInput.value = this.endTimeVal;
    endTimeInput.addEventListener('change', e => {
      this.endTimeVal = (e.target as HTMLInputElement).value;
    });
  }

  private renderCategoriesChecklist(container: HTMLElement, categoriesList: string[]): void {
    container.empty();
    if (categoriesList.length === 0) return;

    container.createEl('h4', { text: t('exportModal.categoriesTitle') || 'Categories to Include' });

    categoriesList.forEach(category => {
      new Setting(container).setName(category).addToggle(toggle => {
        toggle.setValue(this.selectedCategories.has(category)).onChange(val => {
          if (val) {
            this.selectedCategories.add(category);
          } else {
            this.selectedCategories.delete(category);
          }
        });
      });
    });
  }

  private renderTaskStatusSettings(container: HTMLElement): void {
    container.empty();
    if (this.includeTypes === 'events') return;

    new Setting(container)
      .setName(t('exportModal.taskStatus') || 'Task Completion Status')
      .setDesc(t('exportModal.taskStatusDesc') || 'Filter tasks by their completion status.')
      .addDropdown(dropdown => {
        dropdown
          .addOption('all', t('exportModal.taskStatusAll') || 'All Tasks')
          .addOption('incomplete', t('exportModal.taskStatusIncomplete') || 'Incomplete Tasks Only')
          .addOption('completed', t('exportModal.taskStatusCompleted') || 'Completed Tasks Only')
          .setValue(this.taskStatus)
          .onChange(val => {
            this.taskStatus = val as 'all' | 'incomplete' | 'completed';
          });
      });
  }

  private compileEvents(): OFCEvent[] {
    if (this.selectedCalendars.size === 0) {
      throw new Error(
        t('exportModal.noticeNoCalendarsSelected') ||
          'Please select at least one calendar to export.'
      );
    }

    const allSources = PluginState.getCache().getAllEvents();
    const rawEvents: { event: OFCEvent; calendarId: string; id: string }[] = [];

    for (const source of allSources) {
      const isIncluded = this.selectedCalendars.has(source.id);
      if (isIncluded) {
        for (const event of source.events) {
          rawEvents.push({
            event: event.event,
            calendarId: source.id,
            id: event.id
          });
        }
      }
    }

    // Apply filtration criteria
    const filteredEvents = rawEvents.filter(({ event }) => {
      const isTaskEvent = isTask(event);

      // 1. Filter by event type
      if (this.includeTypes === 'events' && isTaskEvent) {
        return false;
      }
      if (this.includeTypes === 'tasks' && !isTaskEvent) {
        return false;
      }

      // 2. Filter tasks by completion status
      if (isTaskEvent && this.includeTypes !== 'events') {
        const isCompleted =
          'completed' in event &&
          event.completed !== undefined &&
          event.completed !== false &&
          event.completed !== null;
        if (this.taskStatus === 'incomplete' && isCompleted) {
          return false;
        }
        if (this.taskStatus === 'completed' && !isCompleted) {
          return false;
        }
      }

      // 3. Filter by Date Range
      if (this.exportPeriod === 'range') {
        const startBound = this.startDateVal
          ? DateTime.fromISO(this.startDateVal).startOf('day')
          : null;
        const endBound = this.endDateVal ? DateTime.fromISO(this.endDateVal).endOf('day') : null;

        let eventStart: DateTime | null = null;
        let eventEnd: DateTime | null = null;

        if (event.type === 'single') {
          eventStart = DateTime.fromISO(event.date);
          eventEnd = event.endDate ? DateTime.fromISO(event.endDate) : eventStart;
        } else if (event.type === 'rrule') {
          eventStart = DateTime.fromISO(event.startDate);
          eventEnd = event.endDate ? DateTime.fromISO(event.endDate) : null;
        } else if (event.type === 'recurring') {
          eventStart = event.startRecur ? DateTime.fromISO(event.startRecur) : null;
          eventEnd = event.endRecur ? DateTime.fromISO(event.endRecur) : null;
        }

        if (endBound && eventStart && eventStart > endBound) {
          return false;
        }
        if (startBound && eventEnd && eventEnd < startBound) {
          return false;
        }
      }

      // 4. Filter by All-Day Event Exclusion
      if (!this.includeAllDay && event.allDay) {
        return false;
      }

      // 5. Exclude Weekends
      if (this.excludeWeekends) {
        if (event.type === 'single') {
          const dt = DateTime.fromISO(event.date);
          if (dt.weekday === 6 || dt.weekday === 7) {
            return false;
          }
        } else if (event.type === 'recurring') {
          if (event.daysOfWeek && event.daysOfWeek.every(day => day === 'S' || day === 'U')) {
            return false;
          }
        }
      }

      // 6. Filter by Daily Time Range (for timed events)
      if (this.filterDailyTimeRange && event.allDay === false) {
        const startTimeStr = event.startTime || '00:00';
        const endTimeStr = event.endTime || '23:59';

        const parseTimeToMin = (timeStr: string) => {
          const parts = (timeStr || '00:00').split(':');
          const hr = parseInt(parts[0], 10) || 0;
          const min = parseInt(parts[1], 10) || 0;
          return hr * 60 + min;
        };

        const eventStartMin = parseTimeToMin(startTimeStr);
        const eventEndMin = parseTimeToMin(endTimeStr);

        const filterStartMin = parseTimeToMin(this.startTimeVal);
        const filterEndMin = parseTimeToMin(this.endTimeVal);

        if (eventStartMin >= filterEndMin || eventEndMin <= filterStartMin) {
          return false;
        }
      }

      // 7. Filter by Categories
      if (event.category && !this.selectedCategories.has(event.category)) {
        return false;
      }

      return true;
    });

    // Reconcile UIDs
    const clonedEvents = filteredEvents.map(({ event }) => ({ ...event }));

    const getCleanIdentifier = (idStr: string | undefined): string | null => {
      if (!idStr) return null;
      return idStr.split('/').pop()?.replace(/\.md$/i, '') || null;
    };

    const matchMaster = (override: OFCEvent, master: OFCEvent): boolean => {
      if (override.uid && master.uid && override.uid === master.uid) {
        return true;
      }
      const parentId = override.recurringEventId || override.uid;
      if (!parentId) return false;

      const parentFile = getCleanIdentifier(parentId);
      if (!parentFile) return false;

      if (
        master.uid &&
        (master.uid === parentId || getCleanIdentifier(master.uid) === parentFile)
      ) {
        return true;
      }
      if (master.id && (master.id === parentId || getCleanIdentifier(master.id) === parentFile)) {
        return true;
      }
      return false;
    };

    // First assign UID to masters if they don't have one
    for (const event of clonedEvents) {
      if (event.type === 'recurring' || event.type === 'rrule') {
        if (!event.uid) {
          event.uid = window.crypto.randomUUID();
        }
      }
    }

    // Then reconcile override UIDs with their masters
    for (const event of clonedEvents) {
      if (event.recurrenceId || event.recurringEventId) {
        const master = clonedEvents.find(
          candidate =>
            (candidate.type === 'recurring' || candidate.type === 'rrule') &&
            matchMaster(event, candidate)
        );
        if (master && master.uid) {
          event.uid = master.uid;
        }
      }
    }

    return clonedEvents;
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
      const a = createEl('a');
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
