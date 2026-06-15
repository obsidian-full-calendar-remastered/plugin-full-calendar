/**
 * @file LoadingModal.ts
 * @brief A generic loading/waiting modal with a cancel callback.
 * @license See LICENSE.md
 */

import { App, Modal, Setting } from 'obsidian';

export class LoadingModal extends Modal {
  private titleText: string;
  private descriptionText: string;
  private cancelLabel: string;
  private onCancel: (() => void) | null;
  private wasCancelledByUser: boolean = true;

  constructor(
    app: App,
    options: {
      titleText: string;
      descriptionText: string;
      cancelLabel?: string;
      onCancel?: () => void;
    }
  ) {
    super(app);
    this.titleText = options.titleText;
    this.descriptionText = options.descriptionText;
    this.cancelLabel = options.cancelLabel || 'Cancel';
    this.onCancel = options.onCancel || null;
  }

  // A method to close the modal programmatically without triggering the user cancel callback
  public closeSuccess() {
    this.wasCancelledByUser = false;
    this.close();
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl('h2', { text: this.titleText });
    contentEl.createEl('p', { text: this.descriptionText });

    const spinnerContainer = contentEl.createDiv({ cls: 'ofc-loading-spinner-container' });

    spinnerContainer.createEl('span', { text: '⏳', cls: 'ofc-loading-spinner' });

    new Setting(contentEl).addButton(btn =>
      btn.setButtonText(this.cancelLabel).onClick(() => {
        this.close();
      })
    );
  }

  onClose() {
    this.contentEl.empty();
    if (this.wasCancelledByUser && this.onCancel) {
      this.onCancel();
    }
  }
}
