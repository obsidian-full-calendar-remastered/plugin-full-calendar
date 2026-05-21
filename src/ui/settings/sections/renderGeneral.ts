/**
 * @file renderGeneral.ts
 * @brief Renders the general settings section of the plugin settings tab.
 * @license See LICENSE.md
 */

import { PluginState } from '../../../core/PluginState';
import { Setting } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { t } from '../../../features/i18n/i18n';
import { createDescWithDocs } from '../docsLinks';

const INITIAL_VIEW_OPTIONS = {
  DESKTOP: {
    timeGridDay: 'settings.viewOptions.day',
    timeGridWeek: 'settings.viewOptions.week',
    dayGridMonth: 'settings.viewOptions.month',
    listWeek: 'settings.viewOptions.list'
  },
  MOBILE: {
    dayGridMonth: 'settings.viewOptions.month',
    timeGrid3Days: 'settings.viewOptions.threeDays',
    timeGridDay: 'settings.viewOptions.day',
    listWeek: 'settings.viewOptions.list'
  }
};

export function renderGeneralSettings(
  containerEl: HTMLElement,
  _plugin: FullCalendarPlugin,
  _rerender: () => void
): void {
  const desktopViewOptions: { [key: string]: string } = { ...INITIAL_VIEW_OPTIONS.DESKTOP };
  if (PluginState.getSettings().enableAdvancedCategorization) {
    desktopViewOptions['resourceTimelineWeek'] = 'settings.viewOptions.timelineWeek';
    desktopViewOptions['resourceTimelineDay'] = 'settings.viewOptions.timelineDay';
  }

  new Setting(containerEl)
    .setName(t('settings.general.desktopInitialView.label'))
    .setDesc(
      createDescWithDocs(t('settings.general.desktopInitialView.description'), [
        { text: 'Display and behavior', path: 'user/settings/fc_config' },
        { text: 'Views guide', path: 'user/views/' }
      ])
    )
    .addDropdown(dropdown => {
      Object.entries(desktopViewOptions).forEach(([value, labelKey]) => {
        dropdown.addOption(value, t(labelKey));
      });
      dropdown.setValue(PluginState.getSettings().initialView.desktop);
      dropdown.onChange(async initialView => {
        PluginState.getSettings().initialView.desktop = initialView;
        await PluginState.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName(t('settings.general.mobileInitialView.label'))
    .setDesc(
      createDescWithDocs(t('settings.general.mobileInitialView.description'), [
        { text: 'Display and behavior', path: 'user/settings/fc_config' },
        { text: 'Views guide', path: 'user/views/' }
      ])
    )
    .addDropdown(dropdown => {
      Object.entries(INITIAL_VIEW_OPTIONS.MOBILE).forEach(([value, labelKey]) => {
        dropdown.addOption(value, t(labelKey));
      });
      dropdown.setValue(PluginState.getSettings().initialView.mobile);
      dropdown.onChange(async initialView => {
        PluginState.getSettings().initialView.mobile = initialView;
        await PluginState.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName(t('settings.general.displayTimezone.label'))
    .setDesc(
      createDescWithDocs(t('settings.general.displayTimezone.description'), [
        { text: 'Timezone support', path: 'user/events/timezones' }
      ])
    )
    .addDropdown(dropdown => {
      const timezones = Intl.supportedValuesOf('timeZone'); // ['Europe/Bucharest', 'Europe/Zagreb'];
      timezones.forEach(tz => {
        dropdown.addOption(tz, tz);
      });
      dropdown.setValue(
        PluginState.getSettings().displayTimezone ||
          Intl.DateTimeFormat().resolvedOptions().timeZone
      );
      dropdown.onChange(async newTimezone => {
        PluginState.getSettings().displayTimezone = newTimezone;
        await PluginState.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName(t('settings.general.clickToCreateEvent.label'))
    .setDesc(
      createDescWithDocs(t('settings.general.clickToCreateEvent.description'), [
        { text: 'Interactions and gestures', path: 'user/features/interactions' },
        { text: 'Event management', path: 'user/events/manage' }
      ])
    )
    .addToggle(toggle => {
      toggle.setValue(PluginState.getSettings().clickToCreateEventFromMonthView);
      toggle.onChange(async val => {
        PluginState.getSettings().clickToCreateEventFromMonthView = val;
        await PluginState.saveSettings();
      });
    });
}
