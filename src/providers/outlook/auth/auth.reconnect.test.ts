/**
 * @jest-environment jsdom
 */
import { TextEncoder, TextDecoder } from 'util';
Object.defineProperty(window, 'TextEncoder', { value: TextEncoder, writable: true });
Object.defineProperty(window, 'TextDecoder', { value: TextDecoder, writable: true });

import { requestUrl, RequestUrlParam } from 'obsidian';
import {
  startOutlookLogin,
  exchangeCodeForToken,
  saveOutlookOAuthSession,
  consumeOutlookOAuthSession,
  clearExpiredOutlookOAuthSessions
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

describe('Outlook Auth Reconnect Logic', () => {
  let mockPlugin: FullCalendarPlugin;
  const mockSettings: Partial<FullCalendarSettings> = {
    useCustomMicrosoftClient: false,
    microsoftClientId: '',
    microsoftProxyBaseUrl: 'https://gcal-proxy-server.vercel.app',
    microsoftAccounts: []
  };

  beforeAll(() => {
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
    it('saves and consumes Outlook OAuth session from localStorage', () => {
      const session = {
        verifier: 'ms_verifier',
        state: 'ms_state_123',
        isReconnect: true,
        expectedEmail: 'outlook_user@example.com',
        timestamp: Date.now()
      };

      saveOutlookOAuthSession(session);
      const consumed = consumeOutlookOAuthSession('ms_state_123');

      expect(consumed).toEqual(session);
      expect(consumeOutlookOAuthSession('ms_state_123')).toBeNull();
    });

    it('returns null and does not consume if session is expired (> 15 mins)', () => {
      const expiredSession = {
        verifier: 'ms_verifier',
        state: 'ms_expired',
        isReconnect: true,
        timestamp: Date.now() - 16 * 60 * 1000
      };

      saveOutlookOAuthSession(expiredSession);
      expect(consumeOutlookOAuthSession('ms_expired')).toBeNull();
    });

    it('clears multiple consecutive expired sessions without index-shifting skipping', () => {
      const expired1 = {
        verifier: 'v1',
        state: 's1',
        isReconnect: true,
        timestamp: Date.now() - 20 * 60 * 1000
      };
      const expired2 = {
        verifier: 'v2',
        state: 's2',
        isReconnect: true,
        timestamp: Date.now() - 25 * 60 * 1000
      };
      const valid = {
        verifier: 'v3',
        state: 's3',
        isReconnect: false,
        timestamp: Date.now()
      };

      saveOutlookOAuthSession(expired1);
      saveOutlookOAuthSession(expired2);
      saveOutlookOAuthSession(valid);

      clearExpiredOutlookOAuthSessions();

      expect(consumeOutlookOAuthSession('s1')).toBeNull();
      expect(consumeOutlookOAuthSession('s2')).toBeNull();
      expect(consumeOutlookOAuthSession('s3')).not.toBeNull();
    });
  });

  describe('startOutlookLogin URL construction & Entra ID rules', () => {
    it('sets login_hint and OMITS prompt=select_account when reconnecting', async () => {
      await startOutlookLogin(mockPlugin, {
        isReconnect: true,
        email: 'ms_reconnect@example.com'
      });

      expect(openExternalUrl).toHaveBeenCalledTimes(1);
      const calls = (openExternalUrl as jest.Mock).mock.calls as string[][];
      const authUrl = calls[0][0];
      const url = new URL(authUrl);

      // Entra ID rule: login_hint MUST NOT be paired with prompt=select_account
      expect(url.searchParams.get('login_hint')).toBe('ms_reconnect@example.com');
      expect(url.searchParams.get('prompt')).toBeNull();

      const state = url.searchParams.get('state')!;
      const session = consumeOutlookOAuthSession(state);
      expect(session).not.toBeNull();
      expect(session?.isReconnect).toBe(true);
      expect(session?.expectedEmail).toBe('ms_reconnect@example.com');
    });

    it('sets prompt=select_account and omits login_hint on initial connect', async () => {
      await startOutlookLogin(mockPlugin);

      expect(openExternalUrl).toHaveBeenCalledTimes(1);
      const calls = (openExternalUrl as jest.Mock).mock.calls as string[][];
      const authUrl = calls[0][0];
      const url = new URL(authUrl);

      expect(url.searchParams.get('login_hint')).toBeNull();
      expect(url.searchParams.get('prompt')).toBe('select_account');

      const state = url.searchParams.get('state')!;
      const session = consumeOutlookOAuthSession(state);
      expect(session?.isReconnect).toBe(false);
      expect(session?.expectedEmail).toBeUndefined();
    });
  });

  describe('exchangeCodeForToken proxy parameters', () => {
    it('sends reconnect=true in URL and body when isReconnect is true', async () => {
      const state = 'outlook_reconnect_state';
      saveOutlookOAuthSession({
        verifier: 'verifier_ms_reconnect',
        state,
        isReconnect: true,
        expectedEmail: 'test_ms@example.com',
        timestamp: Date.now()
      });

      (requestUrl as jest.Mock).mockImplementation(async (opts: RequestUrlParam) => {
        if (opts.url.includes('/api/microsoft/token')) {
          return {
            status: 200,
            json: {
              access_token: 'ms_access_token',
              refresh_token: 'ms_refresh_token',
              expires_in: 3600
            }
          };
        }
        if (opts.url.includes('graph.microsoft.com/v1.0/me')) {
          return {
            status: 200,
            json: {
              id: 'user_guid_123',
              mail: 'test_ms@example.com'
            }
          };
        }
        return { status: 404 };
      });

      await exchangeCodeForToken('auth_code_ms', state, mockPlugin);

      const calls = (requestUrl as jest.Mock).mock.calls as [RequestUrlParam][];
      const tokenCall = calls.find(call => call[0].url.includes('/api/microsoft/token'));
      expect(tokenCall).toBeDefined();

      const [tokenReq] = tokenCall!;
      expect(tokenReq.url).toContain('?reconnect=true');
      const bodyStr = typeof tokenReq.body === 'string' ? tokenReq.body : '';
      const parsedBody = JSON.parse(bodyStr) as Record<string, unknown>;
      expect(parsedBody['reconnect']).toBe(true);
      expect(parsedBody['code']).toBe('auth_code_ms');
      expect(parsedBody['code_verifier']).toBe('verifier_ms_reconnect');
    });

    it('does NOT send ?reconnect=true when isReconnect is false', async () => {
      const state = 'outlook_initial_state';
      saveOutlookOAuthSession({
        verifier: 'verifier_ms_initial',
        state,
        isReconnect: false,
        timestamp: Date.now()
      });

      (requestUrl as jest.Mock).mockImplementation(async (opts: RequestUrlParam) => {
        if (opts.url.includes('/api/microsoft/token')) {
          return {
            status: 200,
            json: {
              access_token: 'ms_access_token',
              refresh_token: 'ms_refresh_token',
              expires_in: 3600
            }
          };
        }
        if (opts.url.includes('graph.microsoft.com/v1.0/me')) {
          return {
            status: 200,
            json: {
              id: 'user_guid_456',
              userPrincipalName: 'new_ms_user@example.com'
            }
          };
        }
        return { status: 404 };
      });

      await exchangeCodeForToken('auth_code_new', state, mockPlugin);

      const calls = (requestUrl as jest.Mock).mock.calls as [RequestUrlParam][];
      const tokenCall = calls.find(call => call[0].url.includes('/api/microsoft/token'));
      const [tokenReq] = tokenCall!;
      expect(tokenReq.url).not.toContain('?reconnect=');
      const bodyStr = typeof tokenReq.body === 'string' ? tokenReq.body : '';
      const parsedBody = JSON.parse(bodyStr) as Record<string, unknown>;
      expect(parsedBody['reconnect']).toBe(false);
    });

    it('rejects account mismatch if authenticated as another account during reconnect', async () => {
      const state = 'ms_mismatch_state';
      saveOutlookOAuthSession({
        verifier: 'verifier_ms_mismatch',
        state,
        isReconnect: true,
        expectedEmail: 'expected_ms@example.com',
        timestamp: Date.now()
      });

      (requestUrl as jest.Mock).mockImplementation(async (opts: RequestUrlParam) => {
        if (opts.url.includes('/api/microsoft/token')) {
          return {
            status: 200,
            json: {
              access_token: 'ms_access_token',
              refresh_token: 'ms_refresh_token',
              expires_in: 3600
            }
          };
        }
        if (opts.url.includes('graph.microsoft.com/v1.0/me')) {
          return {
            status: 200,
            json: {
              id: 'different_user_guid',
              mail: 'other_ms_user@example.com'
            }
          };
        }
        return { status: 404 };
      });

      await exchangeCodeForToken('auth_code_mismatch', state, mockPlugin);

      expect(showNotice).toHaveBeenCalledTimes(1);
      expect(showNotice).toHaveBeenCalledWith(expect.stringContaining('Account mismatch'));
    });

    it('matches when expectedEmail equals userPrincipalName (corporate alias)', async () => {
      const state = 'ms_upn_state';
      saveOutlookOAuthSession({
        verifier: 'verifier_upn',
        state,
        isReconnect: true,
        expectedEmail: '  john.smith@company.com  ',
        timestamp: Date.now()
      });

      (requestUrl as jest.Mock).mockImplementation(async (opts: RequestUrlParam) => {
        if (opts.url.includes('/api/microsoft/token')) {
          return {
            status: 200,
            json: {
              access_token: 'ms_access_token',
              refresh_token: 'ms_refresh_token',
              expires_in: 3600
            }
          };
        }
        if (opts.url.includes('graph.microsoft.com/v1.0/me')) {
          return {
            status: 200,
            json: {
              id: 'corp_user_123',
              mail: 'jsmith@company.onmicrosoft.com',
              userPrincipalName: 'john.smith@company.com'
            }
          };
        }
        return { status: 404 };
      });

      await exchangeCodeForToken('auth_code_upn', state, mockPlugin);

      expect(showNotice).toHaveBeenCalledWith(t('outlook.auth.success'));
    });

    it('rejects in-memory sessions that exceeded 15 minute TTL', async () => {
      const state = 'ms_state_expired_in_memory';
      saveOutlookOAuthSession({
        verifier: 'verifier_expired',
        state,
        timestamp: Date.now() - 20 * 60 * 1000
      });

      await exchangeCodeForToken('code_expired', state, mockPlugin);

      expect(showNotice).toHaveBeenCalledWith(t('outlook.auth.stateMismatch'));
    });
  });
});
