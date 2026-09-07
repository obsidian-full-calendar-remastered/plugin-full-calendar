/**
 * @file WorkspaceModal.tsx
 * @brief Modal component for creating and editing workspace configurations.
 * @license See LICENSE.md
 */

import { PluginState } from '../../../core/PluginState';
import { Modal, Setting, DropdownComponent, TextComponent, ToggleComponent } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { WorkspaceSettings, generateWorkspaceId } from '../../../types/settings';
import { CalendarInfo } from '../../../types/calendar_settings';
import { t } from '../../i18n/i18n';
import { listWritableCalendars } from '../../../utils/writableCalendars';

export class WorkspaceModal extends Modal {
  plugin: FullCalendarPlugin;
  workspace: WorkspaceSettings;
  isNew: boolean;
  onSave: (workspace: WorkspaceSettings) => void;

  // Form state
  private nameInput!: TextComponent;
  private desktopViewDropdown!: DropdownComponent;
  private mobileViewDropdown!: DropdownComponent;
  private defaultDateInput!: TextComponent;
  private visibleCalendarsContainer!: HTMLElement;
  private categoryFilterContainer!: HTMLElement;
  private businessHoursToggle!: ToggleComponent;
  private businessHoursContainer!: HTMLElement;
  private timelineExpandedToggle!: ToggleComponent;

  constructor(
    plugin: FullCalendarPlugin,
    workspace: WorkspaceSettings,
    isNew: boolean,
    onSave: (workspace: WorkspaceSettings) => void
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.workspace = { ...workspace }; // Create a copy to avoid mutating original
    this.isNew = isNew;
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.parentElement?.addClass('ofc-settings-modal-wide');
    contentEl.parentElement?.addClass('ofc-workspace-settings-modal');

    const shell = contentEl.createDiv({
      cls: 'ofc-settings-modal-shell ofc-workspace-settings-shell'
    });
    const body = shell.createDiv({ cls: 'ofc-settings-modal-body ofc-workspace-settings-body' });

    // Modal title
    body.createEl('h2', {
      text: this.isNew ? t('modals.workspace.title.create') : t('modals.workspace.title.edit')
    });

    this.renderGeneralSection(body);
    this.renderViewSection(body);
    this.renderCalendarFilterSection(body);
    this.renderCategoryFilterSection(body);
    this.renderAdvancedBasesSection(body);
    this.renderAppearanceSection(body);

    const footer = shell.createEl('footer', {
      cls: 'ofc-settings-modal-footer ofc-workspace-settings-footer'
    });
    this.renderButtons(footer);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.parentElement?.removeClass('ofc-settings-modal-wide');
    contentEl.parentElement?.removeClass('ofc-workspace-settings-modal');
    contentEl.empty();
  }

  private renderGeneralSection(containerEl: HTMLElement) {
    const section = containerEl.createDiv({ cls: 'ofc-workspace-modal-section' });
    section.createEl('h3', { text: t('modals.workspace.sections.general') });

    // Workspace name
    new Setting(section)
      .setName(t('modals.workspace.fields.name.label'))
      .setDesc(t('modals.workspace.fields.name.description'))
      .addText(text => {
        this.nameInput = text;
        text
          .setPlaceholder(t('modals.workspace.fields.name.placeholder'))
          .setValue(this.workspace.name || '')
          .onChange(value => {
            this.workspace.name = value;
          });
      });
  }

