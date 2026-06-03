/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { GoogleProvider } from './GoogleProvider';
import FullCalendarPlugin from '../../main';
import { t } from '../../features/i18n/i18n';

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

import { PluginState } from '../../core/PluginState';
import { OFCEvent } from '../../types';
import { showNotice } from '../../utils/showNotice';
import { fromGoogleEvent, toGoogleEvent } from './parser/parser_gcal';

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

describe('GoogleProvider createLinkedNote', () => {
  let mockPlugin: { app: MockApp };
  let mockApp: MockApp;
  let provider: GoogleProvider;
  const mockEvent: OFCEvent = {
    title: 'Test Dynamic Note Event',
    type: 'single',
    date: '2026-05-21',
    endDate: null,
    allDay: true,
    uid: 'google-uid-123',
    description: 'Event description',
    location: 'Meeting Room 1'
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
    provider = new GoogleProvider(
      {
        id: 'google_1',
        name: 'My Google Calendar',
        calendarId: 'primary'
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
    expect(file!.path).toBe('Calendar/Notes/Test Dynamic Note Event.md');
    expect(file!.content).toContain('# Test Dynamic Note Event');
    expect(file!.content).toContain('**Calendar**: My Google Calendar');
    expect(file!.content).toContain('fc-event-uid: "google-uid-123"');
  });

  it('should use custom template when linkedNoteTemplate setting is provided', async () => {
    PluginState.getSettings = jest.fn().mockReturnValue({
      linkedNotesDirectory: 'Calendar/Notes',
      linkedNoteTemplate: 'Custom Template: {{title}} at {{location}}'
    });

    const file = (await provider.createLinkedNote(mockEvent)) as MockCreatedFile | null;
    expect(file).toBeDefined();
    expect(file!.path).toBe('Calendar/Notes/Test Dynamic Note Event.md');
    expect(file!.content).toContain('Custom Template: Test Dynamic Note Event at Meeting Room 1');
  });

  it('should return null and show notice if linkedNotesDirectory is not configured', async () => {
    PluginState.getSettings = jest.fn().mockReturnValue({
      linkedNotesDirectory: '',
      linkedNoteTemplate: ''
    });

    const file = await provider.createLinkedNote(mockEvent);
    expect(file).toBeNull();
    expect(showNotice).toHaveBeenCalledWith(t('notices.configureLinkedNotesDirFirst'));
  });
});

describe('GoogleProvider reminder mapping', () => {
  it('maps Google popup reminders to provider alarms', () => {
    const event = fromGoogleEvent({
      id: 'google-event-1',
      summary: 'Google Reminder',
      start: { dateTime: '2026-06-15T10:00:00+02:00', timeZone: 'Europe/Amsterdam' },
      end: { dateTime: '2026-06-15T11:00:00+02:00', timeZone: 'Europe/Amsterdam' },
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 25 }]
      }
    });

    expect(event?.alarms).toEqual([{ minutesBefore: 25, action: 'DISPLAY' }]);
  });

  it('serializes provider alarms as Google popup reminder overrides', () => {
    const event = {
      title: 'Google Reminder',
      type: 'single',
      date: '2026-06-15',
      endDate: null,
      allDay: false,
      startTime: '10:00',
      endTime: '11:00',
      alarms: [{ minutesBefore: 25, action: 'DISPLAY' }]
    } as OFCEvent;

    expect(toGoogleEvent(event)).toMatchObject({
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 25 }]
      }
    });
  });
});
