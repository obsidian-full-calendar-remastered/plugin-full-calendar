import { showNotice } from '../../utils/showNotice';
/**
 * @file utils.ts
 * @brief Lightweight settings utilities that must be safe to import at plugin startup.
 * @license See LICENSE.md
 */

import { FullCalendarSettings, GoogleAccount, DEFAULT_SETTINGS } from '../../types/settings';
import { CalendarInfo, generateCalendarId } from '../../types/calendar_settings';
import { t } from '../../features/i18n/i18n';

interface ObsidianSecretStorage {
  getSecret(key: string): string;
  setSecret(key: string, value: string): void;
}

interface ObsidianApp {
  secretStorage?: ObsidianSecretStorage;
}

declare const app: ObsidianApp;

/**
 * Performs all necessary migrations and sanitizations on a loaded settings object.
 * This function is pure and does not modify the plugin state directly.
 * @param settings The raw settings object loaded from data.json.
 * @returns An object containing the migrated settings and a flag indicating if they need to be saved.
 */
// Legacy shape support for migrations
type LegacyGoogleAuth = {
  refreshToken: string | null;
  accessToken: string | null;
  expiryDate: number | null;
};
type GoogleSourceWithAuth = Extract<CalendarInfo, { type: 'google' }> & { auth?: LegacyGoogleAuth };
type LegacySettings = Partial<FullCalendarSettings> & {
  calendarSources?: (CalendarInfo | GoogleSourceWithAuth)[];
  googleAuth?: LegacyGoogleAuth;
};

/**
 * Merges raw settings with DEFAULT_SETTINGS adhering to DRY and Open/Closed principles.
 * Primitives fall back to defaults, nested configuration objects are safely merged,
 * and arrays are initialized safely.
 */
function mergeWithDefaults(
  defaults: FullCalendarSettings,
  raw: LegacySettings
): FullCalendarSettings & { calendarSources: (CalendarInfo | GoogleSourceWithAuth)[] } & {
  googleAuth?: LegacyGoogleAuth;
} {
  const result: Record<string, unknown> = { ...defaults };
  const rawRecord = raw as Record<string, unknown>;

  for (const [key, defaultVal] of Object.entries(defaults)) {
    const rawVal = rawRecord[key];
    if (rawVal === undefined || rawVal === null) {
      result[key] = defaultVal;
    } else if (
      typeof defaultVal === 'object' &&
      defaultVal !== null &&
      !Array.isArray(defaultVal)
    ) {
      result[key] = {
        ...(defaultVal as Record<string, unknown>),
        ...(typeof rawVal === 'object' && rawVal !== null && !Array.isArray(rawVal) ? rawVal : {})
      };
    } else {
      result[key] = rawVal;
    }
  }

  // Ensure safe arrays
  result.calendarSources = raw.calendarSources || [];
  result.googleAccounts = raw.googleAccounts || [];
  result.microsoftAccounts = raw.microsoftAccounts || [];
  result.workspaces = raw.workspaces || [];
  result.categorySettings = raw.categorySettings || [];

  // Milestone sub-maps safety
  if (raw.milestones) {
    result.milestones = {
      counters: raw.milestones.counters || {},
      unlockedAt: raw.milestones.unlockedAt || {},
      shown: raw.milestones.shown || {}
    };
  } else {
    result.milestones = { counters: {}, unlockedAt: {}, shown: {} };
  }

  // Legacy task backlog fallback
  if (raw.caldavTaskInboxLastCalendarId && !raw.taskBacklogLastProviderId) {
    result.taskBacklogLastProviderId = raw.caldavTaskInboxLastCalendarId;
  }

  if (raw.googleAuth) {
    (result as { googleAuth?: LegacyGoogleAuth }).googleAuth = raw.googleAuth;
  }

  return result as unknown as FullCalendarSettings & {
    calendarSources: (CalendarInfo | GoogleSourceWithAuth)[];
  } & { googleAuth?: LegacyGoogleAuth };
}

