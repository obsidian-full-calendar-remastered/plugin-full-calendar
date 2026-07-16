import { showNotice } from '../../../utils/showNotice';
import { openExternalUrl } from '../../../utils/openExternalUrl';
/**
 * @file auth.ts
 * @brief Handles all OAuth 2.0 logic for Google Calendar integration.
 *
 * @description
 * This module manages the OAuth 2.0 Authorization Code Flow with PKCE.
 * It handles generating auth URLs, exchanging the authorization code for tokens,
 * storing tokens securely, and automatically refreshing the access token when it expires.
 *
 * @license See LICENSE.md
 */

import { Platform, requestUrl } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { GoogleAuthManager } from './GoogleAuthManager';
import { t } from '../../../features/i18n/i18n';
import { PluginState } from '../../../core/PluginState';
import { CopyTextModal } from '../../../ui/modals/CopyTextModal';
import { LoadingModal } from '../../../ui/modals/LoadingModal';
import { CredentialStore } from '../../../features/credentials/CredentialStore';

// =================================================================================================
// CONSTANTS
// =================================================================================================

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'; // Renamed for clarity
const PROXY_TOKEN_URL = 'https://gcal-proxy-server.vercel.app/api/google/token';

const CALENDAR_SCOPES =
  'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events email';
const TASKS_SCOPES = 'https://www.googleapis.com/auth/tasks email';

const MOBILE_REDIRECT_URI =
  'https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/assets/meta/google-auth-callback.html';
const DESKTOP_REDIRECT_URI = 'http://127.0.0.1:42813/callback';

const PUBLIC_CLIENT_ID = '272284435724-ltjbog78np5lnbjhgecudaqhsfba9voi.apps.googleusercontent.com';

// =================================================================================================
// MODULE STATE
// =================================================================================================

type DesktopRequest = { url?: string };
type DesktopResponse = { writeHead: (status: number) => void; end: (body?: string) => void };
type DesktopServer = { close: () => void; listen: (port: number, callback: () => void) => void };
type DesktopHttpModule = {
  createServer: (handler: (req: DesktopRequest, res: DesktopResponse) => void) => DesktopServer;
};
type DesktopUrlModule = {
  parse: (input: string, parseQueryString?: boolean) => { query?: Record<string, unknown> };
};

interface GlobalAuthState {
  pkce: { verifier: string; state: string; scopes: string } | null;
  server: DesktopServer | null;
  waitingModal: LoadingModal | null;
}

interface ExtendedWindow extends Window {
  _ofcGoogleAuthState?: GlobalAuthState;
}

function getGlobalAuthState(): GlobalAuthState {
  const g = window as ExtendedWindow;
  if (!g._ofcGoogleAuthState) {
    g._ofcGoogleAuthState = {
      pkce: null,
      server: null,
      waitingModal: null
    };
  }
  return g._ofcGoogleAuthState;
}

const oauthState = getGlobalAuthState();

// =================================================================================================
// PKCE HELPER FUNCTIONS
// =================================================================================================

function generateRandomString(length: number): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
}

function base64urlencode(a: ArrayBuffer): string {
  const bytes = new Uint8Array(a);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const hashed = await sha256(verifier);
  return base64urlencode(hashed);
}

function showAuthUI(
  plugin: FullCalendarPlugin,
  authUrl: string,
  useCopyPaste: boolean,
  isMobile: boolean
): void {
  if (useCopyPaste) {
    new CopyTextModal(plugin.app, {
      titleText: t('google.auth.copyModalTitle'),
      descriptionText: t('google.auth.copyModalDesc'),
      valueToCopy: authUrl,
      copyButtonLabel: t('google.auth.copyModalCopyButton'),
      copiedButtonLabel: t('google.auth.copyModalCopiedButton'),
      closeButtonLabel: t('google.auth.copyModalCloseButton'),
      onCloseCallback: () => {
        const onCancel = isMobile
          ? () => {
              oauthState.pkce = null;
              oauthState.waitingModal = null;
            }
          : () => {
              if (oauthState.server) {
                try {
                  oauthState.server.close();
                } catch (e) {
                  console.error('Error closing Google Auth server on cancel:', e);
                }
                oauthState.server = null;
              }
              oauthState.waitingModal = null;
            };

        // If desktop and server was already closed by the callback, don't open the waiting modal
        if (!isMobile && !oauthState.server) {
          return;
        }

        oauthState.waitingModal = new LoadingModal(plugin.app, {
          titleText: t('google.auth.waitingModalTitle'),
          descriptionText: t('google.auth.waitingModalDesc'),
          cancelLabel: t('google.auth.waitingModalCancel'),
          onCancel
        });
        oauthState.waitingModal.open();
      }
    }).open();
  } else {
    openExternalUrl(authUrl);
  }
}

