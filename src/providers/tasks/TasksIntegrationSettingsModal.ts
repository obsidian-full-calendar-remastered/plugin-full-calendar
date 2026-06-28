import { PluginState } from '../../core/PluginState';
import { Modal, Setting } from 'obsidian';
import FullCalendarPlugin from '../../main';
import { t } from '../../features/i18n/i18n';
import { TasksBacklogDateTarget, TasksDateTarget, TasksDisplayFormat } from '../../types/settings';

export class TasksIntegrationSettingsModal extends Modal {
  constructor(
    private plugin: FullCalendarPlugin,
    private onChange: () => void
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.titleEl.setText(t('settings.tasksIntegration.modal.title'));

    const settings = PluginState.getSettings().tasksIntegration;

    new Setting(this.contentEl)
      .setName(t('settings.tasksIntegration.backlogDateTarget.label'))
      .setDesc(t('settings.tasksIntegration.backlogDateTarget.description'))
      .addDropdown(dropdown => {
        dropdown
          .addOption('scheduledDate', t('settings.tasksIntegration.backlogDateTarget.scheduled'))
          .addOption('startDate', t('settings.tasksIntegration.backlogDateTarget.start'))
          .addOption('dueDate', t('settings.tasksIntegration.backlogDateTarget.due'))
          .setValue(settings.backlogDateTarget)
          .onChange(async value => {
            PluginState.getSettings().tasksIntegration.backlogDateTarget =
              value as TasksBacklogDateTarget;
            await PluginState.saveSettings();
            PluginState.getProviderRegistry().refreshBacklogViews();
            this.onChange();
          });
      });

    new Setting(this.contentEl)
      .setName(t('settings.tasksIntegration.calendarDisplayDateTarget.label'))
      .setDesc(t('settings.tasksIntegration.calendarDisplayDateTarget.description'))
      .addDropdown(dropdown => {
        dropdown
          .addOption('scheduledDate', t('settings.tasksIntegration.backlogDateTarget.scheduled'))
          .addOption('startDate', t('settings.tasksIntegration.backlogDateTarget.start'))
          .addOption('dueDate', t('settings.tasksIntegration.backlogDateTarget.due'))
          .setValue(settings.calendarDisplayDateTarget)
          .onChange(async value => {
            PluginState.getSettings().tasksIntegration.calendarDisplayDateTarget =
              value as TasksDateTarget;
            await PluginState.saveSettings();
            this.onChange();
          });
      });

    new Setting(this.contentEl)
      .setName(t('settings.tasksIntegration.openEditModalAfterBacklogDrop.label'))
      .setDesc(t('settings.tasksIntegration.openEditModalAfterBacklogDrop.description'))
      .addToggle(toggle => {
        toggle.setValue(settings.openEditModalAfterBacklogDrop).onChange(async value => {
          PluginState.getSettings().tasksIntegration.openEditModalAfterBacklogDrop = value;
          await PluginState.saveSettings();
          this.onChange();
        });
      });

    new Setting(this.contentEl)
      .setName(t('settings.tasksIntegration.includeGlobalQueryInBacklog.label'))
      .setDesc(t('settings.tasksIntegration.includeGlobalQueryInBacklog.description'))
      .addToggle(toggle => {
        toggle.setValue(settings.includeGlobalQueryInBacklog ?? false).onChange(async value => {
          PluginState.getSettings().tasksIntegration.includeGlobalQueryInBacklog = value;
          await PluginState.saveSettings();
          PluginState.getProviderRegistry().refreshBacklogViews();
          this.onChange();
        });
      });

    new Setting(this.contentEl)
      .setName(t('settings.tasksIntegration.backlogQuery.label'))
      .setDesc(t('settings.tasksIntegration.backlogQuery.description'))
      .addTextArea(text => {
        text
          .setPlaceholder(t('settings.tasksIntegration.backlogQuery.placeholder'))
          .setValue(settings.backlogQuery ?? '')
          .onChange(value => {
            PluginState.getSettings().tasksIntegration.backlogQuery = value;
            void (async () => {
              await PluginState.saveSettings(false);
              PluginState.getProviderRegistry().refreshBacklogViews();
              this.onChange();
            })();
          });
        text.inputEl.rows = 6;
        text.inputEl.cols = 50;
        text.inputEl.setCssProps({ width: '100%' });
      });

    new Setting(this.contentEl)
      .setName(t('settings.tasksIntegration.taskDisplayFormat.label'))
      .setDesc(t('settings.tasksIntegration.taskDisplayFormat.description'))
      .addDropdown(dropdown => {
        dropdown
          .addOption('standard', t('settings.tasksIntegration.taskDisplayFormat.standard'))
          .addOption('dayPlanner', t('settings.tasksIntegration.taskDisplayFormat.dayPlanner'))
          .setValue(settings.taskDisplayFormat ?? 'dayPlanner')
          .onChange(async value => {
            PluginState.getSettings().tasksIntegration.taskDisplayFormat =
              value as TasksDisplayFormat;
            await PluginState.saveSettings();
            this.onChange();
          });
      });
  }

  onClose(): void {
    void PluginState.flushDebouncedSave();
    this.contentEl.empty();
  }
}