// Accept unknown to force validation of shape when accessing.
export function migrateAndSanitizeSettings(settings: unknown): {
  settings: FullCalendarSettings;
  needsSave: boolean;
} {
  let needsSave = false;
  const raw = (settings as LegacySettings) || {};
  let newSettings = mergeWithDefaults(DEFAULT_SETTINGS, raw);

  // Migrate the initial Journals integration, which used a Daily Note source
  // discriminator plus a provider flag, to the first-class Journals source type.
  newSettings.calendarSources = newSettings.calendarSources.map(source => {
    if (source.type !== 'dailynote' || source.provider !== 'journals' || !source.journalId) {
      return source;
    }
    needsSave = true;
    const { provider: _legacyProvider, ...rest } = source;
    return { ...rest, type: 'journals' } as CalendarInfo;
  });

  // MIGRATION 0: Ensure all sources have a `name`.
  newSettings.calendarSources.forEach(source => {
    if (!('name' in source) || !source.name) {
      needsSave = true;
      switch (source.type) {
        case 'local':
          source.name = source.directory;
          break;
        case 'dailynote':
          source.name = 'Daily Note';
          break;
        case 'journals':
          source.name = 'Journals';
          break;
        case 'ical':
          source.name = source.url;
          break;
        default:
          source.name = 'Unnamed Calendar';
          break;
      }
    }

    // Early Journals sources used the generic provider label as their instance name.
    // Preserve user-defined names, but make those legacy defaults distinguishable.
    if (
      source.type === 'journals' &&
      source.name === 'Journals' &&
      typeof source.journalId === 'string' &&
      source.journalId.length > 0
    ) {
      source.name = `Journals: ${source.journalId}`;
      needsSave = true;
    }
  });

  // Ensure googleAccounts array exists for the migration
  // googleAccounts already defaulted above

  // MIGRATION 1: Global googleAuth to source-specific auth (from previous work, can be removed or kept for safety)
  const globalGoogleAuth = raw.googleAuth || null;
  if (globalGoogleAuth) {
    // This logic is technically superseded by the next migration,
    // but we can leave it for robustness during the transition.
    newSettings.calendarSources.forEach(s => {
      if (s.type === 'google' && !('googleAccountId' in s) && !(s as GoogleSourceWithAuth).auth) {
        (s as GoogleSourceWithAuth).auth = globalGoogleAuth;
      }
    });
  }

  // === FINAL MIGRATION: Move embedded auth to centralized googleAccounts ===
  const refreshTokenToAccountId = new Map<string, string>();
  newSettings.calendarSources.forEach(source => {
    if (
      source.type === 'google' &&
      (source as GoogleSourceWithAuth).auth &&
      !source.googleAccountId
    ) {
      needsSave = true;
      const refreshToken = (source as GoogleSourceWithAuth).auth?.refreshToken;
      if (refreshToken) {
        if (refreshTokenToAccountId.has(refreshToken)) {
          const existingAccountId = refreshTokenToAccountId.get(refreshToken);
          if (existingAccountId) {
            source.googleAccountId = existingAccountId;
          }
        } else {
          const sourceAuth = (source as GoogleSourceWithAuth).auth;
          if (sourceAuth) {
            const newAccountId = `gcal_${Math.random().toString(36).slice(2, 11)}`;
            const newAccount: GoogleAccount = {
              id: newAccountId,
              email: 'Migrated Account',
              ...sourceAuth
            };
            newSettings.googleAccounts.push(newAccount);
            refreshTokenToAccountId.set(refreshToken, newAccountId);
            source.googleAccountId = newAccountId;
          }
        }
      }
      delete (source as GoogleSourceWithAuth).auth;
    }
  });
  // global googleAuth removed implicitly by not copying it forward
  // === END FINAL MIGRATION ===

  // MIGRATION 2: Ensure all calendar sources have a stable ID.
  const { updated, sources } = ensureCalendarIds(newSettings.calendarSources);
  if (updated) {
    needsSave = true;
  }
  newSettings.calendarSources = sources;

  // MIGRATION 3: Bi-directional keychain migration if secretStorage is supported
  if (typeof app !== 'undefined' && app.secretStorage) {
    const secretStorage = app.secretStorage;
    const getSecretKey = {
      googleRefreshToken: (id: string) =>
        `fcr-gcal-ref-${id.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      googleAccessToken: (id: string) =>
        `fcr-gcal-acc-${id.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      googleClientSecret: () => `fcr-gcal-custom-secret`,
      microsoftRefreshToken: (id: string) =>
        `fcr-ms-ref-${id.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      microsoftAccessToken: (id: string) =>
        `fcr-ms-acc-${id.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      caldavPassword: (id: string) =>
        `fcr-caldav-pwd-${id.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      githubToken: () => `fcr-github-token`,
      agentApiKey: () => `fcr-agent-api-key`
    };

    if (!newSettings.useLegacyPlaintextCredentials) {
      // --- Case A: Secure mode (migrate settings -> keychain) ---

      // Google Accounts
      if (newSettings.googleAccounts) {
        newSettings.googleAccounts.forEach(acc => {
          if (acc.refreshToken) {
            secretStorage.setSecret(getSecretKey.googleRefreshToken(acc.id), acc.refreshToken);
            acc.refreshToken = null;
            needsSave = true;
          }
          if (acc.accessToken) {
            secretStorage.setSecret(getSecretKey.googleAccessToken(acc.id), acc.accessToken);
            acc.accessToken = null;
            needsSave = true;
          }
        });
      }

      // Microsoft Accounts
      if (newSettings.microsoftAccounts) {
        newSettings.microsoftAccounts.forEach(acc => {
          if (acc.refreshToken) {
            secretStorage.setSecret(getSecretKey.microsoftRefreshToken(acc.id), acc.refreshToken);
            acc.refreshToken = null;
            needsSave = true;
          }
          if (acc.accessToken) {
            secretStorage.setSecret(getSecretKey.microsoftAccessToken(acc.id), acc.accessToken);
            acc.accessToken = null;
            needsSave = true;
          }
        });
      }

      // Custom Google Client Secret
      if (newSettings.googleClientSecret) {
        secretStorage.setSecret(getSecretKey.googleClientSecret(), newSettings.googleClientSecret);
        newSettings.googleClientSecret = '';
        needsSave = true;
      }

      // CalDAV Passwords
      if (newSettings.calendarSources) {
        newSettings.calendarSources.forEach(source => {
          if (source.type === 'caldav' || source.type === 'caldavtasks') {
            if (source.password) {
              secretStorage.setSecret(getSecretKey.caldavPassword(source.id), source.password);
              source.password = '';
              needsSave = true;
            }
          }
        });
      }

      // GitHub Token
      if (newSettings.githubToken) {
        secretStorage.setSecret(getSecretKey.githubToken(), newSettings.githubToken);
        newSettings.githubToken = null;
        needsSave = true;
      }

      // Agent API Key
      if (newSettings.agent?.apiKey) {
        secretStorage.setSecret(getSecretKey.agentApiKey(), newSettings.agent.apiKey);
        newSettings.agent.apiKey = '';
        needsSave = true;
      }
    } else {
      // --- Case B: Legacy mode (migrate keychain -> settings) ---

      // Google Accounts
      if (newSettings.googleAccounts) {
        newSettings.googleAccounts.forEach(acc => {
          const storedRef = secretStorage.getSecret(getSecretKey.googleRefreshToken(acc.id));
          if (storedRef && storedRef !== '') {
            acc.refreshToken = storedRef;
            secretStorage.setSecret(getSecretKey.googleRefreshToken(acc.id), '');
            needsSave = true;
          }
          const storedAcc = secretStorage.getSecret(getSecretKey.googleAccessToken(acc.id));
          if (storedAcc && storedAcc !== '') {
            acc.accessToken = storedAcc;
            secretStorage.setSecret(getSecretKey.googleAccessToken(acc.id), '');
            needsSave = true;
          }
        });
      }

      // Microsoft Accounts
      if (newSettings.microsoftAccounts) {
        newSettings.microsoftAccounts.forEach(acc => {
          const storedRef = secretStorage.getSecret(getSecretKey.microsoftRefreshToken(acc.id));
          if (storedRef && storedRef !== '') {
            acc.refreshToken = storedRef;
            secretStorage.setSecret(getSecretKey.microsoftRefreshToken(acc.id), '');
            needsSave = true;
          }
          const storedAcc = secretStorage.getSecret(getSecretKey.microsoftAccessToken(acc.id));
          if (storedAcc && storedAcc !== '') {
            acc.accessToken = storedAcc;
            secretStorage.setSecret(getSecretKey.microsoftAccessToken(acc.id), '');
            needsSave = true;
          }
        });
      }

      // Custom Google Client Secret
      const storedClientSecret = secretStorage.getSecret(getSecretKey.googleClientSecret());
      if (storedClientSecret && storedClientSecret !== '') {
        newSettings.googleClientSecret = storedClientSecret;
        secretStorage.setSecret(getSecretKey.googleClientSecret(), '');
        needsSave = true;
      }

      // CalDAV Passwords
      if (newSettings.calendarSources) {
        newSettings.calendarSources.forEach(source => {
          if (source.type === 'caldav' || source.type === 'caldavtasks') {
            const storedPwd = secretStorage.getSecret(getSecretKey.caldavPassword(source.id));
            if (storedPwd && storedPwd !== '') {
              source.password = storedPwd;
              secretStorage.setSecret(getSecretKey.caldavPassword(source.id), '');
              needsSave = true;
            }
          }
        });
      }

      // GitHub Token
      const storedGithubToken = secretStorage.getSecret(getSecretKey.githubToken());
      if (storedGithubToken && storedGithubToken !== '') {
        newSettings.githubToken = storedGithubToken;
        secretStorage.setSecret(getSecretKey.githubToken(), '');
        needsSave = true;
      }

      // Agent API Key
      const storedAgentApiKey = secretStorage.getSecret(getSecretKey.agentApiKey());
      if (storedAgentApiKey && storedAgentApiKey !== '') {
        if (!newSettings.agent) {
          newSettings.agent = { ...DEFAULT_SETTINGS.agent };
        }
        newSettings.agent.apiKey = storedAgentApiKey;
        secretStorage.setSecret(getSecretKey.agentApiKey(), '');
        needsSave = true;
      }
    }
  }

  // SANITIZATION 1: Correct initial view if timeline is disabled.
  newSettings = sanitizeInitialView(newSettings);

  return { settings: newSettings, needsSave };
}

/**
 * Ensure each calendar source has a stable id. Pure and UI-free.
 */
export function ensureCalendarIds(sources: unknown[]): {
  updated: boolean;
  sources: CalendarInfo[];
} {
  let updated = false;
  const existingIds: string[] = (sources as { id?: string }[])
    .map(s => s.id)
    .filter((id): id is string => !!id);
  const updatedSources = (
    sources as (CalendarInfo | { id?: string; type: CalendarInfo['type'] })[]
  ).map(source => {
    if (!('id' in source) || !source.id) {
      updated = true;
      const newId = generateCalendarId((source as CalendarInfo).type, existingIds);
      existingIds.push(newId);
      return { ...source, id: newId };
    }
    return source;
  });
  return { updated, sources: updatedSources as CalendarInfo[] };
}

/**
 * Sanitize initial view if timeline is disabled. Pure and UI-free aside from a Notice.
 */
export function sanitizeInitialView(settings: FullCalendarSettings): FullCalendarSettings {
  if (
    !settings.enableAdvancedCategorization &&
    settings.initialView.desktop.startsWith('resourceTimeline')
  ) {
    showNotice(t('settings.utils.timelineDisabled'), 5000);
    return {
      ...settings,
      initialView: {
        ...settings.initialView,
        desktop: 'timeGridWeek'
      }
    };
  }
  return settings;
}