function startDesktopLogin(plugin: FullCalendarPlugin, authUrl: string): void {
  const http = window.require('http') as DesktopHttpModule;
  const url = window.require('url') as DesktopUrlModule;
  const useCopyPaste = PluginState.getSettings().googleUseCopyPasteAuth;
  if (oauthState.server) {
    showAuthUI(plugin, authUrl, useCopyPaste, false);
    return;
  }
  oauthState.server = http.createServer(
    (
      req: { url?: string },
      res: { writeHead: (status: number) => void; end: (body?: string) => void }
    ) => {
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

          res.end('Authentication successful! Please return to Obsidian.');

          if (oauthState.server) {
            oauthState.server.close();
            oauthState.server = null;
          }

          await exchangeCodeForToken(code, state, plugin);
          // Refresh the settings tab if it's open
          PluginState.displaySettingsTab();
        } catch (e) {
          console.error('Error handling Google Auth callback:', e);
          res.end('Authentication failed. Please check the console in Obsidian and try again.');

          const modalToClose = oauthState.waitingModal;
          oauthState.waitingModal = null;
          if (modalToClose) {
            modalToClose.closeSuccess();
          }

          if (oauthState.server) {
            oauthState.server.close();
            oauthState.server = null;
          }
        }
      })();
    }
  );
  oauthState.server.listen(42813, () => {
    showAuthUI(plugin, authUrl, useCopyPaste, false);
  });
}

// =================================================================================================
// EXPORTED AUTHENTICATION FUNCTIONS
// =================================================================================================

/**
 * Kicks off the Google OAuth 2.0 flow.
 */
export async function startGoogleLogin(
  plugin: FullCalendarPlugin,
  flowType: 'calendar' | 'tasks' = 'calendar'
): Promise<void> {
  const settings = PluginState.getSettings();
  const isMobile = Platform.isMobile;
  const useCopyPaste = settings.googleUseCopyPasteAuth;

  // For mobile: Open window FIRST (synchronously) to avoid iOS popup blocker.
  // iOS requires window.open() to be called in the same event loop tick as the user action.
  let mobileWindow: Window | null = null;
  if (isMobile && !useCopyPaste) {
    mobileWindow = window.open('about:blank', '_blank');
    if (!mobileWindow) {
      showNotice(t('google.auth.popupBlocked'));
      return;
    }
  }

  // NOW perform async operations (after window is opened on mobile)
  const state = generateRandomString(16);
  const verifier = generateRandomString(128);
  const challenge = await generateCodeChallenge(verifier);

  // Store the verifier and state now; scopes will be added after computation below.
  oauthState.pkce = { verifier, state, scopes: '' };

  const clientId = settings.useCustomGoogleClient ? settings.googleClientId : PUBLIC_CLIENT_ID;
  const redirectUri = isMobile ? MOBILE_REDIRECT_URI : DESKTOP_REDIRECT_URI;

  const clientSecret = settings.useCustomGoogleClient
    ? CredentialStore.getGoogleClientSecret()
    : '';
  if (settings.useCustomGoogleClient && (!clientId || !clientSecret)) {
    showNotice(t('google.auth.customCredsMissing'));
    // Close the mobile window if we opened one
    if (mobileWindow) {
      mobileWindow.close();
    }
    return;
  }

  // Start with the scopes required for the requested flow type.
  const requestedScopes = flowType === 'tasks' ? TASKS_SCOPES : CALENDAR_SCOPES;

  // Merge in any scopes already granted to existing accounts so that re-authorizing
  // one provider (e.g. tasks) does not revoke the other provider's access (e.g. calendar)
  // on the same Google account. Google replaces the token's scopes on every OAuth flow,
  // so we must always include the union of all previously-granted scopes.
  // See: https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/issues/332
  const existingGrantedScopes = (PluginState.getSettings().googleAccounts || [])
    .flatMap(a => (a.grantedScopes ?? '').split(' '))
    .filter(Boolean);
  const allScopeTokens = Array.from(
    new Set([...requestedScopes.split(' '), ...existingGrantedScopes])
  );
  const scopes = allScopeTokens.join(' ');
  // Update pkce with the computed scopes so they are available in the callback.
  oauthState.pkce.scopes = scopes;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    prompt: 'consent',
    access_type: 'offline',
    state: state,
    scope: scopes,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });

  const authUrl = `${AUTH_URL}?${params.toString()}`;
  if (useCopyPaste) {
    if (isMobile) {
      showAuthUI(plugin, authUrl, true, true);
    } else {
      startDesktopLogin(plugin, authUrl);
    }
  } else if (isMobile && mobileWindow) {
    // Redirect the already-open window to the OAuth URL
    mobileWindow.location.href = authUrl;
  } else {
    startDesktopLogin(plugin, authUrl);
  }
}

