import { showNotice } from '../../../utils/showNotice';
import * as React from 'react';
import { useState } from 'react';
import { UrlInput } from '../../../ui/components/forms/UrlInput';
import { UsernameInput } from '../../../ui/components/forms/UsernameInput';
import { PasswordInput } from '../../../ui/components/forms/PasswordInput';
import { CalDAVProviderConfig } from '../types/typesCalDAV';
import { importCalendars } from '../client/import_caldav';
import { t } from '../../../features/i18n/i18n';
import { CredentialStore } from '../../../features/credentials/CredentialStore';

interface CalDAVConfigComponentProps {
  config: Partial<CalDAVProviderConfig>;
  onSave: (configs: CalDAVProviderConfig[]) => void;
  onClose: () => void;
}

export const CalDAVConfigComponent: React.FC<CalDAVConfigComponentProps> = ({
  config,
  onSave,
  onClose
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
  const [submitText, setSubmitText] = useState(t('settings.calendars.caldav.importButton'));

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!url || !username || !password) return;

    setIsSubmitting(true);
    setSubmitText(t('settings.calendars.caldav.importing'));
    let shouldResetFormState = true;

    try {
      const sources = await importCalendars({ type: 'basic', username, password }, url, []);
      onSave(sources);
      shouldResetFormState = false;
      onClose();
    } catch (error) {
      console.error('Failed to import CalDAV calendars', error);
      const details = error instanceof Error ? error.message : String(error);
      showNotice(`${t('settings.calendars.caldav.importFailed')}: ${details}`);
    } finally {
      if (shouldResetFormState) {
        setSubmitText(t('settings.calendars.caldav.importButton'));
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
