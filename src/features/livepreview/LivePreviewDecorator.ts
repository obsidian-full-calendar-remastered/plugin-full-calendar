import { DecorationSet } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { TFile } from 'obsidian';

export interface LivePreviewDecorator {
  /**
   * Generates CodeMirror decorations synchronously for the given file and state.
   */
  getDecorations(state: EditorState, file: TFile): DecorationSet;
}
