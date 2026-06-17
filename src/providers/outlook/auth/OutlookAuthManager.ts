import { showNotice } from '../../../utils/showNotice';
import { requestUrl } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { PluginState } from '../../../core/PluginState';
import { CalendarInfo } from '../../../types';
import { MicrosoftAccount } from '../../../types/settings';
import { t } from '../../../features/i18n/i18n';
import { resolveOutlookAuthConfig } from './config';
import { CredentialStore } from '../../../features/credentials/CredentialStore';

const ME_URL = 'https://graph.microsoft.com/v1.0/me';

interface RefreshResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

type OutlookCalendarInfo = Extract<CalendarInfo, { type: 'outlook' }>;

export class OutlookAuthManager {
  private plugin: FullCalendarPlugin;

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
  }

  private async refreshAccessToken(account: MicrosoftAccount): Promise<string | null> {
    const refreshToken = CredentialStore.getMicrosoftRefreshToken(account.id);
    if (!refreshToken) {
      console.error('No refresh token available for Outlook account:', account.id);
      return null;
    }

    const { proxyBaseUrl, isCustom } = resolveOutlookAuthConfig(PluginState.getSettings());
    if (isCustom && !proxyBaseUrl) {
      showNotice(t('outlook.auth.proxyMissing'));
      return null;
    }

    try {
      const response = await requestUrl({
        method: 'POST',
        url: `${proxyBaseUrl}/api/microsoft/refresh`,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
        throw: false
      });

      if (response.status >= 200 && response.status < 300) {
        const data = response.json as RefreshResponse;
        CredentialStore.setMicrosoftAccessToken(account.id, data.access_token);
        account.expiryDate = Date.now() + data.expires_in * 1000;
        if (data.refresh_token) {
          CredentialStore.setMicrosoftRefreshToken(account.id, data.refresh_token);
        }
        await PluginState.saveSettings();
        return data.access_token;
      }

      console.error('Failed to refresh Outlook access token:', response.status, response.text);
      if (response.status === 400 || response.status === 401) {
        CredentialStore.setMicrosoftAccessToken(account.id, null);
        CredentialStore.setMicrosoftRefreshToken(account.id, null);
        account.expiryDate = null;
        await PluginState.saveSettings();
        showNotice(t('outlook.auth.expired'));
      }
      return null;
    } catch (error) {
      console.error('Network error during Outlook token refresh:', error);
      return null;
    }
  }

  public async getTokenForSource(source: OutlookCalendarInfo): Promise<string | null> {
    if (!source.microsoftAccountId) {
      showNotice(t('outlook.auth.authFailed'));
      return null;
    }

    const account = PluginState.getSettings().microsoftAccounts.find(
      a => a.id === source.microsoftAccountId
    );
    if (!account) {
      console.error('Could not find Outlook account with ID:', source.microsoftAccountId);
      return null;
    }

    const accessToken = CredentialStore.getMicrosoftAccessToken(account.id);
    if (accessToken && account.expiryDate && Date.now() < account.expiryDate - 60000) {
      return accessToken;
    }

    return this.refreshAccessToken(account);
  }

  private async getUserIdentity(accessToken: string): Promise<{ email: string; id: string }> {
    const response = await requestUrl({
      url: ME_URL,
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const json = response.json as {
      id: string;
      mail?: string | null;
      userPrincipalName?: string;
      displayName?: string;
    };

    const email = json.mail || json.userPrincipalName || json.displayName || json.id;
    return { email, id: json.id };
  }

  public async addAccount(auth: {
    refreshToken: string;
    accessToken: string;
    expiryDate: number;
  }): Promise<MicrosoftAccount> {
    const identity = await this.getUserIdentity(auth.accessToken);
    const newAccount: MicrosoftAccount = {
      id: `ms_${identity.id}`,
      email: identity.email,
      refreshToken: null,
      accessToken: null,
      expiryDate: auth.expiryDate
    };

    const existing = PluginState.getSettings().microsoftAccounts || [];
    const idx = existing.findIndex(a => a.id === newAccount.id);
    if (idx >= 0) {
      existing[idx] = newAccount;
    } else {
      existing.push(newAccount);
    }

    PluginState.getSettings().microsoftAccounts = existing;

    // Save tokens securely
    CredentialStore.setMicrosoftRefreshToken(newAccount.id, auth.refreshToken);
    CredentialStore.setMicrosoftAccessToken(newAccount.id, auth.accessToken);

    await PluginState.saveSettings();

    this.plugin.app.workspace.trigger('full-calendar:outlook-account-added');
    return newAccount;
  }

  public async removeAccount(accountId: string): Promise<void> {
    PluginState.getSettings().microsoftAccounts = (
      PluginState.getSettings().microsoftAccounts || []
    ).filter(a => a.id !== accountId);

    PluginState.getSettings().calendarSources = PluginState.getSettings().calendarSources.filter(
      source => !(source.type === 'outlook' && source.microsoftAccountId === accountId)
    );

    await PluginState.saveSettings();
  }
}
