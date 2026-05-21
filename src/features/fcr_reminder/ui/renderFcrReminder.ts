import { PluginState } from '../../../core/PluginState';
import { Setting } from 'obsidian';
import FullCalendarPlugin from '../../../main';

export function renderFcrReminderSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  // 1. Integrations Header
  new Setting(containerEl)
    .setName('Fcr reminder companion')
    .setHeading()
    .setDesc(
      'Sync your upcoming calendar events with the persistent fcr reminder background companion daemon to receive native system-level toast notifications even when Obsidian is completely closed.'
    );

  const manager = plugin.fcrReminderManager;
  if (!manager) return;

  const companionSettings = manager.getCompanionSettings();

  // 2. Enable/Disable Toggle
  new Setting(containerEl)
    .setName('Enable companion integration')
    .setDesc('Synchronize upcoming event alarms to the background companion daemon.')
    .addToggle(toggle => {
      toggle.setValue(companionSettings.enabled);
      toggle.onChange(async val => {
        companionSettings.enabled = val;
        await PluginState.saveSettings();
        rerender();
      });
    });

  // 3. Companion Settings UI when enabled
  if (companionSettings.enabled) {
    // 3.1. API Server URL
    new Setting(containerEl)
      .setName('Companion server url')
      .setDesc('The loopback address of the fcr reminder daemon.')
      .addText(text => {
        text.inputEl.type = 'text';
        text.setPlaceholder('Http://127.0.0.1:45677');
        text.setValue(companionSettings.apiUrl || 'http://127.0.0.1:45677');
        text.onChange(async val => {
          companionSettings.apiUrl = val.trim();
          await PluginState.saveSettings();
        });
      });

    // 3.2. Offline Warning Banner element
    const bannerEl = containerEl.createDiv('full-calendar-companion-offline-banner');
    bannerEl.setCssProps({
      backgroundColor: 'rgba(224, 86, 86, 0.08)',
      border: '1px solid var(--background-modifier-error)',
      color: 'var(--text-normal)',
      padding: '12px 16px',
      borderRadius: '6px',
      marginTop: '12px',
      marginBottom: '12px',
      fontSize: '13px',
      lineHeight: '1.4',
      display: 'none'
    });

    const titleSpan = bannerEl.createEl('strong', { text: '⚠️ companion app offline\n' });
    titleSpan.setCssProps({
      display: 'block',
      marginBottom: '4px'
    });

    bannerEl.createSpan({
      text: 'FCR reminder is not running. Please start the companion app to enable native, off-line notifications.'
    });

    // 3.3. Asynchronous Status Verification Check
    void (async () => {
      const isOnline = await manager.checkDaemonStatus();
      if (!isOnline) {
        bannerEl.setCssProps({ display: 'block' });
      } else {
        bannerEl.setCssProps({ display: 'none' });
      }
    })();
  }
}
