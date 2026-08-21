import { App, TFile } from 'obsidian';
import { OFCEvent } from '../../../types';
import { modifyFrontmatterString } from '../../fullnote/frontmatter';
import { LinkedNoteIndex } from '../../utils/LinkedNoteIndex';

export const LINKED_TASK_DATE_PROPERTIES = [
  'scheduled',
  'scheduled-link',
  'due',
  'due-link'
] as const;

export function linkedTaskDailyNoteLink(date: string | null): string | null {
  // YAML must quote wiki-links or Obsidian parses [[date]] as a nested array.
  return date ? `"[[${date}]]"` : null;
}

export function linkedTaskDateProperties(event: OFCEvent): Record<string, unknown> {
  let scheduled: string | null = null;
  let due: string | null = null;

  if (event.type === 'single') {
    scheduled = event.date || null;
    due = event.endDate || scheduled;
  } else if (event.type === 'rrule') {
    scheduled = event.startDate || null;
    due = event.endDate || scheduled;
  }

  return {
    scheduled,
    'scheduled-link': linkedTaskDailyNoteLink(scheduled),
    due,
    'due-link': linkedTaskDailyNoteLink(due)
  };
}

export async function updateLinkedTaskNoteDates(
  app: App,
  linkedNoteIndex: LinkedNoteIndex,
  event: OFCEvent,
  knownFile?: TFile
): Promise<void> {
  const uid = event.uid || event.id;
  if (!uid) return;

  const file =
    knownFile || (await linkedNoteIndex.getFileForEventAfterHydration(uid, event.recurrenceId));
  if (!file) return;

  const contents = await app.vault.read(file);
  const updatedContents = modifyFrontmatterString(contents, linkedTaskDateProperties(event));
  if (updatedContents !== contents) {
    await app.vault.modify(file, updatedContents);
  }
}

export async function clearLinkedTaskNoteDates(
  app: App,
  linkedNoteIndex: LinkedNoteIndex,
  uid: string
): Promise<void> {
  const file = await linkedNoteIndex.getFileForEventAfterHydration(uid);
  if (!file) return;

  const contents = await app.vault.read(file);
  const removals = Object.fromEntries(
    LINKED_TASK_DATE_PROPERTIES.map(property => [property, null])
  );
  const updatedContents = modifyFrontmatterString(contents, removals);
  if (updatedContents !== contents) {
    await app.vault.modify(file, updatedContents);
  }
}
