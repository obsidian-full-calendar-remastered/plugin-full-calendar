/**
 * @file BasesProvider.test.ts
 * @brief Tests for BasesProvider isFileRelevant and getEventsInFile methods.
 */

import { TFile, TFolder, CachedMetadata, App } from 'obsidian';
import { BasesProvider, BasesProviderConfig } from './BasesProvider';
import { ObsidianInterface } from '../../ObsidianAdapter';
import FullCalendarPlugin from '../../main';

describe('BasesProvider', () => {
  let mockPlugin: FullCalendarPlugin;
  let mockObsidian: ObsidianInterface;
  let mockFile: TFile;
  let mockBaseFile: TFile;
  let provider: BasesProvider;
  let config: BasesProviderConfig;
  let mockCache: CachedMetadata;

  beforeEach(() => {
    const parentFolder = new TFolder();
    parentFolder.name = 'vault';

    mockFile = new TFile();
    mockFile.name = 'event.md';
    mockFile.parent = parentFolder;

    mockBaseFile = new TFile();
    mockBaseFile.name = 'MyBase.base';
    mockBaseFile.parent = parentFolder;

    mockCache = {
      frontmatter: {
        title: 'Bases Event',
        date: '2026-09-08'
      }
    };

    config = {
      name: 'My Bases Calendar',
      type: 'bases',
      basePath: 'vault/MyBase.base',
      color: '#4488cc'
    };

    const mockVault = {
      getAbstractFileByPath: jest.fn((path: string) => {
        if (path === 'vault/MyBase.base') return mockBaseFile;
        return null;
      }),
      read: jest.fn().mockResolvedValue('filters:\n  - file.hasTag("meeting")\n')
    };

    const mockMetadataCache = {
      getFileCache: jest.fn((f: TFile) => {
        if (f === mockFile) return mockCache;
        return null;
      })
    };

    mockPlugin = {
      app: {
        vault: mockVault,
        metadataCache: mockMetadataCache
      } as unknown as App
    } as unknown as FullCalendarPlugin;

    mockObsidian = {
      getAbstractFileByPath: jest.fn(),
      getFileByPath: jest.fn(),
      getMetadata: jest.fn(),
      waitForMetadata: jest.fn(),
      read: jest.fn(),
      process: jest.fn(),
      create: jest.fn(),
      rewrite: jest.fn(),
      rename: jest.fn(),
      delete: jest.fn()
    };

    provider = new BasesProvider(config, mockPlugin, mockObsidian);
  });

  describe('isFileRelevant', () => {
    it('returns false for non-markdown files', () => {
      const nonMdFile = new TFile();
      nonMdFile.name = 'data.json';
      expect(provider.isFileRelevant(nonMdFile)).toBe(false);
    });

    it('returns false when file metadata has no frontmatter', () => {
      mockCache.frontmatter = undefined;
      expect(provider.isFileRelevant(mockFile)).toBe(false);
    });

    it('returns false when frontmatter has no date fields', () => {
      mockCache.frontmatter = { title: 'No Date Note' };
      expect(provider.isFileRelevant(mockFile)).toBe(false);
    });

    it('returns true when frontmatter has date', () => {
      mockCache.frontmatter = { date: '2026-09-08' };
      expect(provider.isFileRelevant(mockFile)).toBe(true);
    });

    it('returns true when frontmatter has due or scheduled or start', () => {
      mockCache.frontmatter = { due: '2026-09-08' };
      expect(provider.isFileRelevant(mockFile)).toBe(true);

      mockCache.frontmatter = { scheduled: '2026-09-08' };
      expect(provider.isFileRelevant(mockFile)).toBe(true);

      mockCache.frontmatter = { start: '2026-09-08' };
      expect(provider.isFileRelevant(mockFile)).toBe(true);
    });
  });

  describe('getEventsInFile', () => {
    it('returns parsed event when filter passes or is absent', async () => {
      (mockPlugin.app.vault.read as jest.Mock).mockResolvedValue('filters: []\n');
      mockCache.frontmatter = {
        title: 'Bases Meeting',
        date: '2026-09-08',
        allDay: true
      };

      const events = await provider.getEventsInFile(mockFile);
      expect(events).toHaveLength(1);
      expect(events[0][0].title).toBe('Bases Meeting');
      expect(events[0][0].uid).toBe(mockFile.path);
    });

    it('filters out event when base filter does not match file', async () => {
      (mockPlugin.app.vault.read as jest.Mock).mockResolvedValue(
        'filters:\n  - file.hasTag("project")\n'
      );
      mockCache.tags = [];
      mockCache.frontmatter = {
        title: 'Bases Meeting',
        date: '2026-09-08',
        allDay: true
      };

      const events = await provider.getEventsInFile(mockFile);
      expect(events).toHaveLength(0);
    });
  });
});
