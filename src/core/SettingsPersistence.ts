/**
 * @file SettingsPersistence.ts
 * @brief Single source of truth for reading, validating, backing up, and writing `data.json`.
 *
 * Ensures that:
 * - No write to `data.json` can occur before initial load completes.
 * - Corrupt, truncated (including 0-byte), or unreadable existing `data.json` files
 *   fail closed instead of silently falling back to defaults and overwriting user data.
 * - All disk writes are strictly serialized via a FIFO promise queue using deep-cloned snapshots.
 *
 * @license See LICENSE.md
 */

export interface SettingsPersistenceAdapter {
  dataJsonPath: string;
  backupPath: string;
  loadRawData: () => Promise<unknown>;
  saveRawData: (data: unknown) => Promise<void>;
  fileExists: (path: string) => Promise<boolean>;
  readRawFile: (path: string) => Promise<string>;
  writeRawFile: (path: string, content: string) => Promise<void>;
  onCorruptData?: (reason: string) => void;
}

export type SettingsLoadResult =
  | { status: 'loaded'; data: Record<string, unknown> }
  | { status: 'fresh'; data: null }
  | { status: 'corrupt'; data: null; reason: string };

/**
 * Deep-clones plain settings data using `structuredClone` when available,
 * falling back to JSON round-tripping for older WebViews/environments.
 */
export function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Serializes all `data.json` reads and writes behind a load-state gate and corruption guard.
 */
export class SettingsPersistence {
  #adapter: SettingsPersistenceAdapter;
  #loaded = false;
  #saveBlocked = false;
  #saveQueue: Promise<void> = Promise.resolve();

  constructor(adapter: SettingsPersistenceAdapter) {
    this.#adapter = adapter;
  }

  public get isLoaded(): boolean {
    return this.#loaded;
  }

  public get isSaveBlocked(): boolean {
    return this.#saveBlocked;
  }

  public async load(): Promise<SettingsLoadResult> {
    let persisted: unknown;
    try {
      persisted = await this.#adapter.loadRawData();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.#handleCorruptLoad(reason);
      return { status: 'corrupt', data: null, reason };
    }

    if (isPlainRecord(persisted)) {
      this.#loaded = true;
      this.#saveBlocked = false;
      return { status: 'loaded', data: persisted };
    }

    let exists: boolean;
    try {
      exists = await this.#adapter.fileExists(this.#adapter.dataJsonPath);
    } catch (error) {
      const reason = `Failed to verify data.json existence: ${error instanceof Error ? error.message : String(error)}`;
      await this.#handleCorruptLoad(reason);
      return { status: 'corrupt', data: null, reason };
    }

    if (!exists && (persisted === null || persisted === undefined)) {
      this.#loaded = true;
      this.#saveBlocked = false;
      return { status: 'fresh', data: null };
    }

    const reason = exists
      ? 'data.json exists on disk but could not be parsed as a valid settings object'
      : `Unexpected non-object settings payload (${typeof persisted})`;
    await this.#handleCorruptLoad(reason);
    return { status: 'corrupt', data: null, reason };
  }

  public save(data: unknown): Promise<boolean> {
    if (!this.#loaded || this.#saveBlocked) {
      console.warn(
        '[Full Calendar] Blocked data.json save because settings are not safely loaded.'
      );
      return Promise.resolve(false);
    }

    const snapshot = deepClone(data);
    let wrote = false;

    const run = async (): Promise<void> => {
      if (!this.#loaded || this.#saveBlocked) {
        console.warn('[Full Calendar] Blocked queued data.json save.');
        return;
      }
      await this.#adapter.saveRawData(snapshot);
      wrote = true;
    };

    const next = this.#saveQueue.then(run, run);
    this.#saveQueue = next.catch(() => {});
    return next.then(() => wrote);
  }

  async #handleCorruptLoad(reason: string): Promise<void> {
    this.#loaded = false;
    this.#saveBlocked = true;

    try {
      const raw = await this.#adapter.readRawFile(this.#adapter.dataJsonPath);
      if (raw.length > 0) {
        let shouldWriteBackup = true;
        try {
          const backupExists = await this.#adapter.fileExists(this.#adapter.backupPath);
          if (backupExists) {
            const existingBackup = await this.#adapter.readRawFile(this.#adapter.backupPath);
            if (existingBackup === raw) {
              shouldWriteBackup = false;
            }
          }
        } catch {
          shouldWriteBackup = true;
        }

        if (shouldWriteBackup) {
          await this.#adapter.writeRawFile(this.#adapter.backupPath, raw);
        }
      }
    } catch (backupErr) {
      console.error('[Full Calendar] Failed to back up corrupt data.json:', backupErr);
    }

    this.#adapter.onCorruptData?.(reason);
  }
}
