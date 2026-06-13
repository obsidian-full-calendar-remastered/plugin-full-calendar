/**
 * @file DeprecationWarningModal.ts
 * @brief Modal dialog to warn users about deprecated calendar providers in their settings.
 * @license See LICENSE.md
 */

import { App, ButtonComponent, Modal, Setting } from 'obsidian';

export interface DeprecatedSourceItem {
  name: string;
  typeName: string;
  message: string;
}

export class DeprecationWarningModal extends Modal {
  constructor(
    app: App,
    private deprecatedSources: DeprecatedSourceItem[]
  ) {
    super(app);
  }

  onOpen() {
    this.modalEl.addClass('full-calendar-deprecation-modal');
    const { contentEl } = this;

    contentEl.createEl('h2', { text: 'Deprecated calendar providers in use' });

    contentEl.createEl('p', {
      text: 'The following calendar sources in your settings use deprecated providers that will be removed in a future version of the plugin. Please update your settings to avoid losing access to these events:'
    });

    const listEl = contentEl.createEl('ul');
    for (const source of this.deprecatedSources) {
      const li = listEl.createEl('li');
      li.createEl('strong', { text: `${source.name} ` });
      li.createEl('span', { text: `(${source.typeName} provider) — ${source.message}` });
    }

    contentEl.createEl('p', {
      text: 'Please visit the plugin settings to migrate or remove these calendar sources.'
    });

    new Setting(contentEl).addButton((btn: ButtonComponent) =>
      btn
        .setButtonText('Dismiss')
        .setCta()
        .onClick(() => {
          this.close();
        })
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}
