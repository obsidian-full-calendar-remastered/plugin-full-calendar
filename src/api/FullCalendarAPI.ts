import { showNotice } from '../utils/showNotice';
import { PluginState } from '../core/PluginState';
import {
  EventFilterSortEngine,
  QueryableEvent,
  EventFilterCriteria,
  EventSortCriteria
} from '../core/EventFilterSortEngine';
import type { EventSourceInput } from '@fullcalendar/core';
import type { ViewConfig } from '../features/codeblock/CodeBlockProcessor';
import { getEventSources as helperGetEventSources } from '../features/codeblock/CodeBlockQueryHelper';
import { Modal, App } from 'obsidian';
import type { Calendar } from '@fullcalendar/core';
import type FullCalendarPlugin from '../main';
import type { CalendarView } from '../ui/view';
import type EventCache from '../core/EventCache';
import type { ProviderRegistry } from '../providers/ProviderRegistry';
import type { CalendarInfo } from '../types/calendar_settings';
import { EventLocation, OFCEvent } from '../types';
import type { ApiScope, ApiTokenRecord, FullCalendarSettings } from '../types/settings';
import { launchCreateModal } from '../ui/modals/event_modal';
import { t } from '../features/i18n/i18n';
import {
  FULL_ACCESS_SCOPE,
  getScopeDefinition,
  hasApiScope,
  normalizeApiScopes
} from './apiScopes';

/**
 * The internal API that actually holds state and performs actions.
 * This is never exposed directly on the plugin object.
 */
export class InternalAPI {
  #activeViews: Set<CalendarView> = new Set();

  public registerView(view: CalendarView) {
    this.#activeViews.add(view);
  }

  public unregisterView(view: CalendarView) {
    this.#activeViews.delete(view);
  }

  #getActiveCalendar(): Calendar | null {
    for (const view of this.#activeViews) {
      if (view.fullCalendarView) {
        return view.fullCalendarView;
      }
    }
    return null;
  }

  public async openCalendar(): Promise<void> {
    const plugin = PluginState.getPlugin();
    const { FULL_CALENDAR_VIEW_TYPE } = await import('../ui/view');
    const leaves = plugin.app.workspace
      .getLeavesOfType(FULL_CALENDAR_VIEW_TYPE)
      .filter(l => (l.view as CalendarView).inSidebar === false);
    if (leaves.length === 0) {
      const leaf = plugin.app.workspace.getLeaf('tab');
      await leaf.setViewState({
        type: FULL_CALENDAR_VIEW_TYPE,
        active: true
      });
    } else {
      await Promise.all(leaves.map(l => (l.view as CalendarView).onOpen()));
    }
  }

  public async openSidebar(): Promise<void> {
    const plugin = PluginState.getPlugin();
    const { FULL_CALENDAR_SIDEBAR_VIEW_TYPE } = await import('../ui/view');
    if (plugin.app.workspace.getLeavesOfType(FULL_CALENDAR_SIDEBAR_VIEW_TYPE).length) {
      return;
    }
    const targetLeaf = plugin.app.workspace.getRightLeaf(false);
    if (targetLeaf) {
      await targetLeaf.setViewState({
        type: FULL_CALENDAR_SIDEBAR_VIEW_TYPE
      });
      await plugin.app.workspace.revealLeaf(targetLeaf);
    } else {
      console.warn('Right leaf not found for calendar view!');
    }
  }

  public async changeView(viewName: string): Promise<void> {
    let calendar = this.#getActiveCalendar();
    if (!calendar) {
      await this.openCalendar();
      await new Promise(resolve => window.setTimeout(resolve, 100));
      calendar = this.#getActiveCalendar();
    }

    if (calendar) {
      calendar.changeView(viewName);
    } else {
      showNotice('Failed to find active calendar view.');
    }
  }

  public openCreateModal(initialData?: Partial<OFCEvent>): void {
    launchCreateModal(PluginState.getPlugin(), initialData || {});
  }

  public getAllEvents() {
    return PluginState.getCache().getAllEvents();
  }

  public getEventById(id: string): OFCEvent | null {
    return PluginState.getCache().getEventById(id);
  }

  public getEventDetails(id: string): ApiEventDetails {
    return PluginState.getCache().store.getEventDetails(id) as ApiEventDetails;
  }

  public getEvents(criteria: EventFilterCriteria, sorts?: EventSortCriteria[]): QueryableEvent[] {
    const allSources = PluginState.getCache().getAllEvents();
    const queryables: QueryableEvent[] = [];

    for (const source of allSources) {
      for (const event of source.events) {
        if (!event.id) continue;
        const details = this.getEventDetails(event.id);

        const q = EventFilterSortEngine.fromStoredEvent({
          id: event.id,
          event: details ? details.event : event.event,
          calendarId: details ? details.calendarId : source.id,
          location:
            details && details.location
              ? {
                  path:
                    'file' in details.location
                      ? (details.location as { file: { path: string } }).file.path
                      : (details.location as { path: string }).path,
                  lineNumber: details.location.lineNumber
                }
              : null
        });
        q.rawEvent = event;
        queryables.push(q);
      }
    }

    return EventFilterSortEngine.query(queryables, criteria, sorts);
  }

  public getEventSources(
    config: ViewConfig,
    sourcePath: string
  ): { sources: EventSourceInput[]; initialDate?: string } {
    return helperGetEventSources(config, sourcePath, this);
  }
}

