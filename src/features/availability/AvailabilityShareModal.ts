/**
 * @file AvailabilityShareModal.ts
 * @brief Modal user interface for configuring and exporting shared availability.
 * @license See LICENSE.md
 */

import { Modal, Setting, TFile } from 'obsidian';
import { showNotice } from '../../utils/showNotice';
import { DateTime } from 'luxon';
import { PluginState } from '../../core/PluginState';
import { CredentialStore } from '../credentials/CredentialStore';
import { AvailabilityService } from './AvailabilityService';
import { GithubGistService } from './GithubGistService';
import { CalendarInfo } from '../../types/calendar_settings';
import { t } from '../i18n/i18n';
import { openExternalUrl } from '../../utils/openExternalUrl';
import { createDescWithDocs } from '../../ui/settings/docsLinks';

export class AvailabilityShareModal extends Modal {
  private startDateVal: string = DateTime.now().toISODate() || '';
  private endDateVal: string = DateTime.now().plus({ days: 7 }).toISODate() || '';
  private startTimeVal: string = '09:00';
  private endTimeVal: string = '17:00';
  private excludeWeekendsVal: boolean = true;
  private anonymizeVal: boolean = true;
  private selectedCalendars: Set<string> = new Set<string>();

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    // Set custom class on parent container for targeted CSS scoping if needed
    contentEl.parentElement?.addClass('ofc-availability-share-modal');

    // Modal Title
    contentEl.createEl('h2', {
      text: t('availability.modal.title')
    });

    // Intro description with Docs link
    const descDiv = contentEl.createEl('p', { cls: 'setting-item-description' });
    descDiv.appendChild(
      createDescWithDocs(t('availability.modal.introDesc'), [
        { text: t('global.learnMoreLink') || 'Learn more', path: 'user/features/availability' }
      ])
    );

    const settings = PluginState.getSettings();
    if (settings.availabilityDefaultTimeRange) {
      this.startTimeVal = settings.availabilityDefaultTimeRange.startTime;
      this.endTimeVal = settings.availabilityDefaultTimeRange.endTime;
    }

    // --- Configuration Section ---
    const configSection = contentEl.createDiv({ cls: 'ofc-availability-config-section' });

    // 1. Date Range picker (Unified range UI, responsive wrapping)
    const dateSetting = new Setting(configSection)
      .setClass('ofc-responsive-range-setting')
      .setName(t('availability.modal.dateRange'))
      .setDesc(
        createDescWithDocs(t('availability.modal.dateRangeDesc'), [
          { text: t('global.learnMoreLink') || 'Learn more', path: 'user/features/availability' }
        ])
      );

    dateSetting.controlEl.empty();

    const startDateInput = dateSetting.controlEl.createEl('input', { attr: { type: 'date' } });
    startDateInput.value = this.startDateVal;
    startDateInput.addEventListener('change', e => {
      this.startDateVal = (e.target as HTMLInputElement).value;
      updateRangeWarning();
    });

    dateSetting.controlEl.createSpan({ cls: 'ofc-range-separator' });

    const endDateInput = dateSetting.controlEl.createEl('input', { attr: { type: 'date' } });
    endDateInput.value = this.endDateVal;
    endDateInput.addEventListener('change', e => {
      this.endDateVal = (e.target as HTMLInputElement).value;
      updateRangeWarning();
    });

    const warningEl = configSection.createDiv({
      cls: 'ofc-warning-box',
      text:
        t('availability.modal.warningLargeRange') ||
        'Warning: Selecting a date range longer than 90 days may cause performance slowdowns.'
    });
    warningEl.setCssProps({
      display: 'none'
    });

    const updateRangeWarning = () => {
      if (!this.startDateVal || !this.endDateVal) {
        warningEl.setCssProps({ display: 'none' });
        return;
      }
      const start = DateTime.fromISO(this.startDateVal);
      const end = DateTime.fromISO(this.endDateVal);
      if (start.isValid && end.isValid) {
        const diff = end.diff(start, 'days').days;
        if (diff > 90) {
          warningEl.setCssProps({ display: 'block' });
        } else {
          warningEl.setCssProps({ display: 'none' });
        }
      } else {
        warningEl.setCssProps({ display: 'none' });
      }
    };

    updateRangeWarning();

    // 2. Daily Time Range picker (Unified range UI, responsive wrapping)
    const timeSetting = new Setting(configSection)
      .setClass('ofc-responsive-range-setting')
      .setName(t('availability.modal.timeRange'))
      .setDesc(
        createDescWithDocs(t('availability.modal.timeRangeDesc'), [
          { text: t('global.learnMoreLink') || 'Learn more', path: 'user/features/availability' }
        ])
      );