  private renderViewSection(containerEl: HTMLElement) {
    const section = containerEl.createDiv({ cls: 'ofc-workspace-modal-section' });
    section.createEl('h3', { text: t('modals.workspace.sections.viewConfiguration') });

    // Desktop view
    const desktopViewOptions: { [key: string]: string } = {
      '': t('modals.workspace.fields.desktopView.label'),
      timeGridDay: t('settings.viewOptions.day'),
      timeGridWeek: t('settings.viewOptions.week'),
      dayGridMonth: t('settings.viewOptions.month'),
      listWeek: t('settings.viewOptions.list')
    };

    if (PluginState.getSettings().enableAdvancedCategorization) {
      desktopViewOptions['resourceTimelineWeek'] = t('settings.viewOptions.timelineWeek');
      desktopViewOptions['resourceTimelineDay'] = t('settings.viewOptions.timelineDay');
    }

    new Setting(section)
      .setName(t('modals.workspace.fields.desktopView.label'))
      .setDesc(t('modals.workspace.fields.desktopView.description'))
      .addDropdown(dropdown => {
        this.desktopViewDropdown = dropdown;
        Object.entries(desktopViewOptions).forEach(([value, display]) => {
          dropdown.addOption(value, display);
        });
        dropdown.setValue(this.workspace.defaultView?.desktop || '');
        dropdown.onChange(value => {
          if (!this.workspace.defaultView) this.workspace.defaultView = {};
          this.workspace.defaultView.desktop = value || undefined;
        });
      });

    // Mobile view
    const mobileViewOptions: { [key: string]: string } = {
      '': t('modals.workspace.fields.desktopView.label'),
      dayGridMonth: t('settings.viewOptions.month'),
      timeGrid3Days: t('settings.viewOptions.threeDays'),
      timeGridDay: t('settings.viewOptions.day'),
      listWeek: t('settings.viewOptions.list')
    };

    new Setting(section)
      .setName(t('modals.workspace.fields.mobileView.label'))
      .setDesc(t('modals.workspace.fields.mobileView.description'))
      .addDropdown(dropdown => {
        this.mobileViewDropdown = dropdown;
        Object.entries(mobileViewOptions).forEach(([value, display]) => {
          dropdown.addOption(value, display);
        });
        dropdown.setValue(this.workspace.defaultView?.mobile || '');
        dropdown.onChange(value => {
          if (!this.workspace.defaultView) this.workspace.defaultView = {};
          this.workspace.defaultView.mobile = value || undefined;
        });
      });

    // Default date
    new Setting(section)
      .setName(t('modals.workspace.fields.defaultDate.label'))
      .setDesc(t('modals.workspace.fields.defaultDate.description'))
      .addText(text => {
        this.defaultDateInput = text;
        text
          .setPlaceholder(t('modals.workspace.fields.defaultDate.placeholder'))
          .setValue(this.workspace.defaultDate || '')
          .onChange(value => {
            this.workspace.defaultDate = value || undefined;
          });
      });
  }

  private renderCalendarFilterSection(containerEl: HTMLElement) {
    const section = containerEl.createDiv({ cls: 'ofc-workspace-modal-section' });
    section.createEl('h3', { text: t('modals.workspace.sections.calendarFilters') });

    // Get available calendars
    const calendars = PluginState.getProviderRegistry().getAllSources();

    if (calendars.length === 0) {
      section.createEl('p', {
        text: t('modals.workspace.fields.visibleCalendars.noCalendars')
      });
      return;
    }

    // Visible calendars
    new Setting(section)
      .setName(t('modals.workspace.fields.visibleCalendars.label'))
      .setDesc(t('modals.workspace.fields.visibleCalendars.description'))
      .setClass('ofc-workspace-calendar-filter');

    this.visibleCalendarsContainer = section.createDiv({
      cls: 'ofc-workspace-calendar-checkboxes'
    });
    this.renderCalendarCheckboxes(this.visibleCalendarsContainer, calendars);

    // Default calendar for new events, overriding the global setting.
    new Setting(section)
      .setName(t('modals.workspace.fields.defaultCalendar.label'))
      .setDesc(t('modals.workspace.fields.defaultCalendar.description'))
      .addDropdown(dropdown => {
        dropdown.addOption('', t('modals.workspace.fields.defaultCalendar.options.useDefault'));
        listWritableCalendars().forEach(calendar => {
          dropdown.addOption(calendar.id, calendar.name || calendar.id);
        });

        dropdown.setValue(this.workspace.defaultCalendarId ?? '');
        dropdown.onChange(value => {
          this.workspace.defaultCalendarId = value === '' ? undefined : value;
        });
      });
  }

