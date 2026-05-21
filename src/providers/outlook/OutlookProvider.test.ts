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

import { PluginState } from '../../core/PluginState';
import { OFCEvent } from '../../types';

jest.mock('../../core/PluginState');
jest.mock('../../utils/showNotice');

interface MockVault {
  getAbstractFileByPath: jest.Mock;
  create: jest.Mock;
}

interface MockMetadataCache {
  getFileCache: jest.Mock;
  on: jest.Mock;
  offref: jest.Mock;
}

interface MockApp {
  vault: MockVault;
  metadataCache: MockMetadataCache;
}

interface MockCreatedFile {
  path: string;
  content: string;
}

describe('OutlookProvider createLinkedNote', () => {
  let mockPlugin: { app: MockApp };
  let mockApp: MockApp;
  let provider: OutlookProvider;
  const mockEvent: OFCEvent = {
    title: 'Outlook Linked Note Event',
    type: 'single',
    date: '2026-05-21',
    endDate: null,
    allDay: true,
    uid: 'outlook-uid-123',
    description: 'Meeting agenda details',
    location: 'Teams Meeting Room'
  };

  beforeEach(() => {
    mockApp = {
      vault: {
        getAbstractFileByPath: jest.fn().mockReturnValue(null),
        create: jest.fn().mockImplementation((path: string, content: string): MockCreatedFile => {
          return { path, content };
        })
      },
      metadataCache: {
        getFileCache: jest.fn(),
        on: jest.fn(),
        offref: jest.fn()
      }
    };
    mockPlugin = { app: mockApp };
    provider = new OutlookProvider(
      {
        id: 'outlook_1',
        name: 'My Outlook Calendar',
        calendarId: 'primary',
        microsoftAccountId: 'ms-acc-123'
      },
      mockPlugin as unknown as FullCalendarPlugin
    );
  });

  it('should fall back to DEFAULT_TEMPLATE when linkedNoteTemplate setting is blank', async () => {
    PluginState.getSettings = jest.fn().mockReturnValue({
      linkedNotesDirectory: 'Calendar/Notes',
      linkedNoteTemplate: ''
    });

    const file = (await provider.createLinkedNote(mockEvent)) as MockCreatedFile | null;
    expect(file).toBeDefined();
    expect(file!.path).toBe('Calendar/Notes/Outlook Linked Note Event.md');
    expect(file!.content).toContain('# Outlook Linked Note Event');
    expect(file!.content).toContain('**Calendar**: My Outlook Calendar');
    expect(file!.content).toContain('fc-event-uid: outlook-uid-123');
  });

  it('should use custom template when linkedNoteTemplate setting is provided', async () => {
    PluginState.getSettings = jest.fn().mockReturnValue({
      linkedNotesDirectory: 'Calendar/Notes',
      linkedNoteTemplate: 'Teams: {{title}}'
    });

    const file = (await provider.createLinkedNote(mockEvent)) as MockCreatedFile | null;
    expect(file).toBeDefined();
    expect(file!.path).toBe('Calendar/Notes/Outlook Linked Note Event.md');
    expect(file!.content).toContain('Teams: Outlook Linked Note Event');
  });
});
