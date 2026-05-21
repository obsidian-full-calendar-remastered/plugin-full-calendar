/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { OutlookProvider } from './OutlookProvider';
import FullCalendarPlugin from '../../main';

describe('OutlookProvider Configuration Wrapper', () => {
  let mockPlugin: FullCalendarPlugin;

  beforeEach(() => {
    mockPlugin = {} as FullCalendarPlugin;
  });

  it('should propagate accountId correctly to onSave from the static component wrapper', () => {
    const ConfigComponent = OutlookProvider.getConfigurationComponent();
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

    const selectedConfigs = [
      {
        id: 'outlook_123',
        name: 'My Outlook Calendar',
        color: '#00ff00',
        calendarId: 'outlook_123'
      }
    ];
    const accountId = 'ms_test@outlook.com';
    element.props.onSave(selectedConfigs, accountId);

    expect(onSaveMock).toHaveBeenCalledWith(selectedConfigs, accountId);
  });
});
