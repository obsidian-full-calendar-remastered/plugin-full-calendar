import { App, TFile, EventRef } from 'obsidian';
import { PluginState } from '../../core/PluginState';

export class LinkedNoteIndex {
  private app: App;
  private calendarId: string;
  private index = new Map<string, TFile>(); // uid -> TFile
  private eventRefs: EventRef[] = [];

  constructor(app: App, calendarId: string) {
    this.app = app;
    this.calendarId = calendarId;
  }

  public getFileForEvent(eventUid: string, recurrenceId?: string): TFile | null {
    if (recurrenceId) {
      const instanceKey = `${eventUid}::${recurrenceId.trim()}`;
      const instanceFile = this.index.get(instanceKey);
      if (instanceFile) {
        return instanceFile;
      }
    }
    return this.index.get(eventUid) || null;
  }

  private getDirectory(): string {
    return PluginState.getSettings().linkedNotesDirectory || '';
  }

  private isFileInDirectory(file: TFile): boolean {
    const dir = this.getDirectory().trim();
    if (!dir) return false;
    // Normalize paths
    const normalizedDir = dir.replace(/\/$/, '');
    return file.path.startsWith(`${normalizedDir}/`);
  }

  public initialize(): void {
    this.destroy();
    const dir = this.getDirectory().trim();
    if (!dir) return;

    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      if (this.isFileInDirectory(file)) {
        this.processFile(file, false);
      }
    }

    this.registerWatchers();
  }

  private processFile(file: TFile, triggerReload = true): boolean {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;

    if (!frontmatter) {
      // Remove any existing mapping for this file
      return this.removePathFromIndex(file.path, triggerReload);
    }

    const calId = frontmatter['fc-calendar-id'] as unknown;
    const eventUid = frontmatter['fc-event-uid'] as unknown;
    const recurrenceId = frontmatter['fc-event-recurrence-id'] as unknown;

    if (calId === this.calendarId && typeof eventUid === 'string' && eventUid.trim() !== '') {
      const recurrenceSuffix =
        typeof recurrenceId === 'string' && recurrenceId.trim() !== ''
          ? `::${recurrenceId.trim()}`
          : '';
      const key = `${eventUid}${recurrenceSuffix}`;

      // Clean up any stale mappings in the index map that point to the same file path but have a different key
      let removedOld = false;
      for (const [k, indexedFile] of this.index.entries()) {
        if (indexedFile.path === file.path && k !== key) {
          this.index.delete(k);
          removedOld = true;
        }
      }

      const prevFile = this.index.get(key);
      if (prevFile?.path !== file.path || removedOld) {
        this.index.set(key, file);
        if (triggerReload) {
          this.triggerReload();
        }
        return true;
      }
    } else {
      return this.removePathFromIndex(file.path, triggerReload);
    }

    return false;
  }

  private removePathFromIndex(path: string, triggerReload = true): boolean {
    let removed = false;
    for (const [key, indexedFile] of this.index.entries()) {
      if (indexedFile.path === path) {
        this.index.delete(key);
        removed = true;
      }
    }
    if (removed && triggerReload) {
      this.triggerReload();
    }
    return removed;
  }

  private triggerReload(): void {
    try {
      PluginState.getProviderRegistry().reloadProviderNow(this.calendarId);
    } catch (e) {
      console.warn(
        `Failed to reload calendar provider ${this.calendarId} after linked note change`,
        e
      );
    }
  }

  private registerWatchers(): void {
    const changedRef = this.app.metadataCache.on('changed', file => {
      if (file instanceof TFile) {
        if (this.isFileInDirectory(file)) {
          this.processFile(file);
        } else {
          // If the file was in our index but is now moved out of directory, remove it
          this.removePathFromIndex(file.path);
        }
      }
    });
    this.eventRefs.push(changedRef);

    const deleteRef = this.app.vault.on('delete', file => {
      if (file instanceof TFile) {
        this.removePathFromIndex(file.path);
      }
    });
    this.eventRefs.push(deleteRef);

    const renameRef = this.app.vault.on('rename', (file, oldPath) => {
      if (file instanceof TFile) {
        // Remove old mapping by treating it as a deleted file
        const removed = this.removePathFromIndex(oldPath, false);

        // Process as new file if it's in the directory now
        if (this.isFileInDirectory(file)) {
          this.processFile(file);
        } else if (removed) {
          this.triggerReload();
        }
      }
    });
    this.eventRefs.push(renameRef);
  }

  public destroy(): void {
    for (const ref of this.eventRefs) {
      // metadataCache and vault can offref their listeners
      this.app.metadataCache.offref(ref);
      this.app.vault.offref(ref);
    }
    this.eventRefs = [];
    this.index.clear();
  }
}
