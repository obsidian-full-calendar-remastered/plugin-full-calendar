import { PluginState } from '../../core/PluginState';

interface ObsidianSecretStorage {
  getSecret(key: string): string;
  setSecret(key: string, value: string): void;
}

interface ObsidianApp {
  secretStorage?: ObsidianSecretStorage;
}

declare const app: ObsidianApp;

/**
 * Deterministic keys for storing secrets in Obsidian's SecretStorage.
 * Obsidian's SecretStorage requires lowercase alphanumeric IDs with optional dashes.
 */
const getSecretKey = {
  googleRefreshToken: (accountId: string) =>
    `fcr-gcal-ref-${accountId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
  googleAccessToken: (accountId: string) =>
    `fcr-gcal-acc-${accountId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
  googleClientSecret: () => `fcr-gcal-custom-secret`,
  microsoftRefreshToken: (accountId: string) =>
    `fcr-ms-ref-${accountId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
  microsoftAccessToken: (accountId: string) =>
    `fcr-ms-acc-${accountId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
  caldavPassword: (sourceId: string) =>
    `fcr-caldav-pwd-${sourceId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
  githubToken: () => `fcr-github-token`
};

export class CredentialStore {
  /**
   * Helper to check if the Obsidian SecretStorage API is supported in the current environment.
   */
  static isSecretStorageSupported(): boolean {
    return typeof app !== 'undefined' && !!app.secretStorage;
  }

  /**
   * Checks if we should bypass SecretStorage and use legacy plaintext storage in data.json.
   */
  private static useLegacy(): boolean {
    try {
      return PluginState.getSettings().useLegacyPlaintextCredentials;
    } catch {
      return false; // Safely default to secure if settings aren't loaded yet
    }
  }

  // ==========================================================================
  // GOOGLE ACCOUNTS
  // ==========================================================================

  static getGoogleRefreshToken(accountId: string): string | null {
    if (this.useLegacy() || !this.isSecretStorageSupported()) {
      try {
        const acc = PluginState.getSettings().googleAccounts.find(a => a.id === accountId);
        return acc?.refreshToken ?? null;
      } catch {
        return null;
      }
    }
    const secret = app.secretStorage?.getSecret(getSecretKey.googleRefreshToken(accountId));
    return secret && secret !== '' ? secret : null;
  }

  static setGoogleRefreshToken(accountId: string, token: string | null): void {
    if (this.useLegacy() || !this.isSecretStorageSupported()) {
      try {
        const acc = PluginState.getSettings().googleAccounts.find(a => a.id === accountId);
        if (acc) {
          acc.refreshToken = token;
        }
      } catch {
        /* ignore */
      }
    } else {
      app.secretStorage?.setSecret(getSecretKey.googleRefreshToken(accountId), token ?? '');
      // Clear from settings
      try {
        const acc = PluginState.getSettings().googleAccounts.find(a => a.id === accountId);
        if (acc) {
          acc.refreshToken = null;
        }
      } catch {
        /* ignore */
      }
    }
  }

  static hasGoogleRefreshToken(accountId: string): boolean {
    return !!this.getGoogleRefreshToken(accountId);
  }

  static getGoogleAccessToken(accountId: string): string | null {
    if (this.useLegacy() || !this.isSecretStorageSupported()) {
      try {
        const acc = PluginState.getSettings().googleAccounts.find(a => a.id === accountId);
        return acc?.accessToken ?? null;
      } catch {
        return null;
      }
    }
    const secret = app.secretStorage?.getSecret(getSecretKey.googleAccessToken(accountId));
    return secret && secret !== '' ? secret : null;
  }

  static setGoogleAccessToken(accountId: string, token: string | null): void {
    if (this.useLegacy() || !this.isSecretStorageSupported()) {
      try {
        const acc = PluginState.getSettings().googleAccounts.find(a => a.id === accountId);
        if (acc) {
          acc.accessToken = token;
        }
      } catch {
        /* ignore */
      }
    } else {
      app.secretStorage?.setSecret(getSecretKey.googleAccessToken(accountId), token ?? '');
      // Clear from settings
      try {
        const acc = PluginState.getSettings().googleAccounts.find(a => a.id === accountId);
        if (acc) {
          acc.accessToken = null;
        }
      } catch {
        /* ignore */
      }
    }
  }

  // ==========================================================================
  // GOOGLE CUSTOM CLIENT SECRET
  // ==========================================================================

  static getGoogleClientSecret(): string {
    if (this.useLegacy() || !this.isSecretStorageSupported()) {
      try {
        return PluginState.getSettings().googleClientSecret || '';
      } catch {
        return '';
      }
    }
    const secret = app.secretStorage?.getSecret(getSecretKey.googleClientSecret());
    return secret || '';
  }

  static setGoogleClientSecret(secret: string): void {
    if (this.useLegacy() || !this.isSecretStorageSupported()) {
      try {
        PluginState.getSettings().googleClientSecret = secret;
      } catch {
        /* ignore */
      }
    } else {
      app.secretStorage?.setSecret(getSecretKey.googleClientSecret(), secret);
      try {
        PluginState.getSettings().googleClientSecret = '';
      } catch {
        /* ignore */
      }
    }
  }

  // ==========================================================================
  // MICROSOFT ACCOUNTS
  // ==========================================================================

  static getMicrosoftRefreshToken(accountId: string): string | null {
    if (this.useLegacy() || !this.isSecretStorageSupported()) {
      try {
        const acc = PluginState.getSettings().microsoftAccounts.find(a => a.id === accountId);
        return acc?.refreshToken ?? null;
      } catch {
        return null;
      }
    }
    const secret = app.secretStorage?.getSecret(getSecretKey.microsoftRefreshToken(accountId));
    return secret && secret !== '' ? secret : null;
  }

  static setMicrosoftRefreshToken(accountId: string, token: string | null): void {
    if (this.useLegacy() || !this.isSecretStorageSupported()) {
      try {
        const acc = PluginState.getSettings().microsoftAccounts.find(a => a.id === accountId);
        if (acc) {
          acc.refreshToken = token;
        }
      } catch {
        /* ignore */
      }
    } else {
      app.secretStorage?.setSecret(getSecretKey.microsoftRefreshToken(accountId), token ?? '');
      // Clear from settings
      try {
        const acc = PluginState.getSettings().microsoftAccounts.find(a => a.id === accountId);
        if (acc) {
          acc.refreshToken = null;
        }
      } catch {
        /* ignore */
      }
    }
  }

  static hasMicrosoftRefreshToken(accountId: string): boolean {
    return !!this.getMicrosoftRefreshToken(accountId);
  }

  static getMicrosoftAccessToken(accountId: string): string | null {
    if (this.useLegacy() || !this.isSecretStorageSupported()) {
      try {
        const acc = PluginState.getSettings().microsoftAccounts.find(a => a.id === accountId);
        return acc?.accessToken ?? null;
      } catch {
        return null;
      }
    }
    const secret = app.secretStorage?.getSecret(getSecretKey.microsoftAccessToken(accountId));
    return secret && secret !== '' ? secret : null;
  }

  static setMicrosoftAccessToken(accountId: string, token: string | null): void {
    if (this.useLegacy() || !this.isSecretStorageSupported()) {
      try {
        const acc = PluginState.getSettings().microsoftAccounts.find(a => a.id === accountId);
        if (acc) {
          acc.accessToken = token;
        }
      } catch {
        /* ignore */
      }
    } else {
      app.secretStorage?.setSecret(getSecretKey.microsoftAccessToken(accountId), token ?? '');
      // Clear from settings
      try {
        const acc = PluginState.getSettings().microsoftAccounts.find(a => a.id === accountId);
        if (acc) {
          acc.accessToken = null;
        }
      } catch {
        /* ignore */
      }
    }
  }

  // ==========================================================================
  // CALDAV PASSWORDS
  // ==========================================================================

  static getCalDAVPassword(sourceId: string): string | null {
    if (this.useLegacy() || !this.isSecretStorageSupported()) {
      try {
        const source = PluginState.getSettings().calendarSources.find(s => s.id === sourceId);
        if (source && source.type === 'caldav') {
          return source.password ?? null;
        }
      } catch {
        /* ignore */
      }
      return null;
    }
    const secret = app.secretStorage?.getSecret(getSecretKey.caldavPassword(sourceId));
    return secret && secret !== '' ? secret : null;
  }

  static setCalDAVPassword(sourceId: string, password: string | null): void {
    if (this.useLegacy() || !this.isSecretStorageSupported()) {
      try {
        const source = PluginState.getSettings().calendarSources.find(s => s.id === sourceId);
        if (source && source.type === 'caldav') {
          source.password = password ?? '';
        }
      } catch {
        /* ignore */
      }
    } else {
      app.secretStorage?.setSecret(getSecretKey.caldavPassword(sourceId), password ?? '');
      // Clear from settings
      try {
        const source = PluginState.getSettings().calendarSources.find(s => s.id === sourceId);
        if (source && source.type === 'caldav') {
          source.password = '';
        }
      } catch {
        /* ignore */
      }
    }
  }

  // ==========================================================================
  // GITHUB TOKEN
  // ==========================================================================

  static getGitHubToken(): string | null {
    if (this.useLegacy() || !this.isSecretStorageSupported()) {
      try {
        return PluginState.getSettings().githubToken ?? null;
      } catch {
        return null;
      }
    }
    const secret = app.secretStorage?.getSecret(getSecretKey.githubToken());
    return secret && secret !== '' ? secret : null;
  }

  static setGitHubToken(token: string | null): void {
    if (this.useLegacy() || !this.isSecretStorageSupported()) {
      try {
        PluginState.getSettings().githubToken = token;
      } catch {
        /* ignore */
      }
    } else {
      app.secretStorage?.setSecret(getSecretKey.githubToken(), token ?? '');
      // Clear from settings
      try {
        PluginState.getSettings().githubToken = null;
      } catch {
        /* ignore */
      }
    }
  }

  static hasGitHubToken(): boolean {
    return !!this.getGitHubToken();
  }
}
