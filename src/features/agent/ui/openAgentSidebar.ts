/**
 * @file openAgentSidebar.ts
 * @brief Single shared helper to open, reveal, and focus the Full Calendar Agent sidebar leaf.
 *
 * @license See LICENSE.md
 */

import type { App } from 'obsidian';
import { FULL_CALENDAR_AGENT_VIEW } from '../types';

export async function openAgentSidebarLeaf(app: App, initialPrompt?: string): Promise<void> {
  const workspace = app.workspace;
  let leaf = workspace.getLeavesOfType(FULL_CALENDAR_AGENT_VIEW)[0];
  if (!leaf) {
    const rightLeaf = workspace.getRightLeaf(false);
    if (!rightLeaf) return;
    await rightLeaf.setViewState({
      type: FULL_CALENDAR_AGENT_VIEW,
      active: true
    });
    leaf = rightLeaf;
  }

  void workspace.revealLeaf(leaf);
  const view = leaf.view as { setPrompt?: (p: string) => void; focus?: () => void } | null;
  if (initialPrompt && typeof view?.setPrompt === 'function') {
    view.setPrompt(initialPrompt);
  }
  if (typeof view?.focus === 'function') {
    view.focus();
  }
}
