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

  it('should support compound key mapping for recurring event instances', () => {
    const fileMaster = createMockFile('events/master.md');
    const fileInstance = createMockFile('events/instance.md');

    mockVault.getMarkdownFiles.mockReturnValue([fileMaster, fileInstance]);

    mockMetadataCache.getFileCache.mockImplementation((file: TFile) => {
      if (file.path === 'events/master.md') {
        return {
          frontmatter: {
            'fc-calendar-id': calendarId,
            'fc-event-uid': 'uid-recur'
          }
        };
      }
      if (file.path === 'events/instance.md') {
        return {
          frontmatter: {
            'fc-calendar-id': calendarId,
            'fc-event-uid': 'uid-recur',
            'fc-event-recurrence-id': '2026-05-20'
          }
        };
      }
      return null;
    });

    const index = new LinkedNoteIndex(mockApp, calendarId);
    index.initialize();

    // specific instance query should match the instance-specific file
    expect(index.getFileForEvent('uid-recur', '2026-05-20')).toBe(fileInstance);
    // query for a different instance should fall back to the master note
    expect(index.getFileForEvent('uid-recur', '2026-05-21')).toBe(fileMaster);
    // query with no instance should match the master note
    expect(index.getFileForEvent('uid-recur')).toBe(fileMaster);
  });

  it('should scrub stale mappings pointing to the same path but a different key during reactive updates', () => {
    const index = new LinkedNoteIndex(mockApp, calendarId);
    index.initialize();

    const file = createMockFile('events/note.md');

    // First, file is mapped to master key 'uid-stale'
    mockMetadataCache.getFileCache.mockReturnValue({
      frontmatter: {
        'fc-calendar-id': calendarId,
        'fc-event-uid': 'uid-stale'
      }
    });

    const changedCallbacks = registeredEvents['changed'] || [];
    changedCallbacks[0](file);

    expect(index.getFileForEvent('uid-stale')).toBe(file);

    // Second, file frontmatter is edited reactively to have recurrence ID
    mockMetadataCache.getFileCache.mockReturnValue({
      frontmatter: {
        'fc-calendar-id': calendarId,
        'fc-event-uid': 'uid-stale',
        'fc-event-recurrence-id': '2026-05-20'
      }
    });

    changedCallbacks[0](file);

    // Compound key should map to the file
    expect(index.getFileForEvent('uid-stale', '2026-05-20')).toBe(file);
    // Old master key should be scrubbed!
    expect(index.getFileForEvent('uid-stale')).toBeNull();
  });

  it('should unregister all listeners during teardown', () => {
    const index = new LinkedNoteIndex(mockApp, calendarId);
    index.initialize();

    index.destroy();

    expect(mockMetadataCache.offref).toHaveBeenCalled();
    expect(mockVault.offref).toHaveBeenCalled();
  });
});