    timeSetting.controlEl.empty();

    const startTimeInput = timeSetting.controlEl.createEl('input', { attr: { type: 'time' } });
    startTimeInput.value = this.startTimeVal;
    startTimeInput.addEventListener('change', e => {
      this.startTimeVal = (e.target as HTMLInputElement).value;
    });

    timeSetting.controlEl.createSpan({ cls: 'ofc-range-separator' });

    const endTimeInput = timeSetting.controlEl.createEl('input', { attr: { type: 'time' } });
    endTimeInput.value = this.endTimeVal;
    endTimeInput.addEventListener('change', e => {
      this.endTimeVal = (e.target as HTMLInputElement).value;
    });

    // 3. Exclude Weekends Toggle
    new Setting(configSection)
      .setName(t('availability.modal.excludeWeekends'))
      .setDesc(
        createDescWithDocs(t('availability.modal.excludeWeekendsDesc'), [
          { text: t('global.learnMoreLink') || 'Learn more', path: 'user/features/availability' }
        ])
      )
      .addToggle(toggle => {
        toggle.setValue(this.excludeWeekendsVal).onChange(val => {
          this.excludeWeekendsVal = val;
        });
      });

    // 4. Anonymization Dropdown (Stacks vertically to prevent squishing)
    new Setting(configSection)
      .setClass('ofc-responsive-dropdown-setting')
      .setName(t('availability.modal.anonymize'))
      .setDesc(
        createDescWithDocs(t('availability.modal.anonymizeDesc'), [
          { text: t('global.learnMoreLink') || 'Learn more', path: 'user/features/availability' }
        ])
      )
      .addDropdown(dropdown => {
        dropdown
          .addOption('full', t('availability.modal.anonymizeFull'))
          .addOption('semi', t('availability.modal.anonymizeSemi'))
          .setValue('full')
          .onChange(val => {
            this.anonymizeVal = val === 'full';
          });
      });

    // 5. Calendars to Include Section (reusing standard ofc-workspace-modal-section styling)
    const calendarSection = configSection.createDiv({ cls: 'ofc-workspace-modal-section' });
    calendarSection.createEl('h3', { text: t('availability.modal.calendarsTitle') });

    const sources = PluginState.getProviderRegistry().getAllSources();
    if (sources.length === 0) {
      calendarSection.createEl('p', { text: t('availability.modal.noCalendars') });
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

    // --- Onboarding / Gist Setup Panel (initially hidden) ---
    const setupPanel = contentEl.createDiv({ cls: 'ofc-setup-card' });
    setupPanel.setCssProps({ display: 'none' });

    setupPanel.createEl('h3', { text: t('availability.modal.setupTitle') });
    setupPanel.createEl('p', {
      text: t('availability.modal.setupDesc'),
      cls: 'setting-item-description'
    });

    // Step 1
    const step1Setting = new Setting(setupPanel).setName(t('availability.modal.setupStep1'));
    const step1Link = step1Setting.descEl.createEl('a', {
      text: t('availability.modal.setupStep1Link')
    });
    step1Link.setAttribute('href', '#');
    step1Link.addEventListener('click', e => {
      e.preventDefault();
      openExternalUrl(
        'https://github.com/settings/tokens/new?scopes=gist&description=Obsidian%20Full%20Calendar%20Availability%20Sharing'
      );
    });

    // Step 2
    let tempToken = '';
    new Setting(setupPanel).setName(t('availability.modal.setupStep2')).addText(text => {
      text.inputEl.type = 'text';
      text.setPlaceholder(t('availability.modal.setupPlaceholder'));
      text.setValue(tempToken);
      text.onChange(val => {
        tempToken = val.trim();
      });
    });

    // --- Action Buttons ---
    const actionButtons = contentEl.createDiv({ cls: 'ofc-workspace-modal-buttons' });
    actionButtons.setCssProps({ marginTop: '2rem' });

    actionButtons.createEl('button', { text: t('availability.modal.btnMarkdown') }, button => {
      button.addEventListener('click', () => {
        this.exportMarkdown().catch(console.error);
      });
    });

    actionButtons.createEl(
      'button',
      {
        text: t('availability.modal.btnWebLink'),
        cls: 'mod-cta'
      },
      button => {
        button.addEventListener('click', () => {
          const token = CredentialStore.getGitHubToken();
          if (!token) {
            configSection.setCssProps({ display: 'none' });
            setupPanel.setCssProps({ display: 'block' });
            actionButtons.setCssProps({ display: 'none' });
            setupButtons.setCssProps({ display: 'flex' });
          } else {
            button.disabled = true;
            button.textContent = t('availability.modal.btnGenerating');
            this.generateWebLink().catch(() => {
              button.disabled = false;
              button.textContent = t('availability.modal.btnWebLink');
            });
          }
        });
      }
    );

    // --- Setup Buttons ---
    const setupButtons = contentEl.createDiv({ cls: 'ofc-workspace-modal-buttons' });
    setupButtons.setCssProps({ display: 'none', marginTop: '2rem' });

    setupButtons.createEl('button', { text: t('availability.modal.btnBack') || 'Back' }, button => {
      button.addEventListener('click', () => {
        configSection.setCssProps({ display: 'block' });
        setupPanel.setCssProps({ display: 'none' });
        actionButtons.setCssProps({ display: 'flex' });
        setupButtons.setCssProps({ display: 'none' });
      });
    });

    setupButtons.createEl(
      'button',
      {
        text: t('availability.modal.btnSaveAndGenerate'),
        cls: 'mod-cta'
      },
      button => {
        button.addEventListener('click', () => {
          if (!tempToken) {
            showNotice('Please paste your GitHub Access Token first.');
            return;
          }
          button.disabled = true;
          button.textContent = t('availability.modal.btnGenerating');
          CredentialStore.setGitHubToken(tempToken);
          PluginState.saveSettings()
            .then(() => this.generateWebLink())
            .catch(err => {
              showNotice(t('availability.modal.noticeFailedGist', { error: String(err) }));
              button.disabled = false;
              button.textContent = t('availability.modal.btnSaveAndGenerate');
            });
        });
      }
    );
  }

