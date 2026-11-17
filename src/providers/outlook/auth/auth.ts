import { showNotice } from '../../../utils/showNotice';
import { openExternalUrl } from '../../../utils/openExternalUrl';
import { Platform, requestUrl } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { PluginState } from '../../../core/PluginState';
import { t } from '../../../features/i18n/i18n';
import { OutlookAuthManager } from './OutlookAuthManager';
import { resolveOutlookAuthConfig } from './config';
import {
  BaseOAuthSession,
  OAuthSessionStore,
  AccountMismatchError
} from '../../utils/oauthSessionStore';

type DesktopRequest = { url?: string };
type DesktopResponse = { writeHead: (status: number) => void; end: (body?: string) => void };
type DesktopServer = { close: () => void; listen: (port: number, callback: () => void) => void };
type DesktopHttpModule = {
  createServer: (handler: (req: DesktopRequest, res: DesktopResponse) => void) => DesktopServer;
};
type DesktopUrlModule = {
  parse: (input: string, parseQueryString?: boolean) => { query?: Record<string, unknown> };
};

const AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const DESKTOP_REDIRECT_URI = 'http://localhost:42813/callback';
const SCOPES = 'offline_access Calendars.ReadWrite Calendars.ReadWrite.Shared User.Read';

export type OutlookOAuthSession = BaseOAuthSession;

export interface OutlookLoginOptions {
  isReconnect?: boolean;
  email?: string;
}

export const outlookSessionStore = new OAuthSessionStore<OutlookOAuthSession>('outlook');

export const saveOutlookOAuthSession = (session: OutlookOAuthSession): void =>
  outlookSessionStore.save(session);
export const consumeOutlookOAuthSession = (state: string): OutlookOAuthSession | null =>
  outlookSessionStore.consume(state);
export const clearExpiredOutlookOAuthSessions = (): void => outlookSessionStore.clearExpired();

let pkce: OutlookOAuthSession | null = null;
let server: DesktopServer | null = null;

function generateRandomString(length: number): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  for (let i = 0; i < length; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return window.crypto.subtle.digest('SHA-256', encoder.encode(plain));
}

function base64urlencode(a: ArrayBuffer): string {
  const bytes = new Uint8Array(a);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const hashed = await sha256(verifier);
  return base64urlencode(hashed);
}

function startDesktopLogin(plugin: FullCalendarPlugin, authUrl: string): void {
  const http = window.require('http') as DesktopHttpModule;
  const url = window.require('url') as DesktopUrlModule;

  if (server) {
    openExternalUrl(authUrl);
    return;
  }

  server = http.createServer((req, res) => {
    void (async () => {
      try {
        if (!req.url || !req.url.startsWith('/callback')) {
          res.writeHead(204);
          res.end();
          return;
        }

        const parsed = url.parse(req.url, true);
        const query = parsed.query || {};
        const code = query.code;
        const state = query.state;

        if (typeof code !== 'string' || typeof state !== 'string') {
          throw new Error('Invalid callback parameters');
        }

        res.end(t('outlook.auth.callbackSuccess'));

        if (server) {
          server.close();
          server = null;
        }

        await exchangeCodeForToken(code, state, plugin);
        PluginState.displaySettingsTab();
      } catch (error) {
        console.error('Error handling Outlook auth callback:', error);
        res.end(t('outlook.auth.callbackFailed'));
        if (server) {
          server.close();
          server = null;
        }
      }
    })();
  });

  server.listen(42813, () => {
    openExternalUrl(authUrl);
  });
}

export async function startOutlookLogin(
  plugin: FullCalendarPlugin,
  options: OutlookLoginOptions = {}
): Promise<void> {
  if (Platform.isMobile) {
    showNotice(t('outlook.auth.desktopOnly'));
    return;
  }

  outlookSessionStore.clearExpired();

  const settings = PluginState.getSettings();
  const { clientId, proxyBaseUrl, isCustom } = resolveOutlookAuthConfig(settings);

  if (isCustom && !clientId) {
    showNotice(t('outlook.auth.clientIdMissing'));
    return;
  }

  if (isCustom && !proxyBaseUrl) {
    showNotice(t('outlook.auth.proxyMissing'));
    return;
  }

  const isReconnect = options.isReconnect ?? false;
  const expectedEmail = options.email;

  const state = generateRandomString(16);
  const verifier = generateRandomString(128);
  const challenge = await generateCodeChallenge(verifier);

  const session: OutlookOAuthSession = {
    verifier,
    state,
    isReconnect,
    expectedEmail,
    timestamp: Date.now()
  };
  pkce = session;
  saveOutlookOAuthSession(session);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: DESKTOP_REDIRECT_URI,
    response_mode: 'query',
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });

  // Microsoft Entra ID rule:
  // When login_hint is present, DO NOT set prompt=select_account (causes AADSTS90014 error!)
  if (isReconnect && expectedEmail) {
    params.set('login_hint', expectedEmail);
  } else {
    params.set('prompt', 'select_account');
  }

  startDesktopLogin(plugin, `${AUTH_URL}?${params.toString()}`);
}

export async function exchangeCodeForToken(
  code: string,
  state: string,
  plugin: FullCalendarPlugin
): Promise<void> {
  let session = pkce;
  if (!outlookSessionStore.isValid(session) || session?.state !== state) {
    session = outlookSessionStore.consume(state);
  } else {
    outlookSessionStore.consume(state);
  }

  if (!session || state !== session.state) {
    showNotice(t('outlook.auth.stateMismatch'));
    return;
  }

  const settings = PluginState.getSettings();
  const { proxyBaseUrl, isCustom } = resolveOutlookAuthConfig(settings);

  if (isCustom && !proxyBaseUrl) {
    showNotice(t('outlook.auth.proxyMissing'));
    return;
  }

  const isReconnect = session.isReconnect ?? false;
  const tokenUrl = isReconnect
    ? `${proxyBaseUrl}/api/microsoft/token?reconnect=true`
    : `${proxyBaseUrl}/api/microsoft/token`;

  const body: Record<string, unknown> = {
    code,
    code_verifier: session.verifier,
    reconnect: isReconnect
  };

  try {
    const response = await requestUrl({
      method: 'POST',
      url: tokenUrl,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      throw: false
    });

    if (response.status >= 400) {
      throw new Error(`Outlook token exchange failed (${response.status}): ${response.text}`);
    }

    const data = response.json as {
      refresh_token?: string;
      access_token: string;
      expires_in: number;
    };

    if (!data.refresh_token) {
      throw new Error('No refresh token received from Microsoft proxy.');
    }

    const authManager = new OutlookAuthManager(plugin);
    await authManager.addAccount({
      refreshToken: data.refresh_token,
      accessToken: data.access_token,
      expiryDate: Date.now() + data.expires_in * 1000,
      expectedEmail: session.expectedEmail
    });

    showNotice(t('outlook.auth.success'));
  } catch (error) {
    console.error('Outlook token exchange error:', error);
    if (!(error instanceof AccountMismatchError)) {
      showNotice(t('outlook.auth.failed'));
    }
  } finally {
    pkce = null;
    clearExpiredOutlookOAuthSessions();
  }
}
