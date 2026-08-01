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
  let mockWaitForMetadata: jest.Mock;
  let mockVault: {
    getMarkdownFiles: jest.Mock;
    on: jest.Mock;
    offref: jest.Mock;
  };
  let mockWorkspace: {
    onLayoutReady: jest.Mock;
  };
  let mockRegistry: {
    reloadProviderNow: jest.Mock;
  };
  const calendarId = 'cal-123';

  // Keep track of registered callbacks
  let registeredEvents: Record<string, ((...args: unknown[]) => void)[]> = {};

  const triggerEvent = (name: string, ...args: unknown[]): void => {
    const callbacks = registeredEvents[name] || [];
    for (const callback of callbacks) {
      switch (name) {
        case 'resolved':
          callback();
          break;
        default:
          callback(...args);
          break;
      }
    }
  };

  beforeEach(() => {
    registeredEvents = {};
    mockWaitForMetadata = jest.fn().mockResolvedValue({ frontmatter: {} });

    mockMetadataCache = {
      getFileCache: jest.fn(),
      on: jest.fn().mockImplementation((name: string, callback: (...args: unknown[]) => void) => {
        if (!registeredEvents[name]) registeredEvents[name] = [];
        registeredEvents[name].push(callback);
        return { name } as EventRef;
      }),
      offref: jest.fn()
    };

    mockVault = {
      getMarkdownFiles: jest.fn().mockReturnValue([]),
      on: jest.fn().mockImplementation((name: string, callback: (...args: unknown[]) => void) => {
        if (!registeredEvents[name]) registeredEvents[name] = [];
        registeredEvents[name].push(callback);
        return { name } as EventRef;
      }),
      offref: jest.fn()
    };

    mockWorkspace = {
      onLayoutReady: jest.fn().mockImplementation((callback: () => void) => {
        callback();
      })
    };

    mockApp = {
      metadataCache: mockMetadataCache,
      vault: mockVault,
      workspace: mockWorkspace,
      waitForMetadata: mockWaitForMetadata
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

  it('recovers links after startup when frontmatter becomes available asynchronously', async () => {
    const file = createMockFile('events/startup-note.md');

    mockWorkspace.onLayoutReady.mockImplementation(() => undefined);

    mockVault.getMarkdownFiles.mockReturnValue([file]);
    mockMetadataCache.getFileCache
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValue({
        frontmatter: {
          'fc-calendar-id': calendarId,
          'fc-event-uid': 'uid-startup'
        }
      });

    const index = new LinkedNoteIndex(mockApp, calendarId);
    index.initialize();

    await Promise.resolve();
    await Promise.resolve();

    expect(mockWaitForMetadata).toHaveBeenCalledWith(file);
    expect(index.getFileForEvent('uid-startup')).toBe(file);
    expect(mockRegistry.reloadProviderNow).toHaveBeenCalledWith(calendarId);
  });

  it('rescans on layout ready when the initial vault scan is empty during startup', () => {
    const file = createMockFile('events/layout-ready-note.md');

    mockVault.getMarkdownFiles.mockReturnValueOnce([]).mockReturnValue([file]);

    mockMetadataCache.getFileCache.mockReturnValue({
      frontmatter: {
        'fc-calendar-id': calendarId,
        'fc-event-uid': 'uid-layout-ready'
      }
    });

    const index = new LinkedNoteIndex(mockApp, calendarId);
    index.initialize();

    expect(mockWorkspace.onLayoutReady).toHaveBeenCalled();
    expect(index.getFileForEvent('uid-layout-ready')).toBe(file);
  });

  it('rescans on metadata resolved when startup scans still miss linked-note files', () => {
    const file = createMockFile('events/resolved-note.md');

    mockWorkspace.onLayoutReady.mockImplementation(() => undefined);
    mockWaitForMetadata.mockImplementation(() => new Promise(() => undefined));
    mockVault.getMarkdownFiles.mockReturnValueOnce([]).mockReturnValue([file]);

    mockMetadataCache.getFileCache.mockReturnValue({
      frontmatter: {
        'fc-calendar-id': calendarId,
        'fc-event-uid': 'uid-resolved'
      }
    });

    const index = new LinkedNoteIndex(mockApp, calendarId);
    index.initialize();

    expect(index.getFileForEvent('uid-resolved')).toBeNull();

    triggerEvent('resolved');

    expect(index.getFileForEvent('uid-resolved')).toBe(file);
  });

  it('waits for startup hydration before resolving a linked note file', async () => {
    const file = createMockFile('events/async-resolved-note.md');
    let metadataReady = false;

    mockWorkspace.onLayoutReady.mockImplementation(() => undefined);
    mockWaitForMetadata.mockImplementation(() => new Promise(() => undefined));
    mockVault.getMarkdownFiles.mockReturnValue([file]);

    mockMetadataCache.getFileCache.mockImplementation(() => {
      if (!metadataReady) {
        return null;
      }
      return {
        frontmatter: {
          'fc-calendar-id': calendarId,
          'fc-event-uid': 'uid-async-resolved'
        }
      };
    });

    const index = new LinkedNoteIndex(mockApp, calendarId);
    index.initialize();

    let resolved = false;
    const filePromise = index.getFileForEventAfterHydration('uid-async-resolved').then(result => {
      resolved = true;
      return result;
    });
    await Promise.resolve();

    expect(resolved).toBe(false);

    metadataReady = true;
    triggerEvent('resolved');

    await expect(filePromise).resolves.toBe(file);
    expect(resolved).toBe(true);
  });

  it('does not treat the index as hydrated while any linked-note files are unresolved', async () => {
    const indexedFile = createMockFile('events/indexed-note.md');
    const delayedFile = createMockFile('events/delayed-note.md');
    let delayedMetadataReady = false;

    mockWorkspace.onLayoutReady.mockImplementation(() => undefined);
    mockWaitForMetadata.mockImplementation(() => new Promise(() => undefined));
    mockVault.getMarkdownFiles.mockReturnValue([indexedFile, delayedFile]);
    mockMetadataCache.getFileCache.mockImplementation((file: TFile) => {
      if (file.path === indexedFile.path) {
        return {
          frontmatter: {
            'fc-calendar-id': calendarId,
            'fc-event-uid': 'uid-indexed'
          }
        };
      }
      if (file.path === delayedFile.path && delayedMetadataReady) {
        return {
          frontmatter: {
            'fc-calendar-id': calendarId,
            'fc-event-uid': 'uid-delayed'
          }
        };
      }
      return null;
    });

    const index = new LinkedNoteIndex(mockApp, calendarId);
    index.initialize();

    let resolved = false;
    const filePromise = index.getFileForEventAfterHydration('uid-delayed').then(result => {
      resolved = true;
      return result;
    });
    await Promise.resolve();

    expect(index.getFileForEvent('uid-indexed')).toBe(indexedFile);
    expect(resolved).toBe(false);

    delayedMetadataReady = true;
    triggerEvent('resolved');

    await expect(filePromise).resolves.toBe(delayedFile);
    expect(resolved).toBe(true);
  });

  it('indexes linked-note files created in the watched directory', () => {
    const index = new LinkedNoteIndex(mockApp, calendarId);
    index.initialize();

    const file = createMockFile('events/created-note.md');
    mockMetadataCache.getFileCache.mockReturnValue({
      frontmatter: {
        'fc-calendar-id': calendarId,
        'fc-event-uid': 'uid-created'
      }
    });

    triggerEvent('create', file);

    expect(index.getFileForEvent('uid-created')).toBe(file);
    expect(mockRegistry.reloadProviderNow).toHaveBeenCalledWith(calendarId);
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

  it('indexes existing linked notes whose UID frontmatter was parsed as a number', () => {
    const file = createMockFile('events/numeric-uid.md');

    mockVault.getMarkdownFiles.mockReturnValue([file]);
    mockMetadataCache.getFileCache.mockReturnValue({
      frontmatter: {
        'fc-calendar-id': calendarId,
        'fc-event-uid': 1234567890
      }
    });

    const index = new LinkedNoteIndex(mockApp, calendarId);
    index.initialize();

    expect(index.getFileForEvent('1234567890')).toBe(file);
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
