import { CalendarInfo } from './calendar_settings';
// Import lazily-referenced type for chrono analyser configuration.
// Placed inside a type-only import to avoid pulling heavy modules at runtime here.

import type { InsightsConfig } from '../chrono_analyser/ui/ui';

export interface TriggerRule {
  id: string;
  bucketType: string;
  matchField?: string;
  matchPattern: string;
  useRegex: boolean;
}

export interface ContextProfile {
  id: string;
  name: string;
  activationThresholdMins: number;
  softBreakLimitMins: number;
  primaryEvidenceRules: TriggerRule[];
  supportingEvidenceRules?: TriggerRule[];
  hardBreakRules: TriggerRule[];
  titleTemplate: string;
  color: string;
}

export interface ActivityWatchSettings {
  enabled: boolean;
  apiUrl: string;
  lastSyncTime: number;
  autoSyncEnabled: boolean;
  autoSyncIntervalMins: number;
  targetCalendarId: string;
  syncStrategy: 'auto' | 'custom';
  customDateStart: string;
  customDateEnd: string;
  profiles: ContextProfile[];
}

export type TasksDateTarget = 'scheduledDate' | 'startDate' | 'dueDate';

export type TasksBacklogDateTarget = TasksDateTarget;
export type TasksDisplayFormat = 'standard' | 'dayPlanner';

export interface TasksIntegrationSettings {
  backlogDateTarget: TasksBacklogDateTarget;
  calendarDisplayDateTarget: TasksDateTarget;
  openEditModalAfterBacklogDrop: boolean;
  taskDisplayFormat?: TasksDisplayFormat;
  includeGlobalQueryInBacklog?: boolean;
}

export interface MilestonesSettings {
  counters: Record<string, number>;
  unlockedAt: Record<string, number>;
}

export type ApiScope =
  | 'ui:open-calendar'
  | 'ui:open-sidebar'
  | 'ui:change-view'
  | 'ui:modals'
  | 'events:read'
  | 'events:write'
  | 'providers:read'
  | 'providers:write'
  | 'settings:read'
  | 'settings:write'
  | 'system:full-access';

export interface ApiTokenRecord {
  pluginId: string;
  reason: string;
  requestedScopes: ApiScope[];
  grantedScopes: ApiScope[];
  grantedAt: number;
  lastUsedAt?: number;
}

export interface BusinessHoursSettings {
  enabled: boolean;
  daysOfWeek: number[]; // 0=Sunday, 1=Monday, etc.
  startTime: string; // Format: 'HH:mm'
  endTime: string; // Format: 'HH:mm'
}

export interface WorkspaceSettings {
  id: string;
  name: string;

  // View Configuration
  defaultView?: {
    desktop?: string;
    mobile?: string;
  };
  defaultDate?: string; // 'today' | 'start-of-month' | 'next-week' | ISO date string

  // Source & Content Filtering
  visibleCalendars?: string[]; // Calendar IDs to show (if empty, show all)
  categoryFilter?: {
    mode: 'show-only' | 'hide'; // Filter mode
    categories: string[]; // List of categories to show/hide
  };

  // Appearance Overrides
  businessHours?: BusinessHoursSettings; // Override global business hours setting
  timelineExpanded?: boolean; // Timeline categories expanded by default

  // New granular view configuration overrides
  slotMinTime?: string; // Format: 'HH:mm' - earliest time to display
  slotMaxTime?: string; // Format: 'HH:mm' - latest time to display
  allDaySlot?: boolean; // Whether to show all-day slot in week/day time-grid views
  timeGridDayHeaderFormat?: string; // Format for week/day column headers in time-grid views
  weekends?: boolean; // Whether to display weekends
  hiddenDays?: number[]; // Array of day numbers to hide (0=Sunday, 1=Monday, etc.)
  dayMaxEvents?: number | boolean; // Max events per day in month view (true = no limit, false = default, number = limit)
}

export interface GoogleAccount {
  id: string; // A unique identifier for this account
  email: string; // The user's email for display purposes
  refreshToken: string | null;
  accessToken: string | null;
  expiryDate: number | null;
}

export interface MicrosoftAccount {
  id: string;
  email: string;
  refreshToken: string | null;
  accessToken: string | null;
  expiryDate: number | null;
}

export interface FcrReminderCompanionSettings {
  enabled: boolean;
  apiUrl: string;
}

export interface FullCalendarSettings {
  calendarSources: CalendarInfo[];
  defaultCalendar: number;
  firstDay: number;
  initialView: {
    desktop: string;
    mobile: string;
  };
  timeFormat24h: boolean;
  clickToCreateEventFromMonthView: boolean;
  displayTimezone: string | null;
  lastSystemTimezone: string | null;
  enableAdvancedCategorization: boolean;
  chrono_analyser_config: InsightsConfig | null;
  categorySettings: { name: string; color: string }[];
  useCustomGoogleClient: boolean;
  googleClientId: string;
  googleClientSecret: string;
  googleAccounts: GoogleAccount[];
  useCustomMicrosoftClient: boolean;
  microsoftClientId: string;
  microsoftProxyBaseUrl: string;
  microsoftAccounts: MicrosoftAccount[];
  businessHours: BusinessHoursSettings;
  enableBackgroundEvents: boolean;
  enableReminders: boolean;
  enableDefaultReminder: boolean;
  defaultReminderMinutes: number;
  workspaces: WorkspaceSettings[];
  activeWorkspace: string | null; // Workspace ID, null means default view
  showEventInStatusBar: boolean;
  highlightCurrentOrNextEvent: boolean;

