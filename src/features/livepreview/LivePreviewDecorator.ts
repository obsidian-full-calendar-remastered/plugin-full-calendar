import { DecorationSet, EditorView } from '@codemirror/view';
import { TFile } from 'obsidian';

export interface LivePreviewDecorator {
  /**
   * Generates CodeMirror decorations synchronously for the given file and visible ranges.
   */
  getDecorations(
    view: EditorView,
    file: TFile,
    visibleRanges: readonly { from: number; to: number }[]
  ): DecorationSet;
}
