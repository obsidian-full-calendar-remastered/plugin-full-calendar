import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { TFile, editorInfoField } from 'obsidian';
import { StateField, StateEffect } from '@codemirror/state';
import { PluginState } from '../../core/PluginState';

export const setLivePreviewDecorations = StateEffect.define<DecorationSet>();

export const livePreviewStateField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    const mapped = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setLivePreviewDecorations)) {
        return effect.value;
      }
    }
    return mapped;
  },
  provide: f => EditorView.decorations.from(f)
});

export class LivePreviewCoordinatorPlugin {
  decorations: DecorationSet;
  private currentFilePath: string | null = null;
  private isDestroyed = false;
  private updateListener: (() => void) | null = null;

  constructor(view: EditorView) {
    const activeFile = this.getFileFromView(view);
    this.currentFilePath = activeFile ? activeFile.path : null;
    this.decorations = this.buildDecorations(view, activeFile);

    // Dispatch initial decorations to the StateField
    window.setTimeout(() => {
      if (!this.isDestroyed && typeof view.dispatch === 'function') {
        view.dispatch({
          effects: setLivePreviewDecorations.of(this.decorations)
        });
      }
    }, 0);

    // Set up update listener to dynamically update decorations when cache updates
    this.updateListener = () => {
      window.setTimeout(() => {
        if (this.isDestroyed) {
          return;
        }
        const file = this.getFileFromView(view);
        this.decorations = this.buildDecorations(view, file);
        if (typeof view.dispatch === 'function') {
          view.dispatch({
            effects: setLivePreviewDecorations.of(this.decorations)
          });
        }
      }, 0);
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

      const view = update.view;
      const decs = this.decorations;
      window.setTimeout(() => {
        if (!this.isDestroyed && typeof view.dispatch === 'function') {
          view.dispatch({
            effects: setLivePreviewDecorations.of(decs)
          });
        }
      }, 0);
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

export const livePreviewCoordinator = ViewPlugin.fromClass(LivePreviewCoordinatorPlugin);
