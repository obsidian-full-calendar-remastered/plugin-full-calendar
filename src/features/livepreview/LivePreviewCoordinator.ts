import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { TFile } from 'obsidian';
import { PluginState } from '../../core/PluginState';

export class LivePreviewCoordinatorPlugin {
  decorations: DecorationSet;
  private currentFilePath: string | null = null;

  constructor(view: EditorView) {
    const activeFile = PluginState.getPlugin().app.workspace.getActiveFile();
    this.currentFilePath = activeFile ? activeFile.path : null;
    this.decorations = this.buildDecorations(view, activeFile);
  }

  update(update: ViewUpdate) {
    const activeFile = PluginState.getPlugin().app.workspace.getActiveFile();
    const activeFilePath = activeFile ? activeFile.path : null;

    const fileChanged = activeFilePath !== this.currentFilePath;
    if (fileChanged || update.docChanged || update.selectionSet || update.viewportChanged) {
      this.currentFilePath = activeFilePath;
      this.decorations = this.buildDecorations(update.view, activeFile);
    }
  }

  private buildDecorations(view: EditorView, activeFile: TFile | null): DecorationSet {
    if (!activeFile) {
      return Decoration.none;
    }

    try {
      const provider = PluginState.getProviderRegistry()
        .getActiveProviders()
        .find(p => p.isFileRelevant && p.isFileRelevant(activeFile));

      if (!provider || !provider.getEditorDecorator) {
        return Decoration.none;
      }

      const decorator = provider.getEditorDecorator();
      if (!decorator) {
        return Decoration.none;
      }

      return decorator.getDecorations(view, activeFile, view.visibleRanges);
    } catch (error) {
      console.error('Full Calendar: Error building live preview decorations', error);
      return Decoration.none;
    }
  }
}

export const livePreviewCoordinator = ViewPlugin.fromClass(LivePreviewCoordinatorPlugin, {
  decorations: (v: LivePreviewCoordinatorPlugin) => v.decorations
});
