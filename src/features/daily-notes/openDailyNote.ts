import { App, moment as obsidianMoment, TFile } from 'obsidian';
import {
  appHasDailyNotesPluginLoaded,
  createDailyNote,
  getAllDailyNotes,
  getDailyNote
} from 'obsidian-daily-notes-interface';

type MomentFactory = typeof import('moment');
const moment = obsidianMoment as unknown as MomentFactory;

/**
 * Resolve an existing daily note without creating one.
 *
 * Keeping this separate from {@link openDailyNoteForDate} is important for hover previews:
 * moving the pointer over a calendar date must never create a note as a side effect.
 */
export function getDailyNoteForDate(date: Date): TFile | null {
  if (!appHasDailyNotesPluginLoaded()) {
    return null;
  }

  return getDailyNote(moment(date), getAllDailyNotes()) ?? null;
}

export async function openDailyNoteForDate(app: App, date: Date): Promise<void> {
  if (!appHasDailyNotesPluginLoaded()) {
    return;
  }

  const day = moment(date);
  const file = getDailyNote(day, getAllDailyNotes()) ?? (await createDailyNote(day));
  if (file) {
    await app.workspace.getLeaf(false).openFile(file);
  }
}
