import 'obsidian';

/**
 * Declaration merging to expose Obsidian's global `activeDocument` / `activeWindow`
 * as named module exports. The obsidian package only declares these inside a
 * `declare global` block (as properties of Window), so an explicit
 * `import { activeDocument } from 'obsidian'` would fail without these augments.
 *
 * IMPORTANT: use `let` (not `const`) to match the upstream declarations.
 */
declare module 'obsidian' {
  export let activeDocument: Document;
  export let activeWindow: Window;
  export let moment: typeof import('moment').default;

  /**
   * Minimal subset of the Moment.js interface used by DailyNoteProvider
   * and obsidian-daily-notes-interface.
   */
  export interface MinimalMoment {
    format(fmt?: string): string;
    valueOf(): number;
    isValid(): boolean;
    toDate(): Date;
    diff(other: MinimalMoment, unit?: string, floating?: boolean): number;
    isSameOrAfter(other: string | MinimalMoment, unit?: string): boolean;
    isSameOrBefore(other: string | MinimalMoment, unit?: string): boolean;
  }
}

declare module '*.css';
