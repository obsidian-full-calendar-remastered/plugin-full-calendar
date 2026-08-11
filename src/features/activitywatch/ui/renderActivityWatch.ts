import { showNotice } from '../../../utils/showNotice';
import { PluginState } from '../../../core/PluginState';
import { Setting } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { t } from '../../i18n/i18n';
import { ActivityWatchSettingsModal } from './ActivityWatchSettingsModal';
import { createDescWithDocs } from '../../../ui/settings/docsLinks';

export function renderActivityWatchSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  onChange: () => void
): void {
  const settings = PluginState.getSettings();
  const awSettings = settings.activityWatch;

  new Setting(containerEl)
    .setName(t('settings.activityWatch.enable.label'))
    .setDesc(
      createDescWithDocs(t('settings.activityWatch.enable.description'), [
        { text: 'ActivityWatch integration', path: 'user/calendars/activitywatch/' },
        { text: 'Troubleshooting', path: 'user/guides/troubleshooting' }
      ])
    )
    .setHeading()
    .addToggle(toggle => {
      toggle.setValue(awSettings.enabled).onChange(async value => {
        awSettings.enabled = value;
        await PluginState.saveSettings();
        onChange();

        // If they just toggled it ON and no target calendar is set, prompt them
        if (value && (!awSettings.targetCalendarId || awSettings.targetCalendarId === '')) {
          showNotice(t('settings.activityWatch.sync.enabledPrompt'));
        }
      });
    })
    .addExtraButton(button => {
      button
        .setIcon('gear')
        .setTooltip(t('settings.activityWatch.configButton'))
        .onClick(() => {
          new ActivityWatchSettingsModal(plugin, onChange).open();
        });
    });
}
