import { showNotice } from './showNotice';
/**
 * @file eventActions.ts
 * @module actions/eventActions
 * @description
 * Provides high-level user action functions for interacting with calendar events,
 * such as opening the note associated with an event in a new pane. These actions
 * coordinate between the EventCache and the Obsidian workspace to perform user-initiated
 * operations from the UI.
 *
 * @remarks
 * Functions in this module are intended to be called from UI components or commands,
 * encapsulating the logic for manipulating event-related files and views.
 *
 * @license See LICENSE.md
 */

import EventCache from '../core/EventCache';
import { MarkdownView, TFile, Vault, Workspace } from 'obsidian';
import { t } from '../features/i18n/i18n';

/**
 * Open a file in a NEW PANE (new tab view) to a given event.
 * @param cache
 * @param param1 App
 * @param id event ID
 * @returns
 */
export async function openFileForEvent(
  cache: EventCache,
  { workspace, vault }: { workspace: Workspace; vault: Vault },
  id: string
) {
  const details = cache.store.getEventDetails(id);
  if (!details || !details.location) {
    showNotice(t('notices.cannotOpenRemote'));
    return;
  }
  const {
    location: { path, lineNumber }
  } = details;

  const file = vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) {
    return;
  }

  // The new logic:
  // Use 'split' to create a new pane to the side.
  // Alternative: Use `workspace.getLeaf(true)` to open in a new tab.
  const leaf = workspace.getLeaf(true);
  await leaf.openFile(file);

  if (lineNumber && leaf.view instanceof MarkdownView) {
    leaf.view.editor.setCursor({ line: lineNumber, ch: 0 });
  }
}

export { openOrCreateLinkedNote } from '../features/linked-notes/linkedNotes';
