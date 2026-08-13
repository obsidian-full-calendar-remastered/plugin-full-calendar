import { OFCEvent, EventLocation } from '../types';
import {
  EventHandle,
  ProviderConfigContext,
  FCReactComponent,
  ProviderSettingsRowProps
} from './typesProvider';
import type FullCalendarPlugin from '../main';
import { LivePreviewDecorator } from '../features/livepreview/LivePreviewDecorator';

export interface CalendarProviderCapabilities {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  hasCustomEditUI?: boolean; // This is the new capability
  supportsAlarms?: boolean;
  ownsRecurringInstanceOverrides?: boolean;
  contextMenu?: {
    allowGenericTaskActions?: boolean;
    allowDisplayActions?: boolean;
    providesNativeTaskSemantics?: boolean;
  };
}

export interface TaskBacklogInfo {
  id: string;
  name: string;
  title?: string;
  supportsCreate?: boolean;
}

export interface TaskBacklogItem {
  id: string;
  title: string;
  completed: boolean;
  subtitle?: string;
  sourceId?: string;
}

export interface TaskBacklogProvider {
  getTaskBacklogInfo(): TaskBacklogInfo;
  getTaskBacklogItems(): Promise<TaskBacklogItem[]>;
  createTaskBacklogItem?(title: string): Promise<TaskBacklogItem>;
  setTaskBacklogItemComplete?(taskId: string, isDone: boolean): Promise<boolean>;
  openTaskBacklogItem?(taskId: string): Promise<void>;
  deleteTaskBacklogItem?(taskId: string): Promise<void>;
  refreshTaskBacklogItems?(): Promise<TaskBacklogItem[]>;
  ownsTaskId(taskId: string): boolean;
  scheduleTask(taskId: string, date: Date, allDay?: boolean): Promise<void>;
  unscheduleTask?(taskId: string): Promise<void>;
  validateTaskSchedule?(taskId: string, date: Date): Promise<{ isValid: boolean; reason?: string }>;
}

export class RecoverableProviderLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecoverableProviderLoadError';
  }
}

export class DelegatedProviderActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DelegatedProviderActionError';
  }
}

export interface ProviderLoadRetryPolicy {
  retryDelayMs: number;
  maxAttempts?: number;
}

export interface ProviderEventContext {
  eventId: string;
  event: OFCEvent;
  calendarId: string;
  location: { path: string; lineNumber: number | undefined } | null;
  display?: string;
  title: string;
  start?: Date | null;
  plugin: FullCalendarPlugin;
}

export interface EventContextAction {
  id: string;
  title: string;
  icon?: string;
  disabled?: boolean;
  visible?: boolean;
  run(): Promise<void> | void;
}

export interface RecurringInstanceState {
  completed: boolean;
  skipped: boolean;
}

export interface CalendarProvider<TConfig> {
  readonly type: string;
  readonly displayName: string;
  readonly isRemote: boolean;
  readonly loadPriority: number;

  /**
   * Optional initialization hook called after provider instance is created.
   * Use this to subscribe to external events or set up live watchers.
   */
  initialize?(): void;

  /**
   * Optional retry policy for providers that may be temporarily unavailable during
   * Obsidian startup. The registry owns the delayed retry loop so views can render
   * while provider data catches up in the background.
   */
  getLoadRetryPolicy?(): ProviderLoadRetryPolicy | null;

  getCapabilities(): CalendarProviderCapabilities;

  getEventHandle(event: OFCEvent): EventHandle | null;

  getEvents(range?: { start: Date; end: Date }): Promise<[OFCEvent, EventLocation | null][]>;
  getEventsInFile?(file: import('obsidian').TFile): Promise<[OFCEvent, EventLocation | null][]>;
  isFileRelevant?(file: import('obsidian').TFile): boolean;

  createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]>;
  updateEvent(
    handle: EventHandle,
    oldEventData: OFCEvent,
    newEventData: OFCEvent
  ): Promise<EventLocation | null>;
  deleteEvent(handle: EventHandle): Promise<void>;

  createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]>;

  /**
   * Optional: A provider-specific method for toggling the completion status of a task.
   * If implemented, this will be called instead of the default behavior when a task checkbox
   * in the UI is toggled. The provider is responsible for persisting the change and triggering
   * any necessary cache updates.
   * @param eventId The session ID of the event to toggle.
   * @param isDone The desired completion state.
   * @returns A promise that resolves to `true` on success and `false` on failure.
   */
  toggleComplete?(eventId: string, isDone: boolean): Promise<boolean>;

  /**
   * Optional: Called before a drag-and-drop scheduling action is committed.
   * The provider can implement this to enforce rules, like preventing a task
   * from being scheduled after its due date.
   * @param event The event being scheduled. For undated tasks, this may be a stub.
   * @param date The date the event is being dropped on.
   * @returns An object indicating if the action is valid and an optional reason for the user.
   */
  canBeScheduledAt?(event: OFCEvent, date: Date): Promise<{ isValid: boolean; reason?: string }>;

  /**
   * Optional provider-specific event context actions. Generic actions are
   * contributed by the UI menu builder based on capabilities; providers can add
   * actions here when their source has native semantics the UI should not guess.
   */
  getEventContextActions?(
    context: ProviderEventContext
  ): EventContextAction[] | Promise<EventContextAction[]>;

  getConfigurationComponent(): FCReactComponent<{
    plugin: FullCalendarPlugin;
    config: Partial<TConfig>;
    onConfigChange: (newConfig: Partial<TConfig>) => void;
    context: ProviderConfigContext;
    onSave: (finalConfig: TConfig | TConfig[]) => void;
    onClose: () => void;
  }>;

  getSettingsRowComponent(): FCReactComponent<ProviderSettingsRowProps>;

  getEditorDecorator?(): LivePreviewDecorator;
}

/**
 * Optional interface for providers that can produce a cheap, deterministic
 * sync key for events. Used by EventCache.syncCalendar() and syncFile()
 * to perform efficient keyed-identity diffing instead of nuke-and-rebuild.
 *
 * This is a separate interface following the Interface Segregation Principle:
 * providers that don't implement it will fall back to a default key derivation.
 *
 * IMPORTANT: The sync key MUST be deterministic — the same event data must
 * always produce the same key string. It must also be unique within a calendar
 * (no two different events in the same calendar should produce the same key).
 */
export interface SyncKeyProvider {
  /**
   * Computes a lightweight, deterministic key that uniquely identifies an event
   * within this calendar. This MUST be a pure function with no I/O — no vault
   * scans, no network calls, no file reads. String operations only.
   *
   * The key is used for set-diffing during sync: events with the same key in
   * old and new sets are considered "the same event" and their session IDs
   * are reused, avoiding unnecessary UI churn and mapping work.
   */
  computeSyncKey(event: OFCEvent): string;
}

export interface CanonicalTitleProvider {
  getCanonicalTitle(event: OFCEvent): string;
}

/**
 * Optional interface for providers that own recurring-instance semantics.
 *
 * This keeps provider-specific recurrence state (for example, arrays of completed
 * or skipped dates) encapsulated inside each provider and exposes only a generic,
 * provider-agnostic contract to core/UI layers.
 */
export interface RecurringInstanceStateProvider {
  getRecurringInstanceState(
    event: OFCEvent,
    instanceDate: string
  ): Promise<RecurringInstanceState | null>;

  setRecurringInstanceState(
    event: OFCEvent,
    instanceDate: string,
    nextState: RecurringInstanceState
  ): Promise<boolean>;
}