  private renderCalendarCheckboxes(container: HTMLElement, calendars: CalendarInfo[]) {
    const selectedIds = new Set((this.workspace.visibleCalendars || []).map(String));

    calendars.forEach(calendar => {
      const checkboxContainer = container.createDiv({ cls: 'ofc-workspace-checkbox-item' });

      // Show labels in the format "<calendar type>: <user-defined name>"
      let displayName: string;
      switch (calendar.type) {
        case 'local':
          displayName = `${t('modals.workspace.calendarTypes.local')} ${calendar.name}`;
          break;
        case 'dailynote':
          displayName = `${t('modals.workspace.calendarTypes.dailyNotes')} ${calendar.name}`;
          break;
        case 'journals':
          displayName = calendar.name;
          break;
        case 'ical':
          displayName = `${t('modals.workspace.calendarTypes.ics')} ${calendar.name}`;
          break;
        case 'caldav':
          displayName = `${t('modals.workspace.calendarTypes.caldav')} ${calendar.name}`;
          break;
        case 'google':
          displayName = `${t('modals.workspace.calendarTypes.google')} ${calendar.name}`;
          break;
        case 'outlook':
          displayName = `${t('modals.workspace.calendarTypes.outlook')} ${calendar.name}`;
          break;
        default:
          displayName = `${calendar.type}: ${calendar.name || calendar.id}`;
      }

      new Setting(checkboxContainer).setName(displayName).addToggle(toggle => {
        const settingsId = String(calendar.id);
        toggle.setValue(selectedIds.has(settingsId));

        toggle.onChange(checked => {
          const currentSelected = new Set((this.workspace.visibleCalendars || []).map(String));
          if (checked) {
            currentSelected.add(settingsId);
          } else {
            currentSelected.delete(settingsId);
          }
          const newList = Array.from(currentSelected);
          this.workspace.visibleCalendars = newList.length > 0 ? newList : undefined;
        });
      });
    });
  }

  private renderCategoryFilterSection(containerEl: HTMLElement) {
    const section = containerEl.createDiv({ cls: 'ofc-workspace-modal-section' });
    section.createEl('h3', { text: t('modals.workspace.sections.categoryFilters') });

    if (!PluginState.getSettings().enableAdvancedCategorization) {
      section.createEl('p', {
        text: t('modals.workspace.fields.categories.requiresAdvanced')
      });
      return;
    }

    // Ensure there is always a category filter object; empty selection means show all
    if (!this.workspace.categoryFilter) {
      this.workspace.categoryFilter = { mode: 'show-only', categories: [] };
    }

    // Category filter mode
    new Setting(section)
      .setName(t('modals.workspace.fields.categoryFilterMode.label'))
      .setDesc(t('modals.workspace.fields.categoryFilterMode.description'))
      .addDropdown(dropdown => {
        dropdown.addOption(
          'show-only',
          t('modals.workspace.fields.categoryFilterMode.options.showOnly')
        );
        dropdown.addOption('hide', t('modals.workspace.fields.categoryFilterMode.options.hide'));

        dropdown.setValue(this.workspace.categoryFilter?.mode ?? 'show-only');
        dropdown.onChange(value => {
          // Mode is always defined now; empty categories means show-all implicitly
          this.workspace.categoryFilter = this.workspace.categoryFilter || {
            mode: 'show-only',
            categories: []
          };
          this.workspace.categoryFilter.mode = value as 'show-only' | 'hide';
          this.renderCategoryCheckboxes();
        });
      });

    // Hint for selection semantics
    new Setting(section)
      .setName(t('modals.workspace.fields.categories.label'))
      .setDesc(t('modals.workspace.fields.categories.description'));

    this.categoryFilterContainer = section.createDiv({
      cls: 'ofc-workspace-category-checkboxes'
    });
    this.renderCategoryCheckboxes();
  }

  private renderCategoryCheckboxes() {
    this.categoryFilterContainer.empty();
    // Ensure filter object exists so checkboxes always render
    if (!this.workspace.categoryFilter) {
      this.workspace.categoryFilter = { mode: 'show-only', categories: [] };
    }

    const categories = PluginState.getSettings().categorySettings;
    if (categories.length === 0) {
      this.categoryFilterContainer.createEl('p', {
        text: t('modals.workspace.fields.categories.noCategories')
      });
      return;
    }

    categories.forEach(category => {
      const checkboxContainer = this.categoryFilterContainer.createDiv({
        cls: 'ofc-workspace-checkbox-item'
      });

      new Setting(checkboxContainer).setName(category.name).addToggle(toggle => {
        toggle.setValue((this.workspace.categoryFilter?.categories || []).includes(category.name));
        toggle.onChange(checked => {
          if (!this.workspace.categoryFilter) return;

          const current = this.workspace.categoryFilter.categories || [];
          if (checked) {
            if (!current.includes(category.name)) {
              this.workspace.categoryFilter.categories = [...current, category.name];
            }
          } else {
            this.workspace.categoryFilter.categories = current.filter(
              name => name !== category.name
            );
          }
        });
      });
    });
  }

