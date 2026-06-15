/**
 * @file CopyTextModal.ts
 * @brief A generic Obsidian Modal class for displaying and copying text/links.
 * @license See LICENSE.md
 */

import { App, Modal, Setting } from 'obsidian';

export class CopyTextModal extends Modal {
  private titleText: string;
  private descriptionText: string;
  private valueToCopy: string;
  private copyButtonLabel: string;
  private copiedButtonLabel: string;
  private closeButtonLabel: string;

  private onCopy: (() => void) | null;
  private onCloseCallback: (() => void) | null;

  constructor(
    app: App,
    options: {
      titleText: string;
      descriptionText: string;
      valueToCopy: string;
      copyButtonLabel?: string;
      copiedButtonLabel?: string;
      closeButtonLabel?: string;
      onCopy?: () => void;
      onCloseCallback?: () => void;
    }
  ) {
    super(app);
    this.titleText = options.titleText;
    this.descriptionText = options.descriptionText;
    this.valueToCopy = options.valueToCopy;
    this.copyButtonLabel = options.copyButtonLabel || 'Copy';
    this.copiedButtonLabel = options.copiedButtonLabel || 'Copied!';
    this.closeButtonLabel = options.closeButtonLabel || 'Close';
    this.onCopy = options.onCopy || null;
    this.onCloseCallback = options.onCloseCallback || null;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl('h2', { text: this.titleText });
    contentEl.createEl('p', { text: this.descriptionText });

    const container = contentEl.createDiv({ cls: 'ofc-generated-token-container' });

    const inputEl = container.createEl('input', {
      cls: 'ofc-token-display-input'
    });
    inputEl.type = 'text';
    inputEl.value = this.valueToCopy;
    inputEl.setAttribute('readonly', 'true');

    // Auto-focus and highlight
    inputEl.focus();
    inputEl.select();

    const copyBtn = container.createEl('button', {
      text: this.copyButtonLabel
    });
    copyBtn.onclick = () => {
      void (async () => {
        await navigator.clipboard.writeText(this.valueToCopy);
        copyBtn.setText(this.copiedButtonLabel);
        if (this.onCopy) {
          this.onCopy();
        }
        // Auto-close modal after copying so that the waiting modal shows up immediately
        this.close();
      })();
    };

    new Setting(contentEl).addButton(btn =>
      btn
        .setButtonText(this.closeButtonLabel)
        .setCta()
        .onClick(() => this.close())
    );
  }

  onClose() {
    this.contentEl.empty();
    if (this.onCloseCallback) {
      this.onCloseCallback();
    }
  }
}
