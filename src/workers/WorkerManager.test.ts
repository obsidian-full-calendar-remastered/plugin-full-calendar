/**
 * @file WorkerManager.test.ts
 * @brief Unit tests for WorkerManager and main-thread task fallback.
 *
 * @license See LICENSE.md
 */

import { WorkerManager } from './WorkerManager';
import { computeCacheDiffTask, CacheDiffInputItem } from './calendarWorkerTask';

describe('WorkerManager & Task Processing', () => {
  it('correctly computes cache diff additions, deletions, and updates', async () => {
    const oldItems: CacheDiffInputItem[] = [
      { key: 'cal1::item1', id: 'session1', event: { title: 'Old Event 1' }, calendarId: 'cal1' },
      { key: 'cal1::item2', id: 'session2', event: { title: 'Old Event 2' }, calendarId: 'cal1' }
    ];

    const newItems: CacheDiffInputItem[] = [
      { key: 'cal1::item2', event: { title: 'Updated Event 2' }, calendarId: 'cal1' },
      { key: 'cal1::item3', event: { title: 'New Event 3' }, calendarId: 'cal1' }
    ];

    const diff = await WorkerManager.computeCacheDiff(oldItems, newItems);

    expect(diff.removedIds).toEqual(['session1']);
    expect(diff.added.length).toBe(1);
    expect(diff.added[0].key).toBe('cal1::item3');
    expect(diff.updated.length).toBe(1);
    expect(diff.updated[0].key).toBe('cal1::item2');
    expect(diff.updated[0].id).toBe('session2');
  });

  it('handles empty inputs cleanly', async () => {
    const diff = await WorkerManager.computeCacheDiff([], []);
    expect(diff.added).toEqual([]);
    expect(diff.removedIds).toEqual([]);
    expect(diff.updated).toEqual([]);
  });

  it('runs task directly via computeCacheDiffTask helper', () => {
    const oldItems: CacheDiffInputItem[] = [
      { key: 'k1', id: 'id1', event: { a: 1 }, calendarId: 'c1' }
    ];
    const newItems: CacheDiffInputItem[] = [{ key: 'k1', event: { a: 2 }, calendarId: 'c1' }];

    const diff = computeCacheDiffTask(oldItems, newItems);
    expect(diff.updated.length).toBe(1);
    expect(diff.updated[0].id).toBe('id1');
  });
});
