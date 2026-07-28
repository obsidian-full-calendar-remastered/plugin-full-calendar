/**
 * @file DailyNoteParseCache.ts
 * @brief High-performance, reactive in-memory parse cache for daily note events.
 *
 * Stores parsed OFCEvent arrays keyed by file path, stat.mtime, and stat.size.
 * Automatically invalidates entries when Obsidian Vault triggers modify, delete, or rename events.
 */

import { TFile, Vault } from 'obsidian';
import { OFCEvent, EventLocation } from '../../types';

export type EditableEventResponse = [OFCEvent, EventLocation | null];

interface CachedEntry {
  mtime: number;
  size: number;
  events: EditableEventResponse[];
}

export class DailyNoteParseCache {
  private cache = new Map<string, CachedEntry>();

  constructor(vault?: Vault) {
    if (vault && typeof vault.on === 'function') {
      vault.on('modify', file => {
        if (file instanceof TFile) {
          this.cache.delete(file.path);
        }
      });
      vault.on('delete', file => {
        if (file instanceof TFile) {
          this.cache.delete(file.path);
        }
      });
      vault.on('rename', (file, oldPath) => {
        this.cache.delete(oldPath);
      });
    }
  }

  public get(file: TFile): EditableEventResponse[] | null {
    if (!file || !file.stat) return null;
    const entry = this.cache.get(file.path);
    if (entry && entry.mtime === file.stat.mtime && entry.size === file.stat.size) {
      return entry.events;
    }
    return null;
  }

  public set(file: TFile, events: EditableEventResponse[]): void {
    if (!file) return;
    const mtime = file.stat?.mtime ?? 0;
    const size = file.stat?.size ?? 0;
    this.cache.set(file.path, {
      mtime,
      size,
      events
    });
  }

  public invalidate(file: TFile | string): void {
    const path = typeof file === 'string' ? file : file.path;
    this.cache.delete(path);
  }

  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }
}
