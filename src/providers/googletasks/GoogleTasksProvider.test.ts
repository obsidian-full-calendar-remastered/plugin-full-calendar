/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { GoogleTasksProvider } from './GoogleTasksProvider';
import FullCalendarPlugin from '../../main';
import { GoogleTasksProviderConfig } from './typesGoogleTasks';
import { makeAuthenticatedRequest } from '../google/auth/request';
import { PluginState } from '../../core/PluginState';

jest.mock('../google/auth/request', () => ({
  makeAuthenticatedRequest: jest.fn(),
  GoogleApiError: class GoogleApiError extends Error {}
}));

jest.mock('../google/auth/GoogleAuthManager', () => ({
  GoogleAuthManager: jest.fn().mockImplementation(() => ({
    getTokenForSource: jest.fn().mockResolvedValue('token')
  }))
}));

jest.mock('../../core/PluginState', () => ({
  PluginState: {
    getProviderRegistry: jest.fn().mockReturnValue({
      refreshBacklogViews: jest.fn()
    })
  }
}));

describe('GoogleTasksProvider Configuration Wrapper', () => {
  let mockPlugin: FullCalendarPlugin;

  beforeEach(() => {
    mockPlugin = {} as FullCalendarPlugin;
  });

  it('should propagate accountId correctly to onSave from the static component wrapper', () => {
    const ConfigComponent = GoogleTasksProvider.getConfigurationComponent();
    const onSaveMock = jest.fn();
    const onCloseMock = jest.fn();

    const props = {
      plugin: mockPlugin,
      config: {},
      onConfigChange: jest.fn(),
      context: {
        allDirectories: [],
        usedDirectories: [],
        headings: []
      },
      onSave: onSaveMock,
      onClose: onCloseMock
    };

    const element = React.createElement(ConfigComponent, props);

    expect(element).toBeDefined();
    expect(element.props.onClose).toBe(onCloseMock);

    // Invoke the handleSave function passed to the underlying GoogleTasksConfigComponent
    const selectedConfigs = [{ id: 'list_123', name: 'My Tasks List', color: '#4285F4' }];
    const accountId = 'gcal_test@gmail.com';
    element.props.onSave(selectedConfigs as unknown as GoogleTasksProviderConfig[], accountId);

    // Verify that the parent's onSave received the accountId
    expect(onSaveMock).toHaveBeenCalledWith(selectedConfigs, accountId);
  });
});

