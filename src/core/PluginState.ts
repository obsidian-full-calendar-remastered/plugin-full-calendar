import type FullCalendarPlugin from '../main';
import type EventCache from './EventCache';
import type { ProviderRegistry } from '../providers/ProviderRegistry';
import type { FullCalendarSettings } from '../types/settings';
import type { InternalAPI } from '../api/FullCalendarAPI';
import type { TFile } from 'obsidian';

// Internal closure state
let _plugin: FullCalendarPlugin | null = null;
let _settings: FullCalendarSettings | null = null;
let _cache: EventCache | null = null;
let _providerRegistry: ProviderRegistry | null = null;
let _internalAPI: InternalAPI | null = null;
let _saveSettings: (() => Promise<void>) | null = null;
let _persistData: (() => Promise<void>) | null = null;
let _loadSettings: (() => Promise<void>) | null = null;
let _debounceTimer: number | null = null;
let _pendingSavePromise: Promise<void> | null = null;
let _pendingSaveResolvers: (() => void)[] = [];
let _nonBlockingProcess:
  | ((
      files: TFile[],
      processor: (file: TFile) => Promise<void>,
      description: string
    ) => Promise<void>)
  | null = null;
let _displaySettingsTab: (() => void) | null = null;
let _showChangelog: (() => void) | null = null;
let _showMilestones: (() => void) | null = null;
let _isMobile: (() => boolean) | null = null;

function syncProviderSources(): void {
  const updateSources = (
    _providerRegistry as { updateSources?: ProviderRegistry['updateSources'] } | null
  )?.updateSources;
  if (_settings && updateSources) {
    updateSources.call(_providerRegistry, _settings.calendarSources);
  }
}

export const PluginState = {
  getPlugin(): FullCalendarPlugin {
    if (!_plugin) throw new Error('PluginState: Plugin not initialized');
    return _plugin;
  },
  setPlugin(plugin: FullCalendarPlugin) {
    _plugin = plugin;
  },

  getSettings(): FullCalendarSettings {
    if (!_settings) throw new Error('PluginState: Settings not initialized');
    return _settings;
  },
  setSettings(settings: FullCalendarSettings) {
    _settings = settings;
    syncProviderSources();
  },

  getCache(): EventCache {
    if (!_cache) throw new Error('PluginState: EventCache not initialized');
    return _cache;
  },
  setCache(cache: EventCache) {
    _cache = cache;
  },

  getProviderRegistry(): ProviderRegistry {
    if (!_providerRegistry) throw new Error('PluginState: ProviderRegistry not initialized');
    return _providerRegistry;
  },
  setProviderRegistry(registry: ProviderRegistry) {
    _providerRegistry = registry;
    syncProviderSources();
  },

  getInternalAPI(): InternalAPI {
    if (!_internalAPI) throw new Error('PluginState: InternalAPI not initialized');
    return _internalAPI;
  },
  setInternalAPI(api: InternalAPI) {
    _internalAPI = api;
  },

  saveSettings(immediate = true): Promise<void> {
    if (!_saveSettings) throw new Error('PluginState: saveSettings not initialized');

    if (immediate) {
      if (_debounceTimer) {
        window.clearTimeout(_debounceTimer);
        _debounceTimer = null;
      }
      const promise = _saveSettings();
      const resolvers = [..._pendingSaveResolvers];
      _pendingSaveResolvers = [];
      _pendingSavePromise = null;
      void promise.then(() => {
        resolvers.forEach(resolve => resolve());
      });
      return promise;
    }

    if (_debounceTimer) {
      window.clearTimeout(_debounceTimer);
    }
    if (!_pendingSavePromise) {
      _pendingSavePromise = new Promise<void>(resolve => {
        _pendingSaveResolvers.push(resolve);
      });
    }
    _debounceTimer = window.setTimeout(() => {
      _debounceTimer = null;
      if (!_saveSettings) return;
      const promise = _saveSettings();
      const resolvers = [..._pendingSaveResolvers];
      _pendingSaveResolvers = [];
      _pendingSavePromise = null;
      void promise.then(() => {
        resolvers.forEach(resolve => resolve());
      });
    }, 500);

    return _pendingSavePromise;
  },
  setSaveSettings(saveSettings: () => Promise<void>) {
    _saveSettings = saveSettings;
  },

  async flushDebouncedSave(): Promise<void> {
    if (_debounceTimer) {
      await this.saveSettings(true);
    }
  },

  persistData(): Promise<void> {
    if (!_persistData) throw new Error('PluginState: persistData not initialized');
    return _persistData();
  },
  setPersistData(persistData: () => Promise<void>) {
    _persistData = persistData;
  },

  loadSettings(): Promise<void> {
    if (!_loadSettings) throw new Error('PluginState: loadSettings not initialized');
    return _loadSettings();
  },
  setLoadSettings(loadSettings: () => Promise<void>) {
    _loadSettings = loadSettings;
  },

  nonBlockingProcess(
    files: TFile[],
    processor: (file: TFile) => Promise<void>,
    description: string
  ): Promise<void> {
    if (!_nonBlockingProcess) {
      throw new Error('PluginState: nonBlockingProcess not initialized');
    }
    return _nonBlockingProcess(files, processor, description);
  },
  setNonBlockingProcess(
    nonBlockingProcess: (
      files: TFile[],
      processor: (file: TFile) => Promise<void>,
      description: string
    ) => Promise<void>
  ) {
    _nonBlockingProcess = nonBlockingProcess;
  },

  displaySettingsTab() {
    if (!_displaySettingsTab) throw new Error('PluginState: settings tab not initialized');
    _displaySettingsTab();
  },
  setDisplaySettingsTab(displaySettingsTab: () => void) {
    _displaySettingsTab = displaySettingsTab;
  },

  showChangelog() {
    if (!_showChangelog) throw new Error('PluginState: changelog view not initialized');
    _showChangelog();
  },
  setShowChangelog(showChangelog: () => void) {
    _showChangelog = showChangelog;
  },

  showMilestones() {
    if (!_showMilestones) throw new Error('PluginState: milestones view not initialized');
    _showMilestones();
  },
  setShowMilestones(showMilestones: () => void) {
    _showMilestones = showMilestones;
  },

  isMobile(): boolean {
    if (!_isMobile) throw new Error('PluginState: mobile detector not initialized');
    return _isMobile();
  },
  setIsMobile(isMobile: () => boolean) {
    _isMobile = isMobile;
  },

  clear() {
    if (_debounceTimer) {
      window.clearTimeout(_debounceTimer);
      _debounceTimer = null;
    }
    _pendingSavePromise = null;
    _pendingSaveResolvers = [];

    _plugin = null;
    _settings = null;
    _cache = null;
    _providerRegistry = null;
    _internalAPI = null;
    _saveSettings = null;
    _persistData = null;
    _loadSettings = null;
    _nonBlockingProcess = null;
    _displaySettingsTab = null;
    _showChangelog = null;
    _showMilestones = null;
    _isMobile = null;
  }
};
