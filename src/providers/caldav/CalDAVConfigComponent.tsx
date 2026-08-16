import { showNotice } from '../../utils/showNotice';
import * as React from 'react';
import { useState } from 'react';
import { UrlInput } from '../../ui/components/forms/UrlInput';
import { UsernameInput } from '../../ui/components/forms/UsernameInput';
import { PasswordInput } from '../../ui/components/forms/PasswordInput';
import { CalDAVProviderConfig } from './typesCalDAV';
import { importCalendars } from './import_caldav';
import { t } from '../../features/i18n/i18n';
import { CredentialStore } from '../../features/credentials/CredentialStore';

interface CalDAVConfigComponentProps {
  config: Partial<CalDAVProviderConfig>;
  onSave: (configs: CalDAVProviderConfig[]) => void;
  onClose: () => void;
  mode?: 'events' | 'tasks';
}

export const CalDAVConfigComponent: React.FC<CalDAVConfigComponentProps> = ({
  config,
  onSave,
  onClose,
  mode = 'events'
}) => {
  const [url, setUrl] = useState(config.url || '');
  const [username, setUsername] = useState(config.username || '');
  const [password, setPassword] = useState(() => {
    if (config.id) {
      return CredentialStore.getCalDAVPassword(config.id) || config.password || '';
    }
    return config.password || '';
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const importButtonKey =
    mode === 'tasks'
      ? 'settings.calendars.caldavTasks.importButton'
      : 'settings.calendars.caldav.importButton';
  const [submitText, setSubmitText] = useState(t(importButtonKey));

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!url || !username || !password) return;

    setIsSubmitting(true);
    setSubmitText(t('settings.calendars.caldav.importing'));
    let shouldResetFormState = true;

    try {
      const sources =
        mode === 'tasks'
          ? await importCalendars({ type: 'basic', username, password }, url, [], 'caldavtasks')
          : await importCalendars({ type: 'basic', username, password }, url, []);
      onSave(sources);
      shouldResetFormState = false;
      onClose();
    } catch (error) {
      const errorKey =
        mode === 'tasks'
          ? 'settings.calendars.caldavTasks.importFailed'
          : 'settings.calendars.caldav.importFailed';
      console.error(t(errorKey), error);
      const details = error instanceof Error ? error.message : String(error);
      showNotice(`${t(errorKey)}: ${details}`);
    } finally {
      if (shouldResetFormState) {
        setSubmitText(t(importButtonKey));
        setIsSubmitting(false);
      }
    }
  };

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        void handleSubmit(e);
      }}
    >
      {mode === 'tasks' && (
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">{t('settings.calendars.caldavTasks.title')}</div>
            <div className="setting-item-description">
              {t('settings.calendars.caldavTasks.description')}
            </div>
          </div>
        </div>
      )}
      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">{t('settings.calendars.caldav.url.label')}</div>
          <div className="setting-item-description">
            {t('settings.calendars.caldav.url.description')}
          </div>
        </div>
        <div className="setting-item-control">
          <UrlInput value={url} onChange={setUrl} />
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">{t('settings.calendars.caldav.username.label')}</div>
          <div className="setting-item-description">
            {t('settings.calendars.caldav.username.description')}
          </div>
        </div>
        <div className="setting-item-control">
          <UsernameInput value={username} onChange={setUsername} />
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info">
          <div className="setting-item-name">{t('settings.calendars.caldav.password.label')}</div>
          <div className="setting-item-description">
            {t('settings.calendars.caldav.password.description')}
          </div>
        </div>
        <div className="setting-item-control">
          <PasswordInput value={password} onChange={setPassword} />
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-item-info" />
        <div className="setting-item-control">
          <button
            className="mod-cta"
            type="submit"
            disabled={isSubmitting || !url || !username || !password}
          >
            {submitText}
          </button>
        </div>
      </div>
    </form>
  );
};