  private renderAdvancedBasesSection(containerEl: HTMLElement) {
    const section = containerEl.createDiv({ cls: 'ofc-workspace-modal-section' });
    section.createEl('h3', { text: t('modals.workspace.sections.advancedBases') });

    new Setting(section)
      .setName(t('modals.workspace.fields.basisQueryPath.label'))
      .setDesc(t('modals.workspace.fields.basisQueryPath.description'))
      .addText(text => {
        text
          .setPlaceholder('e.g., queries/work.base')
          .setValue(this.workspace.basisQueryPath || '')
          .onChange(value => {
            this.workspace.basisQueryPath = value.trim() || undefined;
          });
      });
  }

  private renderAppearanceSection(containerEl: HTMLElement) {
    const section = containerEl.createDiv({ cls: 'ofc-workspace-modal-section' });
    section.createEl('h3', { text: t('modals.workspace.sections.appearanceOverrides') });

    // Business hours override
    new Setting(section)
      .setName(t('modals.workspace.fields.overrideBusinessHours.label'))
      .setDesc(t('modals.workspace.fields.overrideBusinessHours.description'))
      .addToggle(toggle => {
        this.businessHoursToggle = toggle;
        const hasOverride = !!this.workspace.businessHours;
        toggle.setValue(hasOverride);
        toggle.onChange(value => {
          if (value) {
            // Initialize with default business hours if enabling
            this.workspace.businessHours = {
              enabled: true,
              daysOfWeek: [1, 2, 3, 4, 5], // Monday to Friday
              startTime: '09:00',
              endTime: '17:00'
            };
          } else {
            this.workspace.businessHours = undefined;
          }
          this.renderBusinessHoursDetails();
        });
      });

    this.businessHoursContainer = section.createDiv({
      cls: 'ofc-workspace-business-hours-details'
    });
    this.renderBusinessHoursDetails();

    // Timeline expanded
    if (PluginState.getSettings().enableAdvancedCategorization) {
      new Setting(section)
        .setName(t('modals.workspace.fields.timelineCategories.label'))
        .setDesc(t('modals.workspace.fields.timelineCategories.description'))
        .addDropdown(dropdown => {
          dropdown.addOption(
            '',
            t('modals.workspace.fields.timelineCategories.options.useDefault')
          );
          dropdown.addOption(
            'true',
            t('modals.workspace.fields.timelineCategories.options.expanded')
          );
          dropdown.addOption(
            'false',
            t('modals.workspace.fields.timelineCategories.options.collapsed')
          );

          const currentValue = this.workspace.timelineExpanded;
          dropdown.setValue(currentValue === undefined ? '' : currentValue.toString());
          dropdown.onChange(value => {
            this.workspace.timelineExpanded = value === '' ? undefined : value === 'true';
          });
        });
    }

    // Add separator
    section.createEl('hr', { cls: 'ofc-workspace-modal-separator' });
    section.createEl('h4', { text: t('modals.workspace.sections.viewClipping') });

    // Visible time range - Start time
    new Setting(section)
      .setName(t('modals.workspace.fields.slotMinTime.label'))
      .setDesc(t('modals.workspace.fields.slotMinTime.description'))
      .addText(text => {
        text
          .setPlaceholder(t('modals.workspace.fields.slotMinTime.placeholder'))
          .setValue(this.workspace.slotMinTime || '')
          .onChange(value => {
            const trimmed = value.trim();
            if (!trimmed) {
              // Cleared — remove override so global setting takes effect
              this.workspace.slotMinTime = undefined;
              return;
            }
            // Validate HH:mm format (hours 00–23)
            if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(trimmed)) {
              return;
            }
            // Cross-field invariant: must be strictly before slotMaxTime when
            // both are set (workspace overrides only — global fallback not checked here)
            const currentMax = this.workspace.slotMaxTime;
            if (currentMax && trimmed >= currentMax) {
              console.warn(
                `[FCR] Workspace slotMinTime (${trimmed}) must be earlier than slotMaxTime (${currentMax}). Value not saved.`
              );
              return;
            }
            this.workspace.slotMinTime = trimmed;
          });
      });

