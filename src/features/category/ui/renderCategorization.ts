/**
 * @file renderCategorization.ts
 * @brief Renders the advanced categorization settings section.
 * @license See LICENSE.md
 */

import { PluginState } from '../../../core/PluginState';
import { createElement } from 'react';
import { Setting, Modal } from 'obsidian';
import * as ReactDOM from 'react-dom/client';
import { CategorySettingsManager } from './CategorySetting';
import { bulkUpdateCategories, bulkRemoveCategories } from '../bulkCategorization';
import { t } from '../../i18n/i18n';
import { createDescWithDocs } from '../../../ui/settings/docsLinks';
import { FullCalendarSettingTab } from '../../../ui/settings/SettingsTab';

export function renderCategorizationSettings(
  containerEl: HTMLElement,
  tab: FullCalendarSettingTab,
  rerender: () => void
): void {
  const plugin = tab.plugin;
  new Setting(containerEl)
    .setName(t('settings.categorization.title'))
    .setHeading()
    .setDesc(
      createDescWithDocs(t('global.learnMore'), [
        { text: t('settings.categorization.learnMoreLink'), path: 'user/events/categories' },
        { text: 'Event management', path: 'user/events/manage' },
        { text: 'Tasks and categories', path: 'user/events/tasks' }
      ])
    );

  new Setting(containerEl)
    .setName(t('settings.categorization.enable.label'))
    .setDesc(t('settings.categorization.enable.description'))
    .addToggle(toggle => {
      toggle
        .setValue(PluginState.getSettings().enableAdvancedCategorization)
        .onChange(async value => {
          if (value) {
            // Logic for turning ON
            // LAZY LOAD MODAL
            const { BulkCategorizeModal } = await import('./BulkCategorizeModal');
            new BulkCategorizeModal(plugin.app, (choice, defaultCategory) => {
              void (async () => {
                PluginState.getSettings().enableAdvancedCategorization = true;
                await PluginState.saveSettings();
                await bulkUpdateCategories(plugin, choice, defaultCategory);
                rerender();
              })();
            }).open();
          } else {
            // Logic for turning OFF
            const confirmModal = new Modal(plugin.app);
            confirmModal.modalEl.addClass('full-calendar-confirm-modal');
            const { contentEl } = confirmModal;
            contentEl.createEl('h2', { text: t('settings.categorization.disable.modalTitle') });
            contentEl.createEl('p', {
              text: t('settings.categorization.disable.modalDescription')
            });
            new Setting(contentEl)
              .addButton(btn =>
                btn
                  .setButtonText(t('settings.categorization.disable.buttonDisableWithoutCleanup'))
                  .setCta()
                  .onClick(async () => {
                    PluginState.getSettings().enableAdvancedCategorization = false;
                    await PluginState.saveSettings();
                    confirmModal.close();
                    rerender();
                  })
              )
              .addButton(btn =>
                btn
                  .setButtonText(t('settings.categorization.disable.buttonDisable'))
                  .onClick(async () => {
                    PluginState.getSettings().enableAdvancedCategorization = false;
                    PluginState.getSettings().categorySettings = [];
                    await PluginState.saveSettings();
                    await bulkRemoveCategories(plugin);
                    confirmModal.close();
                    rerender();
                  })
              )
              .addButton(btn =>
                btn.setButtonText(t('settings.categorization.disable.buttonCancel')).onClick(() => {
                  toggle.setValue(true); // Revert toggle state if cancelled
                  confirmModal.close();
                })
              );
            confirmModal.open();
          }
        });
    });

  if (PluginState.getSettings().enableAdvancedCategorization) {
    const categoryDiv = containerEl.createDiv();
    const categoryRoot = ReactDOM.createRoot(categoryDiv);
    tab.registerReactRoot(categoryRoot);

    const allCategoriesInVault = PluginState.getCache().getAllCategories();
    const configuredCategoryNames = new Set(
      PluginState.getSettings().categorySettings.map(s => s.name)
    );
    const availableSuggestions = allCategoriesInVault.filter(
      cat => !configuredCategoryNames.has(cat)
    );

    categoryRoot.render(
      createElement(CategorySettingsManager, {
        settings: PluginState.getSettings().categorySettings,
        suggestions: availableSuggestions,
        onSave: async newSettings => {
          PluginState.getSettings().categorySettings = newSettings;
          await PluginState.saveSettings();
        }
      })
    );
  }
}
