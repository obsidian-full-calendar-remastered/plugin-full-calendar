/**
 * @file oauthSessionStore.ts
 * @brief Generic, resilient OAuth 2.0 PKCE session store backed by localStorage with TTL validation.
 * @license See LICENSE.md
 */

export interface BaseOAuthSession {
  verifier: string;
  state: string;
  isReconnect?: boolean;
  expectedEmail?: string;
  timestamp: number;
}

export const OAUTH_SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes

export class OAuthSessionStore<T extends BaseOAuthSession> {
  private readonly prefix: string;
  private readonly ttlMs: number;

  constructor(provider: string, ttlMs: number = OAUTH_SESSION_TTL_MS) {
    this.prefix = `ofc_${provider}_oauth_session_`;
    this.ttlMs = ttlMs;
  }

  public save(session: T): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(`${this.prefix}${session.state}`, JSON.stringify(session));
    } catch (e) {
      console.warn(`Failed to save ${this.prefix} session to localStorage:`, e);
    }
  }

  public consume(state: string): T | null {
    const key = `${this.prefix}${state}`;
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      window.localStorage.removeItem(key);

      const session = JSON.parse(raw) as T;
      if (!this.isValid(session)) {
        return null;
      }
      return session;
    } catch (e) {
      console.warn(`Failed to consume ${this.prefix} session from localStorage:`, e);
      return null;
    }
  }

  public isValid(session: T | null | undefined): boolean {
    if (!session || typeof session !== 'object') return false;
    if (!session.timestamp || typeof session.timestamp !== 'number') return false;
    const delta = Date.now() - session.timestamp;
    return Number.isFinite(delta) && delta >= 0 && delta <= this.ttlMs;
  }

  public clearExpired(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const now = Date.now();
      const candidateKeys: string[] = [];

      // Snapshot candidate keys first to avoid index shifting during deletion
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
          candidateKeys.push(key);
        }
      }

      for (const key of candidateKeys) {
        try {
          const raw = window.localStorage.getItem(key);
          if (!raw) {
            window.localStorage.removeItem(key);
            continue;
          }
          const session = JSON.parse(raw) as T;
          const delta = now - session.timestamp;
          if (
            !session.timestamp ||
            typeof session.timestamp !== 'number' ||
            !Number.isFinite(delta) ||
            delta < 0 ||
            delta > this.ttlMs
          ) {
            window.localStorage.removeItem(key);
          }
        } catch {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      // Ignore storage iteration errors
    }
  }
}

export class AccountMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountMismatchError';
  }
}
