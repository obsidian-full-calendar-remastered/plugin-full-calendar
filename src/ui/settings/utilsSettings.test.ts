import { migrateAndSanitizeSettings } from './utilsSettings';
import { DEFAULT_SETTINGS, type FullCalendarSettings } from '../../types/settings';

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
        ],
        githubToken: 'ghp_secret_token_123',
        agent: {
          ...DEFAULT_SETTINGS.agent,
          apiKey: 'sk-agent-secret-key-xyz'
        }
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
      expect(settings.githubToken).toBeNull();
      expect(settings.agent.apiKey).toBe('');

      // Verify they are moved to SecretStorage
      expect(mockSecretStorage['fcr-gcal-custom-secret']).toBe('my-super-secret-client');
      expect(mockSecretStorage['fcr-gcal-ref-acc1']).toBe('g-refresh-token');
      expect(mockSecretStorage['fcr-gcal-acc-acc1']).toBe('g-access-token');
      expect(mockSecretStorage['fcr-ms-ref-ms1']).toBe('m-refresh-token');
      expect(mockSecretStorage['fcr-ms-acc-ms1']).toBe('m-access-token');
      expect(mockSecretStorage['fcr-caldav-pwd-cal1']).toBe('cal-password');
      expect(mockSecretStorage['fcr-github-token']).toBe('ghp_secret_token_123');
      expect(mockSecretStorage['fcr-agent-api-key']).toBe('sk-agent-secret-key-xyz');
    });

    it('should restore credentials from SecretStorage to settings when legacy mode is enabled', () => {
      // Pre-populate mock SecretStorage
      mockSecretStorage['fcr-gcal-custom-secret'] = 'restored-client-secret';
      mockSecretStorage['fcr-gcal-ref-acc2'] = 'restored-g-refresh';
      mockSecretStorage['fcr-gcal-acc-acc2'] = 'restored-g-access';
      mockSecretStorage['fcr-ms-ref-ms2'] = 'restored-m-refresh';
      mockSecretStorage['fcr-ms-acc-ms2'] = 'restored-m-access';
      mockSecretStorage['fcr-caldav-pwd-cal2'] = 'restored-caldav-password';
      mockSecretStorage['fcr-github-token'] = 'restored-gh-token';
      mockSecretStorage['fcr-agent-api-key'] = 'restored-agent-api-key';

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
        ],
        githubToken: null,
        agent: {
          ...DEFAULT_SETTINGS.agent,
          apiKey: ''
        }
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
      expect(settings.githubToken).toBe('restored-gh-token');
      expect(settings.agent.apiKey).toBe('restored-agent-api-key');

      // Verify they are cleared from SecretStorage
      expect(mockSecretStorage['fcr-gcal-custom-secret']).toBe('');
      expect(mockSecretStorage['fcr-gcal-ref-acc2']).toBe('');
      expect(mockSecretStorage['fcr-gcal-acc-acc2']).toBe('');
      expect(mockSecretStorage['fcr-ms-ref-ms2']).toBe('');
      expect(mockSecretStorage['fcr-ms-acc-ms2']).toBe('');
      expect(mockSecretStorage['fcr-caldav-pwd-cal2']).toBe('');
      expect(mockSecretStorage['fcr-github-token']).toBe('');
      expect(mockSecretStorage['fcr-agent-api-key']).toBe('');
    });
  });

  describe('agent settings persistence and migration', () => {
    it('should preserve custom endpointUrl, model, specUrl, and execution parameters', () => {
      const customAgentSettings = {
        enabled: true,
        endpointUrl: 'https://api.groq.com/openai/v1',
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        specUrl: 'https://example.com/custom-spec.md',
        maxRetries: 5,
        timeoutMs: 45000
      };

      const rawSettings = {
        ...DEFAULT_SETTINGS,
        agent: customAgentSettings
      };

      const { settings } = migrateAndSanitizeSettings(rawSettings);

      expect(settings.agent.endpointUrl).toBe('https://api.groq.com/openai/v1');
      expect(settings.agent.model).toBe('llama-3.3-70b-versatile');
      expect(settings.agent.temperature).toBe(0.7);
      expect(settings.agent.specUrl).toBe('https://example.com/custom-spec.md');
      expect(settings.agent.maxRetries).toBe(5);
      expect(settings.agent.timeoutMs).toBe(45000);
      expect(settings.agent.enabled).toBe(true);
    });

    it('should cleanly fallback to default agent settings when missing from raw settings', () => {
      const rawSettings = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
      delete rawSettings.agent;

      const { settings } = migrateAndSanitizeSettings(rawSettings);

      expect(settings.agent).toBeDefined();
      expect(settings.agent.endpointUrl).toBe(DEFAULT_SETTINGS.agent.endpointUrl);
      expect(settings.agent.model).toBe(DEFAULT_SETTINGS.agent.model);
      expect(settings.agent.temperature).toBe(DEFAULT_SETTINGS.agent.temperature);
      expect(settings.agent.maxRetries).toBe(DEFAULT_SETTINGS.agent.maxRetries);
      expect(settings.agent.timeoutMs).toBe(DEFAULT_SETTINGS.agent.timeoutMs);
    });

    it('should merge partial agent settings with defaults without dropping custom fields', () => {
      const rawSettings = {
        ...DEFAULT_SETTINGS,
        agent: {
          endpointUrl: 'http://localhost:11434/v1',
          model: 'mistral-nemo'
        } as unknown as typeof DEFAULT_SETTINGS.agent
      };

      const { settings } = migrateAndSanitizeSettings(rawSettings);

      expect(settings.agent.endpointUrl).toBe('http://localhost:11434/v1');
      expect(settings.agent.model).toBe('mistral-nemo');
      expect(settings.agent.temperature).toBe(DEFAULT_SETTINGS.agent.temperature);
      expect(settings.agent.specUrl).toBe(DEFAULT_SETTINGS.agent.specUrl);
      expect(settings.agent.maxRetries).toBe(DEFAULT_SETTINGS.agent.maxRetries);
      expect(settings.agent.timeoutMs).toBe(DEFAULT_SETTINGS.agent.timeoutMs);
    });

    it('should withstand 50 consecutive save, serialization, and reload cycles without data loss', () => {
      let currentSettings: FullCalendarSettings = {
        ...DEFAULT_SETTINGS,
        agent: {
          enabled: true,
          endpointUrl: 'https://initial-endpoint.ai/v1',
          model: 'test-model-0',
          temperature: 0.1,
          specUrl: 'https://spec.com/initial.md',
          maxRetries: 2,
          timeoutMs: 30000
        }
      };

      const testEndpoints = [
        'https://api.openai.com/v1',
        'https://openrouter.ai/api/v1',
        'https://api.groq.com/openai/v1',
        'https://api.deepseek.com/v1',
        'http://localhost:11434/v1',
        'http://localhost:1234/v1',
        'https://custom-gateway.internal.net/v1'
      ];

      for (let i = 0; i < 50; i++) {
        const expectedEndpoint = testEndpoints[i % testEndpoints.length];
        const expectedModel = `model-variant-${i}`;
        const expectedTemp = Math.round((0.1 + (i % 9) * 0.1) * 10) / 10;
        const expectedRetries = (i % 5) + 1;

        currentSettings.agent.endpointUrl = expectedEndpoint;
        currentSettings.agent.model = expectedModel;
        currentSettings.agent.temperature = expectedTemp;
        currentSettings.agent.maxRetries = expectedRetries;

        // 1. Simulate saving (which runs migrateAndSanitizeSettings)
        const { settings: migratedOnSave } = migrateAndSanitizeSettings(currentSettings);

        // 2. Simulate disk serialization (JSON.stringify -> data.json)
        const serialized = JSON.stringify(migratedOnSave);

        // 3. Simulate reload from disk (JSON.parse(data.json) -> migrateAndSanitizeSettings)
        const loadedFromDisk = JSON.parse(serialized) as unknown;
        const { settings: reloadedSettings } = migrateAndSanitizeSettings(loadedFromDisk);

        // Verify exact persistence round-trip
        expect(reloadedSettings.agent.endpointUrl).toBe(expectedEndpoint);
        expect(reloadedSettings.agent.model).toBe(expectedModel);
        expect(reloadedSettings.agent.temperature).toBe(expectedTemp);
        expect(reloadedSettings.agent.maxRetries).toBe(expectedRetries);

        currentSettings = reloadedSettings;
      }
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