  // New granular view configuration options
  slotMinTime?: string; // Format: 'HH:mm' - earliest time to display
  slotMaxTime?: string; // Format: 'HH:mm' - latest time to display
  allDaySlot?: boolean; // Whether to show all-day slot in week/day time-grid views
  timeGridDayHeaderFormat?: string; // Format for week/day column headers in time-grid views
  weekends?: boolean; // Whether to display weekends
  hiddenDays?: number[]; // Array of day numbers to hide (0=Sunday, 1=Monday, etc.)
  dayMaxEvents?: number | boolean; // Max events per day in month view (true = no limit, false = default, number = limit)
  activityWatch: ActivityWatchSettings;
  tasksIntegration: TasksIntegrationSettings;
  milestones: MilestonesSettings;
  fcrReminderCompanion: FcrReminderCompanionSettings;
  apiTokens?: Record<string, ApiTokenRecord>;
  authorizedTokens?: Record<string, { pluginId: string; reason: string; grantedAt: number }>;

  currentVersion: string | null;
  linkedNotesDirectory: string;
  linkedNoteTemplate: string;
}

export const DEFAULT_SETTINGS: FullCalendarSettings = {
  calendarSources: [],
  defaultCalendar: 0,
  firstDay: 0,
  initialView: {
    desktop: 'timeGridWeek',
    mobile: 'timeGrid3Days'
  },
  timeFormat24h: false,
  clickToCreateEventFromMonthView: true,
  displayTimezone: null,
  lastSystemTimezone: null,
  enableAdvancedCategorization: false,
  chrono_analyser_config: null,
  categorySettings: [],
  useCustomGoogleClient: false,
  googleClientId: '',
  googleClientSecret: '',
  googleAccounts: [],
  useCustomMicrosoftClient: false,
  microsoftClientId: '',
  microsoftProxyBaseUrl: '',
  microsoftAccounts: [],
  businessHours: {
    enabled: false,
    daysOfWeek: [1, 2, 3, 4, 5], // Monday to Friday
    startTime: '09:00',
    endTime: '17:00'
  },
  enableBackgroundEvents: true,
  enableReminders: true,
  workspaces: [],
  activeWorkspace: null,
  showEventInStatusBar: false,
  highlightCurrentOrNextEvent: true,

  // New granular view configuration defaults
  slotMinTime: '00:00', // Show all hours by default
  slotMaxTime: '24:00', // Show all hours by default
  allDaySlot: true, // Show all-day row in week/day views by default
  timeGridDayHeaderFormat: 'day-mmdd', // Default: Wed 4/9
  weekends: true, // Show weekends by default
  hiddenDays: [], // Show all days by default
  dayMaxEvents: false, // Use FullCalendar default behavior
  activityWatch: {
    enabled: false,
    apiUrl: 'http://127.0.0.1:5600',
    lastSyncTime: 0,
    autoSyncEnabled: false,
    autoSyncIntervalMins: 10,
    targetCalendarId: '',
    syncStrategy: 'auto',
    customDateStart: '',
    customDateEnd: '',
    profiles: []
  },
  tasksIntegration: {
    backlogDateTarget: 'scheduledDate',
    calendarDisplayDateTarget: 'scheduledDate',
    openEditModalAfterBacklogDrop: false,
    taskDisplayFormat: 'dayPlanner',
    includeGlobalQueryInBacklog: false
  },
  milestones: {
    counters: {},
    unlockedAt: {}
  },
  fcrReminderCompanion: {
    enabled: false,
    apiUrl: 'http://127.0.0.1:45677'
  },
  apiTokens: {},
  authorizedTokens: {},

  enableDefaultReminder: true,
  defaultReminderMinutes: 10,
  currentVersion: null,
  linkedNotesDirectory: '',
  linkedNoteTemplate:
    '# {{title}}\n\n**Date**: {{date}}\n**Time**: {{timeString}}\n**Location**: {{location}}\n**Calendar**: {{calendarName}}\n\n## Description\n{{description}}\n\n## Notes\n- '
};

// Utility functions for workspace management
export function generateWorkspaceId(): string {
  return `workspace_${Math.random().toString(36).slice(2, 11)}`;
}

export function createDefaultWorkspace(name: string): WorkspaceSettings {
  return {
    id: generateWorkspaceId(),
    name: name,
    defaultView: undefined,
    defaultDate: undefined,
    visibleCalendars: undefined,
    categoryFilter: undefined,
    businessHours: undefined,
    timelineExpanded: undefined
  };
}

export function getActiveWorkspace(settings: FullCalendarSettings): WorkspaceSettings | null {
  if (!settings.activeWorkspace) return null;
  return settings.workspaces.find(w => w.id === settings.activeWorkspace) || null;
}
