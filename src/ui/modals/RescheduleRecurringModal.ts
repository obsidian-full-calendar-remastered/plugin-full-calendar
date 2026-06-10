import { App, ButtonComponent, Modal, Setting } from 'obsidian';
import { t } from '../../features/i18n/i18n';

export class RescheduleRecurringModal extends Modal {
  constructor(
    app: App,
    private onRescheduleInstance: () => void,
    private onRescheduleSequence: () => void,
    private instanceDate?: string
  ) {
    super(app);
  }

  onOpen() {
    this.modalEl.addClass('full-calendar-confirm-modal');
    const { contentEl } = this;
    contentEl.createEl('h2', { text: t('modals.rescheduleRecurring.title') });
    contentEl.createEl('p', {
      text: t('modals.rescheduleRecurring.description')
    });

    new Setting(contentEl)
      .setName(t('modals.rescheduleRecurring.rescheduleInstance.name'))
      .setDesc(
        this.instanceDate
          ? t('modals.rescheduleRecurring.rescheduleInstance.description', {
              date: this.instanceDate
            })
          : t('modals.rescheduleRecurring.rescheduleInstance.descriptionNoDate')
      )
      .addButton((btn: ButtonComponent) =>
        btn
          .setButtonText(t('modals.rescheduleRecurring.rescheduleInstance.button'))
          .setCta()
          .onClick(() => {
            this.close();
            this.onRescheduleInstance();
          })
      );

    new Setting(contentEl)
      .setName(t('modals.rescheduleRecurring.rescheduleSequence.name'))
      .setDesc(t('modals.rescheduleRecurring.rescheduleSequence.description'))
      .addButton((btn: ButtonComponent) =>
        btn
          .setButtonText(t('modals.rescheduleRecurring.rescheduleSequence.button'))
          .setCta()
          .onClick(() => {
            this.close();
            this.onRescheduleSequence();
          })
      );

    new Setting(contentEl).addButton((btn: ButtonComponent) =>
      btn.setButtonText(t('modals.rescheduleRecurring.cancel')).onClick(() => this.close())
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}
