export const DAILY_NOTE_EVENT_FORMATS = ['default', 'dayPlanner'] as const;

export type DailyNoteEventFormat = (typeof DAILY_NOTE_EVENT_FORMATS)[number];

export const DEFAULT_DAILY_NOTE_EVENT_FORMAT: DailyNoteEventFormat = 'default';

export const DAILY_NOTE_PROVIDERS = ['daily-notes', 'journals'] as const;

export type DailyNoteSourceProvider = (typeof DAILY_NOTE_PROVIDERS)[number];

export const DEFAULT_DAILY_NOTE_PROVIDER: DailyNoteSourceProvider = 'daily-notes';

export type DailyNoteProviderConfig = {
  id: string; // The settings-level ID, e.g., "dailynote_1"
  heading: string;
  format?: DailyNoteEventFormat;
  provider?: DailyNoteSourceProvider;
  journalId?: string;
};

export function getDailyNoteEventFormat(
  config: Pick<DailyNoteProviderConfig, 'format'> | undefined
): DailyNoteEventFormat {
  return config?.format ?? DEFAULT_DAILY_NOTE_EVENT_FORMAT;
}

export function getDailyNoteSourceProvider(
  config: Pick<DailyNoteProviderConfig, 'provider'> | undefined
): DailyNoteSourceProvider {
  return config?.provider ?? DEFAULT_DAILY_NOTE_PROVIDER;
}
