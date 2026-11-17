/**
 * @jest-environment jsdom
 */
import { TextEncoder, TextDecoder } from 'util';
Object.defineProperty(window, 'TextEncoder', { value: TextEncoder, writable: true });
Object.defineProperty(window, 'TextDecoder', { value: TextDecoder, writable: true });

import { requestUrl, RequestUrlParam } from 'obsidian';
import {
  startGoogleLogin,
  exchangeCodeForToken,
  saveGoogleOAuthSession,
  consumeGoogleOAuthSession,
  clearExpiredGoogleOAuthSessions
} from './auth';
import { PluginState } from '../../../core/PluginState';
import { FullCalendarSettings } from '../../../types/settings';
import { showNotice } from '../../../utils/showNotice';
import { openExternalUrl } from '../../../utils/openExternalUrl';
import { t } from '../../../features/i18n/i18n';
import FullCalendarPlugin from '../../../main';

jest.mock('../../../core/PluginState');
jest.mock('../../../utils/showNotice');
jest.mock('../../../utils/openExternalUrl');

interface WindowWithRequire extends Window {
  require?: (mod: string) => unknown;
}

describe('Google Auth Reconnect Logic', () => {
  let mockPlugin: FullCalendarPlugin;
  const mockSettings: Partial<FullCalendarSettings> = {
    useCustomGoogleClient: false,
    googleClientId: '',
    googleUseCopyPasteAuth: false,
    googleAccounts: []
  };

  beforeAll(() => {
    // Provide subtle crypto digest if missing in jsdom
    if (!window.crypto?.subtle?.digest) {
      Object.defineProperty(window, 'crypto', {
        value: {
          subtle: {
            digest: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4]).buffer)
          }
        }
      });
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    const mockHttp = {
      createServer: jest.fn().mockReturnValue({
        listen: jest.fn((_port: number, cb?: () => void) => {
          if (cb) cb();
        }),
        close: jest.fn()
      })
    };
    const mockUrl = {
      parse: jest.fn()
    };
    (window as WindowWithRequire).require = jest.fn((mod: string): unknown => {
      if (mod === 'http') return mockHttp;
      if (mod === 'url') return mockUrl;
      return null;
    });
    (PluginState.getSettings as jest.Mock).mockReturnValue(mockSettings);
    mockPlugin = {
      app: {
        workspace: {
          trigger: jest.fn()
        }
      }
    } as unknown as FullCalendarPlugin;
  });

  describe('Session Storage & TTL', () => {
    it('saves and consumes Google OAuth session from localStorage', () => {
      const session = {
        verifier: 'test_verifier',
        state: 'state_123',
        scopes: 'email calendar',
        isReconnect: true,
        expectedEmail: 'user@example.com',
        timestamp: Date.now()
      };

      saveGoogleOAuthSession(session);
      const consumed = consumeGoogleOAuthSession('state_123');

      expect(consumed).toEqual(session);
      // Ensure single-use (consumed)
      expect(consumeGoogleOAuthSession('state_123')).toBeNull();
    });

    it('returns null and does not consume if session is expired (> 15 mins)', () => {
      const expiredSession = {
        verifier: 'test_verifier',
        state: 'expired_state',
        scopes: 'email',
        isReconnect: true,
        timestamp: Date.now() - 16 * 60 * 1000
      };

      saveGoogleOAuthSession(expiredSession);
      expect(consumeGoogleOAuthSession('expired_state')).toBeNull();
    });

    it('clears multiple consecutive expired sessions without index-shifting skipping', () => {
      const expired1 = {
        verifier: 'v1',
        state: 's1',
        scopes: 'email',
        timestamp: Date.now() - 20 * 60 * 1000
      };
      const expired2 = {
        verifier: 'v2',
        state: 's2',
        scopes: 'email',
        timestamp: Date.now() - 25 * 60 * 1000
      };
      const expired3 = {
        verifier: 'v3',
        state: 's3',
        scopes: 'email',
        timestamp: Date.now() - 30 * 60 * 1000
      };
      const valid = {
        verifier: 'v4',
        state: 's4',
        scopes: 'email',
        timestamp: Date.now()
      };

      saveGoogleOAuthSession(expired1);
      saveGoogleOAuthSession(expired2);
      saveGoogleOAuthSession(expired3);
      saveGoogleOAuthSession(valid);

      clearExpiredGoogleOAuthSessions();

      expect(consumeGoogleOAuthSession('s1')).toBeNull();
      expect(consumeGoogleOAuthSession('s2')).toBeNull();
      expect(consumeGoogleOAuthSession('s3')).toBeNull();
      expect(consumeGoogleOAuthSession('s4')).not.toBeNull();
    });
  });

  describe('startGoogleLogin URL construction', () => {
    it('sets login_hint and prompt=consent when reconnecting with an email', async () => {
      await startGoogleLogin(mockPlugin, 'calendar', {
        isReconnect: true,
        email: 'reconnect@example.com'
      });

      expect(openExternalUrl).toHaveBeenCalledTimes(1);
      const calls = (openExternalUrl as jest.Mock).mock.calls as string[][];
      const authUrl = calls[0][0];
      const url = new URL(authUrl);

      expect(url.searchParams.get('login_hint')).toBe('reconnect@example.com');
      expect(url.searchParams.get('prompt')).toBe('consent');
      expect(url.searchParams.get('access_type')).toBe('offline');

      // Verify session was persisted
      const state = url.searchParams.get('state')!;
      const session = consumeGoogleOAuthSession(state);
      expect(session).not.toBeNull();
      expect(session?.isReconnect).toBe(true);
      expect(session?.expectedEmail).toBe('reconnect@example.com');
    });

    it('does not set login_hint when initial connection (isReconnect=false)', async () => {
      await startGoogleLogin(mockPlugin, 'calendar');

      expect(openExternalUrl).toHaveBeenCalledTimes(1);
      const calls = (openExternalUrl as jest.Mock).mock.calls as string[][];
      const authUrl = calls[0][0];
      const url = new URL(authUrl);

      expect(url.searchParams.get('login_hint')).toBeNull();
      expect(url.searchParams.get('prompt')).toBe('consent');

      const state = url.searchParams.get('state')!;
      const session = consumeGoogleOAuthSession(state);
      expect(session?.isReconnect).toBe(false);
      expect(session?.expectedEmail).toBeUndefined();
    });
  });

  describe('exchangeCodeForToken proxy parameters', () => {
    it('sends reconnect=true in URL and body when isReconnect is true', async () => {
      const state = 'test_reconnect_state';
      saveGoogleOAuthSession({
        verifier: 'verifier_abc',
        state,
        scopes: 'email calendar',
        isReconnect: true,
        expectedEmail: 'test@example.com',
        timestamp: Date.now()
      });

      (requestUrl as jest.Mock).mockImplementation(async (opts: RequestUrlParam) => {
        if (opts.url.includes('/api/google/token')) {
          return {
            status: 200,
            json: {
              access_token: 'fake_access_token',
              refresh_token: 'fake_refresh_token',
              expires_in: 3600
            }
          };
        }
        if (opts.url.includes('/userinfo')) {
          return {
            status: 200,
            json: { email: 'test@example.com' }
          };
        }
        return { status: 404 };
      });

      await exchangeCodeForToken('auth_code_123', state, mockPlugin);

      const calls = (requestUrl as jest.Mock).mock.calls as [RequestUrlParam][];
      const tokenCall = calls.find(call => call[0].url.includes('/api/google/token'));
      expect(tokenCall).toBeDefined();

      const [tokenReq] = tokenCall!;
      expect(tokenReq.url).toContain('?reconnect=true');
      const bodyStr = typeof tokenReq.body === 'string' ? tokenReq.body : '';
      const parsedBody = JSON.parse(bodyStr) as Record<string, unknown>;
      expect(parsedBody['reconnect']).toBe(true);
      expect(parsedBody['code']).toBe('auth_code_123');
      expect(parsedBody['code_verifier']).toBe('verifier_abc');
    });

    it('sends reconnect=false and clean URL when isReconnect is false', async () => {
      const state = 'test_initial_state';
      saveGoogleOAuthSession({
        verifier: 'verifier_xyz',
        state,
        scopes: 'email calendar',
        isReconnect: false,
        timestamp: Date.now()
      });

      (requestUrl as jest.Mock).mockImplementation(async (opts: RequestUrlParam) => {
        if (opts.url.includes('/api/google/token')) {
          return {
            status: 200,
            json: {
              access_token: 'fake_access_token',
              refresh_token: 'fake_refresh_token',
              expires_in: 3600
            }
          };
        }
        if (opts.url.includes('/userinfo')) {
          return {
            status: 200,
            json: { email: 'newuser@example.com' }
          };
        }
        return { status: 404 };
      });

      await exchangeCodeForToken('auth_code_456', state, mockPlugin);

      const calls = (requestUrl as jest.Mock).mock.calls as [RequestUrlParam][];
      const tokenCall = calls.find(call => call[0].url.includes('/api/google/token'));
      expect(tokenCall).toBeDefined();
      const [tokenReq] = tokenCall!;
      expect(tokenReq.url).not.toContain('?reconnect=');
      const bodyStr = typeof tokenReq.body === 'string' ? tokenReq.body : '';
      const parsedBody = JSON.parse(bodyStr) as Record<string, unknown>;
      expect(parsedBody['reconnect']).toBe(false);
    });

    it('does NOT send reconnect to Google when useCustomGoogleClient is true', async () => {
      (PluginState.getSettings as jest.Mock).mockReturnValue({
        ...mockSettings,
        useCustomGoogleClient: true,
        googleClientId: 'custom_client',
        googleClientSecret: 'custom_secret'
      });

      const state = 'custom_client_state';
      saveGoogleOAuthSession({
        verifier: 'verifier_custom',
        state,
        scopes: 'email',
        isReconnect: true,
        timestamp: Date.now()
      });

      (requestUrl as jest.Mock).mockImplementation(async (opts: RequestUrlParam) => {
        if (opts.url.includes('oauth2.googleapis.com/token')) {
          return {
            status: 200,
            json: {
              access_token: 'access_custom',
              refresh_token: 'refresh_custom',
              expires_in: 3600
            }
          };
        }
        if (opts.url.includes('/userinfo')) {
          return {
            status: 200,
            json: { email: 'custom@example.com' }
          };
        }
        return { status: 404 };
      });

      await exchangeCodeForToken('auth_code_custom', state, mockPlugin);

      const calls = (requestUrl as jest.Mock).mock.calls as [RequestUrlParam][];
      const tokenCall = calls.find(call => call[0].url.includes('oauth2.googleapis.com/token'));
      expect(tokenCall).toBeDefined();
      const [tokenReq] = tokenCall!;
      expect(tokenReq.url).not.toContain('reconnect');
      const bodyStr = typeof tokenReq.body === 'string' ? tokenReq.body : '';
      expect(bodyStr).not.toContain('reconnect');
    });

    it('rejects account mismatch if user authenticated as another account during reconnect', async () => {
      const state = 'state_mismatch_test';
      saveGoogleOAuthSession({
        verifier: 'verifier_mismatch',
        state,
        scopes: 'email calendar',
        isReconnect: true,
        expectedEmail: 'expected@example.com',
        timestamp: Date.now()
      });

      (requestUrl as jest.Mock).mockImplementation(async (opts: RequestUrlParam) => {
        if (opts.url.includes('/api/google/token')) {
          return {
            status: 200,
            json: {
              access_token: 'token_wrong_user',
              refresh_token: 'refresh_wrong_user',
              expires_in: 3600
            }
          };
        }
        if (opts.url.includes('/userinfo')) {
          // Returning an unexpected email!
          return {
            status: 200,
            json: { email: 'otheruser@example.com' }
          };
        }
        return { status: 404 };
      });

      await exchangeCodeForToken('code_wrong_user', state, mockPlugin);

      expect(showNotice).toHaveBeenCalledTimes(1);
      expect(showNotice).toHaveBeenCalledWith(expect.stringContaining('Account mismatch'));
    });

    it('trims whitespace when comparing expected and authenticated emails', async () => {
      const state = 'state_whitespace_test';
      saveGoogleOAuthSession({
        verifier: 'verifier_ws',
        state,
        scopes: 'email calendar',
        isReconnect: true,
        expectedEmail: '  trimmed@example.com  ',
        timestamp: Date.now()
      });

      (requestUrl as jest.Mock).mockImplementation(async (opts: RequestUrlParam) => {
        if (opts.url.includes('/api/google/token')) {
          return {
            status: 200,
            json: {
              access_token: 'token_ws',
              refresh_token: 'refresh_ws',
              expires_in: 3600
            }
          };
        }
        if (opts.url.includes('/userinfo')) {
          return {
            status: 200,
            json: { email: 'trimmed@example.com' }
          };
        }
        return { status: 404 };
      });

      await exchangeCodeForToken('code_ws', state, mockPlugin);

      expect(showNotice).toHaveBeenCalledWith(t('google.auth.success'));
    });

    it('rejects in-memory sessions that exceeded 15 minute TTL', async () => {
      const state = 'state_expired_in_memory';
      saveGoogleOAuthSession({
        verifier: 'verifier_expired',
        state,
        scopes: 'email',
        timestamp: Date.now() - 20 * 60 * 1000
      });

      await exchangeCodeForToken('code_expired', state, mockPlugin);

      expect(showNotice).toHaveBeenCalledWith(t('google.auth.stateMismatch'));
    });
  });
});