    // Visible time range - End time
    // Note: placeholder key is slotMaxTime (was previously slotMinTime — copy-paste bug fixed)
    new Setting(section)
      .setName(t('modals.workspace.fields.slotMaxTime.label'))
      .setDesc(t('modals.workspace.fields.slotMaxTime.description'))
      .addText(text => {
        text
          .setPlaceholder(t('modals.workspace.fields.slotMaxTime.placeholder'))
          .setValue(this.workspace.slotMaxTime || '')
          .onChange(value => {
            const trimmed = value.trim();
            if (!trimmed) {
              // Cleared — remove override so global setting takes effect
              this.workspace.slotMaxTime = undefined;
              return;
            }
            // Validate HH:mm or 24:00 format
            if (!/^([01]?[0-9]|2[0-4]):[0-5][0-9]$/.test(trimmed)) {
              return;
            }
            // Cross-field invariant: must be strictly after slotMinTime when both set
            const currentMin = this.workspace.slotMinTime;
            if (currentMin && trimmed <= currentMin) {
              console.warn(
                `[FCR] Workspace slotMaxTime (${trimmed}) must be later than slotMinTime (${currentMin}). Value not saved.`
              );
              return;
            }
            this.workspace.slotMaxTime = trimmed;
          });
      });

    // Weekend visibility
    new Setting(section)
      .setName(t('modals.workspace.fields.weekendDisplay.label'))
      .setDesc(t('modals.workspace.fields.weekendDisplay.description'))
      .addDropdown(dropdown => {
        dropdown.addOption('', t('modals.workspace.fields.slotMinTime.placeholder'));
        dropdown.addOption('true', t('modals.workspace.fields.weekendDisplay.options.show'));
        dropdown.addOption('false', t('modals.workspace.fields.weekendDisplay.options.hide'));

        const currentValue = this.workspace.weekends;
        dropdown.setValue(currentValue === undefined ? '' : currentValue.toString());
        dropdown.onChange(value => {
          this.workspace.weekends = value === '' ? undefined : value === 'true';
        });
      });

    // Hidden days
    new Setting(section)
      .setName(t('modals.workspace.fields.hiddenDays.label'))
      .setDesc(t('modals.workspace.fields.hiddenDays.description'))
      .addDropdown(dropdown => {
        dropdown.addOption('', t('modals.workspace.fields.slotMinTime.placeholder'));
        dropdown.addOption('[]', t('modals.workspace.fields.hiddenDays.options.showAll'));
        dropdown.addOption('[0,6]', t('modals.workspace.fields.hiddenDays.options.hideWeekends'));
        dropdown.addOption('[0]', t('modals.workspace.fields.hiddenDays.options.hideSunday'));
        dropdown.addOption('[6]', t('modals.workspace.fields.hiddenDays.options.hideSaturday'));
        dropdown.addOption('[1]', t('modals.workspace.fields.hiddenDays.options.hideMonday'));
        dropdown.addOption('[5]', t('modals.workspace.fields.hiddenDays.options.hideFriday'));

        const currentValue = this.workspace.hiddenDays;
        const dropdownValue = currentValue === undefined ? '' : JSON.stringify(currentValue);
        dropdown.setValue(dropdownValue);
        dropdown.onChange(value => {
          if (value === '') {
            this.workspace.hiddenDays = undefined;
          } else {
            try {
              this.workspace.hiddenDays = JSON.parse(value) as number[];
            } catch {
              // Invalid JSON, keep current value
            }
          }
        });
      });

