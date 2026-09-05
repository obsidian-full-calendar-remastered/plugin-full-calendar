/**
 * @file noteUtils.test.ts
 * @brief Tests for note and file utilities.
 */

import {
  sanitizeTitleForFilename,
  extractCleanTitleFromBasename,
  basenameFromEvent,
  filenameForEvent,
  serializeFrontmatter,
  findUniquePath,
  waitForFileAtPath,
  waitForMetadataWithTimeout
} from './noteUtils';
import { OFCEvent } from '../../types';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { TFile, CachedMetadata } from 'obsidian';
import { replaceFrontmatter } from '../fullnote/frontmatter';

describe('noteUtils', () => {
  describe('sanitizeTitleForFilename', () => {
    it('should strip out OS reserved characters', () => {
      const dirtyTitle = 'Meeting / Discussion: "Q4 Planning" <Secrets> | & ?';
      const clean = sanitizeTitleForFilename(dirtyTitle);
      expect(clean).toBe('Meeting Discussion Q4 Planning Secrets &');
    });

    it('should collapse multiple spaces', () => {
      const spacedTitle = 'Hello    World';
      expect(sanitizeTitleForFilename(spacedTitle)).toBe('Hello World');
    });
  });

  describe('extractCleanTitleFromBasename', () => {
    it('should strip leading ISO date prefix', () => {
      expect(extractCleanTitleFromBasename('2026-09-05 Team Standup')).toBe('Team Standup');
      expect(extractCleanTitleFromBasename('2024-01-01 Doctor Appointment')).toBe(
        'Doctor Appointment'
      );
    });

    it('should strip recurring prefixes', () => {
      expect(extractCleanTitleFromBasename('(Every day) Daily Meeting')).toBe('Daily Meeting');
      expect(extractCleanTitleFromBasename('(Every 3 days) Interval Meeting')).toBe(
        'Interval Meeting'
      );
      expect(extractCleanTitleFromBasename('(Every M,W) Weekly Standup')).toBe('Weekly Standup');
      expect(extractCleanTitleFromBasename('(Every month on the 1) Rent Payment')).toBe(
        'Rent Payment'
      );
      expect(extractCleanTitleFromBasename('(Every year on May 20) Birthday')).toBe('Birthday');
      expect(extractCleanTitleFromBasename('(Recurring) Gym Session')).toBe('Gym Session');
    });

    it('should strip both date and recurrence if combined', () => {
      expect(extractCleanTitleFromBasename('2026-09-05 (Every M,W) Weekly Standup')).toBe(
        'Weekly Standup'
      );
    });

    it('should strip unique path suffix', () => {
      expect(extractCleanTitleFromBasename('2026-05-20 Single Event-_-_-1')).toBe('Single Event');
      expect(extractCleanTitleFromBasename('Dentist Appointment-_-_-2')).toBe(
        'Dentist Appointment'
      );
    });

    it('should preserve standard note names without calendar prefixes', () => {
      expect(extractCleanTitleFromBasename('Meeting with Alice')).toBe('Meeting with Alice');
      expect(extractCleanTitleFromBasename('Project Plan 2026')).toBe('Project Plan 2026');
    });

    it('should fallback gracefully when basename is only a date or empty', () => {
      expect(extractCleanTitleFromBasename('2026-09-05')).toBe('2026-09-05');
      expect(extractCleanTitleFromBasename('')).toBe('Untitled Event');
    });
  });

  describe('basenameFromEvent', () => {
    it('should generate expected basename for single events', () => {
      const event: OFCEvent = {
        title: 'Single Event',
        type: 'single',
        date: '2026-05-20',
        endDate: null,
        allDay: true
      };
      expect(basenameFromEvent(event, {})).toBe('2026-05-20 Single Event');
    });

    it('should generate expected basename for day-of-week recurring events', () => {
      const event: OFCEvent = {
        title: 'Weekly Standup',
        type: 'recurring',
        daysOfWeek: ['M', 'W'],
        endDate: null,
        skipDates: [],
        allDay: false,
        startTime: '09:00',
        endTime: null
      };
      expect(basenameFromEvent(event, {})).toBe('(Every M,W) Weekly Standup');
    });

    it('should generate expected basename for monthly recurring events', () => {
      const event: OFCEvent = {
        title: 'Rent Payment',
        type: 'recurring',
        dayOfMonth: 1,
        endDate: null,
        skipDates: [],
        allDay: true
      };
      expect(basenameFromEvent(event, {})).toBe('(Every month on the 1) Rent Payment');
    });

    it('should generate expected basename for yearly recurring events', () => {
      const event: OFCEvent = {
        title: 'Birthday',
        type: 'recurring',
        month: 5,
        dayOfMonth: 20,
        endDate: null,
        skipDates: [],
        allDay: true
      };
      expect(basenameFromEvent(event, {})).toBe('(Every year on May 20) Birthday');
    });
  });

  describe('filenameForEvent', () => {
    it('should append .md extension', () => {
      const event: OFCEvent = {
        title: 'Event',
        type: 'single',
        date: '2026-05-20',
        endDate: null,
        allDay: true
      };
      expect(filenameForEvent(event, {})).toBe('2026-05-20 Event.md');
    });
  });

  describe('serializeFrontmatter', () => {
    it('should serialize simple key value pairs and skip null/undefined values', () => {
      const fields = {
        'fc-event-uid': '12345',
        'fc-calendar-id': 'cal-1',
        empty: null,
        missing: undefined,
        active: true
      };
      const yaml = serializeFrontmatter(fields);
      expect(yaml).toBe('fc-event-uid: "12345"\nfc-calendar-id: "cal-1"\nactive: true');
    });

    it('should quote and escape string values so identifiers stay strings', () => {
      const yaml = serializeFrontmatter({
        'fc-event-uid': '12345',
        title: 'Quote "heavy" task',
        path: 'Folder\\Note'
      });

      expect(yaml).toBe(
        'fc-event-uid: "12345"\ntitle: "Quote \\"heavy\\" task"\npath: "Folder\\\\Note"'
      );
    });
  });

  describe('findUniquePath', () => {
    it('should return base path if no file exists', () => {
      const mockApp = {
        getAbstractFileByPath: jest.fn().mockReturnValue(null)
      } as unknown as ObsidianInterface;

      const path = findUniquePath(mockApp, 'Folder', 'Note');
      expect(path).toBe('Folder/Note.md');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockApp.getAbstractFileByPath).toHaveBeenCalledWith('Folder/Note.md');
    });

    it('should append sequential suffix if collision occurs', () => {
      const mockApp = {
        getAbstractFileByPath: jest.fn().mockImplementation((path: string) => {
          if (path === 'Folder/Note.md' || path === 'Folder/Note-_-_-1.md') {
            return {}; // Suffix collisions
          }
          return null; // Unique path found
        })
      } as unknown as ObsidianInterface;

      const path = findUniquePath(mockApp, 'Folder', 'Note');
      expect(path).toBe('Folder/Note-_-_-2.md');
    });
  });

  describe('waitForFileAtPath', () => {
    it('should return file once it is found by getFileByPath', async () => {
      // eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast
      const mockFile = { path: 'Folder/File.md' } as unknown as TFile;
      const mockApp = {
        getFileByPath: jest.fn().mockReturnValue(mockFile)
      } as unknown as ObsidianInterface;

      const file = await waitForFileAtPath(mockApp, 'Folder/File.md', 5, 2);
      expect(file).toBe(mockFile);
    });

    it('should return null if file is never found', async () => {
      const mockApp = {
        getFileByPath: jest.fn().mockReturnValue(null)
      } as unknown as ObsidianInterface;

      const file = await waitForFileAtPath(mockApp, 'Folder/File.md', 3, 2);
      expect(file).toBeNull();
    });
  });

  describe('waitForMetadataWithTimeout', () => {
    it('should return metadata immediately if it exists in cache', async () => {
      const mockMeta = { frontmatter: {} } as CachedMetadata;
      // eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast
      const mockFile = {} as unknown as TFile;
      const mockApp = {
        getMetadata: jest.fn().mockReturnValue(mockMeta)
      } as unknown as ObsidianInterface;

      const meta = await waitForMetadataWithTimeout(mockApp, mockFile);
      expect(meta).toBe(mockMeta);
    });

    it('should wait for metadata promise and return it', async () => {
      const mockMeta = { frontmatter: {} } as CachedMetadata;
      // eslint-disable-next-line obsidianmd/no-tfile-tfolder-cast
      const mockFile = {} as unknown as TFile;
      const mockApp = {
        getMetadata: jest.fn().mockReturnValue(null),
        waitForMetadata: jest.fn().mockResolvedValue(mockMeta)
      } as unknown as ObsidianInterface;

      const meta = await waitForMetadataWithTimeout(mockApp, mockFile);
      expect(meta).toBe(mockMeta);
    });
  });

  describe('replaceFrontmatter formatting', () => {
    it('should add a newline after the closing separator when contents have no leading newline', () => {
      const page = '# Heading\nContent goes here';
      const yaml = 'key: value';
      const result = replaceFrontmatter(page, yaml);
      expect(result).toBe('---\nkey: value\n---\n# Heading\nContent goes here');
    });

    it('should not duplicate the separator newline when contents already start with a newline', () => {
      const page = '\n# Heading\nContent goes here';
      const yaml = 'key: value';
      const result = replaceFrontmatter(page, yaml);
      expect(result).toBe('---\nkey: value\n---\n# Heading\nContent goes here');
    });

    it('should collapse repeated blank lines between frontmatter and contents', () => {
      const page = '---\nkey: old\n---\n\n\n# Heading\nContent goes here';
      const yaml = 'key: value';
      const result = replaceFrontmatter(page, yaml);
      expect(result).toBe('---\nkey: value\n---\n# Heading\nContent goes here');
    });

    it('should handle empty contents without error', () => {
      const page = '';
      const yaml = 'key: value';
      const result = replaceFrontmatter(page, yaml);
      expect(result).toBe('---\nkey: value\n---\n');
    });
  });
});
