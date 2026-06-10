import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { TFile, editorInfoField } from 'obsidian';
import { PluginState } from '../../core/PluginState';

export class LivePreviewCoordinatorPlugin {
  decorations: DecorationSet;
  private currentFilePath: string | null = null;
  private isDestroyed = false;
  private updateListener: (() => void) | null = null;

  constructor(view: EditorView) {
    const activeFile = this.getFileFromView(view);
    this.currentFilePath = activeFile ? activeFile.path : null;
    this.decorations = this.buildDecorations(view, activeFile);

    // Set up update listener to dynamically update decorations when cache updates
    this.updateListener = () => {
      if (this.isDestroyed) {
        return;
      }
      const file = this.getFileFromView(view);
      this.decorations = this.buildDecorations(view, file);
      if (typeof view.dispatch === 'function') {
        view.dispatch({});
      }
    };

    try {
      const cache = PluginState.getCache();
      if (cache) {
        cache.on('update', this.updateListener);
      }
    } catch {
      // Quietly ignore if cache is not initialized
    }
  }

  update(update: ViewUpdate) {
    const activeFile = this.getFileFromView(update.view);
    const activeFilePath = activeFile ? activeFile.path : null;

    const fileChanged = activeFilePath !== this.currentFilePath;
    if (fileChanged || update.docChanged || update.selectionSet || update.viewportChanged) {
      this.currentFilePath = activeFilePath;
      this.decorations = this.buildDecorations(update.view, activeFile);
    }
  }

  destroy() {
    this.isDestroyed = true;
    try {
      const cache = PluginState.getCache();
      if (cache && this.updateListener) {
        cache.off('update', this.updateListener);
      }
    } catch {
      // Ignore cleanup error if cache is already destroyed or uninitialized
    }
  }

  private getFileFromView(view: EditorView): TFile | null {
    try {
      if (editorInfoField && typeof view.state.field === 'function') {
        const info = view.state.field(editorInfoField);
        if (info && info.file) {
          return info.file;
        }
      }
    } catch {
      // Fallback
    }
    try {
      return PluginState.getPlugin().app.workspace.getActiveFile();
    } catch {
      return null;
    }
  }

  private buildDecorations(view: EditorView, activeFile: TFile | null): DecorationSet {
    if (!activeFile) {
      return Decoration.none;
    }

    try {
      const activeProviders = PluginState.getProviderRegistry().getActiveProviders();
      const provider = activeProviders.find(p => {
        return (
          p.isFileRelevant &&
          p.isFileRelevant(activeFile) &&
          typeof p.getEditorDecorator === 'function'
        );
      });

      if (!provider) {
        return Decoration.none;
      }

      if (!provider.getEditorDecorator) {
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
  decorations: v => v.decorations
});
