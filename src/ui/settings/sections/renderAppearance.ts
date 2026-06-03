/**
 * @file renderAppearance.ts
 * @brief Renders the appearance-related settings section.
 * @license See LICENSE.md
 */

import { PluginState } from '../../../core/PluginState';
import { Setting } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { t } from '../../../features/i18n/i18n';
import { createDescWithDocs, createDocsLinksFragment } from '../docsLinks';

const WEEKDAYS_KEYS = [
  'settings.weekdays.sunday',
  'settings.weekdays.monday',
  'settings.weekdays.tuesday',
  'settings.weekdays.wednesday',
  'settings.weekdays.thursday',
  'settings.weekdays.friday',
  'settings.weekdays.saturday'
];

export function renderAppearanceSettings(
  containerEl: HTMLElement,
  _plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  new Setting(containerEl)
    .setName(t('settings.appearance.title'))
    .setHeading()
    .setDesc(
      createDocsLinksFragment([
        { text: 'Display and behavior', path: 'user/settings/fc_config' },
        { text: 'Views guide', path: 'user/views/' }
      ])
    );

  new Setting(containerEl)
    .setName(t('settings.appearance.firstDay.label'))
    .setDesc(
      createDescWithDocs(t('settings.appearance.firstDay.description'), [
        { text: 'Display and behavior', path: 'user/settings/fc_config' }
      ])
    )
    .addDropdown(dropdown => {
      WEEKDAYS_KEYS.forEach((dayKey, code) => {
        dropdown.addOption(code.toString(), t(dayKey));
      });
      dropdown.setValue(PluginState.getSettings().firstDay.toString());
      dropdown.onChange(async codeAsString => {
        PluginState.getSettings().firstDay = Number(codeAsString);
        await PluginState.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName(t('settings.appearance.timeFormat24h.label'))
    .setDesc(
      createDescWithDocs(t('settings.appearance.timeFormat24h.description'), [
        { text: 'Display and behavior', path: 'user/settings/fc_config' }
      ])
    )
    .addToggle(toggle => {
      toggle.setValue(PluginState.getSettings().timeFormat24h);
      toggle.onChange(async val => {
        PluginState.getSettings().timeFormat24h = val;
        await PluginState.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName(t('settings.appearance.milestones.label'))
    .setDesc(
      createDescWithDocs(t('settings.appearance.milestones.description'), [
        { text: 'Milestones guide', path: 'user/features/milestones/' }
      ])
    )
    .addExtraButton(button => {
      button
        .setIcon('gear')
        .setTooltip(t('settings.appearance.milestones.openButton'))
        .onClick(() => {
          PluginState.showMilestones();
        });
    });

  new Setting(containerEl)
    .setName('Enable monthly milestones report')
    .setDesc(
      'Periodically generate a beautiful usage statistics and milestones note at the start of each month.'
    )
    .addToggle(toggle => {
      toggle.setValue(PluginState.getSettings().enableMonthlyStatsReport);
      toggle.onChange(async val => {
        PluginState.getSettings().enableMonthlyStatsReport = val;
        await PluginState.saveSettings();
      });
    });

  // Business Hours Settings
  new Setting(containerEl)
    .setName(t('settings.appearance.businessHours.enable.label'))
    .setDesc(
      createDescWithDocs(t('settings.appearance.businessHours.enable.description'), [
        { text: 'Display and behavior', path: 'user/settings/fc_config' }
      ])
    )
    .addToggle(toggle => {
      toggle.setValue(PluginState.getSettings().businessHours.enabled);
      toggle.onChange(async val => {
        PluginState.getSettings().businessHours.enabled = val;
        await PluginState.saveSettings();
        rerender(); // This will show/hide the indented settings
      });
    });

  if (PluginState.getSettings().businessHours.enabled) {
    new Setting(containerEl)
      .setName(t('settings.appearance.businessHours.days.label'))
      .setDesc(t('settings.appearance.businessHours.days.description'))
      .addDropdown(dropdown => {
        dropdown
          .addOption('1,2,3,4,5', t('settings.appearance.businessHours.options.mondayFriday'))
          .addOption('0,1,2,3,4,5,6', t('settings.appearance.businessHours.options.everyDay'))
          .addOption('1,2,3,4', t('settings.appearance.businessHours.options.mondayThursday'))
          .addOption('2,3,4,5,6', t('settings.appearance.businessHours.options.tuesdaySaturday'));

        const currentDays = PluginState.getSettings().businessHours.daysOfWeek.join(',');
        dropdown.setValue(currentDays);
        dropdown.onChange(async value => {
          PluginState.getSettings().businessHours.daysOfWeek = value.split(',').map(Number);
          await PluginState.saveSettings();
        });
      })
      .settingEl.addClass('ofc-indented-setting');

    new Setting(containerEl)
      .setName(t('settings.appearance.businessHours.startTime.label'))
      .setDesc(t('settings.appearance.businessHours.startTime.description'))
      .addText(text => {
        text.setValue(PluginState.getSettings().businessHours.startTime);
        text.onChange(async value => {
          // Basic validation for time format
          if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
            PluginState.getSettings().businessHours.startTime = value;
            await PluginState.saveSettings();
          }
        });
      })
      .settingEl.addClass('ofc-indented-setting');

    new Setting(containerEl)
      .setName(t('settings.appearance.businessHours.endTime.label'))
      .setDesc(t('settings.appearance.businessHours.endTime.description'))
      .addText(text => {
        text.setValue(PluginState.getSettings().businessHours.endTime);
        text.onChange(async value => {
          // Basic validation for time format
          if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
            PluginState.getSettings().businessHours.endTime = value;
            await PluginState.saveSettings();
          }
        });
      })
      .settingEl.addClass('ofc-indented-setting');
  }

  // New granular view configuration section
  new Setting(containerEl)
    .setName(t('settings.appearance.viewTimeRange.title'))
    .setHeading()
    .setDesc(
      createDocsLinksFragment([{ text: 'Display and behavior', path: 'user/settings/fc_config' }])
    );

  new Setting(containerEl)
    .setName(t('settings.appearance.viewTimeRange.slotMinTime.label'))
    .setDesc(t('settings.appearance.viewTimeRange.slotMinTime.description'))
    .addText(text => {
      text.setValue(PluginState.getSettings().slotMinTime || '00:00');
      text.onChange(async value => {
        // Basic validation for time format
        if (/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
          PluginState.getSettings().slotMinTime = value;
          await PluginState.saveSettings();
        }
      });
    });

  new Setting(containerEl)
    .setName(t('settings.appearance.viewTimeRange.slotMaxTime.label'))
    .setDesc(t('settings.appearance.viewTimeRange.slotMaxTime.description'))
    .addText(text => {
      text.setValue(PluginState.getSettings().slotMaxTime || '24:00');
      text.onChange(async value => {
        // Basic validation for time format (allow 24:00)
        if (/^([01]?[0-9]|2[0-4]):[0-5][0-9]$/.test(value)) {
          PluginState.getSettings().slotMaxTime = value;
          await PluginState.saveSettings();
        }
      });
    });

  new Setting(containerEl)
    .setName(t('settings.appearance.viewTimeRange.allDaySlot.label'))
    .setDesc(t('settings.appearance.viewTimeRange.allDaySlot.description'))
    .addToggle(toggle => {
      toggle.setValue(PluginState.getSettings().allDaySlot ?? true);
      toggle.onChange(async val => {
        PluginState.getSettings().allDaySlot = val;
        await PluginState.saveSettings();
        rerender();
      });
    });

  new Setting(containerEl)
    .setName(t('settings.appearance.viewTimeRange.timeGridDayHeaderFormat.label'))
    .setDesc(t('settings.appearance.viewTimeRange.timeGridDayHeaderFormat.description'))
    .addDropdown(dropdown => {
      dropdown.addOption(
        'ddmm-day',
        t('settings.appearance.viewTimeRange.timeGridDayHeaderFormat.options.ddmmDay')
      );
      dropdown.addOption(
        'mmdd-day',
        t('settings.appearance.viewTimeRange.timeGridDayHeaderFormat.options.mmddDay')
      );
      dropdown.addOption(
        'day-ddmm',
        t('settings.appearance.viewTimeRange.timeGridDayHeaderFormat.options.dayDdmm')
      );
      dropdown.addOption(
        'day-mmdd',
        t('settings.appearance.viewTimeRange.timeGridDayHeaderFormat.options.dayMmdd')
      );
      dropdown.addOption(
        'ddmmyyyy-day',
        t('settings.appearance.viewTimeRange.timeGridDayHeaderFormat.options.ddmmyyyyDay')
      );
      dropdown.addOption(
        'mmddyyyy-day',
        t('settings.appearance.viewTimeRange.timeGridDayHeaderFormat.options.mmddyyyyDay')
      );

      dropdown.setValue(PluginState.getSettings().timeGridDayHeaderFormat || 'day-mmdd');
      dropdown.onChange(async value => {
        PluginState.getSettings().timeGridDayHeaderFormat = value;
        await PluginState.saveSettings();
        rerender();
      });
    });

  new Setting(containerEl)
    .setName(t('settings.appearance.dayVisibility.title'))
    .setHeading()
    .setDesc(
      createDocsLinksFragment([{ text: 'Display and behavior', path: 'user/settings/fc_config' }])
    );

  new Setting(containerEl)
    .setName(t('settings.appearance.dayVisibility.weekends.label'))
    .setDesc(t('settings.appearance.dayVisibility.weekends.description'))
    .addToggle(toggle => {
      toggle.setValue(PluginState.getSettings().weekends ?? true);
      toggle.onChange(async val => {
        PluginState.getSettings().weekends = val;
        await PluginState.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName(t('settings.appearance.dayVisibility.hiddenDays.label'))
    .setDesc(t('settings.appearance.dayVisibility.hiddenDays.description'))
    .addDropdown(dropdown => {
      dropdown.addOption('[]', t('settings.appearance.dayVisibility.hiddenDays.options.showAll'));
      dropdown.addOption(
        '[0,6]',
        t('settings.appearance.dayVisibility.hiddenDays.options.hideWeekends')
      );
      dropdown.addOption(
        '[0]',
        t('settings.appearance.dayVisibility.hiddenDays.options.hideSunday')
      );
      dropdown.addOption(
        '[6]',
        t('settings.appearance.dayVisibility.hiddenDays.options.hideSaturday')
      );
      dropdown.addOption(
        '[1]',
        t('settings.appearance.dayVisibility.hiddenDays.options.hideMonday')
      );
      dropdown.addOption(
        '[2]',
        t('settings.appearance.dayVisibility.hiddenDays.options.hideTuesday')
      );
      dropdown.addOption(
        '[3]',
        t('settings.appearance.dayVisibility.hiddenDays.options.hideWednesday')
      );
      dropdown.addOption(
        '[4]',
        t('settings.appearance.dayVisibility.hiddenDays.options.hideThursday')
      );
      dropdown.addOption(
        '[5]',
        t('settings.appearance.dayVisibility.hiddenDays.options.hideFriday')
      );

      const currentValue = JSON.stringify(PluginState.getSettings().hiddenDays || []);
      dropdown.setValue(currentValue);
      dropdown.onChange(async value => {
        try {
          PluginState.getSettings().hiddenDays = JSON.parse(value) as number[];
          await PluginState.saveSettings();
        } catch {
          // Invalid JSON, keep current value
        }
      });
    });

  new Setting(containerEl)
    .setName(t('settings.appearance.dayMaxEvents.label'))
    .setDesc(
      createDescWithDocs(t('settings.appearance.dayMaxEvents.description'), [
        { text: 'Display and behavior', path: 'user/settings/fc_config' }
      ])
    )
    .addDropdown(dropdown => {
      dropdown.addOption('false', t('settings.appearance.dayMaxEvents.options.default'));
      dropdown.addOption('true', t('settings.appearance.dayMaxEvents.options.unlimited'));
      dropdown.addOption('1', t('settings.appearance.dayMaxEvents.options.one'));
      dropdown.addOption('2', t('settings.appearance.dayMaxEvents.options.two'));
      dropdown.addOption('3', t('settings.appearance.dayMaxEvents.options.three'));
      dropdown.addOption('4', t('settings.appearance.dayMaxEvents.options.four'));
      dropdown.addOption('5', t('settings.appearance.dayMaxEvents.options.five'));
      dropdown.addOption('10', t('settings.appearance.dayMaxEvents.options.ten'));

      const currentValue = (PluginState.getSettings().dayMaxEvents ?? false).toString();
      dropdown.setValue(currentValue);
      dropdown.onChange(async value => {
        if (value === 'true') {
          PluginState.getSettings().dayMaxEvents = true;
        } else if (value === 'false') {
          PluginState.getSettings().dayMaxEvents = false;
        } else {
          PluginState.getSettings().dayMaxEvents = parseInt(value);
        }
        await PluginState.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName(t('settings.appearance.enableBackgroundEvents.label'))
    .setDesc(
      createDescWithDocs(t('settings.appearance.enableBackgroundEvents.description'), [
        { text: 'Display and behavior', path: 'user/settings/fc_config' }
      ])
    )
    .addToggle(toggle => {
      toggle.setValue(PluginState.getSettings().enableBackgroundEvents);
      toggle.onChange(async val => {
        PluginState.getSettings().enableBackgroundEvents = val;
        await PluginState.saveSettings();
      });
    });

  // Show current event in status bar toggle
  new Setting(containerEl)
    .setName(t('settings.appearance.showEventInStatusBar.label'))
    .setDesc(
      createDescWithDocs(t('settings.appearance.showEventInStatusBar.description'), [
        { text: 'Display and behavior', path: 'user/settings/fc_config' }
      ])
    )
    .addToggle(toggle => {
      toggle.setValue(PluginState.getSettings().showEventInStatusBar);
      toggle.onChange(async val => {
        PluginState.getSettings().showEventInStatusBar = val;
        await PluginState.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName(t('settings.appearance.highlightCurrentOrNextEvent'))
    .setDesc(
      createDescWithDocs(t('settings.appearance.highlightCurrentOrNextEventDesc'), [
        { text: 'Display and behavior', path: 'user/settings/fc_config' }
      ])
    )
    .addToggle(toggle => {
      toggle.setValue(PluginState.getSettings().highlightCurrentOrNextEvent ?? true);
      toggle.onChange(async val => {
        PluginState.getSettings().highlightCurrentOrNextEvent = val;
        await PluginState.saveSettings();
        rerender();
      });
    });
}
