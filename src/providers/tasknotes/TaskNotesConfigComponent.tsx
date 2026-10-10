/**
 * @file TaskNotesConfigComponent.tsx
 * @brief Configuration component for the TaskNotes provider.
 *
 * @license See LICENSE.md
 */

import * as React from 'react';
import { TaskNotesProviderConfig } from './typesTaskNotes';
import { ProviderConfigContext } from '../typesProvider';
import { t } from '../../features/i18n/i18n';
import FullCalendarPlugin from '../../main';

export interface TaskNotesConfigComponentProps {
  plugin: FullCalendarPlugin;
  config: Partial<TaskNotesProviderConfig>;
  onConfigChange: (newConfig: Partial<TaskNotesProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: TaskNotesProviderConfig | TaskNotesProviderConfig[]) => void;
  onClose: () => void;
}

export const TaskNotesConfigComponent: React.FC<TaskNotesConfigComponentProps> = ({
  config,
  onConfigChange,
  onSave,
  onClose
}) => {
  const [name, setName] = React.useState(config.name || t('settings.calendars.types.tasknotes'));
  const [dispatchMode, setDispatchMode] = React.useState<'search' | 'create'>(
    config.dispatchMode || 'search'
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    setIsSubmitting(true);
    onSave({ ...config, id: config.id || '', name, dispatchMode });
  };

  return (
    <div className="tasknotes-provider-config">
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">
            {t('settings.calendars.tasknotes.zeroConfig.label')}
          </div>
          <div className="setting-item-description">
            {t('settings.calendars.tasknotes.zeroConfig.description')}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">
              {t('settings.calendars.tasknotes.calendarName.label')}
            </div>
            <div className="setting-item-description">
              {t('settings.calendars.tasknotes.calendarName.description')}
            </div>
          </div>
          <div className="setting-item-control">
            <input
              type="text"
              value={name}
              onChange={e => {
                setName(e.target.value);
                onConfigChange({ ...config, name: e.target.value });
              }}
              placeholder={t('settings.calendars.tasknotes.calendarName.placeholder')}
            />
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">
              {t('settings.calendars.tasknotes.dispatchMode.label')}
            </div>
            <div className="setting-item-description">
              {t('settings.calendars.tasknotes.dispatchMode.description')}
            </div>
          </div>
          <div className="setting-item-control">
            <select
              value={dispatchMode}
              onChange={e => {
                const mode = e.target.value as 'search' | 'create';
                setDispatchMode(mode);
                onConfigChange({ ...config, name, dispatchMode: mode });
              }}
            >
              <option value="search">
                {t('settings.calendars.tasknotes.dispatchMode.options.search')}
              </option>
              <option value="create">
                {t('settings.calendars.tasknotes.dispatchMode.options.create')}
              </option>
            </select>
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">
              {t('settings.calendars.tasknotes.readOnly.label')}
            </div>
            <div className="setting-item-description">
              {t('settings.calendars.tasknotes.readOnly.description')}
            </div>
          </div>
        </div>

        <div className="setting-item">
          <button type="submit" className="mod-cta" disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? t('settings.calendars.tasknotes.adding') : t('ui.buttons.addCalendar')}
          </button>
          <button type="button" onClick={onClose} disabled={isSubmitting} className="u-ml-10px">
            {t('settings.calendars.tasknotes.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
};

export const TaskNotesSettingsRow: React.FC<{
  source: Partial<import('../../types').CalendarInfo>;
}> = ({ source }) => {
  const name = source.name ?? t('settings.calendars.types.tasknotes');
  return React.createElement(
    'div',
    { className: 'setting-item-control ofc-settings-row-tasknotes-provider' },
    React.createElement('input', {
      className: 'ofc-settings-row-text',
      disabled: true,
      value: name
    })
  );
};
