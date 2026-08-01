/**
 * @file WorkerManager.ts
 * @brief Obsidian-compliant Inline Web Worker Manager.
 *
 * @description
 * Instantiates an in-memory Web Worker via Blob URLs created from inline code.
 * Ensures 100% compliance with Obsidian single-file (`main.js`) distribution requirements.
 * Provides asynchronous RPC methods and transparent main-thread fallbacks.
 *
 * @license See LICENSE.md
 */

import { computeCacheDiffTask, CacheDiffInputItem, CacheDiffResult } from './calendarWorkerTask';

interface WorkerResponse {
  id: string;
  result?: unknown;
  error?: string;
}

class WorkerManagerImpl {
  private worker: Worker | null = null;
  private isWorkerSupported = true;
  private messageCounter = 0;
  private pendingRequests = new Map<
    string,
    { resolve: (val: unknown) => void; reject: (err: Error) => void }
  >();

  constructor() {
    this.initWorker();
  }

  private initWorker(): void {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      this.isWorkerSupported = false;
      return;
    }

    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      // Keep Jest unit tests deterministic on main thread
      this.isWorkerSupported = false;
      return;
    }

    try {
      const workerCode = `
        self.onmessage = function (e) {
          var id = e.data.id;
          var type = e.data.type;
          var payload = e.data.payload;
          try {
            if (type === 'computeCacheDiff') {
              var oldItems = payload.oldItems || [];
              var newItems = payload.newItems || [];
              var oldByKey = new Map();
              for (var i = 0; i < oldItems.length; i++) {
                var item = oldItems[i];
                if (item.key) oldByKey.set(item.key, item);
              }

              var newByKey = new Map();
              for (var j = 0; j < newItems.length; j++) {
                var newItem = newItems[j];
                if (newItem.key) newByKey.set(newItem.key, newItem);
              }

              var removedIds = [];
              var added = [];
              var updated = [];

              for (var entryOld of oldByKey.entries()) {
                var kOld = entryOld[0];
                var oldItem = entryOld[1];
                if (!newByKey.has(kOld) && oldItem.id) {
                  removedIds.push(oldItem.id);
                }
              }

              for (var entryNew of newByKey.entries()) {
                var kNew = entryNew[0];
                var newItem = entryNew[1];
                var existing = oldByKey.get(kNew);
                if (!existing) {
                  added.push(newItem);
                } else if (JSON.stringify(existing.event) !== JSON.stringify(newItem.event)) {
                  updated.push(Object.assign({}, newItem, { id: existing.id }));
                }
              }

              self.postMessage({ id: id, result: { added: added, removedIds: removedIds, updated: updated } });
            } else {
              self.postMessage({ id: id, error: 'Unknown task type: ' + type });
            }
          } catch (err) {
            var errorMsg = err instanceof Error ? err.message : String(err);
            self.postMessage({ id: id, error: errorMsg });
          }
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      this.worker = new Worker(workerUrl);

      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const { id, result, error } = e.data;
        const pending = this.pendingRequests.get(id);
        if (!pending) return;

        this.pendingRequests.delete(id);
        if (error) {
          pending.reject(new Error(error));
        } else {
          pending.resolve(result);
        }
      };

      this.worker.onerror = () => {
        this.isWorkerSupported = false;
        this.terminateWorker();
      };
    } catch {
      this.isWorkerSupported = false;
    }
  }

  private terminateWorker(): void {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // Ignore termination errors
      }
      this.worker = null;
    }
  }

  public get isWorkerActive(): boolean {
    return this.isWorkerSupported && this.worker !== null;
  }

  public async computeCacheDiff(
    oldItems: CacheDiffInputItem[],
    newItems: CacheDiffInputItem[]
  ): Promise<CacheDiffResult> {
    if (!this.isWorkerSupported || !this.worker) {
      return computeCacheDiffTask(oldItems, newItems);
    }

    const id = `req_${++this.messageCounter}`;
    return new Promise<CacheDiffResult>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: resolve as (val: unknown) => void,
        reject
      });

      if (this.worker) {
        this.worker.postMessage({ id, type: 'computeCacheDiff', payload: { oldItems, newItems } });
      } else {
        reject(new Error('Worker is not available'));
      }
    });
  }
}

export const WorkerManager = new WorkerManagerImpl();
