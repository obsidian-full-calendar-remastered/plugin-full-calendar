import * as React from 'react';
import { DirectorySelect } from '../../ui/components/forms/DirectorySelect';
import { FullNoteProviderConfig } from './typesLocal';
import { ProviderConfigContext } from '../typesProvider';
import { t } from '../../features/i18n/i18n';
import { TemplateEngine } from '../../features/linked-notes/TemplateEngine';

interface FullNoteConfigComponentProps {
  config: Partial<FullNoteProviderConfig>;
  onConfigChange: (newConfig: Partial<FullNoteProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: FullNoteProviderConfig) => void;
  onClose: () => void; // Required prop
}

export const FullNoteConfigComponent: React.FC<FullNoteConfigComponentProps> = ({
  config,
  onConfigChange,
  context,
  onSave,
  onClose: _onClose // Destructuring the new prop
}) => {
  const [directory, setDirectory] = React.useState(config.directory || '');
  const [template, setTemplate] = React.useState(config.template || '');
  const [taskCompletionStyle, setTaskCompletionStyle] = React.useState(
    config.taskCompletionStyle || 'datetime'
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!directory) return;

    setIsSubmitting(true);
    onSave({ ...config, id: config.id || '', directory, template, taskCompletionStyle });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">
            {t('settings.calendars.fullNote.directory.label')}
          </div>
          <div className="setting-item-description">
            {t('settings.calendars.fullNote.directory.description')}
          </div>
        </div>
        <div className="setting-item-control">
          <DirectorySelect
            value={directory}
            onChange={newValue => {
              setDirectory(newValue);
              onConfigChange({ ...config, directory: newValue });
            }}
            directories={context.allDirectories}
          />
        </div>
      </div>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">{t('settings.calendars.fullNote.template.label')}</div>
          <div className="setting-item-description">
            {t('settings.calendars.fullNote.template.description')}
          </div>
        </div>
        <div className="setting-item-control">
          <textarea
            value={template}
            placeholder={TemplateEngine.DEFAULT_TEMPLATE}
            onChange={e => {
              const newValue = e.target.value;
              setTemplate(newValue);
              onConfigChange({ ...config, template: newValue });
            }}
            rows={8}
            cols={50}
            style={{ width: '100%' }}
          />
        </div>
      </div>
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">
            {t('settings.calendars.fullNote.taskCompletionStyle.label')}
          </div>
          <div className="setting-item-description">
            {t('settings.calendars.fullNote.taskCompletionStyle.description')}
          </div>
        </div>
        <div className="setting-item-control">
          <select
            className="dropdown"
            value={taskCompletionStyle}
            onChange={e => {
              const newValue = e.target.value as 'datetime' | 'boolean';
              setTaskCompletionStyle(newValue);
              onConfigChange({ ...config, taskCompletionStyle: newValue });
            }}
          >
            <option value="datetime">
              {t('settings.calendars.fullNote.taskCompletionStyle.options.datetime')}
            </option>
            <option value="boolean">
              {t('settings.calendars.fullNote.taskCompletionStyle.options.boolean')}
            </option>
          </select>
        </div>
      </div>
      <div className="setting-item">
        <div className="setting-item-info" />
        <div className="setting-item-control">
          <button className="mod-cta" type="submit" disabled={isSubmitting || !directory}>
            {t('ui.buttons.addCalendar')}
          </button>
        </div>
      </div>
    </form>
  );
};