  private async exportMarkdown(): Promise<void> {
    try {
      const res = await AvailabilityService.computeAvailability({
        startDate: this.startDateVal,
        endDate: this.endDateVal,
        startTime: this.startTimeVal,
        endTime: this.endTimeVal,
        excludeWeekends: this.excludeWeekendsVal,
        calendarIds: Array.from(this.selectedCalendars),
        anonymize: this.anonymizeVal
      });

      const mdContent = AvailabilityService.generateMarkdown(res, this.anonymizeVal);
      const folder = PluginState.getSettings().availabilityExportPath || '';
      const filename = `availability-${DateTime.now().toFormat('yyyyMMdd-HHmmss')}.md`;
      const fullPath = folder ? `${folder}/${filename}` : filename;

      await this.app.vault.create(fullPath, mdContent);
      showNotice(t('availability.modal.noticeSuccessMd', { path: fullPath }));

      const tfile = this.app.vault.getAbstractFileByPath(fullPath);
      if (tfile instanceof TFile) {
        await this.app.workspace.getLeaf(false).openFile(tfile);
      }
      this.close();
    } catch (err) {
      console.error(err);
      showNotice(
        t('availability.modal.noticeFailedMd', {
          error: err instanceof Error ? err.message : String(err)
        })
      );
    }
  }

  private async generateWebLink(): Promise<void> {
    try {
      const res = await AvailabilityService.computeAvailability({
        startDate: this.startDateVal,
        endDate: this.endDateVal,
        startTime: this.startTimeVal,
        endTime: this.endTimeVal,
        excludeWeekends: this.excludeWeekendsVal,
        calendarIds: Array.from(this.selectedCalendars),
        anonymize: this.anonymizeVal
      });

      const jsonStr = JSON.stringify(res, null, 2);
      const existingGistId = PluginState.getSettings().availabilityGistId;
      const gistId = await GithubGistService.createOrUpdateGist(jsonStr, existingGistId);

      PluginState.getSettings().availabilityGistId = gistId;
      await PluginState.saveSettings();

      const shareUrl = `https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/assets/share-availability.html?gist=${gistId}`;
      await navigator.clipboard.writeText(shareUrl);
      showNotice(t('availability.modal.noticeSuccessGist'));

      const { CopyTextModal } = await import('../../ui/modals/CopyTextModal');
      const linkModal = new CopyTextModal(this.app, {
        titleText: t('availability.modal.successModalTitle'),
        descriptionText: t('availability.modal.successModalDesc'),
        valueToCopy: shareUrl,
        copyButtonLabel: t('availability.modal.successModalCopy'),
        copiedButtonLabel: t('availability.modal.successModalCopied')
      });
      linkModal.open();
      this.close();
    } catch (err) {
      console.error(err);
      showNotice(
        t('availability.modal.noticeFailedGist', {
          error: err instanceof Error ? err.message : String(err)
        })
      );
      throw err;
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.parentElement?.removeClass('ofc-availability-share-modal');
    contentEl.empty();
  }
}
