import { App, normalizePath, TFile } from 'obsidian';
import { PluginState } from '../../core/PluginState';
import { OFCEvent } from '../../types';
import { sanitizeTitleForFilename } from '../../providers/utils/noteUtils';
import { t } from '../i18n/i18n';

export function titleBasedLinkedNotePath(directory: string, event: OFCEvent): string {
  const baseFilename = sanitizeTitleForFilename(event.title || t('linkedNotes.untitledNote'));
  return normalizePath(`${directory}/${baseFilename}.md`);
}

/** Resolves name-based note identity without creating or modifying a file. */
export function getNameBasedLinkedNoteFile(app: App, event: OFCEvent): TFile | null {
  const settings = PluginState.getSettings();
  const directory = settings.linkedNotesDirectory?.trim();
  if (settings.linkedNoteLinkStrategy !== 'name' || !directory) {
    return null;
  }

  return app.vault.getFileByPath(titleBasedLinkedNotePath(directory, event));
}
