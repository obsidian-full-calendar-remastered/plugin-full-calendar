import { showNotice } from '../../../utils/showNotice';
import { openExternalUrl } from '../../../utils/openExternalUrl';
import { Platform, requestUrl } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { PluginState } from '../../../core/PluginState';
import { t } from '../../../features/i18n/i18n';
import { OutlookAuthManager } from './OutlookAuthManager';
import { resolveOutlookAuthConfig } from './config';

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

let pkce: { verifier: string; state: string } | null = null;
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

export async function startOutlookLogin(plugin: FullCalendarPlugin): Promise<void> {
  if (Platform.isMobile) {
    showNotice(t('outlook.auth.desktopOnly'));
    return;
  }

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

  const state = generateRandomString(16);
  const verifier = generateRandomString(128);
  const challenge = await generateCodeChallenge(verifier);
  pkce = { verifier, state };

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

  startDesktopLogin(plugin, `${AUTH_URL}?${params.toString()}`);
}

export async function exchangeCodeForToken(
  code: string,
  state: string,
  plugin: FullCalendarPlugin
): Promise<void> {
  if (!pkce || state !== pkce.state) {
    showNotice(t('outlook.auth.stateMismatch'));
    return;
  }

  const settings = PluginState.getSettings();
  const { proxyBaseUrl, isCustom } = resolveOutlookAuthConfig(settings);

  if (isCustom && !proxyBaseUrl) {
    showNotice(t('outlook.auth.proxyMissing'));
    return;
  }

  try {
    const response = await requestUrl({
      method: 'POST',
      url: `${proxyBaseUrl}/api/microsoft/token`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: pkce.verifier
      }),
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
      expiryDate: Date.now() + data.expires_in * 1000
    });

    showNotice(t('outlook.auth.success'));
  } catch (error) {
    console.error('Outlook token exchange error:', error);
    showNotice(t('outlook.auth.failed'));
  } finally {
    pkce = null;
  }
}
