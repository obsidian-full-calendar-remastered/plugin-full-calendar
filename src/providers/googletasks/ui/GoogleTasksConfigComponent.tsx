import { PluginState } from '../../../core/PluginState';
import * as React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Setting } from 'obsidian';
import { GoogleAccount } from '../../../types/settings';
import { startGoogleLogin } from '../../google/auth/auth';
import FullCalendarPlugin from '../../../main';
import { GoogleApiError } from '../../google/auth/request';
import { GoogleAuthManager } from '../../google/auth/GoogleAuthManager';
import { t } from '../../../features/i18n/i18n';

type SelectedGoogleTaskList = {
  id: string;
  name: string;
  color: string;
};

interface GoogleTasksConfigComponentProps {
  plugin: FullCalendarPlugin;
  onSave: (configs: SelectedGoogleTaskList[], accountId: string) => void;
  onClose: () => void;
}

export const GoogleTasksConfigComponent: React.FC<GoogleTasksConfigComponentProps> = ({
  plugin,
  onSave,
  onClose
}) => {
  const [view, setView] = useState<'account-select' | 'calendar-select'>('account-select');
  const [accounts, setAccounts] = useState<GoogleAccount[]>(
    PluginState.getSettings().googleAccounts || []
  );
  const [selectedAccount, setSelectedAccount] = useState<GoogleAccount | null>(null);

  interface TaskListDisplayItem {
    id: string;
    summary: string;
  }

  const [availableLists, setAvailableLists] = useState<TaskListDisplayItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const authManager = useMemo(() => new GoogleAuthManager(plugin), [plugin]);

  const accountListRef = useRef<HTMLDivElement>(null);
  const calendarListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleAccountAdded = () => {
      const latestAccounts = PluginState.getSettings().googleAccounts || [];
      setAccounts([...latestAccounts]);
    };
    (plugin.app.workspace as unknown as { on: (name: string, cb: () => void) => void }).on(
      'full-calendar:google-account-added',
      handleAccountAdded
    );
    return () => {
      (plugin.app.workspace as unknown as { off: (name: string, cb: () => void) => void }).off(
        'full-calendar:google-account-added',
        handleAccountAdded
      );
    };
  }, [plugin]);

  const handleSelectAccount = useCallback(
    async (account: GoogleAccount) => {
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
            type: 'google',
            id: `temp_${account.id}`,
            name: account.email,
            calendarId: 'primary',
            googleAccountId: account.id,
            color: ''
          });
          if (!token) {
            throw new GoogleApiError(
              `Failed to refresh token for ${account.email}. Please try connecting the account again.`
            );
          }
          account.accessToken = token;
        }

        const { fetchGoogleTaskList } = await import('../../google/auth/api');
        const allLists = await fetchGoogleTaskList(plugin, account);
        const existingListIds = new Set(
          PluginState.getSettings()
            .calendarSources.filter(
              (s): s is Extract<typeof s, { type: 'googletasks'; listId: string }> =>
                s.type === 'googletasks'
            )
            .map(s => s.listId)
        );

        setAvailableLists(
          allLists
            .filter(list => !existingListIds.has(list.id))
            .map(list => ({ id: list.id, summary: list.title }))
        );
        setView('calendar-select');
      } catch (e) {
        const message = e instanceof Error ? e.message : 'An unknown error occurred.';
        setError(`Failed to fetch task lists for ${account.email}. ${message}`);
        setView('account-select');
      } finally {
        setIsLoading(false);
      }
    },
    [authManager, plugin]
  );

  const handleToggle = (id: string, value: boolean) => {
    setSelection(prev => {
      const newSelection = new Set(prev);
      if (value) newSelection.add(id);
      else newSelection.delete(id);
      return newSelection;
    });
  };

  const handleSave = () => {
    if (!selectedAccount) return;
    const selectedConfigs = availableLists
      .filter(list => selection.has(list.id))
      .map(list => ({
        id: list.id,
        name: list.summary,
        color: '#4285F4' // Google Blue default for Google Tasks
      }));
    onSave(selectedConfigs, selectedAccount.id);
    onClose();
  };

  useEffect(() => {
    if (view === 'account-select' && accountListRef.current) {
      const container = accountListRef.current;
      container.empty();

      accounts.forEach(account => {
        new Setting(container)
          .setName(account.email)
          .addButton(button =>
            button
              .setButtonText(t('google.buttons.selectCalendars'))
              .onClick(() => handleSelectAccount(account))
          );
      });

      new Setting(container).setName(t('google.selectAccount.title')).addButton(button =>
        button
          .setButtonText(t('google.buttons.connectAccount'))
          .setCta()
          .onClick(() => startGoogleLogin(plugin))
      );
    }
  }, [view, accounts, plugin, handleSelectAccount]);

  useEffect(() => {
    if (view === 'calendar-select' && calendarListRef.current) {
      const container = calendarListRef.current;
      container.empty();

      availableLists.forEach(list => {
        new Setting(container).setName(list.summary).addToggle(toggle => {
          toggle.setValue(selection.has(list.id)).onChange(value => handleToggle(list.id, value));
        });
      });
    }
  }, [view, availableLists, selection]);

  if (isLoading) return <div>{t('google.loading')}</div>;

  if (view === 'account-select') {
    return (
      <div>
        <div className="setting-item setting-item-heading">
          <div className="setting-item-info">
            <div className="setting-item-name">{t('google.selectAccount.title')}</div>
          </div>
        </div>
        {error && <p className="mod-warning">{error}</p>}
        <div ref={accountListRef}></div>
      </div>
    );
  }

  if (view === 'calendar-select') {
    return (
      <div>
        <div className="setting-item setting-item-heading">
          <div className="setting-item-info">
            <div className="setting-item-name">
              Select Google Task Lists for {selectedAccount?.email ?? ''}
            </div>
            <div className="setting-item-description">
              {availableLists.length === 0
                ? 'No remaining task lists found on this account.'
                : 'Select the Google Task lists you want to add.'}
            </div>
          </div>
        </div>
        <div ref={calendarListRef}></div>

        <div className="setting-item">
          <div className="setting-item-control">
            <button onClick={() => setView('account-select')}>
              {t('google.buttons.backToAccounts')}
            </button>
            <button
              className="mod-cta u-ml-auto"
              onClick={handleSave}
              disabled={selection.size === 0}
            >
              Add Google Task List
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
