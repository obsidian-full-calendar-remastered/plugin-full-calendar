/**
 * @file SettingsModal.ts
 * @brief Common reusable modal for hosting consolidated plugin settings sections.
 *
 * @description
 * Implements a generic, reusable Modal that adheres to DRY and SOLID principles.
 * Rather than creating custom Modal subclasses for every integration, this component
 * manages the modal lifecycle, header, title, and documentation links, delegating the
 * content rendering to a modular callback.
 *
 * @license See LICENSE.md
 */

import { App, Modal } from 'obsidian';
import { DocsLink, createDescWithDocs, createDocsLinksFragment } from '../settings/docsLinks';

export type SettingsModalRenderer = (
  contentEl: HTMLElement,
  rerenderModal: () => void,
  closeModal: () => void
) => void;

export interface SettingsModalOptions {
  title: string;
  docsLinks?: DocsLink[];
  headerDesc?: string;
  className?: string;
  onClose?: () => void;
}

export class SettingsModal extends Modal {
  constructor(
    app: App,
    private options: SettingsModalOptions,
    private renderFn: SettingsModalRenderer
  ) {
    super(app);
  }

  onOpen(): void {
    if (typeof this.modalEl?.addClass === 'function') {
      this.modalEl.addClass('ofc-settings-modal');
      if (this.options.className) {
        this.modalEl.addClass(this.options.className);
      }
    } else {
      this.modalEl?.classList?.add('ofc-settings-modal');
      if (this.options.className) {
        this.modalEl?.classList?.add(this.options.className);
      }
    }
    this.render();
  }

  render(): void {
    const { contentEl, titleEl } = this;
    contentEl.empty();

    if (this.options.title) {
      titleEl.setText(this.options.title);
    }

    const hasDocs = Boolean(this.options.docsLinks && this.options.docsLinks.length > 0);
    const hasDesc = Boolean(this.options.headerDesc);

    if (hasDesc || hasDocs) {
      const docsContainer = contentEl.createDiv({
        cls: 'ofc-settings-modal-docs setting-item-description'
      });
      docsContainer.appendChild(
        hasDesc
          ? createDescWithDocs(this.options.headerDesc || '', this.options.docsLinks || [])
          : createDocsLinksFragment(this.options.docsLinks || [])
      );
    }

    this.renderFn(
      contentEl,
      () => this.render(),
      () => this.close()
    );
  }

  onClose(): void {
    this.contentEl.empty();
    this.options.onClose?.();
  }

  /**
   * Helper method to instantiate and open a settings modal in one call.
   */
  public static open(
    app: App,
    options: SettingsModalOptions,
    renderFn: SettingsModalRenderer
  ): SettingsModal {
    const modal = new SettingsModal(app, options, renderFn);
    modal.open();
    return modal;
  }
}
