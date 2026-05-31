/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { GoogleTasksProvider } from './GoogleTasksProvider';
import FullCalendarPlugin from '../../main';
import { GoogleTasksProviderConfig } from './typesGoogleTasks';
import { makeAuthenticatedRequest } from '../google/auth/request';

jest.mock('../google/auth/request', () => ({
  makeAuthenticatedRequest: jest.fn(),
  GoogleApiError: class GoogleApiError extends Error {}
}));

jest.mock('../google/auth/GoogleAuthManager', () => ({
  GoogleAuthManager: jest.fn().mockImplementation(() => ({
    getTokenForSource: jest.fn().mockResolvedValue('token')
  }))
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
});
