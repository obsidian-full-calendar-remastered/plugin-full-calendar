/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { GoogleProvider } from './GoogleProvider';
import FullCalendarPlugin from '../../main';

describe('GoogleProvider Configuration Wrapper', () => {
  let mockPlugin: FullCalendarPlugin;

  beforeEach(() => {
    mockPlugin = {} as FullCalendarPlugin;
  });

  it('should propagate accountId correctly to onSave from the static component wrapper', () => {
    const ConfigComponent = GoogleProvider.getConfigurationComponent();
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

    // Use createElement since ConfigComponent is ComponentType (could be class or function)
    const element = React.createElement(ConfigComponent, props);

    expect(element).toBeDefined();
    expect(element.props.onClose).toBe(onCloseMock);

    // Invoke the handleSave function passed to the underlying GoogleConfigComponent
    const selectedConfigs = [
      { id: 'calendar_123', name: 'My Calendar', color: '#ff0000', calendarId: 'calendar_123' }
    ];
    const accountId = 'gcal_test@gmail.com';
    element.props.onSave(selectedConfigs, accountId);

    // Verify that the parent's onSave (props.onSave) received the accountId
    expect(onSaveMock).toHaveBeenCalledWith(selectedConfigs, accountId);
  });
});
