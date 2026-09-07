/**
 * @file ObsidianAdapter.test.ts
 * @brief Unit tests for ObsidianIO adapter methods.
 */

import { App, CachedMetadata, EventRef, TFile, TFolder } from 'obsidian';
import { ObsidianIO } from './ObsidianAdapter';

describe('ObsidianIO', () => {
  let mockFile: TFile;
  let mockApp: App;
  let mockVault: {
    read: jest.Mock;
    cachedRead: jest.Mock;
    modify: jest.Mock;
    create: jest.Mock;
    getAbstractFileByPath: jest.Mock;
  };
  let mockMetadataCache: {
    getFileCache: jest.Mock;
    on: jest.Mock;
    offref: jest.Mock;
  };
  let mockFileManager: {
    trashFile: jest.Mock;
    renameFile: jest.Mock;
  };

  beforeEach(() => {
    const parentFolder = new TFolder();
    parentFolder.name = 'folder';

    mockFile = new TFile();
    mockFile.name = 'test.md';
    mockFile.parent = parentFolder;

    mockVault = {
      read: jest.fn().mockResolvedValue('file content from disk'),
      cachedRead: jest.fn().mockResolvedValue('cached file content'),
      modify: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue(mockFile),
      getAbstractFileByPath: jest.fn()
    };

    mockMetadataCache = {
      getFileCache: jest.fn().mockReturnValue(null),
      on: jest.fn(),
      offref: jest.fn()
    };

    mockFileManager = {
      trashFile: jest.fn().mockResolvedValue(undefined),
      renameFile: jest.fn().mockResolvedValue(undefined)
    };

    mockApp = {
      vault: mockVault,
      metadataCache: mockMetadataCache,
      fileManager: mockFileManager
    } as unknown as App;
  });

  describe('read', () => {
    it('returns cachedRead content when available', async () => {
      const adapter = new ObsidianIO(mockApp);
      const content = await adapter.read(mockFile);

      expect(content).toBe('cached file content');
      expect(mockVault.cachedRead).toHaveBeenCalledWith(mockFile);
      expect(mockVault.read).not.toHaveBeenCalled();
    });

    it('falls back to vault.read directly from disk when cachedRead throws', async () => {
      mockVault.cachedRead.mockRejectedValue(new Error('Cache miss'));
      const adapter = new ObsidianIO(mockApp);
      const content = await adapter.read(mockFile);

      expect(content).toBe('file content from disk');
      expect(mockVault.read).toHaveBeenCalledWith(mockFile);
    });

    it('falls back to vault.read directly from disk when cachedRead returns empty string', async () => {
      mockVault.cachedRead.mockResolvedValue('');
      const adapter = new ObsidianIO(mockApp);
      const content = await adapter.read(mockFile);

      expect(content).toBe('file content from disk');
      expect(mockVault.read).toHaveBeenCalledWith(mockFile);
    });
  });

  describe('waitForMetadata', () => {
    it('resolves immediately if getFileCache already returns metadata', async () => {
      const mockMeta: CachedMetadata = { frontmatter: { title: 'Test' } };
      mockMetadataCache.getFileCache.mockReturnValue(mockMeta);

      const adapter = new ObsidianIO(mockApp);
      const result = await adapter.waitForMetadata(mockFile);

      expect(result).toBe(mockMeta);
      expect(mockMetadataCache.on).not.toHaveBeenCalled();
    });

    it('resolves when changed event fires for the target file', async () => {
      type ChangedCallback = (file: TFile, data: string, cache: CachedMetadata) => void;
      const holder: { callback?: ChangedCallback } = {};
      const fakeRef: EventRef = {};

      mockMetadataCache.on.mockImplementation((event: string, cb: ChangedCallback) => {
        if (event === 'changed') {
          holder.callback = cb;
        }
        return fakeRef;
      });

      const adapter = new ObsidianIO(mockApp);
      const promise = adapter.waitForMetadata(mockFile);

      const updatedMeta: CachedMetadata = { frontmatter: { title: 'Changed' } };
      expect(holder.callback).toBeDefined();
      holder.callback?.(mockFile, '', updatedMeta);

      const result = await promise;
      expect(result).toBe(updatedMeta);
      expect(mockMetadataCache.offref).toHaveBeenCalledWith(fakeRef);
    });

    it('resolves when resolve event fires on rename and metadata is available', async () => {
      type ResolveCallback = (file: TFile) => void;
      const holder: { callback?: ResolveCallback } = {};
      const fakeRef: EventRef = {};

      mockMetadataCache.on.mockImplementation((event: string, cb: unknown) => {
        if (event === 'resolve') {
          holder.callback = cb as ResolveCallback;
        }
        return fakeRef;
      });

      const adapter = new ObsidianIO(mockApp);
      const promise = adapter.waitForMetadata(mockFile);

      const resolvedMeta: CachedMetadata = { frontmatter: { title: 'Resolved After Rename' } };
      mockMetadataCache.getFileCache.mockReturnValue(resolvedMeta);

      expect(holder.callback).toBeDefined();
      holder.callback?.(mockFile);

      const result = await promise;
      expect(result).toBe(resolvedMeta);
      expect(mockMetadataCache.offref).toHaveBeenCalled();
    });

    it('ignores events for a different file', async () => {
      type ChangedCallback = (file: TFile, data: string, cache: CachedMetadata) => void;
      const holder: { callback?: ChangedCallback } = {};
      const fakeRef: EventRef = {};

      mockMetadataCache.on.mockImplementation((event: string, cb: ChangedCallback) => {
        if (event === 'changed') {
          holder.callback = cb;
        }
        return fakeRef;
      });

      const adapter = new ObsidianIO(mockApp);
      let resolved = false;
      void adapter.waitForMetadata(mockFile).then(() => {
        resolved = true;
      });

      const otherFolder = new TFolder();
      otherFolder.name = 'other';
      const otherFile = new TFile();
      otherFile.name = 'path.md';
      otherFile.parent = otherFolder;
      holder.callback?.(otherFile, '', { frontmatter: {} });

      await new Promise(resolve => window.setTimeout(resolve, 10));
      expect(resolved).toBe(false);
      expect(mockMetadataCache.offref).not.toHaveBeenCalled();
    });
  });

  describe('getFileByPath', () => {
    it('returns TFile when abstract file is a TFile', () => {
      mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
      const adapter = new ObsidianIO(mockApp);

      expect(adapter.getFileByPath('folder/test.md')).toBe(mockFile);
    });

    it('returns null when path does not exist or is a folder', () => {
      mockVault.getAbstractFileByPath.mockReturnValue(null);
      const adapter = new ObsidianIO(mockApp);
      expect(adapter.getFileByPath('nonexistent.md')).toBeNull();

      const folder = new TFolder();
      mockVault.getAbstractFileByPath.mockReturnValue(folder);
      expect(adapter.getFileByPath('folder')).toBeNull();
    });
  });
});
