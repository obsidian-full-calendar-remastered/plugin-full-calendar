/**
 * @file ConfirmModal.ts
 * @brief A modal dialog for confirming user actions within the Full Calendar plugin.
 *
 * @description
 * This modal displays a customizable title and body text, and provides two buttons:
 * - "Yes, open parent": Confirms the action and triggers the provided callback.
 * - "Cancel": Closes the modal without taking further action.
 *
 * @remarks
 * This modal is styled with the `full-calendar-confirm-modal` CSS class.
 *
 * @example
 * ```typescript
 * new ConfirmModal(app, "Confirm Action", "Are you sure you want to proceed?", () => {
 *   // Handle confirmation logic here
 * }).open();
 * ```
 *
 * @license See LICENSE.md
 */

import { App, ButtonComponent, Modal, Setting } from 'obsidian';
export class ConfirmModal extends Modal {
  constructor(
    app: App,
    private titleText: string,
    private bodyText: string,
    private onConfirm: () => void,
    private confirmButtonText = 'Yes, open parent',
    private cancelButtonText = 'Cancel',
    private isDestructive = false
  ) {
    super(app);
  }

  onOpen() {
    this.modalEl.addClass('full-calendar-confirm-modal');
    const { contentEl } = this;
    contentEl.createEl('h2', { text: this.titleText });
    contentEl.createEl('p', { text: this.bodyText });

    new Setting(contentEl)
      .addButton((btn: ButtonComponent) => {
        btn.setButtonText(this.confirmButtonText);
        if (this.isDestructive) {
          btn.setDestructive();
        } else {
          btn.setCta();
        }
        btn.onClick(() => {
          this.close();
          this.onConfirm();
        });
      })
      .addButton((btn: ButtonComponent) =>
        btn.setButtonText(this.cancelButtonText).onClick(() => this.close())
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}