export async function exchangeCodeForToken(
  code: string,
  state: string,
  plugin: FullCalendarPlugin
): Promise<void> {
  if (!oauthState.pkce || state !== oauthState.pkce.state) {
    const modalToClose = oauthState.waitingModal;
    oauthState.waitingModal = null;
    if (modalToClose) {
      modalToClose.closeSuccess();
    }
    showNotice(t('google.auth.stateMismatch'));
    console.error('State mismatch during OAuth callback.');
    return;
  }

  const settings = PluginState.getSettings();
  const isMobile = Platform.isMobile;
  const redirectUri = isMobile ? MOBILE_REDIRECT_URI : DESKTOP_REDIRECT_URI;
  const clientId = settings.useCustomGoogleClient ? settings.googleClientId : PUBLIC_CLIENT_ID;

  let tokenUrl: string;
  let requestBody: string;
  let requestHeaders: Record<string, string>;

  if (settings.useCustomGoogleClient) {
    // Legacy path: User provides their own credentials, talk to Google directly.
    tokenUrl = GOOGLE_TOKEN_URL;
    const clientSecret = settings.useCustomGoogleClient
      ? CredentialStore.getGoogleClientSecret()
      : '';
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code: code,
      code_verifier: oauthState.pkce.verifier,
      redirect_uri: redirectUri,
      client_secret: clientSecret
    });
    requestBody = body.toString();
    requestHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
  } else {
    // New default path: Use the public client ID and the proxy server.
    tokenUrl = PROXY_TOKEN_URL;
    const body = {
      client_id: clientId,
      code: code,
      code_verifier: oauthState.pkce.verifier,
      state: state
    };
    requestBody = JSON.stringify(body);
    requestHeaders = { 'Content-Type': 'application/json' };
  }

  try {
    const response = await requestUrl({
      method: 'POST',
      url: tokenUrl,
      headers: requestHeaders,
      body: requestBody,
      throw: false
    });

    if (response.status >= 400) {
      console.error('Token exchange failed:', response.text);
      throw new Error(`Google API returned status ${response.status}: ${response.text}`);
    }
    const data = response.json as {
      refresh_token?: string;
      access_token: string;
      expires_in: number;
    };

    if (!data.refresh_token) {
      throw new Error(
        "No refresh token received. If you are using a custom client, ensure it is configured for a 'Desktop app' and has not already been used to grant a refresh token."
      );
    }

    // --- REPLACEMENT BLOCK ---
    // Use GoogleAuthManager to add the account
    const authManager = new GoogleAuthManager(plugin);
    await authManager.addAccount({
      refreshToken: data.refresh_token,
      accessToken: data.access_token,
      expiryDate: Date.now() + data.expires_in * 1000,
      grantedScopes: oauthState.pkce!.scopes
    });
    // --- END REPLACEMENT BLOCK ---

    showNotice(t('google.auth.success'));
  } catch (e) {
    showNotice(t('google.auth.failed'));
    if (e instanceof Error) {
      console.error('Error during token exchange:', e.message);
    } else {
      console.error('An unknown error occurred during token exchange:', e);
    }
  } finally {
    oauthState.pkce = null;
    const modalToClose = oauthState.waitingModal;
    oauthState.waitingModal = null;
    if (modalToClose) {
      modalToClose.closeSuccess();
    }
  }
}
