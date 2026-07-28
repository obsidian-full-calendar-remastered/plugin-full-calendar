/**
 * @file CopyTextModal.ts
 * @brief A generic, modular Obsidian Modal class for displaying and copying single-line or multi-line text.
 * @license See LICENSE.md
 */

import { App, Modal, Setting } from 'obsidian';

export interface CopyTextModalOptions {
  titleText: string;
  descriptionText?: string;
  valueToCopy: string;
  multiline?: boolean;
  autoCloseOnCopy?: boolean;
  copyButtonLabel?: string;
  copiedButtonLabel?: string;
  closeButtonLabel?: string;
  secondaryButtonLabel?: string;
  onSecondaryClick?: () => void;
  onCopy?: () => void;
  onCloseCallback?: () => void;
}

export class CopyTextModal extends Modal {
  private titleText: string;
  private descriptionText?: string;
  private valueToCopy: string;
  private multiline: boolean;
  private autoCloseOnCopy: boolean;
  private copyButtonLabel: string;
  private copiedButtonLabel: string;
  private closeButtonLabel: string;
  private secondaryButtonLabel?: string;
  private onSecondaryClick?: () => void;
  private onCopy?: () => void;
  private onCloseCallback?: () => void;

  constructor(app: App, options: CopyTextModalOptions) {
    super(app);
    this.titleText = options.titleText;
    this.descriptionText = options.descriptionText;
    this.valueToCopy = options.valueToCopy;
    this.multiline = options.multiline ?? false;
    this.autoCloseOnCopy = options.autoCloseOnCopy ?? true;
    this.copyButtonLabel = options.copyButtonLabel || 'Copy';
    this.copiedButtonLabel = options.copiedButtonLabel || 'Copied!';
    this.closeButtonLabel = options.closeButtonLabel || 'Close';
    this.secondaryButtonLabel = options.secondaryButtonLabel;
    this.onSecondaryClick = options.onSecondaryClick;
    this.onCopy = options.onCopy;
    this.onCloseCallback = options.onCloseCallback;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ofc-copy-text-modal');

    contentEl.createEl('h2', { text: this.titleText });
    if (this.descriptionText) {
      contentEl.createEl('p', { text: this.descriptionText });
    }

    const container = contentEl.createDiv({ cls: 'ofc-generated-token-container' });

    let textEl: HTMLInputElement | HTMLTextAreaElement;

    if (this.multiline) {
      const textarea = container.createEl('textarea', {
        cls: 'ofc-token-display-input ofc-token-display-textarea'
      });
      textarea.rows = 14;
      textEl = textarea;
    } else {
      const input = container.createEl('input', {
        cls: 'ofc-token-display-input'
      });
      input.type = 'text';
      textEl = input;
    }

    textEl.value = this.valueToCopy;
    textEl.setAttribute('readonly', 'true');
    textEl.focus();
    textEl.select();

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
        if (this.autoCloseOnCopy) {
          this.close();
        } else {
          window.setTimeout(() => {
            copyBtn.setText(this.copyButtonLabel);
          }, 2000);
        }
      })();
    };

    const setting = new Setting(contentEl);

    const secondaryLabel = this.secondaryButtonLabel;
    const secondaryHandler = this.onSecondaryClick;
    if (secondaryLabel && secondaryHandler) {
      setting.addButton(btn =>
        btn.setButtonText(secondaryLabel).onClick(() => {
          this.close();
          secondaryHandler();
        })
      );
    }

    setting.addButton(btn =>
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
