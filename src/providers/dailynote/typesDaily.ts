export const DAILY_NOTE_EVENT_FORMATS = ['default', 'dayPlanner'] as const;

export type DailyNoteEventFormat = (typeof DAILY_NOTE_EVENT_FORMATS)[number];

export const DEFAULT_DAILY_NOTE_EVENT_FORMAT: DailyNoteEventFormat = 'default';

export type DailyNoteProviderConfig = {
  id: string; // The settings-level ID, e.g., "dailynote_1"
  heading: string;
  format?: DailyNoteEventFormat;
};

export function getDailyNoteEventFormat(
  config: Pick<DailyNoteProviderConfig, 'format'> | undefined
): DailyNoteEventFormat {
  return config?.format ?? DEFAULT_DAILY_NOTE_EVENT_FORMAT;
}
