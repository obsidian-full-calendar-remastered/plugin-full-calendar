import { App, TFile } from 'obsidian';
import { OFCEvent } from '../../types';
import { PluginState } from '../../core/PluginState';
import { TemplateEngine } from './TemplateEngine';
import { ObsidianIO } from '../../ObsidianAdapter';
import { showNotice } from '../../utils/showNotice';
import { t } from '../i18n/i18n';
import { LinkedNoteIndex } from '../../providers/utils/LinkedNoteIndex';
import {
  serializeFrontmatter,
  findUniquePath,
  sanitizeTitleForFilename
} from '../../providers/utils/noteUtils';
import { replaceFrontmatter } from '../../providers/fullnote/frontmatter';
import FullCalendarPlugin from '../../main';

/**
 * Return stable linked-note lookup keys for an event.
 *
 * Prefer uid because this is the existing linked-note frontmatter contract
 * and because current providers already query LinkedNoteIndex by uid.
 *
 * Fall back to id for providers/events that expose a more specific internal id,
 * such as parsed ICS/CalDAV recurring events.
 */
function getLinkedNoteKeys(event: OFCEvent): string[] {
  const candidates = [event.uid, event.id];

  return candidates
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    .map(value => value.trim())
    .filter((value, index, arr) => arr.indexOf(value) === index);
}

function getPrimaryLinkedNoteKey(event: OFCEvent): string | null {
  return getLinkedNoteKeys(event)[0] || null;
}

function getExistingLinkedNote(
  linkedNoteIndex: LinkedNoteIndex,
  event: OFCEvent
): TFile | null {
  for (const key of getLinkedNoteKeys(event)) {
    const existingFile = linkedNoteIndex.getFileForEvent(key);
    if (existingFile) {
      return existingFile;
    }
  }

  return null;
}

function registerLinkedNoteKeys(
  linkedNoteIndex: LinkedNoteIndex,
  event: OFCEvent,
  file: TFile
): void {
  const keys = getLinkedNoteKeys(event);

  keys.forEach((key, index) => {
    linkedNoteIndex.setFileForEvent(key, file, index === 0);
  });
}

/**
 * Centrally creates a linked note for a remote event.
 */
export async function createLinkedNoteForProvider({
  app,
  event,
  calendarId,
  calendarName,
  linkedNoteIndex
}: {
  app: App;
  event: OFCEvent;
  calendarId: string;
  calendarName: string;
  linkedNoteIndex: LinkedNoteIndex;
}): Promise<TFile | null> {
  const existingFile = getExistingLinkedNote(linkedNoteIndex, event);
  if (existingFile) {
    return existingFile;
  }

  const primaryLinkedNoteKey = getPrimaryLinkedNoteKey(event);
  if (!primaryLinkedNoteKey) {
    console.warn('Full Calendar: Cannot create linked note for event without uid or id.', event);
    showNotice(t('notices.failedToCreateLinkedNote'));
    return null;
  }

  const settings = PluginState.getSettings();
  const directory = settings.linkedNotesDirectory;
  if (!directory) {
    showNotice(t('notices.configureLinkedNotesDirFirst'));
    return null;
  }

  const template = settings.linkedNoteTemplate || TemplateEngine.DEFAULT_TEMPLATE;
  const bodyContent = TemplateEngine.render(template, event, calendarName);

  const frontmatter = {
    'fc-event-uid': primaryLinkedNoteKey,
    'fc-calendar-id': calendarId
  };

  const yaml = serializeFrontmatter(frontmatter);
  const fileContent = replaceFrontmatter(bodyContent, yaml);

  const baseFilename = sanitizeTitleForFilename(event.title || t('linkedNotes.untitledNote'));
  const appAdapter = new ObsidianIO(app);
  const uniquePath = findUniquePath(appAdapter, directory, baseFilename);

  const file = await appAdapter.create(uniquePath, fileContent);

  // Critical fix:
  // Do not wait for metadataCache.on("changed") before the note can be found again.
  registerLinkedNoteKeys(linkedNoteIndex, event, file);

  return file;
}

/**
 * Opens an existing linked note or creates a new one for a remote event centrally.
 */
export async function openOrCreateLinkedNote(
  plugin: FullCalendarPlugin,
  calendarId: string,
  event: OFCEvent,
  openInNewLeaf: boolean
): Promise<void> {
  const provider = PluginState.getProviderRegistry().getInstance(calendarId);
  const linkedNoteProvider = provider as unknown as {
    linkedNoteIndex?: LinkedNoteIndex;
    createLinkedNote?: (event: OFCEvent) => Promise<TFile | null>;
  };

  if (!linkedNoteProvider) {
    showNotice(t('notices.cannotOpenRemote'));
    return;
  }

  const settings = PluginState.getSettings();
  if (!settings.linkedNotesDirectory) {
    showNotice(t('notices.configureLinkedNotesDirFirst'));
    return;
  }

  if (linkedNoteProvider.linkedNoteIndex) {
    const existingFile = getExistingLinkedNote(linkedNoteProvider.linkedNoteIndex, event);
    if (existingFile) {
      const leaf = plugin.app.workspace.getLeaf(openInNewLeaf);
      await leaf.openFile(existingFile);
      return;
    }
  }

  if (typeof linkedNoteProvider.createLinkedNote === 'function') {
    try {
      const file = await linkedNoteProvider.createLinkedNote(event);
      if (file) {
        const leaf = plugin.app.workspace.getLeaf(openInNewLeaf);
        await leaf.openFile(file);
      }
    } catch (e) {
      console.error(e);
      showNotice(t('notices.failedToCreateLinkedNote'));
    }
  } else {
    showNotice(t('notices.cannotOpenRemote'));
  }
}
