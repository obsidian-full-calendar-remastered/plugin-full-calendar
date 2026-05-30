import { App, TFile, EventRef } from 'obsidian';
import { PluginState } from '../../core/PluginState';

export class LinkedNoteIndex {
  private app: App;
  private calendarId: string;
  private index = new Map<string, TFile>(); // uid -> TFile
  private eventRefs: EventRef[] = [];
  private hydrationWaiters: (() => void)[] = [];
  private revision = 0;
  private startupHydrationPending = false;

  constructor(app: App, calendarId: string) {
    this.app = app;
    this.calendarId = calendarId;
  }

  private scanDirectory(): TFile[] {
    const dir = this.getDirectory().trim();
    if (!dir) {
      return [];
    }

    const unresolvedFiles: TFile[] = [];
    const files = this.app.vault.getMarkdownFiles();

    for (const file of files) {
      if (this.isFileInDirectory(file)) {
        if (!this.app.metadataCache.getFileCache(file)) {
          unresolvedFiles.push(file);
        }
        this.processFile(file, false);
      }
    }

    return unresolvedFiles;
  }

  private beginStartupHydration(revision: number): void {
    this.startupHydrationPending = true;

    const resolvedRef = this.app.metadataCache.on('resolved', () => {
      if (!this.startupHydrationPending || revision !== this.revision) {
        return;
      }

      this.reconcileStartupHydration(revision);
    });
    this.eventRefs.push(resolvedRef);
  }

  private reconcileStartupHydration(revision: number): void {
    if (revision !== this.revision) {
      return;
    }

    const unresolvedFiles = this.scanDirectory();
    if (unresolvedFiles.length > 0) {
      void this.backfillUnresolvedFiles(unresolvedFiles, revision);
      return;
    }

    this.completeStartupHydration(revision);
  }

  private completeStartupHydration(revision: number): void {
    if (revision !== this.revision) {
      return;
    }

    this.startupHydrationPending = false;
    this.resolveHydrationWaiters();
  }

  private scheduleLayoutReadyRescan(revision: number): void {
    this.app.workspace.onLayoutReady(() => {
      if (revision !== this.revision) {
        return;
      }

      this.reconcileStartupHydration(revision);
    });
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

  public async getFileForEventAfterHydration(
    eventUid: string,
    recurrenceId?: string
  ): Promise<TFile | null> {
    const existingFile = this.getFileForEvent(eventUid, recurrenceId);
    if (existingFile) {
      return existingFile;
    }

    await this.waitForStartupHydration();
    return this.getFileForEvent(eventUid, recurrenceId);
  }

  public async waitForStartupHydration(timeoutMs = 1500): Promise<void> {
    if (!this.startupHydrationPending) {
      return;
    }

    const revision = this.revision;
    this.reconcileStartupHydration(revision);
    if (!this.startupHydrationPending || revision !== this.revision) {
      return;
    }

    await new Promise<void>(resolve => {
      const resolveOnce = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      const timeout = window.setTimeout(() => {
        this.hydrationWaiters = this.hydrationWaiters.filter(waiter => waiter !== resolveOnce);
        resolve();
      }, timeoutMs);

      this.hydrationWaiters.push(resolveOnce);
    });
  }

  private getDirectory(): string {
    return PluginState.getSettings().linkedNotesDirectory || '';
  }

  private frontmatterString(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
      return value.toString();
    }
    return null;
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
    if (!dir) {
      return;
    }

    const activeRevision = this.revision;
    const unresolvedFiles = this.scanDirectory();

    this.registerWatchers();
    this.beginStartupHydration(activeRevision);
    this.scheduleLayoutReadyRescan(activeRevision);

    if (unresolvedFiles.length > 0) {
      void this.backfillUnresolvedFiles(unresolvedFiles, activeRevision);
    } else if (this.index.size > 0) {
      this.completeStartupHydration(activeRevision);
    }
  }

  private async backfillUnresolvedFiles(files: TFile[], revision: number): Promise<void> {
    const appWithMetadata = this.app as App & {
      waitForMetadata?: (file: TFile) => Promise<unknown>;
    };
    if (typeof appWithMetadata.waitForMetadata !== 'function') {
      return;
    }

    let changed = false;

    for (const file of files) {
      try {
        await appWithMetadata.waitForMetadata(file);
      } catch {
        continue;
      }

      if (revision !== this.revision || !this.isFileInDirectory(file)) {
        return;
      }

      changed = this.processFile(file, false) || changed;
    }

    if (changed && revision === this.revision) {
      this.triggerReload();
    }

    if (revision === this.revision) {
      this.reconcileStartupHydration(revision);
    }
  }

  private processFile(file: TFile, triggerReload = true): boolean {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;

    if (!frontmatter) {
      // Remove any existing mapping for this file
      return this.removePathFromIndex(file.path, triggerReload);
    }

    const calId = this.frontmatterString(frontmatter['fc-calendar-id']);
    const eventUid = this.frontmatterString(frontmatter['fc-event-uid']);
    const recurrenceId = this.frontmatterString(frontmatter['fc-event-recurrence-id']);

    if (calId === this.calendarId && eventUid) {
      const recurrenceSuffix = recurrenceId ? `::${recurrenceId}` : '';
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

    const createRef = this.app.vault.on('create', file => {
      if (file instanceof TFile && this.isFileInDirectory(file)) {
        this.processFile(file);
      }
    });
    this.eventRefs.push(createRef);

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
    this.revision += 1;
    this.startupHydrationPending = false;
    this.resolveHydrationWaiters();
    for (const ref of this.eventRefs) {
      // metadataCache and vault can offref their listeners
      this.app.metadataCache.offref(ref);
      this.app.vault.offref(ref);
    }
    this.eventRefs = [];
    this.index.clear();
  }

  private resolveHydrationWaiters(): void {
    const waiters = this.hydrationWaiters;
    this.hydrationWaiters = [];
    for (const resolve of waiters) {
      resolve();
    }
  }
}
