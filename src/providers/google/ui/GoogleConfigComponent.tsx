/**
 * @file GoogleConfigComponent.tsx
 * @brief React component for the new multi-account Google Calendar setup wizard.
 * @license See LICENSE.md
 */

import { PluginState } from '../../../core/PluginState';
import * as React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Setting } from 'obsidian';
import { GoogleAccount } from '../../../types/settings';
import { startGoogleLogin } from '../auth/auth';
import FullCalendarPlugin from '../../../main';
import { GoogleApiError } from '../auth/request';
import { GoogleAuthManager } from '../auth/GoogleAuthManager'; // Import the manager
import { t } from '../../../features/i18n/i18n';
import { CredentialStore } from '../../../features/credentials/CredentialStore';

// ADD this new type definition. It accurately describes what the component passes back.
type SelectedGoogleCalendar = {
  id: string; // The Google Calendar ID (e.g., "primary", "user@gmail.com")
  name: string;
  color: string;
};

interface GoogleConfigComponentProps {
  plugin: FullCalendarPlugin;
  onSave: (configs: SelectedGoogleCalendar[], accountId: string) => void;
  onClose: () => void;
}

export const GoogleConfigComponent: React.FC<GoogleConfigComponentProps> = ({
  plugin,
  onSave,
  onClose
}) => {
  const [view, setView] = useState<'account-select' | 'calendar-select'>('account-select');
  const [accounts, setAccounts] = useState<GoogleAccount[]>(
    PluginState.getSettings().googleAccounts || []
  );
  const [selectedAccount, setSelectedAccount] = useState<GoogleAccount | null>(null);
  interface CalendarListDisplayItem {
    id: string;
    summary: string;
    backgroundColor?: string;
    description?: string;
  }
  const [availableCalendars, setAvailableCalendars] = useState<CalendarListDisplayItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const authManager = useMemo(() => new GoogleAuthManager(plugin), [plugin]);

  // Refs for imperative Obsidian UI components
  const accountListRef = useRef<HTMLDivElement>(null);
  const calendarListRef = useRef<HTMLDivElement>(null);

  // REMOVE legacy polling useEffect:
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     const latestAccounts = PluginState.getSettings().googleAccounts || [];
  //     if (latestAccounts.length !== accounts.length) {
  //       setAccounts(latestAccounts);
  //     }
  //   }, 500);
  //   return () => clearInterval(interval);
  // }, [PluginState.getSettings().googleAccounts, accounts.length]);

  // ADD event-driven update for accounts list:
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
        // Refresh token if it's expired before we use it
        if (
          !account.accessToken ||
          !account.expiryDate ||
          Date.now() >= account.expiryDate - 60000
        ) {
          // Use public API (getTokenForSource) to trigger refresh logic.
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

        const { fetchGoogleCalendarList } = await import('../auth/api');
        // REMOVE THE HACK and pass the account object directly.
        const allCalendars = await fetchGoogleCalendarList(plugin, account);
        const existingGoogleIds = new Set(
          PluginState.getSettings()
            .calendarSources.filter(
              (s): s is Extract<typeof s, { type: 'google'; calendarId: string }> =>
                s.type === 'google'
            )
            .map(s => s.calendarId)
        );
        setAvailableCalendars(allCalendars.filter(cal => !existingGoogleIds.has(cal.id)));
        setView('calendar-select');
      } catch (e) {
        const message = e instanceof Error ? e.message : 'An unknown error occurred.';
        setError(`Failed to fetch calendars for ${account.email}. ${message}`);
        setView('account-select');
      } finally {
        setIsLoading(false);
        // REMOVE THE HACK CLEANUP
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
    const selectedConfigs = availableCalendars
      .filter(cal => selection.has(cal.id))
      .map(cal => ({
        id: cal.id,
        name: cal.summary,
        color: cal.backgroundColor || ''
      }));
    onSave(selectedConfigs, selectedAccount.id);
    onClose();
  };

  // Effect for rendering the account list imperatively
  useEffect(() => {
    if (view === 'account-select' && accountListRef.current) {
      const container = accountListRef.current;
      container.empty(); // Clear previous content

      accounts.forEach(account => {
        const hasToken = CredentialStore.hasGoogleRefreshToken(account.id);
        const displayName =
          account.email + (hasToken ? '' : ` (${t('settings.credentials.keychainMissing')})`);
        new Setting(container)
          .setName(displayName)
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
  }, [view, accounts, plugin, handleSelectAccount]); // Rerun when view or accounts change

  // Effect for rendering the calendar list imperatively
  useEffect(() => {
    if (view === 'calendar-select' && calendarListRef.current) {
      const container = calendarListRef.current;
      container.empty();

      availableCalendars.forEach(cal => {
        new Setting(container)
          .setName(cal.summary)
          .setDesc(cal.description || '')
          .addToggle(toggle => {
            toggle.setValue(selection.has(cal.id)).onChange(value => handleToggle(cal.id, value));
          });
      });
    }
  }, [view, availableCalendars, selection]); // Rerun when data changes

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
        {/* Container for imperative settings */}
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
              {t('google.selectCalendars.title', { email: selectedAccount?.email ?? '' })}
            </div>
            <div className="setting-item-description">
              {availableCalendars.length === 0
                ? t('google.selectCalendars.noCalendars')
                : t('google.selectCalendars.description')}
            </div>
          </div>
        </div>
        {/* Container for imperative settings */}
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
              {selection.size === 1
                ? t('google.buttons.addCalendars', { count: selection.size })
                : t('google.buttons.addCalendarsPlural', { count: selection.size })}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
