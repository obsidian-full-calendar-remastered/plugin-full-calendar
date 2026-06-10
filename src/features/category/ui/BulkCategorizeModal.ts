import { showNotice } from '../../../utils/showNotice';
/**
 * @file BulkCategorizeModal.ts
 * @brief Modal dialog for bulk categorizing events in local calendars.
 *
 * @description
 * Presents the user with three options for updating event categories:
 * 1. Smart Folder Update: Uses the parent folder name as the category for uncategorized events.
 * 2. Forced Folder Update: Prepends the parent folder name to all event titles, regardless of existing categories.
 * 3. Forced Default Update: Prepends a user-provided category to all event titles, stacking with any existing categories.
 *
 * The modal collects user input and invokes the provided `onSubmit` callback with the selected method and, if applicable, the default category.
 *
 * @remarks
 * - This operation is intended as a one-time bulk update and will modify event notes to match the required formatting.
 * - The modal uses Obsidian's UI components for settings and notifications.
 *
 * @example
 * ```typescript
 * new BulkCategorizeModal(app, (choice, defaultCategory) => {
 *   // Handle the user's selection here
 * });
 * ```
 *
 * @public
 */

import { App, Modal, Setting, TextComponent } from 'obsidian';
import { t } from '../../i18n/i18n';

// This modal presents the 3 bulk-update choices to the user.
export class BulkCategorizeModal extends Modal {
  onSubmit: (choice: 'smart' | 'force_folder' | 'force_default', defaultCategory?: string) => void;

  constructor(
    app: App,
    onSubmit: (choice: 'smart' | 'force_folder' | 'force_default', defaultCategory?: string) => void
  ) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: t('modals.bulkCategorize.title') });
    contentEl.createEl('p', {
      text: t('modals.bulkCategorize.description')
    });

    // Option 1: Smart Folder Update
    new Setting(contentEl)
      .setName(t('modals.bulkCategorize.smartFolder.name'))
      .setDesc(t('modals.bulkCategorize.smartFolder.description'))
      .addButton(button =>
        button
          .setButtonText(t('modals.bulkCategorize.smartFolder.button'))
          .setCta()
          .onClick(() => {
            this.onSubmit('smart');
            this.close();
          })
      );

    // Option 2: Forced Folder Update
    new Setting(contentEl)
      .setName(t('modals.bulkCategorize.forcedFolder.name'))
      .setDesc(t('modals.bulkCategorize.forcedFolder.description'))
      .addButton(button =>
        button
          .setButtonText(t('modals.bulkCategorize.forcedFolder.button'))
          .setWarning()
          .onClick(() => {
            this.onSubmit('force_folder');
            this.close();
          })
      );

    // Option 3: Forced Default Update
    let textInput: TextComponent;
    new Setting(contentEl)
      .setName(t('modals.bulkCategorize.forcedDefault.name'))
      .setDesc(t('modals.bulkCategorize.forcedDefault.description'))
      .addText(text => {
        textInput = text;
        text.setPlaceholder(t('modals.bulkCategorize.forcedDefault.placeholder'));
      })
      .addButton(button =>
        button
          .setButtonText(t('modals.bulkCategorize.forcedDefault.button'))
          .setWarning()
          .onClick(() => {
            const categoryValue = textInput.getValue().trim();
            if (categoryValue === '') {
              showNotice(t('modals.bulkCategorize.forcedDefault.errorEmpty'));
              return;
            }
            this.onSubmit('force_default', categoryValue);
            this.close();
          })
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}
