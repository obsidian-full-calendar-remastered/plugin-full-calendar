/**
 * @file LinkedNoteIndex.test.ts
 * @brief Tests for the reactive LinkedNoteIndex.
 */

import { LinkedNoteIndex } from './LinkedNoteIndex';
import { PluginState } from '../../core/PluginState';
import { App, TFile, EventRef } from 'obsidian';

// Mock Obsidian
jest.mock(
  'obsidian',
  () => {
    class TAbstractFile {
      path: string = '';
      name: string = '';
    }
    class TFile extends TAbstractFile {}
    return {
      TFile,
      TAbstractFile
    };
  },
  { virtual: true }
);

describe('LinkedNoteIndex', () => {
  let mockApp: App;
  let mockMetadataCache: {
    getFileCache: jest.Mock;
    on: jest.Mock;
    offref: jest.Mock;
  };
  let mockVault: {
    getMarkdownFiles: jest.Mock;
    on: jest.Mock;
    offref: jest.Mock;
  };
  let mockRegistry: {
    reloadProviderNow: jest.Mock;
  };
  const calendarId = 'cal-123';

  // Keep track of registered callbacks
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let registeredEvents: Record<string, ((...args: any[]) => void)[]> = {};

  beforeEach(() => {
    registeredEvents = {};

    mockMetadataCache = {
      getFileCache: jest.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      on: jest.fn().mockImplementation((name: string, callback: (...args: any[]) => void) => {
        if (!registeredEvents[name]) registeredEvents[name] = [];
        registeredEvents[name].push(callback);
        return { name } as EventRef;
      }),
      offref: jest.fn()
    };

    mockVault = {
      getMarkdownFiles: jest.fn().mockReturnValue([]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      on: jest.fn().mockImplementation((name: string, callback: (...args: any[]) => void) => {
        if (!registeredEvents[name]) registeredEvents[name] = [];
        registeredEvents[name].push(callback);
        return { name } as EventRef;
      }),
      offref: jest.fn()
    };

    mockApp = {
      metadataCache: mockMetadataCache,
      vault: mockVault
    } as unknown as App;

    mockRegistry = {
      reloadProviderNow: jest.fn()
    };

    // Mock PluginState
    PluginState.getSettings = jest.fn().mockReturnValue({
      linkedNotesDirectory: 'events',
      linkedNoteTemplate: ''
    });
    PluginState.getProviderRegistry = jest.fn().mockReturnValue(mockRegistry);
  });

  const createMockFile = (path: string): TFile => {
    const file = new TFile();
    file.path = path;
    file.name = path.split('/').pop() || '';
    return file;
  };

  it('should initialize and map matching files in the configured directory', () => {
    const file1 = createMockFile('events/note1.md');
    const file2 = createMockFile('events/note2.md');
    const fileOutside = createMockFile('other/note3.md');

    mockVault.getMarkdownFiles.mockReturnValue([file1, file2, fileOutside]);

    mockMetadataCache.getFileCache.mockImplementation((file: TFile) => {
      if (file.path === 'events/note1.md') {
        return {
          frontmatter: {
            'fc-calendar-id': calendarId,
            'fc-event-uid': 'uid-1'
          }
        };
      }
      if (file.path === 'events/note2.md') {
        return {
          frontmatter: {
            'fc-calendar-id': 'different-cal',
            'fc-event-uid': 'uid-2'
          }
        };
      }
      return null;
    });

    const index = new LinkedNoteIndex(mockApp, calendarId);
    index.initialize();

    expect(index.getFileForEvent('uid-1')).toBe(file1);
    expect(index.getFileForEvent('uid-2')).toBeNull(); // Different calendar ID
  });

  it('should trigger reload on changed metadata when a new linked note is added reactively', () => {
    const index = new LinkedNoteIndex(mockApp, calendarId);
    index.initialize();

    const file = createMockFile('events/new-note.md');
    mockMetadataCache.getFileCache.mockReturnValue({
      frontmatter: {
        'fc-calendar-id': calendarId,
        'fc-event-uid': 'uid-reactive'
      }
    });

    // Trigger metadata changed event
    const changedCallbacks = registeredEvents['changed'] || [];
    expect(changedCallbacks.length).toBeGreaterThan(0);

    // Call changed listener
    changedCallbacks[0](file);

    expect(index.getFileForEvent('uid-reactive')).toBe(file);
    expect(mockRegistry.reloadProviderNow).toHaveBeenCalledWith(calendarId);
  });

  it('should remove key mapping and trigger reload when file is deleted reactively', () => {
    const file1 = createMockFile('events/note1.md');
    mockVault.getMarkdownFiles.mockReturnValue([file1]);
    mockMetadataCache.getFileCache.mockReturnValue({
      frontmatter: {
        'fc-calendar-id': calendarId,
        'fc-event-uid': 'uid-1'
      }
    });

    const index = new LinkedNoteIndex(mockApp, calendarId);
    index.initialize();

    expect(index.getFileForEvent('uid-1')).toBe(file1);

    // Trigger delete event
    const deleteCallbacks = registeredEvents['delete'] || [];
    expect(deleteCallbacks.length).toBeGreaterThan(0);
    deleteCallbacks[0](file1);

    expect(index.getFileForEvent('uid-1')).toBeNull();
    expect(mockRegistry.reloadProviderNow).toHaveBeenCalledWith(calendarId);
  });

  it('should unregister all listeners during teardown', () => {
    const index = new LinkedNoteIndex(mockApp, calendarId);
    index.initialize();

    index.destroy();

    expect(mockMetadataCache.offref).toHaveBeenCalled();
    expect(mockVault.offref).toHaveBeenCalled();
  });
});
