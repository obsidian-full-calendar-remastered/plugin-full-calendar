import { migrateAndSanitizeSettings } from './utilsSettings';
import { DEFAULT_SETTINGS } from '../../types/settings';

// Mock Obsidian modules that may be imported transitively
jest.mock('obsidian', () => ({
  Notice: class {},
  normalizePath: (p: string) => p
}));

jest.mock('../../utils/showNotice', () => ({
  showNotice: jest.fn()
}));

jest.mock('../../features/i18n/i18n', () => ({
  t: (key: string) => key
}));

describe('utilsSettings - migrateAndSanitizeSettings', () => {
  it('should preserve existing milestone settings', () => {
    const rawSettings = {
      ...DEFAULT_SETTINGS,
      milestones: {
        counters: { 'created.total': 42 },
        unlockedAt: { 'created.total.100': 1234567890 },
        shown: { 'created.total.100': 1 }
      },
      enableMonthlyStatsReport: false,
      lastMonthlyMilestonesGeneratedMonth: '2026-05',
      lastMonthlyMilestonesCheckDate: '2026-06-01'
    };

    const { settings } = migrateAndSanitizeSettings(rawSettings);

    expect(settings.milestones).toEqual({
      counters: { 'created.total': 42 },
      unlockedAt: { 'created.total.100': 1234567890 },
      shown: { 'created.total.100': 1 }
    });
    expect(settings.enableMonthlyStatsReport).toBe(false);
    expect(settings.lastMonthlyMilestonesGeneratedMonth).toBe('2026-05');
    expect(settings.lastMonthlyMilestonesCheckDate).toBe('2026-06-01');
  });

  it('should fallback to defaults when milestone settings are missing', () => {
    const rawSettings = { ...DEFAULT_SETTINGS } as Partial<typeof DEFAULT_SETTINGS>;
    delete rawSettings.milestones;
    delete rawSettings.enableMonthlyStatsReport;
    delete rawSettings.lastMonthlyMilestonesGeneratedMonth;
    delete rawSettings.lastMonthlyMilestonesCheckDate;

    const { settings } = migrateAndSanitizeSettings(rawSettings);

    expect(settings.milestones).toEqual({
      counters: {},
      unlockedAt: {},
      shown: {}
    });
    expect(settings.enableMonthlyStatsReport).toBe(DEFAULT_SETTINGS.enableMonthlyStatsReport);
    expect(settings.lastMonthlyMilestonesGeneratedMonth).toBe(
      DEFAULT_SETTINGS.lastMonthlyMilestonesGeneratedMonth
    );
    expect(settings.lastMonthlyMilestonesCheckDate).toBe(
      DEFAULT_SETTINGS.lastMonthlyMilestonesCheckDate
    );
  });

  describe('keychain migration (bi-directional)', () => {
    let mockSecretStorage: Record<string, string>;

    interface MockSecretStorage {
      setSecret: jest.Mock;
      getSecret: jest.Mock;
      listSecrets: jest.Mock;
    }

    interface MockApp {
      secretStorage: MockSecretStorage;
    }

    beforeEach(() => {
      mockSecretStorage = {};
      const mockApp: MockApp = {
        secretStorage: {
          setSecret: jest.fn((id: string, val: string) => {
            mockSecretStorage[id] = val;
          }),
          getSecret: jest.fn((id: string) => {
            return mockSecretStorage[id] || null;
          }),
          listSecrets: jest.fn(() => Object.keys(mockSecretStorage))
        }
      };
      (window as unknown as { app: MockApp }).app = mockApp;
    });

    afterEach(() => {
      delete (window as unknown as { app: MockApp | undefined }).app;
    });

    it('should migrate credentials from settings to SecretStorage when legacy mode is disabled', () => {
      const rawSettings = {
        ...DEFAULT_SETTINGS,
        useLegacyPlaintextCredentials: false,
        googleClientSecret: 'my-super-secret-client',
        googleAccounts: [
          {
            id: 'acc1',
            email: 'work@gmail.com',
            refreshToken: 'g-refresh-token',
            accessToken: 'g-access-token',
            expiryDate: 123456
          }
        ],
        microsoftAccounts: [
          {
            id: 'ms1',
            email: 'ms@outlook.com',
            refreshToken: 'm-refresh-token',
            accessToken: 'm-access-token',
            expiryDate: 654321
          }
        ],
        calendarSources: [
          {
            id: 'cal1',
            type: 'caldav',
            name: 'Work Cal',
            username: 'cal-user',
            password: 'cal-password',
            homeUrl: 'https://caldav.example.com',
            url: 'https://caldav.example.com'
          }
        ]
      };

      const { settings, needsSave } = migrateAndSanitizeSettings(rawSettings);

      expect(needsSave).toBe(true);

      // Verify they are cleared from settings
      expect(settings.googleClientSecret).toBe('');
      expect(settings.googleAccounts[0].refreshToken).toBeNull();
      expect(settings.googleAccounts[0].accessToken).toBeNull();
      expect(settings.microsoftAccounts[0].refreshToken).toBeNull();
      expect(settings.microsoftAccounts[0].accessToken).toBeNull();
      expect((settings.calendarSources[0] as { password?: string }).password).toBe('');

      // Verify they are moved to SecretStorage
      expect(mockSecretStorage['fcr-gcal-custom-secret']).toBe('my-super-secret-client');
      expect(mockSecretStorage['fcr-gcal-ref-acc1']).toBe('g-refresh-token');
      expect(mockSecretStorage['fcr-gcal-acc-acc1']).toBe('g-access-token');
      expect(mockSecretStorage['fcr-ms-ref-ms1']).toBe('m-refresh-token');
      expect(mockSecretStorage['fcr-ms-acc-ms1']).toBe('m-access-token');
      expect(mockSecretStorage['fcr-caldav-pwd-cal1']).toBe('cal-password');
    });

    it('should restore credentials from SecretStorage to settings when legacy mode is enabled', () => {
      // Pre-populate mock SecretStorage
      mockSecretStorage['fcr-gcal-custom-secret'] = 'restored-client-secret';
      mockSecretStorage['fcr-gcal-ref-acc2'] = 'restored-g-refresh';
      mockSecretStorage['fcr-gcal-acc-acc2'] = 'restored-g-access';
      mockSecretStorage['fcr-ms-ref-ms2'] = 'restored-m-refresh';
      mockSecretStorage['fcr-ms-acc-ms2'] = 'restored-m-access';
      mockSecretStorage['fcr-caldav-pwd-cal2'] = 'restored-caldav-password';

      const rawSettings = {
        ...DEFAULT_SETTINGS,
        useLegacyPlaintextCredentials: true,
        googleClientSecret: '',
        googleAccounts: [
          {
            id: 'acc2',
            email: 'work@gmail.com',
            refreshToken: null,
            accessToken: null,
            expiryDate: 123456
          }
        ],
        microsoftAccounts: [
          {
            id: 'ms2',
            email: 'ms@outlook.com',
            refreshToken: null,
            accessToken: null,
            expiryDate: 654321
          }
        ],
        calendarSources: [
          {
            id: 'cal2',
            type: 'caldav',
            name: 'Work Cal',
            username: 'cal-user',
            password: '',
            homeUrl: 'https://caldav.example.com',
            url: 'https://caldav.example.com'
          }
        ]
      };

      const { settings, needsSave } = migrateAndSanitizeSettings(rawSettings);

      expect(needsSave).toBe(true);

      // Verify they are populated back in settings
      expect(settings.googleClientSecret).toBe('restored-client-secret');
      expect(settings.googleAccounts[0].refreshToken).toBe('restored-g-refresh');
      expect(settings.googleAccounts[0].accessToken).toBe('restored-g-access');
      expect(settings.microsoftAccounts[0].refreshToken).toBe('restored-m-refresh');
      expect(settings.microsoftAccounts[0].accessToken).toBe('restored-m-access');
      expect((settings.calendarSources[0] as { password?: string }).password).toBe(
        'restored-caldav-password'
      );

      // Verify they are cleared from SecretStorage
      expect(mockSecretStorage['fcr-gcal-custom-secret']).toBe('');
      expect(mockSecretStorage['fcr-gcal-ref-acc2']).toBe('');
      expect(mockSecretStorage['fcr-gcal-acc-acc2']).toBe('');
      expect(mockSecretStorage['fcr-ms-ref-ms2']).toBe('');
      expect(mockSecretStorage['fcr-ms-acc-ms2']).toBe('');
      expect(mockSecretStorage['fcr-caldav-pwd-cal2']).toBe('');
    });
  });

  it('should fallback to defaults when openDailyNoteOnDateClick is missing or preserve it when present', () => {
    const rawSettings = { ...DEFAULT_SETTINGS } as Partial<typeof DEFAULT_SETTINGS>;
    delete rawSettings.openDailyNoteOnDateClick;

    const { settings: settingsDefault } = migrateAndSanitizeSettings(rawSettings);
    expect(settingsDefault.openDailyNoteOnDateClick).toBe(false);

    const { settings: settingsCustom } = migrateAndSanitizeSettings({
      ...rawSettings,
      openDailyNoteOnDateClick: true
    });
    expect(settingsCustom.openDailyNoteOnDateClick).toBe(true);
  });
});
