/**
 * @file renderCalendars.ts
 * @brief Renders the calendar management section of the settings tab.
 * @license See LICENSE.md
 */

import { PluginState } from '../../../core/PluginState';
import { Setting, TFolder } from 'obsidian';
import * as ReactDOM from 'react-dom/client';
import React, { createElement, RefObject } from 'react';
import { addCalendarButton, FullCalendarSettingTab } from '../SettingsTab';
import { CalendarSettings, CalendarSettingsRef } from './calendars/CalendarSetting';
import { CalendarInfo } from '../../../types/calendar_settings';
import { t } from '../../../features/i18n/i18n';
import { createDescWithDocs, createDocsLinksFragment } from '../docsLinks';
import { listWritableCalendars } from '../../../utils/writableCalendars';

export function renderCalendarManagement(
  containerEl: HTMLElement,
  tab: FullCalendarSettingTab,
  calendarSettingsRef: RefObject<CalendarSettingsRef>
): void {
  const plugin = tab.plugin;
  new Setting(containerEl)
    .setName(t('settings.calendars.linkedNotes.title'))
    .setHeading()
    .setDesc(
      createDescWithDocs(t('settings.calendars.linkedNotes.description'), [
        {
          text: t('settings.calendars.linkedNotes.learnMore'),
          path: 'user/features/event-linked-notes'
        }
      ])
    );

  new Setting(containerEl)
    .setName(t('settings.general.linkedNotesDirectory.label'))
    .setDesc(t('settings.general.linkedNotesDirectory.description'))
    .addDropdown(dropdown => {
      const folders = plugin.app.vault
        .getAllLoadedFiles()
        .filter((f): f is TFolder => f instanceof TFolder)
        .map(f => f.path);

      dropdown.addOption('', t('settings.general.linkedNotesDirectory.vaultRoot'));
      folders
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
        .forEach(dir => {
          dropdown.addOption(dir, dir);
        });

      dropdown.setValue(PluginState.getSettings().linkedNotesDirectory || '');
      dropdown.onChange(async value => {
        PluginState.getSettings().linkedNotesDirectory = value;
        await PluginState.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName(t('settings.general.linkedNoteLinkStrategy.label'))
    .setDesc(t('settings.general.linkedNoteLinkStrategy.description'))
    .addDropdown(dropdown => {
      dropdown
        .addOption('deadline', t('settings.general.linkedNoteLinkStrategy.deadline'))
        .addOption('name', t('settings.general.linkedNoteLinkStrategy.name'))
        .setValue(PluginState.getSettings().linkedNoteLinkStrategy || 'deadline')
        .onChange(async value => {
          PluginState.getSettings().linkedNoteLinkStrategy = value as 'name' | 'deadline';
          await PluginState.saveSettings();
        });
    });

  if (!PluginState.getSettings().enableLinkedNoteTemplatesPreset) {
    new Setting(containerEl)
      .setName(t('settings.general.linkedNoteTemplate.label'))
      .setDesc(t('settings.general.linkedNoteTemplate.description'))
      .addTextArea(text => {
        text
          .setPlaceholder(t('settings.general.linkedNoteTemplate.placeholder'))
          .setValue(PluginState.getSettings().linkedNoteTemplate || '')
          .onChange(value => {
            PluginState.getSettings().linkedNoteTemplate = value;
            void PluginState.saveSettings(false);
          });
        text.inputEl.rows = 8;
        text.inputEl.cols = 50;
        text.inputEl.setCssProps({ width: '100%' });
      });
  }

  new Setting(containerEl)
    .setName(t('settings.general.enableLinkedNoteTemplatesPreset.label'))
    .setDesc(t('settings.general.enableLinkedNoteTemplatesPreset.description'))
    .addToggle(toggle => {
      toggle
        .setValue(PluginState.getSettings().enableLinkedNoteTemplatesPreset || false)
        .onChange(async value => {
          PluginState.getSettings().enableLinkedNoteTemplatesPreset = value;
          await PluginState.saveSettings();
          tab.renderSettings();
        });
    });

  if (PluginState.getSettings().enableLinkedNoteTemplatesPreset) {
    const presetContainer = containerEl.createDiv({ cls: 'ofc-settings-preset-container' });

    const presets = PluginState.getSettings().linkedNoteTemplatesPresets || [];

    // 1. Render currently added presets
    presets.forEach((presetPath, index) => {
      const filename = presetPath.split('/').pop() || presetPath;
      new Setting(presetContainer)
        .setName(filename)
        .setDesc(presetPath)
        .addButton(button => {
          button
            .setButtonText(t('settings.general.linkedNoteTemplatesPresets.removeButton'))
            .setClass('mod-warning')
            .onClick(async () => {
              presets.splice(index, 1);
              PluginState.getSettings().linkedNoteTemplatesPresets = presets;
              await PluginState.saveSettings();
              tab.renderSettings();
            });
        });
    });

    // 2. Row to select and add a new preset template note from the vault
    const markdownFiles = plugin.app.vault.getMarkdownFiles();
    const markdownPaths = markdownFiles.map(f => f.path);
    const availablePaths = markdownPaths.filter(p => !presets.includes(p));

    new Setting(presetContainer)
      .setName(t('settings.general.linkedNoteTemplatesPresets.addLabel'))
      .setDesc(t('settings.general.linkedNoteTemplatesPresets.addDesc'))
      .addDropdown(dropdown => {
        dropdown.addOption('', t('settings.general.linkedNoteTemplatesPresets.addPlaceholder'));
        availablePaths
          .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
          .forEach(p => {
            dropdown.addOption(p, p);
          });

        dropdown.onChange(async value => {
          if (value) {
            presets.push(value);
            PluginState.getSettings().linkedNoteTemplatesPresets = presets;
            await PluginState.saveSettings();
            tab.renderSettings();
          }
        });
      });
  }

  containerEl.createEl('hr', { cls: 'settings-view-new-divider' });

  new Setting(containerEl)
    .setName(t('settings.calendars.title'))
    .setHeading()
    .setDesc(
      createDocsLinksFragment([
        { text: 'Calendar sources settings', path: 'user/settings/sources' },
        { text: 'Calendar types', path: 'user/calendars/' }
      ])
    );
  containerEl.createEl('hr', { cls: 'settings-view-new-divider' });
  const sourcesDiv = containerEl.createDiv();
  const root = ReactDOM.createRoot(sourcesDiv);
  tab.registerReactRoot(root);
  root.render(
    createElement(CalendarSettings, {
      ref: calendarSettingsRef as React.Ref<CalendarSettings>,
      sources: PluginState.getProviderRegistry().getAllSources(),
      plugin: plugin,
      submit: (settings: CalendarInfo[]): void => {
        void (async () => {
          PluginState.getSettings().calendarSources = settings;
          await PluginState.saveSettings();
        })();
      }
    })
  );
  addCalendarButton(
    plugin,
    containerEl,
    (source: CalendarInfo): void => {
      calendarSettingsRef.current?.addSource(source);
    },
    () => calendarSettingsRef.current?.getUsedDirectories() ?? []
  );

  new Setting(containerEl)
    .setName(t('settings.calendars.defaultCalendar.label'))
    .setDesc(t('settings.calendars.defaultCalendar.description'))
    .addDropdown(dropdown => {
      dropdown.addOption('', t('settings.calendars.defaultCalendar.firstAvailable'));
      listWritableCalendars().forEach(calendar => {
        dropdown.addOption(calendar.id, calendar.name || calendar.id);
      });

      dropdown.setValue(PluginState.getSettings().defaultCalendarId ?? '');
      dropdown.onChange(async value => {
        PluginState.getSettings().defaultCalendarId = value || null;
        await PluginState.saveSettings();
      });
    });

  new Setting(containerEl).setDesc(
    createDocsLinksFragment(
      [
        { text: t('settings.calendars.docs.fullNote'), path: 'user/calendars/local' },
        { text: t('settings.calendars.docs.dailyNote'), path: 'user/calendars/dailynote' },
        { text: t('settings.calendars.docs.journals'), path: 'user/calendars/journals' },
        { text: t('settings.calendars.docs.ics'), path: 'user/calendars/ics' },
        { text: t('settings.calendars.docs.caldav'), path: 'user/calendars/caldav' },
        {
          text: t('settings.calendars.docs.caldavTasks'),
          path: 'user/calendars/caldav-tasks'
        },
        { text: t('settings.calendars.docs.google'), path: 'user/calendars/gcal' },
        { text: t('settings.calendars.docs.outlook'), path: 'user/calendars/outlook' },
        {
          text: t('settings.calendars.docs.tasks'),
          path: 'user/calendars/tasks-plugin-integration'
        },
        { text: t('settings.calendars.docs.bases'), path: 'user/calendars/bases' },
        { text: t('settings.calendars.docs.taskNotes'), path: 'user/calendars/tasknotes' }
      ],
      t('settings.calendars.docs.providerGuides')
    )
  );
}