describe('GoogleTasksProvider ownsTaskId', () => {
  let mockPlugin: FullCalendarPlugin;
  let provider: GoogleTasksProvider;

  beforeEach(() => {
    (makeAuthenticatedRequest as jest.Mock).mockReset();
    mockPlugin = {
      app: {
        vault: {},
        metadataCache: {}
      }
    } as unknown as FullCalendarPlugin;

    provider = new GoogleTasksProvider(
      {
        id: 'googletasks_1',
        name: 'My Google Tasks List',
        listId: 'list_123',
        googleAccountId: 'account_123'
      },
      mockPlugin
    );
  });

  it('should own taskId starting with provider source ID prefix', () => {
    expect(provider.ownsTaskId('googletasks_1::task_123')).toBe(true);
  });

  it('should not own taskId starting with different provider source ID prefix', () => {
    expect(provider.ownsTaskId('googletasks_2::task_123')).toBe(false);
    expect(provider.ownsTaskId('caldav_1::task_123')).toBe(false);
  });

  it('should not own improperly formatted taskId', () => {
    expect(provider.ownsTaskId('googletasks_1')).toBe(false);
    expect(provider.ownsTaskId('googletasks_1::task_123::extra')).toBe(false);
  });

  it('returns a scheduled Google Task to the backlog by clearing its due date', async () => {
    (makeAuthenticatedRequest as jest.Mock)
      .mockResolvedValueOnce({
        id: 'task_123',
        title: 'Schedule Me',
        status: 'needsAction',
        due: '2026-06-15T00:00:00.000Z'
      })
      .mockResolvedValueOnce({});

    await provider.unscheduleTask('task_123');

    expect(makeAuthenticatedRequest).toHaveBeenCalledTimes(2);
    expect(makeAuthenticatedRequest).toHaveBeenNthCalledWith(
      2,
      'token',
      'https://tasks.googleapis.com/tasks/v1/lists/list_123/tasks/task_123',
      'PUT',
      expect.objectContaining({ due: undefined })
    );
  });

  it('deletes a backlog Google Task by provider-prefixed task ID', async () => {
    (makeAuthenticatedRequest as jest.Mock).mockResolvedValueOnce({});

    await provider.deleteTaskBacklogItem('googletasks_1::task_123');

    expect(makeAuthenticatedRequest).toHaveBeenCalledWith(
      'token',
      'https://tasks.googleapis.com/tasks/v1/lists/list_123/tasks/task_123',
      'DELETE'
    );
  });

  describe('Backlog caching and refresh functionality', () => {
    beforeEach(() => {
      (makeAuthenticatedRequest as jest.Mock).mockReset();
      // Reset provider's private cache state
      const p = provider as unknown as {
        backlogCache: unknown[];
        hasLoadedBacklog: boolean;
        backlogLoadPromise: Promise<unknown> | null;
      };
      p.backlogCache = [];
      p.hasLoadedBacklog = false;
      p.backlogLoadPromise = null;
    });

    it('caches backlog items and does not issue duplicate network requests', async () => {
      (makeAuthenticatedRequest as jest.Mock).mockResolvedValueOnce({
        items: [
          { id: 'task_1', title: 'Task 1', status: 'needsAction' },
          { id: 'task_2', title: 'Task 2', status: 'needsAction' }
        ]
      });

      const items1 = await provider.getTaskBacklogItems();
      expect(items1).toHaveLength(2);
      expect(items1[0].id).toBe('googletasks_1::task_1');

      // Second call should hit the cache and not make another network call
      const items2 = await provider.getTaskBacklogItems();
      expect(items2).toEqual(items1);

      expect(makeAuthenticatedRequest).toHaveBeenCalledTimes(1);
    });

    it('forces refetching when refreshTaskBacklogItems is explicitly called', async () => {
      (makeAuthenticatedRequest as jest.Mock)
        .mockResolvedValueOnce({
          items: [{ id: 'task_1', title: 'Task 1', status: 'needsAction' }]
        })
        .mockResolvedValueOnce({
          items: [
            { id: 'task_1', title: 'Task 1', status: 'needsAction' },
            { id: 'task_2', title: 'Task 2', status: 'needsAction' }
          ]
        });

      await provider.getTaskBacklogItems(); // Warm up cache
      expect(makeAuthenticatedRequest).toHaveBeenCalledTimes(1);

      const refreshed = await provider.refreshTaskBacklogItems();
      expect(refreshed).toHaveLength(2);
      expect(makeAuthenticatedRequest).toHaveBeenCalledTimes(2);
    });

    it('adds newly created items to the cache', async () => {
      (makeAuthenticatedRequest as jest.Mock)
        .mockResolvedValueOnce({
          items: [{ id: 'task_1', title: 'Task 1', status: 'needsAction' }]
        })
        .mockResolvedValueOnce({
          id: 'task_created',
          title: 'Created Task',
          status: 'needsAction'
        });

      await provider.getTaskBacklogItems(); // Warm up cache
      expect(makeAuthenticatedRequest).toHaveBeenCalledTimes(1);

      const created = await provider.createTaskBacklogItem('Created Task');
      expect(created.id).toBe('googletasks_1::task_created');

      // Subsequent getTaskBacklogItems should return the cached list plus the new item without extra network call
      const items = await provider.getTaskBacklogItems();
      expect(items).toHaveLength(2);
      expect(items.some(item => item.id === 'googletasks_1::task_created')).toBe(true);
      expect(makeAuthenticatedRequest).toHaveBeenCalledTimes(2); // 1 for get, 1 for create
    });

    it('removes deleted items from the cache', async () => {
      (makeAuthenticatedRequest as jest.Mock)
        .mockResolvedValueOnce({
          items: [
            { id: 'task_1', title: 'Task 1', status: 'needsAction' },
            { id: 'task_2', title: 'Task 2', status: 'needsAction' }
          ]
        })
        .mockResolvedValueOnce({}); // DELETE response

      await provider.getTaskBacklogItems(); // Warm up cache
      expect(makeAuthenticatedRequest).toHaveBeenCalledTimes(1);

      await provider.deleteTaskBacklogItem('googletasks_1::task_1');

      const items = await provider.getTaskBacklogItems();
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('googletasks_1::task_2');
      expect(makeAuthenticatedRequest).toHaveBeenCalledTimes(2); // 1 for get, 1 for delete
    });

    it('removes scheduled items from the cache', async () => {
      (makeAuthenticatedRequest as jest.Mock)
        .mockResolvedValueOnce({
          items: [
            { id: 'task_1', title: 'Task 1', status: 'needsAction' },
            { id: 'task_2', title: 'Task 2', status: 'needsAction' }
          ]
        })
        .mockResolvedValueOnce({
          id: 'task_1',
          title: 'Task 1',
          status: 'needsAction'
        })
        .mockResolvedValueOnce({}); // PUT response

      await provider.getTaskBacklogItems(); // Warm up cache
      expect(makeAuthenticatedRequest).toHaveBeenCalledTimes(1);

      await provider.scheduleTask('googletasks_1::task_1', new Date());

      const items = await provider.getTaskBacklogItems();
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('googletasks_1::task_2');
    });

    it('invalidates cache when unscheduling a task', async () => {
      (makeAuthenticatedRequest as jest.Mock)
        .mockResolvedValueOnce({
          items: [{ id: 'task_1', title: 'Task 1', status: 'needsAction' }]
        })
        .mockResolvedValueOnce({
          id: 'task_unscheduled',
          title: 'Unscheduled Task',
          status: 'needsAction'
        })
        .mockResolvedValueOnce({}) // PUT response
        .mockResolvedValueOnce({
          items: [
            { id: 'task_1', title: 'Task 1', status: 'needsAction' },
            { id: 'task_unscheduled', title: 'Unscheduled Task', status: 'needsAction' }
          ]
        });

      await provider.getTaskBacklogItems(); // Warm up cache
      expect(makeAuthenticatedRequest).toHaveBeenCalledTimes(1);

      await provider.unscheduleTask('googletasks_1::task_unscheduled');

      // hasLoadedBacklog should be false, so next getTaskBacklogItems calls Google API
      const items = await provider.getTaskBacklogItems();
      expect(items).toHaveLength(2);
      expect(makeAuthenticatedRequest).toHaveBeenCalledTimes(4); // 1 for get, 1 for unschedule get, 1 for unschedule PUT, 1 for new get
    });

    it('completing a task updates cache and refreshes views', async () => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const mockRefresh = PluginState.getProviderRegistry().refreshBacklogViews as jest.Mock;
      mockRefresh.mockClear();

      (makeAuthenticatedRequest as jest.Mock)
        .mockResolvedValueOnce({
          items: [
            { id: 'task_1', title: 'Task 1', status: 'needsAction' },
            { id: 'task_2', title: 'Task 2', status: 'needsAction' }
          ]
        })
        .mockResolvedValueOnce({
          id: 'task_1',
          title: 'Task 1',
          status: 'needsAction'
        })
        .mockResolvedValueOnce({}); // PUT response

      await provider.getTaskBacklogItems(); // Warm up cache
      expect(makeAuthenticatedRequest).toHaveBeenCalledTimes(1);

      const success = await provider.setTaskBacklogItemComplete('googletasks_1::task_1', true);
      expect(success).toBe(true);

      const items = await provider.getTaskBacklogItems();
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('googletasks_1::task_2');
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});
