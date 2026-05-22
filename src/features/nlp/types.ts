export type NLPIntent =
  | 'CREATE_EVENT'
  | 'NAVIGATE_DAY'
  | 'NAVIGATE_WEEK'
  | 'NAVIGATE_MONTH'
  | 'OPEN_CALENDAR'
  | 'OPEN_SIDEBAR'
  | 'OPEN_SETTINGS'
  | 'OPEN_CHRONO'
  | 'SHOW_CHANGELOG'
  | 'SHOW_MILESTONES'
  | 'RESET_CACHE'
  | 'REVALIDATE_REMOTE'
  | 'SYNC_ACTIVITYWATCH'
  | 'SYNC_FCR_REMINDER'
  | 'GOTO_DATE'
  | 'NEW_EVENT';

export type NLPSupportedLanguage = 'en' | 'de' | 'fr' | 'it' | 'es';

export type NLPRecurrence = {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  byDay?: string[];
};

export type NLPActionObject = {
  intent: NLPIntent;
  title: string;
  date: string;
  hours: number;
  minutes: number;
  endHours: number | null;
  endMinutes: number | null;
  targetCalendar: string | null;
  recurrence: NLPRecurrence | null;
  matchedRules: string[];
};

export type NLPRule = {
  name: string;
  regex: string;
  flags?: string;
  actions: string[];
};

export type NLPPayload = {
  version: number;
  locale: NLPSupportedLanguage;
  categoryParsing?: {
    spokenDelimiterRegex: string;
    spokenDelimiterFlags?: string;
    explicitCategoryRegex: string;
    explicitCategoryFlags?: string;
  };
  rules: NLPRule[];
};

export type NLPExecutionContext = {
  date: Date;
  durationHours: number | null;
  durationMinutes: number | null;
  explicitEndHours: number | null;
  explicitEndMinutes: number | null;
  intent: NLPIntent;
  targetCalendar: string | null;
  recurrence: NLPRecurrence | null;
  matchedRules: string[];
  strippedTitle: string;
  shortCircuit: boolean;
};
