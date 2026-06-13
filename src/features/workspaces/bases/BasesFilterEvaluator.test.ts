/**
 * @file BasesFilterEvaluator.test.ts
 * @brief Unit tests for the advanced Bases filter evaluation utility.
 * @license See LICENSE.md
 */

import { TFile, MetadataCache, CachedMetadata, Pos, Vault, TFolder } from 'obsidian';
import { evaluateBaseFilter } from './BasesFilterEvaluator';

describe('BasesFilterEvaluator', () => {
  let mockFile: TFile;
  let mockMetadataCache: MetadataCache;
  let mockCache: CachedMetadata;

  beforeEach(() => {
    const rootFolder = new TFolder();
    rootFolder.name = 'Projects';

    const parentFolder = new TFolder();
    parentFolder.name = 'Phoenix';
    parentFolder.parent = rootFolder;

    mockFile = new TFile();
    mockFile.name = 'EventNote.md';
    mockFile.parent = parentFolder;
    mockFile.vault = {} as unknown as Vault;

    mockCache = {
      tags: [{ tag: '#calendar', position: {} as unknown as Pos }],
      frontmatter: {
        status: 'done',
        priority: 3,
        date: '2026-06-13'
      }
    };

    mockMetadataCache = {
      getFileCache: jest.fn().mockReturnValue(mockCache)
    } as unknown as MetadataCache;
  });

  describe('evaluateBaseFilterString', () => {
    it('should match file.hasTag("tag") filter', () => {
      expect(evaluateBaseFilter('file.hasTag("calendar")', mockFile, mockMetadataCache)).toBe(true);
      expect(evaluateBaseFilter('file.hasTag("work")', mockFile, mockMetadataCache)).toBe(false);
    });

    it('should match file.inFolder("folder") filter', () => {
      expect(evaluateBaseFilter('file.inFolder("Projects")', mockFile, mockMetadataCache)).toBe(
        true
      );
      expect(
        evaluateBaseFilter('file.inFolder("Projects/Phoenix")', mockFile, mockMetadataCache)
      ).toBe(true);
      expect(evaluateBaseFilter('file.inFolder("Archive")', mockFile, mockMetadataCache)).toBe(
        false
      );
    });

    it('should match file.ext == "md" filter', () => {
      expect(evaluateBaseFilter('file.ext == "md"', mockFile, mockMetadataCache)).toBe(true);
    });

    it('should match equals property comparison', () => {
      expect(evaluateBaseFilter('status == "done"', mockFile, mockMetadataCache)).toBe(true);
      expect(evaluateBaseFilter('status == "active"', mockFile, mockMetadataCache)).toBe(false);
    });

    it('should match property existence', () => {
      expect(evaluateBaseFilter('date', mockFile, mockMetadataCache)).toBe(true);
      expect(evaluateBaseFilter('missingProp', mockFile, mockMetadataCache)).toBe(false);
    });

    it('should handle inequality property comparisons', () => {
      expect(evaluateBaseFilter('priority > 2', mockFile, mockMetadataCache)).toBe(true);
      expect(evaluateBaseFilter('priority < 5', mockFile, mockMetadataCache)).toBe(true);
      expect(evaluateBaseFilter('priority >= 3', mockFile, mockMetadataCache)).toBe(true);
      expect(evaluateBaseFilter('priority <= 3', mockFile, mockMetadataCache)).toBe(true);
      expect(evaluateBaseFilter('priority > 3', mockFile, mockMetadataCache)).toBe(false);
      expect(evaluateBaseFilter('priority < 3', mockFile, mockMetadataCache)).toBe(false);
    });

    it('should handle boolean property comparisons', () => {
      mockCache.frontmatter!.isTask = true;
      mockCache.frontmatter!.isCompleted = false;
      expect(evaluateBaseFilter('isTask == true', mockFile, mockMetadataCache)).toBe(true);
      expect(evaluateBaseFilter('isCompleted == false', mockFile, mockMetadataCache)).toBe(true);
      expect(evaluateBaseFilter('isTask == false', mockFile, mockMetadataCache)).toBe(false);
    });

    it('should handle number property comparisons', () => {
      expect(evaluateBaseFilter('priority == 3', mockFile, mockMetadataCache)).toBe(true);
      expect(evaluateBaseFilter('priority == 4', mockFile, mockMetadataCache)).toBe(false);
    });

    it('should match context variables', () => {
      const context = {
        calendarId: 'local_1',
        calendarName: 'Work',
        category: 'Meetings',
        subCategory: '1-on-1'
      };
      expect(
        evaluateBaseFilter('file.calendarId == "local_1"', mockFile, mockMetadataCache, context)
      ).toBe(true);
      expect(
        evaluateBaseFilter('file.calendarName == "Work"', mockFile, mockMetadataCache, context)
      ).toBe(true);
      expect(
        evaluateBaseFilter('file.category == "Meetings"', mockFile, mockMetadataCache, context)
      ).toBe(true);
      expect(
        evaluateBaseFilter('file.subCategory == "1-on-1"', mockFile, mockMetadataCache, context)
      ).toBe(true);
      expect(
        evaluateBaseFilter('file.calendarId == "other"', mockFile, mockMetadataCache, context)
      ).toBe(false);
    });
  });

  describe('evaluateBaseFilter boolean operators', () => {
    it('should handle AND logical combinations', () => {
      const filter = {
        and: ['file.inFolder("Projects")', 'status == "done"']
      };
      expect(evaluateBaseFilter(filter, mockFile, mockMetadataCache)).toBe(true);

      const filterFalse = {
        and: ['file.inFolder("Projects")', 'status == "active"']
      };
      expect(evaluateBaseFilter(filterFalse, mockFile, mockMetadataCache)).toBe(false);
    });

    it('should handle OR logical combinations', () => {
      const filter = {
        or: ['file.inFolder("Archive")', 'status == "done"']
      };
      expect(evaluateBaseFilter(filter, mockFile, mockMetadataCache)).toBe(true);

      const filterFalse = {
        or: ['file.inFolder("Archive")', 'status == "active"']
      };
      expect(evaluateBaseFilter(filterFalse, mockFile, mockMetadataCache)).toBe(false);
    });

    it('should handle NOT logical combinations', () => {
      const filter = {
        not: ['status == "active"']
      };
      expect(evaluateBaseFilter(filter, mockFile, mockMetadataCache)).toBe(true);

      const filterFalse = {
        not: ['status == "done"']
      };
      expect(evaluateBaseFilter(filterFalse, mockFile, mockMetadataCache)).toBe(false);
    });
  });
});
