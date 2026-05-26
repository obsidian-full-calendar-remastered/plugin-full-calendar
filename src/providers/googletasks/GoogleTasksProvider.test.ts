/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { GoogleTasksProvider } from './GoogleTasksProvider';
import FullCalendarPlugin from '../../main';
import { GoogleTasksProviderConfig } from './typesGoogleTasks';

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
});