    // Max events per day (for month view)
    new Setting(section)
      .setName(t('modals.workspace.fields.dayMaxEvents.label'))
      .setDesc(t('modals.workspace.fields.dayMaxEvents.description'))
      .addDropdown(dropdown => {
        dropdown.addOption('', t('modals.workspace.fields.slotMinTime.placeholder'));
        dropdown.addOption('false', t('modals.workspace.fields.dayMaxEvents.options.useDefault'));
        dropdown.addOption('true', t('modals.workspace.fields.dayMaxEvents.options.noLimit'));
        dropdown.addOption('1', t('modals.workspace.fields.dayMaxEvents.options.one'));
        dropdown.addOption('2', t('modals.workspace.fields.dayMaxEvents.options.two'));
        dropdown.addOption('3', t('modals.workspace.fields.dayMaxEvents.options.three'));
        dropdown.addOption('4', t('modals.workspace.fields.dayMaxEvents.options.four'));
        dropdown.addOption('5', t('modals.workspace.fields.dayMaxEvents.options.five'));
        dropdown.addOption('10', t('modals.workspace.fields.dayMaxEvents.options.ten'));

        const currentValue = this.workspace.dayMaxEvents;
        const dropdownValue = currentValue === undefined ? '' : currentValue.toString();
        dropdown.setValue(dropdownValue);
        dropdown.onChange(value => {
          if (value === '') {
            this.workspace.dayMaxEvents = undefined;
          } else if (value === 'true') {
            this.workspace.dayMaxEvents = true;
          } else if (value === 'false') {
            this.workspace.dayMaxEvents = false;
          } else {
            this.workspace.dayMaxEvents = parseInt(value);
          }
        });
      });
  }

  private renderBusinessHoursDetails() {
    this.businessHoursContainer.empty();

    if (!this.workspace.businessHours) return;

    // Enabled toggle
    new Setting(this.businessHoursContainer)
      .setName(t('modals.workspace.fields.enableBusinessHours.label'))
      .setDesc(t('modals.workspace.fields.enableBusinessHours.description'))
      .addToggle(toggle => {
        toggle.setValue(this.workspace.businessHours?.enabled || false);
        toggle.onChange(value => {
          if (this.workspace.businessHours) {
            this.workspace.businessHours.enabled = value;
            this.renderBusinessHoursDetails(); // Re-render to show/hide dependent settings
          }
        });
      })
      .settingEl.addClass('ofc-indented-setting');

    if (this.workspace.businessHours.enabled) {
      // Business days
      new Setting(this.businessHoursContainer)
        .setName(t('modals.workspace.fields.businessDays.label'))
        .setDesc(t('modals.workspace.fields.businessDays.description'))
        .addDropdown(dropdown => {
          dropdown
            .addOption('1,2,3,4,5', t('settings.appearance.businessHours.options.mondayFriday'))
            .addOption('0,1,2,3,4,5,6', t('settings.appearance.businessHours.options.everyDay'))
            .addOption('1,2,3,4', t('settings.appearance.businessHours.options.mondayThursday'))
            .addOption('2,3,4,5,6', t('settings.appearance.businessHours.options.tuesdaySaturday'));

          const currentDays = this.workspace.businessHours?.daysOfWeek.join(',') || '1,2,3,4,5';
          dropdown.setValue(currentDays);
          dropdown.onChange(value => {
            if (this.workspace.businessHours) {
              this.workspace.businessHours.daysOfWeek = value.split(',').map(Number);
            }
          });
        })
        .settingEl.addClass('ofc-indented-setting');

      // Start time
      new Setting(this.businessHoursContainer)
        .setName(t('modals.workspace.fields.businessHoursStart.label'))
        .setDesc(t('modals.workspace.fields.businessHoursStart.description'))
        .addText(text => {
          text.setValue(this.workspace.businessHours?.startTime || '09:00');
          text.onChange(value => {
            if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value) && this.workspace.businessHours) {
              this.workspace.businessHours.startTime = value;
            }
          });
        })
        .settingEl.addClass('ofc-indented-setting');

      // End time
      new Setting(this.businessHoursContainer)
        .setName(t('modals.workspace.fields.businessHoursEnd.label'))
        .setDesc(t('modals.workspace.fields.businessHoursEnd.description'))
        .addText(text => {
          text.setValue(this.workspace.businessHours?.endTime || '17:00');
          text.onChange(value => {
            if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value) && this.workspace.businessHours) {
              this.workspace.businessHours.endTime = value;
            }
          });
        })
        .settingEl.addClass('ofc-indented-setting');
    }
  }

  private renderButtons(containerEl: HTMLElement) {
    const buttonContainer = containerEl.createDiv({ cls: 'ofc-workspace-modal-buttons' });

    // Cancel button
    buttonContainer.createEl('button', { text: t('modals.workspace.buttons.cancel') }, button => {
      button.addEventListener('click', () => {
        this.close();
      });
    });

    // Save button
    buttonContainer.createEl(
      'button',
      {
        text: this.isNew
          ? t('modals.workspace.buttons.create')
          : t('modals.workspace.buttons.save'),
        cls: 'mod-cta'
      },
      button => {
        button.addEventListener('click', () => {
          if (this.validateWorkspace()) {
            // Normalization to runtime IDs is no longer needed.
            if (this.workspace.categoryFilter) {
              const deduped = Array.from(new Set(this.workspace.categoryFilter.categories || []));
              this.workspace.categoryFilter.categories = deduped;
            }

            this.onSave(this.workspace);
            this.close();
          }
        });
      }
    );
  }

  private validateWorkspace(): boolean {
    if (!this.workspace.name || this.workspace.name.trim() === '') {
      // Focus the name input if it's empty
      this.nameInput.inputEl.focus();
      return false;
    }

    // Ensure we have a valid ID
    if (!this.workspace.id) {
      this.workspace.id = generateWorkspaceId();
    }

    return true;
  }
}
