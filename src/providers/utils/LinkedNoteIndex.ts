import { App, TFile, EventRef } from 'obsidian';
import { parse } from 'yaml';
import { PluginState } from '../../core/PluginState';

export class LinkedNoteIndex {
  private app: App;
  private calendarId: string;
  private index = new Map<string, TFile>(); // linked note key -> TFile
  private eventRefs: EventRef[] = [];

  constructor(app: App, calendarId: string) {
    this.app = app;
    this.calendarId = calendarId;
  }

  public getFileForEvent(eventUid: string): TFile | null {
    const key = this.normalizeKey(eventUid);
    if (!key) return null;

    return this.index.get(key) || null;
  }

  public async findFileForEvent(eventUid: string): Promise<TFile | null> {
    const key = this.normalizeKey(eventUid);
    if (!key) return null;

    const indexedFile = this.getFileForEvent(key);
    if (indexedFile) {
      return indexedFile;
    }

    const dir = this.getDirectory().trim();
    if (!dir) return null;

    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      if (!this.isFileInDirectory(file)) {
        continue;
      }

      this.processFile(file, false);
      const cacheIndexedFile = this.getFileForEvent(key);
      if (cacheIndexedFile) {
        return cacheIndexedFile;
      }

      const contentIndexedFile = await this.processFileContent(file, false);
      if (contentIndexedFile && this.getFileForEvent(key) === contentIndexedFile) {
        return contentIndexedFile;
      }
    }

    return null;
  }

  /**
   * Immediately registers a linked note without waiting for Obsidian's metadata cache.
   * This prevents duplicate note creation when the user presses "Open note" again
   * before metadataCache.on("changed") has indexed the newly-created file.
   */
  public setFileForEvent(eventUid: string, file: TFile, triggerReload = true): boolean {
    const key = this.normalizeKey(eventUid);
    if (!key) return false;

    const prevFile = this.index.get(key);
    if (prevFile?.path === file.path) {
      return false;
    }

    this.index.set(key, file);

    if (triggerReload) {
      this.triggerReload();
    }

    return true;
  }

  private normalizeKey(value: unknown): string | null {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return null;
    }

    const key = String(value).trim();
    return key.length > 0 ? key : null;
  }

  private getDirectory(): string {
    return PluginState.getSettings().linkedNotesDirectory || '';
  }

  private isFileInDirectory(file: TFile): boolean {
    const dir = this.getDirectory().trim();
    if (!dir) return false;

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
      return this.removePathFromIndex(file.path, triggerReload);
    }

    return this.processFrontmatter(file, frontmatter, triggerReload);
  }

  private processFrontmatter(
    file: TFile,
    frontmatter: Record<string, unknown>,
    triggerReload = true
  ): boolean {
    const calId = this.normalizeKey(frontmatter['fc-calendar-id']);
    const eventUid = this.normalizeKey(frontmatter['fc-event-uid']);
    const eventId = this.normalizeKey(frontmatter['fc-event-id']);

    if (calId === this.calendarId && (eventUid || eventId)) {
      const keys = [eventUid, eventId].filter(
        (key, index, arr): key is string => !!key && arr.indexOf(key) === index
      );
      let changed = false;

      for (const key of keys) {
        const prevFile = this.index.get(key);
        if (prevFile?.path !== file.path) {
          this.index.set(key, file);
          changed = true;
        }
      }

      if (changed && triggerReload) {
        this.triggerReload();
      }

      return changed;
    } else {
      return this.removePathFromIndex(file.path, triggerReload);
    }
  }

  private async processFileContent(file: TFile, triggerReload = true): Promise<TFile | null> {
    try {
      const content = await this.app.vault.read(file);
      const frontmatter = this.extractFrontmatter(content);
      if (!frontmatter) {
        this.removePathFromIndex(file.path, triggerReload);
        return null;
      }

      return this.processFrontmatter(file, frontmatter, triggerReload) ? file : null;
    } catch (e) {
      console.warn(`Full Calendar: Failed to read linked note metadata from "${file.path}".`, e);
      return null;
    }
  }

  private extractFrontmatter(content: string): Record<string, unknown> | null {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!match) return null;

    try {
      const parsed = parse(match[1]);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  private removePathFromIndex(path: string, triggerReload = true): boolean {
    let removed = false;

    for (const [uid, indexedFile] of this.index.entries()) {
      if (indexedFile.path === path) {
        this.index.delete(uid);
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
        const removed = this.removePathFromIndex(oldPath, false);

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
      this.app.metadataCache.offref(ref);
      this.app.vault.offref(ref);
    }

    this.eventRefs = [];
    this.index.clear();
  }
}
