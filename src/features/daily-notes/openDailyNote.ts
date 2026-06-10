import { App, moment as obsidianMoment } from 'obsidian';
import {
  appHasDailyNotesPluginLoaded,
  createDailyNote,
  getAllDailyNotes,
  getDailyNote
} from 'obsidian-daily-notes-interface';

type MomentFactory = typeof import('moment');
const moment = obsidianMoment as unknown as MomentFactory;

export async function openDailyNoteForDate(app: App, date: Date): Promise<void> {
  if (!appHasDailyNotesPluginLoaded()) {
    return;
  }

  const day = moment(date);
  const file = getDailyNote(day, getAllDailyNotes()) || (await createDailyNote(day));
  if (file) {
    await app.workspace.getLeaf(false).openFile(file);
  }
}
