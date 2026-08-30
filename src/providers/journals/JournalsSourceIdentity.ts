import type { CalendarInfo } from '../../types/calendar_settings';

/**
 * The Journals public API defines a journal name as its identity. Rename notifications are
 * therefore the only supported opportunity to migrate persisted third-party references.
 */
export const migrateJournalsSourceRename = (
  sources: CalendarInfo[],
  from: string,
  to: string
): boolean => {
  let changed = false;
  for (const source of sources) {
    if (source.type !== 'journals' || source.journalId !== from) continue;
    source.journalId = to;
    if (source.name === `Journals: ${from}`) source.name = `Journals: ${to}`;
    changed = true;
  }
  return changed;
};
