/**
 * @file calendarWorkerTask.ts
 * @brief Pure worker task handlers for off-main-thread event processing.
 *
 * @description
 * Contains computational task handlers for parsing ICS content and computing cache diffs.
 * Designed to run either inside an isolated Web Worker or on the main thread as a fallback.
 *
 * @license See LICENSE.md
 */

export interface CacheDiffInputItem {
  key: string;
  id?: string;
  event: Record<string, unknown>;
  calendarId: string;
  location?: unknown;
}

export interface CacheDiffResult {
  added: CacheDiffInputItem[];
  removedIds: string[];
  updated: CacheDiffInputItem[];
}

/**
 * Computes difference sets between old events and new events based on sync keys.
 */
export function computeCacheDiffTask(
  oldItems: CacheDiffInputItem[],
  newItems: CacheDiffInputItem[]
): CacheDiffResult {
  const oldByKey = new Map<string, CacheDiffInputItem>();
  for (let i = 0; i < oldItems.length; i++) {
    const item = oldItems[i];
    if (item.key) {
      oldByKey.set(item.key, item);
    }
  }

  const newByKey = new Map<string, CacheDiffInputItem>();
  for (let i = 0; i < newItems.length; i++) {
    const item = newItems[i];
    if (item.key) {
      newByKey.set(item.key, item);
    }
  }

  const removedIds: string[] = [];
  const added: CacheDiffInputItem[] = [];
  const updated: CacheDiffInputItem[] = [];

  for (const [key, oldItem] of oldByKey) {
    if (!newByKey.has(key)) {
      if (oldItem.id) {
        removedIds.push(oldItem.id);
      }
    }
  }

  for (const [key, newItem] of newByKey) {
    const oldItem = oldByKey.get(key);
    if (!oldItem) {
      added.push(newItem);
    } else {
      if (JSON.stringify(oldItem.event) !== JSON.stringify(newItem.event)) {
        updated.push({ ...newItem, id: oldItem.id });
      }
    }
  }

  return { added, removedIds, updated };
}
