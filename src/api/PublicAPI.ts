import { PluginState } from '../core/PluginState';
import { ApiScope, ApiTokenRecord, FullCalendarSettings } from '../types/settings';
import { OFCEvent } from '../types';
import {
  EventFilterCriteria,
  EventSortCriteria,
  QueryableEvent
} from '../core/EventFilterSortEngine';
import { CalendarInfo } from '../types/calendar_settings';
import { InternalAPI, ApiEventDetails } from './InternalAPI';
import { AuthorizationModal } from './AuthorizationModal';
import { FULL_ACCESS_SCOPE, hasApiScope, normalizeApiScopes } from './apiScopes';
import FullCalendarPlugin from '../main';

type ApiTokenStore = Record<string, ApiTokenRecord>;

function getApiTokenStore(settings: FullCalendarSettings): ApiTokenStore {
  if (!settings.apiTokens) {
    settings.apiTokens = {};
  }
  return settings.apiTokens;
}

function cloneSettings(settings: FullCalendarSettings): FullCalendarSettings {
  return JSON.parse(JSON.stringify(settings)) as FullCalendarSettings;
}

function assertScope(grantedScopes: ApiScope[], required: ApiScope) {
  if (!hasApiScope(grantedScopes, required)) {
    throw new Error(`Full Calendar API: Missing required scope: ${required}`);
  }
}

