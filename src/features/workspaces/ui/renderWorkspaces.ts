/**
 * @file renderWorkspaces.ts
 * @brief Renders the workspace management section of the plugin settings tab.
 * @license See LICENSE.md
 */

import { PluginState } from '../../../core/PluginState';
import { Setting } from 'obsidian';
import FullCalendarPlugin from '../../../main';
import { WorkspaceSettings, createDefaultWorkspace } from '../../../types/settings';
import { WorkspaceModal } from './WorkspaceModal';
import { t } from '../../i18n/i18n';
import { createDescWithDocs } from '../../../ui/settings/docsLinks';

export function renderWorkspaceSettings(
  containerEl: HTMLElement,
  plugin: FullCalendarPlugin,
  rerender: () => void
): void {
  // Header section
  const workspaceSection = containerEl.createDiv();

  new Setting(workspaceSection)
    .setName(t('settings.workspaces.title'))
    .setDesc(
      createDescWithDocs(t('settings.workspaces.description'), [
        { text: 'Workspaces guide', path: 'user/views/workspaces' },
        { text: 'Views guide', path: 'user/views/' }
      ])
    )
    .setHeading();

  // Add workspace button
  new Setting(workspaceSection)
    .setName(t('settings.workspaces.addNew.label'))
    .setDesc(
      createDescWithDocs(t('settings.workspaces.addNew.description'), [
        { text: 'Workspaces guide', path: 'user/views/workspaces' }
      ])
    )
    .addButton(button => {
      button
        .setButtonText(t('settings.workspaces.buttons.new'))
        .setIcon('plus')
        .onClick(() => {
          const newWorkspace = createDefaultWorkspace(t('settings.workspaces.defaultName'));
          new WorkspaceModal(plugin, newWorkspace, true, workspace => {
            PluginState.getSettings().workspaces.push(workspace);
            void PluginState.saveSettings();
            rerender();
          }).open();
        });
    });

  // Workspace list
  if (PluginState.getSettings().workspaces.length > 0) {
    const workspaceList = workspaceSection.createDiv({ cls: 'ofc-workspace-list' });

    PluginState.getSettings().workspaces.forEach((workspace, index) => {
      const workspaceItem = workspaceList.createDiv({ cls: 'ofc-workspace-item' });

      new Setting(workspaceItem)
        .setName(workspace.name)
        .setDesc(getWorkspaceDescription(workspace))
        .addButton(button => {
          button
            .setButtonText(t('settings.workspaces.buttons.edit'))
            .setIcon('pencil')
            .onClick(() => {
              new WorkspaceModal(plugin, workspace, false, updatedWorkspace => {
                PluginState.getSettings().workspaces[index] = updatedWorkspace;
                void PluginState.saveSettings();
                rerender();
              }).open();
            });
        })
        .addButton(button => {
          button
            .setButtonText(t('settings.workspaces.buttons.duplicate'))
            .setIcon('copy')
            .onClick(() => {
              const duplicatedWorkspace = createDefaultWorkspace(
                t('settings.workspaces.copyName', { name: workspace.name })
              );
              // Copy all settings from original workspace
              Object.assign(duplicatedWorkspace, {
                ...workspace,
                id: duplicatedWorkspace.id,
                name: duplicatedWorkspace.name
              });

              new WorkspaceModal(plugin, duplicatedWorkspace, true, newWorkspace => {
                PluginState.getSettings().workspaces.push(newWorkspace);
                void PluginState.saveSettings();
                rerender();
              }).open();
            });
        })
        .addButton(button => {
          const isActive = PluginState.getSettings().activeWorkspace === workspace.id;
          button
            .setButtonText(
              isActive
                ? t('settings.workspaces.buttons.active')
                : t('settings.workspaces.buttons.activate')
            )
            .setIcon(isActive ? 'check' : 'play')
            .setDisabled(isActive)
            .onClick(async () => {
              PluginState.getSettings().activeWorkspace = workspace.id;
              await PluginState.saveSettings();
              rerender();
            });
        })
        .addButton(button => {
          button
            .setButtonText(t('settings.workspaces.buttons.delete'))
            .setIcon('trash-2')
            .setDestructive()
            .onClick(async () => {
              // If this workspace is currently active, clear the active workspace
              if (PluginState.getSettings().activeWorkspace === workspace.id) {
                PluginState.getSettings().activeWorkspace = null;
              }

              PluginState.getSettings().workspaces.splice(index, 1);
              await PluginState.saveSettings();
              rerender();
            });
        });
    });
  }
  // Note: Empty state removed as requested - only show workspace list if there are workspaces
}

function getWorkspaceDescription(workspace: WorkspaceSettings): string {
  const parts: string[] = [];

  if (workspace.defaultView?.desktop || workspace.defaultView?.mobile) {
    const views = [];
    if (workspace.defaultView.desktop) views.push(`Desktop: ${workspace.defaultView.desktop}`);
    if (workspace.defaultView.mobile) views.push(`Mobile: ${workspace.defaultView.mobile}`);
    parts.push(views.join(', '));
  }

  if (workspace.visibleCalendars?.length) {
    parts.push(`Shows ${workspace.visibleCalendars.length} calendar(s)`);
  }

  if (workspace.categoryFilter?.categories.length) {
    const mode = workspace.categoryFilter.mode === 'show-only' ? 'Shows' : 'Hides';
    parts.push(
      `${mode} ${workspace.categoryFilter.categories.length} categor${workspace.categoryFilter.categories.length === 1 ? 'y' : 'ies'}`
    );
  }

  return parts.length > 0 ? parts.join(' • ') : 'Default settings';
}
