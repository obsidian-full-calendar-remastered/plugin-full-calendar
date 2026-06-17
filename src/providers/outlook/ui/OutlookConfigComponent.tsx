import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Setting } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { PluginState } from '../../../core/PluginState';
import { MicrosoftAccount } from '../../../types/settings';
import { OutlookApiError } from '../auth/request';
import { OutlookAuthManager } from '../auth/OutlookAuthManager';
import { startOutlookLogin } from '../auth/auth';
import { t } from '../../../features/i18n/i18n';
import { CredentialStore } from '../../../features/credentials/CredentialStore';

type SelectedOutlookCalendar = {
  id: string;
  name: string;
  color: string;
};

interface OutlookConfigComponentProps {
  plugin: FullCalendarPlugin;
  onSave: (configs: SelectedOutlookCalendar[], accountId: string) => void;
  onClose: () => void;
}

export const OutlookConfigComponent: React.FC<OutlookConfigComponentProps> = ({
  plugin,
  onSave,
  onClose
}) => {
  const [view, setView] = useState<'account-select' | 'calendar-select'>('account-select');
  const [accounts, setAccounts] = useState<MicrosoftAccount[]>(
    PluginState.getSettings().microsoftAccounts || []
  );
  const [selectedAccount, setSelectedAccount] = useState<MicrosoftAccount | null>(null);
  const [availableCalendars, setAvailableCalendars] = useState<
    { id: string; name: string; color?: string }[]
  >([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authManager = useMemo(() => new OutlookAuthManager(plugin), [plugin]);
  const accountListRef = useRef<HTMLDivElement>(null);
  const calendarListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onAccountAdded = () => {
      setAccounts([...(PluginState.getSettings().microsoftAccounts || [])]);
    };

    (plugin.app.workspace as unknown as { on: (name: string, cb: () => void) => void }).on(
      'full-calendar:outlook-account-added',
      onAccountAdded
    );

    return () => {
      (plugin.app.workspace as unknown as { off: (name: string, cb: () => void) => void }).off(
        'full-calendar:outlook-account-added',
        onAccountAdded
      );
    };
  }, [plugin]);

  const handleToggle = (id: string, value: boolean) => {
    setSelection(prev => {
      const next = new Set(prev);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSelectAccount = useCallback(
    async (account: MicrosoftAccount) => {
      setIsLoading(true);
      setError(null);
      setSelectedAccount(account);

      try {
        if (
          !account.accessToken ||
          !account.expiryDate ||
          Date.now() >= account.expiryDate - 60000
        ) {
          const token = await authManager.getTokenForSource({
            type: 'outlook',
            id: `temp_${account.id}`,
            name: account.email,
            calendarId: 'primary',
            microsoftAccountId: account.id,
            color: ''
          });

          if (!token) {
            throw new OutlookApiError(`Failed to refresh token for ${account.email}.`);
          }
          account.accessToken = token;
        }

        const { fetchOutlookCalendarList } = await import('../auth/api');
        const allCalendars = await fetchOutlookCalendarList(account);
        const existingIds = new Set(
          PluginState.getSettings()
            .calendarSources.filter(
              (s): s is Extract<typeof s, { type: 'outlook'; calendarId: string }> =>
                s.type === 'outlook'
            )
            .map(s => s.calendarId)
        );

        setAvailableCalendars(allCalendars.filter(cal => !existingIds.has(cal.id)));
        setView('calendar-select');
      } catch (e) {
        const message = e instanceof Error ? e.message : t('outlook.errors.unknown');
        setError(t('outlook.errors.fetchCalendars', { email: account.email, message }));
        setView('account-select');
      } finally {
        setIsLoading(false);
      }
    },
    [authManager]
  );

  const handleSave = () => {
    if (!selectedAccount) return;

    const configs = availableCalendars
      .filter(cal => selection.has(cal.id))
      .map(cal => ({
        id: cal.id,
        name: `${cal.name} (${selectedAccount.email})`,
        color: cal.color || ''
      }));

    onSave(configs, selectedAccount.id);
    onClose();
  };

  useEffect(() => {
    if (view !== 'account-select' || !accountListRef.current) return;
    const container = accountListRef.current;
    container.empty();

    accounts.forEach(account => {
      const hasToken = CredentialStore.hasMicrosoftRefreshToken(account.id);
      const displayName =
        account.email + (hasToken ? '' : ` (${t('settings.credentials.keychainMissing')})`);
      new Setting(container)
        .setName(displayName)
        .addButton(button =>
          button
            .setButtonText(t('outlook.buttons.selectCalendars'))
            .onClick(() => handleSelectAccount(account))
        );
    });

    new Setting(container).setName(t('outlook.selectAccount.title')).addButton(button =>
      button
        .setButtonText(t('outlook.buttons.connectAccount'))
        .setCta()
        .onClick(() => startOutlookLogin(plugin))
    );
  }, [view, accounts, plugin, handleSelectAccount]);

  useEffect(() => {
    if (view !== 'calendar-select' || !calendarListRef.current) return;
    const container = calendarListRef.current;
    container.empty();

    availableCalendars.forEach(cal => {
      new Setting(container).setName(cal.name).addToggle(toggle => {
        toggle.setValue(selection.has(cal.id)).onChange(value => handleToggle(cal.id, value));
      });
    });
  }, [view, availableCalendars, selection]);

  if (isLoading) return <div>{t('outlook.loading')}</div>;

  if (view === 'account-select') {
    return (
      <div>
        <div className="setting-item setting-item-heading">
          <div className="setting-item-info">
            <div className="setting-item-name">{t('outlook.selectAccount.title')}</div>
          </div>
        </div>
        {error && <p className="mod-warning">{error}</p>}
        <div ref={accountListRef}></div>
      </div>
    );
  }

  return (
    <div>
      <div className="setting-item setting-item-heading">
        <div className="setting-item-info">
          <div className="setting-item-name">
            {t('outlook.selectCalendars.title', { email: selectedAccount?.email ?? '' })}
          </div>
          <div className="setting-item-description">
            {availableCalendars.length === 0
              ? t('outlook.selectCalendars.noCalendars')
              : t('outlook.selectCalendars.description')}
          </div>
        </div>
      </div>

      <div ref={calendarListRef}></div>

      <div className="setting-item">
        <div className="setting-item-control">
          <button onClick={() => setView('account-select')}>
            {t('outlook.buttons.backToAccounts')}
          </button>
          <button
            className="mod-cta u-ml-auto"
            onClick={handleSave}
            disabled={selection.size === 0}
          >
            {selection.size === 1
              ? t('outlook.buttons.addCalendars', { count: selection.size })
              : t('outlook.buttons.addCalendarsPlural', { count: selection.size })}
          </button>
        </div>
      </div>
    </div>
  );
};