function createAuthorizedApi(tokenRecord: ApiTokenRecord): AuthorizedAPI {
  const grantedScopes = tokenRecord.grantedScopes;
  const internal = PluginState.getInternalAPI();
  const cache = PluginState.getCache();
  const registry = PluginState.getProviderRegistry();

  return {
    openCalendar: async () => {
      assertScope(grantedScopes, 'ui:open-calendar');
      return internal.openCalendar();
    },
    openSidebar: async () => {
      assertScope(grantedScopes, 'ui:open-sidebar');
      return internal.openSidebar();
    },
    changeView: async (viewName: string) => {
      assertScope(grantedScopes, 'ui:change-view');
      return internal.changeView(viewName);
    },
    openCreateModal: (initialData?: Partial<OFCEvent>) => {
      assertScope(grantedScopes, 'ui:modals');
      internal.openCreateModal(initialData);
    },
    getAllEvents: () => {
      assertScope(grantedScopes, 'events:read');
      return cache.getAllEvents();
    },
    getEventById: (id: string) => {
      assertScope(grantedScopes, 'events:read');
      return cache.getEventById(id);
    },
    getEventDetails: (id: string) => {
      assertScope(grantedScopes, 'events:read');
      return internal.getEventDetails(id);
    },
    getEvents: (criteria: EventFilterCriteria, sorts?: EventSortCriteria[]) => {
      assertScope(grantedScopes, 'events:read');
      return internal.getEvents(criteria, sorts);
    },
    createEvent: (calendarId: string, event: OFCEvent, options?: { silent?: boolean }) => {
      assertScope(grantedScopes, 'events:write');
      return cache.addEvent(calendarId, event, options);
    },
    updateEvent: (eventId: string, event: OFCEvent, options?: { silent?: boolean }) => {
      assertScope(grantedScopes, 'events:write');
      return cache.updateEventWithId(eventId, event, options);
    },
    deleteEvent: (
      eventId: string,
      options?: { silent?: boolean; instanceDate?: string; force?: boolean }
    ) => {
      assertScope(grantedScopes, 'events:write');
      return cache.deleteEvent(eventId, options);
    },
    moveEvent: (eventId: string, newCalendarId: string, newEventData?: OFCEvent) => {
      assertScope(grantedScopes, 'events:write');
      return cache.moveEventToCalendar(eventId, newCalendarId, newEventData);
    },
    processEvent: (
      eventId: string,
      processor: (event: OFCEvent) => OFCEvent,
      options?: { silent?: boolean }
    ) => {
      assertScope(grantedScopes, 'events:write');
      return cache.processEvent(eventId, processor, options as { silent: boolean } | undefined);
    },
    toggleRecurringInstance: (eventId: string, instanceDate: string, isDone: boolean) => {
      assertScope(grantedScopes, 'events:write');
      return cache.toggleRecurringInstance(eventId, instanceDate, isDone);
    },
    modifyRecurringInstance: (eventId: string, instanceDate: string, newEvent: OFCEvent) => {
      assertScope(grantedScopes, 'events:write');
      return cache.modifyRecurringInstance(eventId, instanceDate, newEvent);
    },
    scheduleTask: (taskId: string, date: Date, allDay = true) => {
      assertScope(grantedScopes, 'events:write');
      return cache.scheduleTask(taskId, date, allDay);
    },
    validateTaskSchedule: (taskId: string, date: Date) => {
      assertScope(grantedScopes, 'events:write');
      return cache.validateTaskSchedule(taskId, date);
    },
    getCalendarSources: () => {
      assertScope(grantedScopes, 'providers:read');
      return registry.getAllSources();
    },
    getProviderCapabilities: (calendarId: string) => {
      assertScope(grantedScopes, 'providers:read');
      return registry.getCapabilities(calendarId);
    },
    revalidateRemoteCalendars: (force?: boolean) => {
      assertScope(grantedScopes, 'providers:write');
      registry.revalidateRemoteCalendars(force);
    },
    reloadProviderNow: (calendarId: string) => {
      assertScope(grantedScopes, 'providers:write');
      registry.reloadProviderNow(calendarId);
    },
    getSettings: () => {
      assertScope(grantedScopes, 'settings:read');
      return cloneSettings(PluginState.getSettings());
    },
    updateSettings: async (
      partial: Partial<FullCalendarSettings>,
      options?: { save?: boolean }
    ) => {
      assertScope(grantedScopes, 'settings:write');
      const nextSettings = { ...PluginState.getSettings(), ...partial };
      PluginState.setSettings(nextSettings);
      if (options?.save !== false) {
        await PluginState.saveSettings();
      }
    },
    saveSettings: async () => {
      assertScope(grantedScopes, 'settings:write');
      await PluginState.saveSettings();
    },
    loadSettings: async () => {
      assertScope(grantedScopes, 'settings:read');
      await PluginState.loadSettings();
    },
    getInternalState: () => {
      assertScope(grantedScopes, FULL_ACCESS_SCOPE);
      return {
        plugin: PluginState.getPlugin(),
        settings: PluginState.getSettings(),
        cache: PluginState.getCache(),
        providerRegistry: PluginState.getProviderRegistry(),
        internalAPI: PluginState.getInternalAPI()
      };
    }
  };
}

/**
 * The VIP section. Only granted to plugins with a valid token.
 */
