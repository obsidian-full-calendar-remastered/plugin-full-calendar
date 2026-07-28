import { TFile } from 'obsidian';
import { DailyNoteParseCache, EditableEventResponse } from './DailyNoteParseCache';
import { OFCEvent } from '../../types';

function createMockFile(path: string, stat = { mtime: 1000, size: 500, ctime: 1000 }): TFile {
  const file = new TFile();
  Object.defineProperty(file, 'path', { value: path, writable: true, configurable: true });
  Object.defineProperty(file, 'stat', { value: stat, writable: true, configurable: true });
  return file;
}

describe('DailyNoteParseCache', () => {
  let cache: DailyNoteParseCache;
  let mockFile: TFile;
  let sampleEvent: EditableEventResponse;

  beforeEach(() => {
    cache = new DailyNoteParseCache();
    mockFile = createMockFile('Daily Notes/2026-07-28.md');

    const event: OFCEvent = {
      type: 'single',
      title: 'Cached Event',
      date: '2026-07-28',
      endDate: '2026-07-28',
      allDay: true
    };
    sampleEvent = [event, { file: mockFile, lineNumber: 10 }];
  });

  it('should return null on cache miss', () => {
    expect(cache.get(mockFile)).toBeNull();
  });

  it('should return cached events on hit matching mtime and size', () => {
    cache.set(mockFile, [sampleEvent]);
    const hit = cache.get(mockFile);
    expect(hit).not.toBeNull();
    if (hit) {
      expect(hit).toHaveLength(1);
      expect(hit[0][0].title).toBe('Cached Event');
    }
  });

  it('should return null if file mtime or size changes', () => {
    cache.set(mockFile, [sampleEvent]);

    // Modify mtime
    const modifiedFile = createMockFile('Daily Notes/2026-07-28.md', {
      mtime: 2000,
      size: 500,
      ctime: 1000
    });
    expect(cache.get(modifiedFile)).toBeNull();

    // Modify size
    const resizedFile = createMockFile('Daily Notes/2026-07-28.md', {
      mtime: 1000,
      size: 600,
      ctime: 1000
    });
    expect(cache.get(resizedFile)).toBeNull();
  });

  it('should invalidate specific file entry', () => {
    cache.set(mockFile, [sampleEvent]);
    cache.invalidate(mockFile);
    expect(cache.get(mockFile)).toBeNull();
  });

  it('should clear all cache entries', () => {
    cache.set(mockFile, [sampleEvent]);
    expect(cache.size()).toBe(1);
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get(mockFile)).toBeNull();
  });
});