export type ApiEventDetails = {
  event: OFCEvent;
  calendarId: string;
  location: EventLocation | null;
} | null;

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
  getProviderCapabilities(calendarId: string): ReturnType<ProviderRegistry['getCapabilities']>;
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
    cache: EventCache;
    providerRegistry: ProviderRegistry;
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

class AuthorizationModal extends Modal {
  private pluginId: string;
  private reason: string;
  private requestedScopes: ApiScope[];
  private grantedScopes: Set<ApiScope>;
  private onResolve: (result: { approved: boolean; grantedScopes: ApiScope[] }) => void;

  constructor(
    app: App,
    pluginId: string,
    reason: string,
    requestedScopes: ApiScope[],
    onResolve: (result: { approved: boolean; grantedScopes: ApiScope[] }) => void
  ) {
    super(app);
    this.pluginId = pluginId;
    this.reason = reason;
    this.requestedScopes = requestedScopes;
    this.grantedScopes = new Set(requestedScopes);
    this.onResolve = onResolve;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText(t('api.authorization.title'));

    contentEl.createEl('p', {
      text: t('api.authorization.requestingPluginMessage', { pluginId: this.pluginId })
    });

    contentEl.createEl('p', {
      text: t('api.authorization.reasonLabel', { reason: this.reason }),
      cls: 'ofc-auth-reason'
    });

    contentEl.createEl('p', {
      text: t('api.authorization.permissionsLabel')
    });

    const scopesContainer = contentEl.createDiv({ cls: 'ofc-auth-scopes' });
    const availableScopes: ApiScope[] =
      this.requestedScopes.length > 0 ? this.requestedScopes : ['events:read'];
    let approveBtn: HTMLButtonElement | null = null;
    const updateApproveState = () => {
      if (approveBtn) {
        approveBtn.disabled = this.grantedScopes.size === 0;
      }
    };

    availableScopes.forEach((scope: ApiScope) => {
      const definition = getScopeDefinition(scope);
      const row = scopesContainer.createDiv({ cls: 'ofc-auth-scope-row' });
      const label = definition?.label || scope;
      const description = definition?.description || '';

      if (definition?.risky) {
        row.addClass('is-risky');
      }

      const checkboxLabel = row.createEl('label', { cls: 'ofc-auth-scope-label' });
      const checkbox = checkboxLabel.createEl('input');
      checkbox.setAttribute('type', 'checkbox');
      checkbox.checked = this.grantedScopes.has(scope);
      checkbox.onchange = () => {
        if (checkbox.checked) {
          this.grantedScopes.add(scope);
        } else {
          this.grantedScopes.delete(scope);
        }
        updateApproveState();
      };

      checkboxLabel.createSpan({ text: label });
      if (description) {
        row.createDiv({ cls: 'ofc-auth-scope-desc', text: description });
      }
    });

    const buttonContainer = contentEl.createDiv({ cls: 'ofc-auth-buttons' });

    const denyBtn = buttonContainer.createEl('button', {
      text: t('api.authorization.deny')
    });
    denyBtn.onclick = () => {
      this.onResolve({ approved: false, grantedScopes: [] });
      this.close();
    };

    approveBtn = buttonContainer.createEl('button', {
      text: t('api.authorization.approve'),
      cls: 'mod-cta'
    });

    updateApproveState();

    approveBtn.onclick = () => {
      this.onResolve({
        approved: true,
        grantedScopes: Array.from(this.grantedScopes)
      });
      this.close();
    };
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
