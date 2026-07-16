/**
 * @file leafUtils.ts
 * @module utils/leafUtils
 * @description
 * Low-level Obsidian workspace helpers for opening files in markdown leaves.
 * Kept separate from eventActions to avoid circular dependencies between
 * eventActions (which re-exports from features/linked-notes) and the
 * linked-notes feature itself.
 *
 * @license See LICENSE.md
 */

import { App, MarkdownView, TFile } from 'obsidian';

/**
 * Opens a TFile in an existing markdown leaf that already shows the file,
 * revealing and focusing it so repeated jumps to the same meeting note land
 * in the same tab rather than spawning duplicates.
 *
 * For brand-new files (just created) no leaf can already be showing them, so
 * the function falls through to opening a fresh tab automatically.
 *
 * @param app   The Obsidian App instance.
 * @param file  The TFile to open or reveal.
 */
export async function openLinkedFileInExistingLeafOrNew(app: App, file: TFile): Promise<void> {
  const existingLeaf = app.workspace
    .getLeavesOfType('markdown')
    .find(leaf => leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path);

  if (existingLeaf) {
    await app.workspace.revealLeaf(existingLeaf);
    app.workspace.setActiveLeaf(existingLeaf, { focus: true });
    return;
  }

  const leaf = app.workspace.getLeaf(true);
  await leaf.openFile(file);
}
