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
import { makeAuthenticatedRequest } from './auth/request';
import { GoogleEventLike } from './parser/parser_gcal';
import { fromGoogleEvent, toGoogleEvent } from './parser/parser_gcal';

jest.mock('../../core/PluginState');
jest.mock('../../utils/showNotice');
jest.mock('./auth/request');

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

describe('GoogleProvider getEvents', () => {
  let mockPlugin: { app: MockApp };
  let mockApp: MockApp;
  let provider: GoogleProvider;

  beforeEach(() => {
    mockApp = {
      vault: {
        getAbstractFileByPath: jest.fn().mockReturnValue(null),
        create: jest.fn()
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

    jest.spyOn(provider['authManager'], 'getTokenForSource').mockResolvedValue('mock-token');
    PluginState.getSettings = jest.fn().mockReturnValue({
      displayTimezone: 'UTC'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should correctly skip exception instances (modified and cancelled, timed and all-day)', async () => {
    const mockItems: GoogleEventLike[] = [
      // Master recurring event
      {
        id: 'master_1',
        summary: 'Weekly Team Meeting',
        start: { dateTime: '2026-06-01T10:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2026-06-01T11:00:00Z', timeZone: 'UTC' },
        recurrence: ['RRULE:FREQ=WEEKLY'],
        status: 'confirmed'
      },
      // Timed cancellation exception
      {
        id: 'master_1_20260608T100000Z',
        recurringEventId: 'master_1',
        originalStartTime: { dateTime: '2026-06-08T10:00:00Z', timeZone: 'UTC' },
        status: 'cancelled'
      },
      // Timed modified exception
      {
        id: 'master_1_20260615T100000Z',
        summary: 'Weekly Team Meeting - Rescheduled',
        recurringEventId: 'master_1',
        originalStartTime: { dateTime: '2026-06-15T10:00:00Z', timeZone: 'UTC' },
        start: { dateTime: '2026-06-15T14:00:00Z', timeZone: 'UTC' },
        end: { dateTime: '2026-06-15T15:00:00Z', timeZone: 'UTC' },
        status: 'confirmed'
      },
      // Master all-day recurring event
      {
        id: 'master_allday',
        summary: 'All-Day Holiday',
        start: { date: '2026-06-01' },
        end: { date: '2026-06-02' },
        recurrence: ['RRULE:FREQ=DAILY'],
        status: 'confirmed'
      },
      // All-day cancellation exception
      {
        id: 'master_allday_20260602',
        recurringEventId: 'master_allday',
        originalStartTime: { date: '2026-06-02' },
        status: 'cancelled'
      },
      // All-day modified exception
      {
        id: 'master_allday_20260603',
        summary: 'All-Day Holiday - Renamed',
        recurringEventId: 'master_allday',
        originalStartTime: { date: '2026-06-03' },
        start: { date: '2026-06-03' },
        end: { date: '2026-06-04' },
        status: 'confirmed'
      }
    ];

    (makeAuthenticatedRequest as jest.Mock).mockResolvedValue({ items: mockItems });

    const events = await provider.getEvents();

    const master1 = events.find(e => e[0].uid === 'master_1')?.[0];
    expect(master1).toBeDefined();
    expect(master1!.type).toBe('rrule');
    if (master1 && (master1.type === 'rrule' || master1.type === 'recurring')) {
      // It should skip both the cancelled and the modified instances
      expect(master1.skipDates).toContain('2026-06-08');
      expect(master1.skipDates).toContain('2026-06-15');
    } else {
      throw new Error('master1 is not a recurring/rrule event');
    }

    const modified1 = events.find(e => e[0].uid === 'master_1_20260615T100000Z')?.[0];
    expect(modified1).toBeDefined();
    expect(modified1!.type).toBe('single');
    expect(modified1!.title).toBe('Weekly Team Meeting - Rescheduled');

    const masterAllday = events.find(e => e[0].uid === 'master_allday')?.[0];
    expect(masterAllday).toBeDefined();
    expect(masterAllday!.type).toBe('rrule');
    if (masterAllday && (masterAllday.type === 'rrule' || masterAllday.type === 'recurring')) {
      // It should skip both the all-day cancelled and all-day modified instances
      expect(masterAllday.skipDates).toContain('2026-06-02');
      expect(masterAllday.skipDates).toContain('2026-06-03');
    } else {
      throw new Error('masterAllday is not a recurring/rrule event');
    }

    const modifiedAllday = events.find(e => e[0].uid === 'master_allday_20260603')?.[0];
    expect(modifiedAllday).toBeDefined();
    expect(modifiedAllday!.type).toBe('single');
    expect(modifiedAllday!.title).toBe('All-Day Holiday - Renamed');

    // The cancelled instances themselves should NOT be returned
    const cancelledTimed = events.find(e => e[0].uid === 'master_1_20260608T100000Z');
    expect(cancelledTimed).toBeUndefined();

    const cancelledAllday = events.find(e => e[0].uid === 'master_allday_20260602');
    expect(cancelledAllday).toBeUndefined();
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