export interface AuthorizedAPI {
  openCalendar(): Promise<void>;
  openSidebar(): Promise<void>;
  changeView(viewName: string): Promise<void>;
  openCreateModal(initialData?: Partial<OFCEvent>): void;
  getAllEvents(): unknown[];
  getEventById(id: string): OFCEvent | null;
  getEventDetails(id: string): ApiEventDetails;
  getEvents(criteria: EventFilterCriteria, sorts?: EventSortCriteria[]): QueryableEvent[];
  createEvent(
    calendarId: string,
    event: OFCEvent,
    options?: { silent?: boolean }
  ): Promise<boolean>;
  updateEvent(eventId: string, event: OFCEvent, options?: { silent?: boolean }): Promise<boolean>;
  deleteEvent(
    eventId: string,
    options?: { silent?: boolean; instanceDate?: string; force?: boolean }
  ): Promise<void>;
  moveEvent(eventId: string, newCalendarId: string, newEventData?: OFCEvent): Promise<void>;
  processEvent(
    eventId: string,
    processor: (event: OFCEvent) => OFCEvent,
    options?: { silent?: boolean }
  ): Promise<boolean>;
  toggleRecurringInstance(eventId: string, instanceDate: string, isDone: boolean): Promise<void>;
  modifyRecurringInstance(eventId: string, instanceDate: string, newEvent: OFCEvent): Promise<void>;
  scheduleTask(taskId: string, date: Date, allDay?: boolean): Promise<void>;
  validateTaskSchedule(taskId: string, date: Date): Promise<{ isValid: boolean; reason?: string }>;
  getCalendarSources(): CalendarInfo[];
  getProviderCapabilities(
    calendarId: string
  ): ReturnType<typeof PluginState.getProviderRegistry.prototype.getCapabilities>;
  revalidateRemoteCalendars(force?: boolean): void;
  reloadProviderNow(calendarId: string): void;
  getSettings(): FullCalendarSettings;
  updateSettings(
    partial: Partial<FullCalendarSettings>,
    options?: { save?: boolean }
  ): Promise<void>;
  saveSettings(): Promise<void>;
  loadSettings(): Promise<void>;
  getInternalState(): {
    plugin: FullCalendarPlugin;
    settings: FullCalendarSettings;
    cache: typeof PluginState.getCache.prototype;
    providerRegistry: typeof PluginState.getProviderRegistry.prototype;
    internalAPI: InternalAPI;
  };
}

/**
 * The Bouncer. This is what is exposed on `app.plugins.plugins['full-calendar'].api`.
 */
export class PublicAPI {
  #plugin: FullCalendarPlugin;

  constructor(plugin: FullCalendarPlugin) {
    this.#plugin = plugin;
  }

  /**
   * Requests access to the Full Calendar API.
   * Prompts the user with a modal. If approved, returns a token.
   */
  public requestAccess(
    pluginId: string,
    reason: string,
    requestedScopes?: ApiScope[]
  ): Promise<string | null> {
    return new Promise(resolve => {
      const normalizedScopes = normalizeApiScopes(requestedScopes);
      const modal = new AuthorizationModal(
        this.#plugin.app,
        pluginId,
        reason,
        normalizedScopes,
        result => {
          if (!result.approved) {
            resolve(null);
            return;
          }

          if (result.grantedScopes.length === 0) {
            resolve(null);
            return;
          }

          const token = crypto.randomUUID();
          const settings = PluginState.getSettings();
          const tokenStore = getApiTokenStore(settings);

          tokenStore[token] = {
            pluginId,
            reason,
            requestedScopes: normalizedScopes,
            grantedScopes: result.grantedScopes,
            grantedAt: Date.now()
          };

          PluginState.saveSettings()
            .then(() => resolve(token))
            .catch(err => {
              console.error('Failed to save settings:', err);
              resolve(null);
            });
        }
      );
      modal.open();
    });
  }

  /**
   * Use an authorized token to get the actual API.
   */
  public withToken(token: string): AuthorizedAPI | null {
    const settings = PluginState.getSettings();
    const tokenStore = getApiTokenStore(settings);
    const tokenRecord = tokenStore[token];

    if (tokenRecord) {
      tokenRecord.lastUsedAt = Date.now();
      void PluginState.saveSettings();
      return createAuthorizedApi(tokenRecord);
    }

    const legacyToken = settings.authorizedTokens?.[token];
    if (legacyToken) {
      const migratedRecord: ApiTokenRecord = {
        pluginId: legacyToken.pluginId,
        reason: legacyToken.reason,
        requestedScopes: [FULL_ACCESS_SCOPE],
        grantedScopes: [FULL_ACCESS_SCOPE],
        grantedAt: legacyToken.grantedAt
      };
      tokenStore[token] = migratedRecord;
      void PluginState.saveSettings();
      return createAuthorizedApi(migratedRecord);
    }

    console.error('Full Calendar API: Invalid or unauthorized token.');
    return null;
  }
}
