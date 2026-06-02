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

const linkedNoteCreationPromises = new Map<string, Promise<TFile | null>>();

function linkedNoteCreationKey(calendarId: string, event: OFCEvent, instanceDate?: string): string {
  return `${calendarId}::${event.uid || ''}::${instanceDate || ''}`;
}

/**
 * Centrally creates a linked note for a remote event, ensuring absolute DRY behavior and zero hardcoded English strings.
 */
export async function createLinkedNoteForProvider({
  app,
  event,
  calendarId,
  calendarName,
  linkedNoteIndex,
  instanceDate
}: {
  app: App;
  event: OFCEvent;
  calendarId: string;
  calendarName: string;
  linkedNoteIndex: LinkedNoteIndex;
  instanceDate?: string;
}): Promise<TFile | null> {
<<<<<<< HEAD
  const existingFile = linkedNoteIndex.getFileForEvent(event.uid || event.id || '', instanceDate);
=======
  const existingFile = await linkedNoteIndex.getFileForEventAfterHydration(
    event.uid || '',
    instanceDate
  );
>>>>>>> origin/main
  if (existingFile) {
    return existingFile;
  }

  const creationKey = linkedNoteCreationKey(calendarId, event, instanceDate);
  const inFlightCreation = linkedNoteCreationPromises.get(creationKey);
  if (inFlightCreation) {
    return inFlightCreation;
  }

  const creationPromise = createLinkedNoteFile({
    app,
    event,
    calendarId,
    calendarName,
    instanceDate
  }).finally(() => {
    linkedNoteCreationPromises.delete(creationKey);
  });
  linkedNoteCreationPromises.set(creationKey, creationPromise);
  return creationPromise;
}

async function createLinkedNoteFile({
  app,
  event,
  calendarId,
  calendarName,
  instanceDate
}: {
  app: App;
  event: OFCEvent;
  calendarId: string;
  calendarName: string;
  instanceDate?: string;
}): Promise<TFile | null> {
  const settings = PluginState.getSettings();
  const directory = settings.linkedNotesDirectory;
  if (!directory) {
    showNotice(t('notices.configureLinkedNotesDirFirst'));
    return null;
  }

  const template = settings.linkedNoteTemplate || TemplateEngine.DEFAULT_TEMPLATE;
  const bodyContent = TemplateEngine.render(template, event, calendarName, instanceDate);

  const frontmatter: Record<string, unknown> = {
    'fc-event-uid': event.uid || event.id,
    'fc-calendar-id': calendarId
  };
  if (instanceDate) {
    frontmatter['fc-event-recurrence-id'] = instanceDate;
  }

  const yaml = serializeFrontmatter(frontmatter);
  // Smart reuse of FullNote's replaceFrontmatter utility
  const fileContent = replaceFrontmatter(bodyContent, yaml);

  let baseFilename = sanitizeTitleForFilename(event.title || t('linkedNotes.untitledNote'));
  if (instanceDate) {
    baseFilename = `${baseFilename} ${instanceDate}`;
  }
  const appAdapter = new ObsidianIO(app);
  const uniquePath = findUniquePath(appAdapter, directory, baseFilename);

  const file = await appAdapter.create(uniquePath, fileContent);
  return file;
}

/**
 * Opens an existing linked note or creates a new one for a remote event centrally.
 */
export async function openOrCreateLinkedNote(
  plugin: FullCalendarPlugin,
  calendarId: string,
  event: OFCEvent,
  openInNewLeaf: boolean,
  instanceDate?: string
): Promise<void> {
  const provider = PluginState.getProviderRegistry().getInstance(calendarId);
  const linkedNoteProvider = provider as unknown as {
    linkedNoteIndex?: LinkedNoteIndex;
    createLinkedNote?: (event: OFCEvent, instanceDate?: string) => Promise<TFile | null>;
  };
  if (!linkedNoteProvider) {
    showNotice(t('notices.cannotOpenRemote'));
    return;
  }

  // 1. Check if a directory is set
  const settings = PluginState.getSettings();
  if (!settings.linkedNotesDirectory) {
    showNotice(t('notices.configureLinkedNotesDirFirst'));
    return;
  }

  // 2. Check if note already exists
  if (linkedNoteProvider.linkedNoteIndex) {
<<<<<<< HEAD
    const existingFile = linkedNoteProvider.linkedNoteIndex.getFileForEvent(
      event.uid || event.id || '',
=======
    const existingFile = await linkedNoteProvider.linkedNoteIndex.getFileForEventAfterHydration(
      event.uid || '',
>>>>>>> origin/main
      instanceDate
    );
    if (existingFile) {
      const leaf = plugin.app.workspace.getLeaf(openInNewLeaf);
      await leaf.openFile(existingFile);
      return;
    }
  }

  // 3. Otherwise create a new note
  if (typeof linkedNoteProvider.createLinkedNote === 'function') {
    try {
      const file = await linkedNoteProvider.createLinkedNote(event, instanceDate);
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
