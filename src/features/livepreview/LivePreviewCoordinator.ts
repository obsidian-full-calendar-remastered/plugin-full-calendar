import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { EditorState, StateEffect, StateField, Transaction } from '@codemirror/state';
import { TFile, editorInfoField } from 'obsidian';
import { PluginState } from '../../core/PluginState';

export const forceUpdateLivePreviewEffect = StateEffect.define<void>();

export class LivePreviewCoordinatorPlugin {
  private isDestroyed = false;
  private updateListener: (() => void) | null = null;

  constructor(view: EditorView) {
    // Set up update listener to dynamically update decorations when cache updates
    this.updateListener = () => {
      if (this.isDestroyed) {
        return;
      }
      if (typeof view.dispatch === 'function') {
        view.dispatch({
          effects: forceUpdateLivePreviewEffect.of()
        });
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
    // ViewPlugin doesn't manage the decoration value itself anymore.
    // The StateField responds directly to editor state transactions.
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
}

export const livePreviewCoordinatorPlugin = ViewPlugin.fromClass(LivePreviewCoordinatorPlugin);

function getFileFromState(state: EditorState): TFile | null {
  try {
    if (editorInfoField && typeof state.field === 'function') {
      const info = state.field(editorInfoField, false);
      if (info && info.file) {
        return info.file;
      }
    }
  } catch {
    // Quietly ignore
  }
  return null;
}

function buildDecorationsForState(state: EditorState, activeFile: TFile | null): DecorationSet {
  if (!activeFile) {
    return Decoration.none;
  }

  try {
    if (PluginState.getSettings().enableLivePreview === false) {
      return Decoration.none;
    }

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

    return decorator.getDecorations(state, activeFile);
  } catch (error) {
    console.error('Full Calendar: Error building live preview decorations', error);
    return Decoration.none;
  }
}

export const livePreviewStateFieldSpec = {
  create(state: EditorState): DecorationSet {
    const file = getFileFromState(state);
    return buildDecorationsForState(state, file);
  },
  update(value: DecorationSet, tr: Transaction): DecorationSet {
    const oldFile = getFileFromState(tr.startState);
    const newFile = getFileFromState(tr.state);
    const fileChanged = oldFile?.path !== newFile?.path;

    const selectionChanged = !tr.startState.selection.eq(tr.state.selection);
    const forceUpdate = tr.effects.some(e => e.is(forceUpdateLivePreviewEffect));

    if (tr.docChanged || selectionChanged || fileChanged || forceUpdate) {
      return buildDecorationsForState(tr.state, newFile);
    }

    return value.map(tr.changes);
  },
  provide: (f: StateField<DecorationSet>) => EditorView.decorations.from(f)
};

export const livePreviewStateField = StateField.define<DecorationSet>(livePreviewStateFieldSpec);

export const livePreviewCoordinator = [livePreviewStateField, livePreviewCoordinatorPlugin];
