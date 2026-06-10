import { App, TFile, normalizePath } from 'obsidian';
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
import { modifyFrontmatterString, replaceFrontmatter } from '../../providers/fullnote/frontmatter';
import FullCalendarPlugin from '../../main';

const linkedNoteCreationPromises = new Map<string, Promise<TFile | null>>();

function linkedNoteIdentityInstanceDate(instanceDate?: string): string | undefined {
  return PluginState.getSettings().linkedNoteLinkStrategy === 'name' ? undefined : instanceDate;
}

function isNameBasedLinkedNotes(): boolean {
  return PluginState.getSettings().linkedNoteLinkStrategy === 'name';
}

function titleBasedLinkedNotePath(directory: string, event: OFCEvent): string {
  const baseFilename = sanitizeTitleForFilename(event.title || t('linkedNotes.untitledNote'));
  return normalizePath(`${directory}/${baseFilename}.md`);
}

function quotedFrontmatterString(value: string): string {
  return JSON.stringify(value);
}

async function linkExistingTitleFile(
  app: App,
  event: OFCEvent,
  calendarId: string,
  directory: string
): Promise<TFile | null> {
  const file = app.vault.getFileByPath(titleBasedLinkedNotePath(directory, event));
  const eventUid = event.uid || event.id;
  if (!file || !eventUid) {
    return file;
  }

  const contents = await app.vault.read(file);
  const updatedContents = modifyFrontmatterString(contents, {
    'fc-event-uid': quotedFrontmatterString(eventUid),
    'fc-calendar-id': quotedFrontmatterString(calendarId),
    'fc-event-recurrence-id': null
  });
  if (updatedContents !== contents) {
    await app.vault.modify(file, updatedContents);
  }
  return file;
}

function linkedNoteCreationKey(calendarId: string, event: OFCEvent, instanceDate?: string): string {
  if (isNameBasedLinkedNotes()) {
    return `${calendarId}::name::${sanitizeTitleForFilename(event.title || t('linkedNotes.untitledNote'))}`;
  }
  return `${calendarId}::${event.uid || event.id || ''}::${instanceDate || ''}`;
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
  const identityInstanceDate = linkedNoteIdentityInstanceDate(instanceDate);
  const directory = PluginState.getSettings().linkedNotesDirectory;
  if (isNameBasedLinkedNotes() && directory) {
    const titleFile = await linkExistingTitleFile(app, event, calendarId, directory);
    if (titleFile) {
      return titleFile;
    }
  }

  const existingFile = await linkedNoteIndex.getFileForEventAfterHydration(
    event.uid || event.id || '',
    identityInstanceDate
  );
  if (existingFile) {
    return existingFile;
  }

  const creationKey = linkedNoteCreationKey(calendarId, event, identityInstanceDate);
  const inFlightCreation = linkedNoteCreationPromises.get(creationKey);
  if (inFlightCreation) {
    return inFlightCreation;
  }

  const creationPromise = createLinkedNoteFile({
    app,
    event,
    calendarId,
    calendarName,
    instanceDate,
    identityInstanceDate
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
  instanceDate,
  identityInstanceDate
}: {
  app: App;
  event: OFCEvent;
  calendarId: string;
  calendarName: string;
  instanceDate?: string;
  identityInstanceDate?: string;
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
  if (identityInstanceDate) {
    frontmatter['fc-event-recurrence-id'] = identityInstanceDate;
  }

  const yaml = serializeFrontmatter(frontmatter);
  // Smart reuse of FullNote's replaceFrontmatter utility
  const fileContent = replaceFrontmatter(bodyContent, yaml);

  let baseFilename = sanitizeTitleForFilename(event.title || t('linkedNotes.untitledNote'));
  if (identityInstanceDate) {
    baseFilename = `${baseFilename} ${identityInstanceDate}`;
  }
  const appAdapter = new ObsidianIO(app);
  const uniquePath = isNameBasedLinkedNotes()
    ? titleBasedLinkedNotePath(directory, event)
    : findUniquePath(appAdapter, directory, baseFilename);

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
  if (isNameBasedLinkedNotes()) {
    const titleFile = await linkExistingTitleFile(
      plugin.app,
      event,
      calendarId,
      settings.linkedNotesDirectory
    );
    if (titleFile) {
      const leaf = plugin.app.workspace.getLeaf(openInNewLeaf);
      await leaf.openFile(titleFile);
      return;
    }
  }

  if (linkedNoteProvider.linkedNoteIndex) {
    const identityInstanceDate = linkedNoteIdentityInstanceDate(instanceDate);
    const existingFile = await linkedNoteProvider.linkedNoteIndex.getFileForEventAfterHydration(
      event.uid || event.id || '',
      identityInstanceDate
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
