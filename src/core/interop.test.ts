/**
 * @file interop.test.ts
 * @brief Tests for interop module, focusing on timezone-aware event conversion.
 *
 * @description
 * This test suite validates the toEventInput function's handling of:
 * - Single events with timezone conversion
 * - Recurring events with RRULE + DTSTART + EXDATE generation
 * - rrule events (ICS/Google Calendar style) with SOURCE timezone preservation
 * - DST boundary edge cases for all event types
 * - Cross-timezone DTSTART and EXDATE consistency
 *
 * Architecture note: For `rrule` type events, DTSTART uses the SOURCE timezone
 * (not the display timezone). The display-time shifting is handled by the
 * monkeypatched rrule expand function at render time.
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { EventApi } from '@fullcalendar/core';
import { toEventInput, fromEventApi } from './interop';
import { OFCEvent } from '../types';
import { FullCalendarSettings, DEFAULT_SETTINGS } from '../types/settings';

jest.mock(
  'obsidian',
  () => ({
    Notice: class {
      constructor() {}
    }
  }),
  { virtual: true }
);

// Mock the view module for category colors
jest.mock('../ui/view', () => ({
  getCalendarColors: (color: string) => ({ color, textColor: '#ffffff' })
}));

// ============================================================================
// Helper: extract EXDATE values from the rrule string
// ============================================================================
function extractExdates(rruleStr: string): string[] {
  return rruleStr
    .split('\n')
    .filter(line => line.startsWith('EXDATE'))
    .map(line => line.trim());
}

// ============================================================================
// SECTION 1: Basic event conversion
// ============================================================================
describe('interop toEventInput tests', () => {
  const baseSettings: FullCalendarSettings = {
    ...DEFAULT_SETTINGS,
    displayTimezone: 'Europe/Budapest'
  };

  describe('Single event conversion', () => {
    it('should convert a simple single event to EventInput', () => {
      const event = {
        type: 'single',
        title: 'Test Event',
        date: '2025-06-15',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        endDate: null
      } as OFCEvent;

      const result = toEventInput('test-id', event, baseSettings);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('test-id');
      expect(result!.title).toBe('Test Event');
      expect(result!.allDay).toBe(false);
    });

    it('should preserve duplicate suffix token in converted title', () => {
      const event = {
        type: 'single',
        title: 'Sleep Event-_-_-2',
        date: '2026-04-07',
        startTime: '00:45',
        endTime: '08:00',
        allDay: false,
        endDate: null
      } as OFCEvent;

      const result = toEventInput('dup-id', event, baseSettings);

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Sleep Event-_-_-2');
    });

    it('should preserve location through the FullCalendar interaction model', () => {
      const event = {
        type: 'single',
        title: 'Located Event',
        location: 'Conference Room B',
        date: '2026-08-21',
        allDay: true,
        endDate: null
      } as OFCEvent;

      const rendered = toEventInput('located-id', event, baseSettings);
      expect(rendered?.extendedProps?.location).toBe('Conference Room B');

      const eventApi = {
        id: 'located-id',
        title: 'Located Event',
        allDay: true,
        start: new Date('2026-08-21T00:00:00.000Z'),
        end: new Date('2026-08-22T00:00:00.000Z'),
        startStr: '2026-08-21',
        endStr: '2026-08-22',
        extendedProps: rendered?.extendedProps
      } as unknown as EventApi;

      expect(fromEventApi(eventApi, baseSettings).location).toBe('Conference Room B');
    });

    it('should handle all-day single events', () => {
      const event = {
        type: 'single',
        title: 'All Day',
        date: '2025-06-15',
        allDay: true,
        endDate: null
      } as OFCEvent;

      const result = toEventInput('test-id', event, baseSettings);

      expect(result).not.toBeNull();
      expect(result!.allDay).toBe(true);
    });

    it('should round-trip all-day date-only without timezone shift', () => {
      const settings: FullCalendarSettings = {
        ...DEFAULT_SETTINGS,
        displayTimezone: 'America/New_York'
      };

      const eventApi = {
        id: 'all-day-1',
        title: 'All Day',
        allDay: true,
        start: new Date('2026-03-09T00:00:00.000Z'),
        end: new Date('2026-03-10T00:00:00.000Z'),
        startStr: '2026-03-09',
        endStr: '2026-03-10',
        extendedProps: {
          cleanTitle: 'All Day',
          uid: 'uid-123',
          sourceTimezone: 'America/New_York'
        }
      } as unknown as EventApi;

      const result = fromEventApi(eventApi, settings);

      expect(result.type).toBe('single');
      const single = result as Extract<OFCEvent, { type: 'single' }>;

      expect(single.allDay).toBe(true);
      expect(single.date).toBe('2026-03-09');
      expect(single.endDate).toBeNull();
      expect(single.timezone).toBeUndefined();
    });

    it('should fallback to one-hour duration when timed EventApi end is null', () => {
      const settings: FullCalendarSettings = {
        ...DEFAULT_SETTINGS,
        displayTimezone: 'UTC'
      };

      const eventApi = {
        id: 'timed-null-end-1',
        title: 'Timed Null End',
        allDay: false,
        start: new Date('2026-05-10T09:00:00.000Z'),
        end: null,
        extendedProps: {
          cleanTitle: 'Timed Null End',
          uid: 'uid-timed-null-end',
          sourceTimezone: 'UTC'
        }
      } as unknown as EventApi;

      const result = fromEventApi(eventApi, settings);
      expect(result.allDay).toBe(false);
      const timed = result as Extract<OFCEvent, { allDay: false }>;
      expect(timed.startTime).toBe('09:00');
      expect(timed.endTime).toBe('10:00');
    });
  });

  // ==========================================================================
  // SECTION 2: Recurring event RRULE generation
  // ==========================================================================
  describe('Recurring event RRULE generation', () => {
    it('should generate weekly RRULE with TZID', () => {
      const event = {
        type: 'recurring',
        title: 'Weekly Meeting',
        startRecur: '2025-01-06',
        startTime: '10:00',
        endTime: '11:00',
        daysOfWeek: ['M', 'W', 'F'],
        allDay: false,
        timezone: 'Europe/Prague'
      } as OFCEvent;

      const result = toEventInput('weekly-id', event, baseSettings);

      expect(result).not.toBeNull();
      expect(result!.rrule).toBeDefined();

      const rrule = result!.rrule as string;
      // Recurring events use display timezone for DTSTART
      expect(rrule).toContain('DTSTART;TZID=');
      expect(rrule).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR');
    });

    it('should generate monthly by day RRULE', () => {
      const event = {
        type: 'recurring',
        title: 'Monthly Payment',
        startRecur: '2025-01-15',
        startTime: '09:00',
        endTime: '09:30',
        dayOfMonth: 15,
        allDay: false,
        timezone: 'Europe/Prague'
      } as OFCEvent;

      const result = toEventInput('monthly-id', event, baseSettings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;
      expect(rrule).toContain('RRULE:FREQ=MONTHLY;BYMONTHDAY=15');
    });

    it('should include EXDATE for skipDates', () => {
      const event = {
        type: 'recurring',
        title: 'With Exceptions',
        startRecur: '2025-01-06',
        startTime: '10:00',
        endTime: '11:00',
        daysOfWeek: ['M'],
        skipDates: ['2025-01-13', '2025-01-20'],
        allDay: false,
        timezone: 'Europe/Prague'
      } as OFCEvent;

      const result = toEventInput('exceptions-id', event, baseSettings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;
      const exdates = extractExdates(rrule);
      expect(exdates).toHaveLength(2);
      expect(exdates[0]).toContain('20250113');
      expect(exdates[1]).toContain('20250120');
    });

    it('should handle repeat interval', () => {
      const event = {
        type: 'recurring',
        title: 'Bi-weekly',
        startRecur: '2025-01-06',
        startTime: '10:00',
        endTime: '11:00',
        daysOfWeek: ['M'],
        repeatInterval: 2,
        allDay: false,
        timezone: 'Europe/Prague'
      } as OFCEvent;

      const result = toEventInput('biweekly-id', event, baseSettings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;
      expect(rrule).toContain('INTERVAL=2');
    });
  });

  // ==========================================================================
  // SECTION 3: rrule type events (Google Calendar / ICS style)
  //
  // KEY ARCHITECTURE: rrule events use SOURCE timezone in DTSTART, not display.
  // The monkeypatched expand function handles source→display conversion at render.
  // ==========================================================================
  describe('rrule type event conversion (Google Calendar style)', () => {
    it('should use SOURCE timezone in DTSTART (not display timezone)', () => {
      const event = {
        type: 'rrule',
        title: 'Football',
        rrule: 'FREQ=WEEKLY;BYDAY=TH',
        startDate: '2025-10-02',
        startTime: '08:00',
        endTime: '09:30',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: [],
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...baseSettings,
        displayTimezone: 'Europe/Budapest'
      };

      const result = toEventInput('football-id', event, settings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;

      // DTSTART must use the SOURCE timezone (Europe/Prague), not display (Europe/Budapest)
      expect(rrule).toContain('DTSTART;TZID=Europe/Prague');
      // Time is NOT converted — stays at source time
      expect(rrule).toContain('T080000');
    });

    it('should calculate correct duration for timed events', () => {
      const event = {
        type: 'rrule',
        title: 'Long Meeting',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        startDate: '2025-01-06',
        startTime: '09:00',
        endTime: '17:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: [],
        endDate: null
      } as OFCEvent;

      const result = toEventInput('long-id', event, baseSettings);

      expect(result).not.toBeNull();
      expect(result!.duration).toBeDefined();
      expect(result!.duration).toBe('08:00');
    });

    it('should handle events crossing midnight', () => {
      const event = {
        type: 'rrule',
        title: 'Night Shift',
        rrule: 'FREQ=WEEKLY;BYDAY=FR',
        startDate: '2025-01-03',
        startTime: '22:00',
        endTime: '06:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: [],
        endDate: null
      } as OFCEvent;

      const result = toEventInput('night-id', event, baseSettings);

      expect(result).not.toBeNull();
      expect(result!.duration).toBe('08:00');
    });

    it('should preserve source timezone even when very different from display', () => {
      const event = {
        type: 'rrule',
        title: 'Tokyo Event',
        rrule: 'FREQ=DAILY',
        startDate: '2025-06-15',
        startTime: '08:00',
        endTime: '09:00',
        allDay: false,
        timezone: 'Asia/Tokyo',
        skipDates: [],
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...baseSettings,
        displayTimezone: 'Europe/Prague'
      };

      const result = toEventInput('tokyo-id', event, settings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;

      // Source timezone preserved — Tokyo, NOT Prague
      expect(rrule).toContain('DTSTART;TZID=Asia/Tokyo');
      // Time is NOT converted — stays at 08:00 (the source local time)
      expect(rrule).toContain('T080000');
    });

    it('should set sourceTimezone in extendedProps', () => {
      const event = {
        type: 'rrule',
        title: 'Test',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        startDate: '2025-01-06',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        timezone: 'Europe/Bucharest',
        skipDates: [],
        endDate: null
      } as OFCEvent;

      const result = toEventInput('src-tz-id', event, baseSettings);

      expect(result).not.toBeNull();
      expect((result!.extendedProps as Record<string, unknown>).sourceTimezone).toBe(
        'Europe/Bucharest'
      );
    });
  });

  // ==========================================================================
  // SECTION 4: EXDATE handling for rrule events (embedded in rrule string)
  // ==========================================================================
  describe('rrule type events — EXDATE handling', () => {
    it('should embed EXDATEs with source timezone in the rrule string', () => {
      const event = {
        type: 'rrule',
        title: 'Weekly Event',
        rrule: 'FREQ=WEEKLY;BYDAY=TH',
        startDate: '2025-10-02',
        startTime: '08:00',
        endTime: '09:00',
        allDay: false,
        timezone: 'Europe/Budapest',
        skipDates: ['2025-11-13', '2025-11-20'],
        endDate: null
      } as OFCEvent;

      const result = toEventInput('exdate-test-id', event, baseSettings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;
      const exdates = extractExdates(rrule);

      expect(exdates).toHaveLength(2);
      // EXDATEs use source timezone and include the start time
      expect(exdates[0]).toContain('TZID=Europe/Budapest');
      expect(exdates[0]).toContain('20251113T080000');
      expect(exdates[1]).toContain('20251120T080000');
    });

    it('should use source timezone for EXDATEs when source differs from display', () => {
      const event = {
        type: 'rrule',
        title: 'Football',
        rrule: 'FREQ=WEEKLY;BYDAY=TH',
        startDate: '2025-10-02',
        startTime: '08:00',
        endTime: '09:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: ['2025-11-13', '2025-11-20', '2025-11-27'],
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...baseSettings,
        displayTimezone: 'Europe/Budapest'
      };

      const result = toEventInput('football-id', event, settings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;
      const exdates = extractExdates(rrule);

      expect(exdates).toHaveLength(3);
      // EXDATEs should use SOURCE timezone (Prague), NOT display (Budapest)
      exdates.forEach(exdate => {
        expect(exdate).toContain('TZID=Europe/Prague');
        expect(exdate).toContain('T080000');
      });
    });

    it('should handle empty skipDates array', () => {
      const event = {
        type: 'rrule',
        title: 'No Skips',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        startDate: '2025-01-06',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: [],
        endDate: null
      } as unknown as OFCEvent;

      const result = toEventInput('no-skips-id', event, baseSettings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;
      const exdates = extractExdates(rrule);
      expect(exdates).toHaveLength(0);
    });

    it('should handle event time at midnight with EXDATEs', () => {
      const event = {
        type: 'rrule',
        title: 'Midnight Event',
        rrule: 'FREQ=WEEKLY;BYDAY=SA',
        startDate: '2025-01-04',
        startTime: '00:00',
        endTime: '01:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: ['2025-01-11'],
        endDate: null
      } as unknown as OFCEvent;

      const result = toEventInput('midnight-id', event, baseSettings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;
      const exdates = extractExdates(rrule);
      expect(exdates).toHaveLength(1);
      expect(exdates[0]).toContain('20250111T000000');
    });

    it('should handle late-night event with EXDATEs', () => {
      const event = {
        type: 'rrule',
        title: 'Late Night Event',
        rrule: 'FREQ=WEEKLY;BYDAY=FR',
        startDate: '2025-01-03',
        startTime: '23:30',
        endTime: '00:30',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: ['2025-01-10'],
        endDate: null
      } as unknown as OFCEvent;

      const result = toEventInput('late-night-id', event, baseSettings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;
      const exdates = extractExdates(rrule);
      expect(exdates).toHaveLength(1);
      expect(exdates[0]).toContain('20250110T233000');
    });

    it('should handle many skipDates', () => {
      const skipDates = Array.from({ length: 52 }, (_, i) => {
        const date = DateTime.fromISO('2025-01-06').plus({ weeks: i });
        return date.toISODate()!;
      });

      const event = {
        type: 'rrule',
        title: 'Many Skips',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        startDate: '2025-01-06',
        startTime: '09:00',
        endTime: '10:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: skipDates,
        endDate: null
      } as unknown as OFCEvent;

      const result = toEventInput('many-skips-id', event, baseSettings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;
      const exdates = extractExdates(rrule);
      expect(exdates).toHaveLength(52);

      // All EXDATEs should include T090000
      exdates.forEach(exdate => {
        expect(exdate).toContain('T090000');
      });
    });
  });

  // ==========================================================================
  // SECTION 5: Category and extended properties
  // ==========================================================================
  describe('Category and extended properties', () => {
    it('should apply category coloring when enabled', () => {
      const event = {
        type: 'single',
        title: 'Categorized Event',
        date: '2025-06-15',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        category: 'Work',
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...baseSettings,
        enableAdvancedCategorization: true,
        categorySettings: [{ name: 'Work', color: '#ff0000' }]
      };

      const result = toEventInput('cat-id', event, settings);

      expect(result).not.toBeNull();
      expect(result!.color).toBe('#ff0000');
    });

    it('should include extended properties', () => {
      const event = {
        type: 'single',
        title: 'Full Event',
        date: '2025-06-15',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        uid: 'unique-123',
        category: 'Work',
        subCategory: 'Meeting',
        endDate: null
      } as OFCEvent;

      const result = toEventInput('full-id', event, baseSettings);

      expect(result).not.toBeNull();
      expect(result!.extendedProps).toEqual(
        expect.objectContaining({
          uid: 'unique-123',
          category: 'Work',
          subCategory: 'Meeting',
          isShadow: false
        })
      );
    });
  });
});

// ============================================================================
// SECTION 6: DST edge cases in RRULE generation
// ============================================================================
describe('DST edge cases in RRULE generation', () => {
  const baseSettings: FullCalendarSettings = {
    ...DEFAULT_SETTINGS,
    displayTimezone: 'Europe/Prague'
  };

  it('should maintain local time in RRULE across DST change (recurring)', () => {
    const event = {
      type: 'recurring',
      title: 'Football Practice',
      startRecur: '2025-10-01',
      endRecur: '2025-11-30',
      startTime: '08:00',
      endTime: '09:30',
      daysOfWeek: ['T', 'R'],
      allDay: false,
      timezone: 'Europe/Prague'
    } as OFCEvent;

    const result = toEventInput('dst-football-id', event, baseSettings);

    expect(result).not.toBeNull();
    const rrule = result!.rrule as string;

    expect(rrule).toContain('DTSTART;TZID=Europe/Prague');
    expect(rrule).toContain('T080000');
  });

  it('should handle US timezone with different DST dates (recurring)', () => {
    const event = {
      type: 'recurring',
      title: 'US Meeting',
      startRecur: '2025-03-01',
      startTime: '09:00',
      endTime: '10:00',
      daysOfWeek: ['M', 'W', 'F'],
      allDay: false,
      timezone: 'America/New_York'
    } as OFCEvent;

    const settings: FullCalendarSettings = {
      ...DEFAULT_SETTINGS,
      displayTimezone: 'America/New_York'
    };

    const result = toEventInput('us-meeting-id', event, settings);

    expect(result).not.toBeNull();
    const rrule = result!.rrule as string;

    expect(rrule).toContain('TZID=America/New_York');
    expect(rrule).toContain('T090000');
  });
});

// ============================================================================
// SECTION 7: Comprehensive DST boundary tests for rrule-type events
// ============================================================================
describe('rrule-type events: DST boundary robustness', () => {
  // EU DST ends Oct 26, 2025 (clocks go BACK, CEST→CET, UTC+2→UTC+1)
  // EU DST starts Mar 30, 2025 (clocks go FORWARD, CET→CEST, UTC+1→UTC+2)
  // US DST starts Mar 9, 2025 (clocks spring forward, EST→EDT, UTC-5→UTC-4)
  // US DST ends Nov 2, 2025 (clocks fall back, EDT→EST, UTC-4→UTC-5)

  describe('European DST transitions', () => {
    it('should keep DTSTART time unchanged across EU DST end (rrule event)', () => {
      // Event at 10:00 Prague, spanning the Oct 26 DST transition
      const event = {
        type: 'rrule',
        title: 'Weekly Review',
        rrule: 'FREQ=WEEKLY;BYDAY=TH',
        startDate: '2025-10-02', // Before DST ends (CEST, UTC+2)
        startTime: '10:00',
        endTime: '11:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: [],
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...DEFAULT_SETTINGS,
        displayTimezone: 'Europe/Prague'
      };

      const result = toEventInput('dst-review-id', event, settings);
      const rrule = result!.rrule as string;

      // DTSTART time is 10:00 — same local time regardless of DST state
      expect(rrule).toContain('DTSTART;TZID=Europe/Prague:20251002T100000');
    });

    it('should keep EXDATE times consistent across EU DST boundary', () => {
      // Skip dates that span the Oct 26 DST transition
      const event = {
        type: 'rrule',
        title: 'Training',
        rrule: 'FREQ=WEEKLY;BYDAY=TH',
        startDate: '2025-10-02',
        startTime: '08:00',
        endTime: '09:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: [
          '2025-10-23', // Before DST ends (CEST)
          '2025-10-30', // After DST ends (CET)
          '2025-11-06',
          '2025-11-13',
          '2025-11-20'
        ],
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...DEFAULT_SETTINGS,
        displayTimezone: 'Europe/Prague'
      };

      const result = toEventInput('training-id', event, settings);
      const rrule = result!.rrule as string;
      const exdates = extractExdates(rrule);

      // All EXDATEs should use 08:00 local time — DST state doesn't matter
      expect(exdates).toHaveLength(5);
      exdates.forEach(exdate => {
        expect(exdate).toContain('T080000');
        expect(exdate).toContain('TZID=Europe/Prague');
      });
    });

    it('should handle EU spring forward (rrule event)', () => {
      // Event starts in winter (CET), occurs through spring forward (CEST)
      const event = {
        type: 'rrule',
        title: 'Morning Standup',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        startDate: '2025-03-24', // Before spring forward (Mar 30)
        startTime: '09:00',
        endTime: '09:30',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: ['2025-03-31'], // First Monday after spring forward
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...DEFAULT_SETTINGS,
        displayTimezone: 'Europe/Prague'
      };

      const result = toEventInput('spring-standup-id', event, settings);
      const rrule = result!.rrule as string;

      // DTSTART keeps the same local time
      expect(rrule).toContain('DTSTART;TZID=Europe/Prague:20250324T090000');
      // EXDATE after DST also uses 09:00 local time
      const exdates = extractExdates(rrule);
      expect(exdates[0]).toContain('20250331T090000');
    });
  });

  describe('US DST transitions', () => {
    it('should keep DTSTART time unchanged across US spring forward (rrule event)', () => {
      // US DST starts Mar 9, 2025
      const event = {
        type: 'rrule',
        title: 'Morning Standup',
        rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
        startDate: '2025-03-03', // Before spring forward
        startTime: '09:00',
        endTime: '09:30',
        allDay: false,
        timezone: 'America/New_York',
        skipDates: ['2025-03-07', '2025-03-10', '2025-03-14'],
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...DEFAULT_SETTINGS,
        displayTimezone: 'America/New_York'
      };

      const result = toEventInput('us-standup-id', event, settings);
      const rrule = result!.rrule as string;
      const exdates = extractExdates(rrule);

      // All EXDATEs should be at 09:00 local (both EST and EDT)
      expect(exdates).toHaveLength(3);
      exdates.forEach(exdate => {
        expect(exdate).toContain('T090000');
      });
    });

    it('should keep DTSTART time unchanged across US fall back (rrule event)', () => {
      // US DST ends Nov 2, 2025
      const event = {
        type: 'rrule',
        title: 'Weekly Sync',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        startDate: '2025-10-27', // Before fall back
        startTime: '14:00',
        endTime: '15:00',
        allDay: false,
        timezone: 'America/New_York',
        skipDates: ['2025-11-03'], // First Monday after fall back
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...DEFAULT_SETTINGS,
        displayTimezone: 'America/New_York'
      };

      const result = toEventInput('us-sync-id', event, settings);
      const rrule = result!.rrule as string;

      expect(rrule).toContain('DTSTART;TZID=America/New_York:20251027T140000');
      const exdates = extractExdates(rrule);
      // After fall back, still 14:00 local
      expect(exdates[0]).toContain('20251103T140000');
    });
  });

  describe('Cross-timezone DTSTART/EXDATE for rrule events', () => {
    it('should preserve source timezone even with large offset difference (Tokyo→NY)', () => {
      // 08:00 Tokyo (UTC+9), displayed in New York (UTC-5/UTC-4)
      const event = {
        type: 'rrule',
        title: 'Tokyo Call',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        startDate: '2025-01-06',
        startTime: '08:00',
        endTime: '09:00',
        allDay: false,
        timezone: 'Asia/Tokyo',
        skipDates: ['2025-01-13', '2025-01-20'],
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...DEFAULT_SETTINGS,
        displayTimezone: 'America/New_York'
      };

      const result = toEventInput('tokyo-call-id', event, settings);

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;

      // DTSTART uses source timezone (Tokyo), NOT display (New York)
      expect(rrule).toContain('DTSTART;TZID=Asia/Tokyo:20250106T080000');

      // EXDATEs also use source timezone
      const exdates = extractExdates(rrule);
      expect(exdates).toHaveLength(2);
      exdates.forEach(exdate => {
        expect(exdate).toContain('TZID=Asia/Tokyo');
        expect(exdate).toContain('T080000');
      });
    });

    it('should preserve source timezone for same-offset different zones (Prague→Budapest)', () => {
      // Prague and Budapest are in the SAME offset, but different IANA zone names
      const event = {
        type: 'rrule',
        title: 'Cross-border Meeting',
        rrule: 'FREQ=WEEKLY;BYDAY=WE',
        startDate: '2025-06-04',
        startTime: '14:00',
        endTime: '15:00',
        allDay: false,
        timezone: 'Europe/Prague',
        skipDates: ['2025-06-11'],
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...DEFAULT_SETTINGS,
        displayTimezone: 'Europe/Budapest'
      };

      const result = toEventInput('cross-border-id', event, settings);
      const rrule = result!.rrule as string;

      // Must keep Prague (source), NOT use Budapest (display)
      expect(rrule).toContain('DTSTART;TZID=Europe/Prague:20250604T140000');
      const exdates = extractExdates(rrule);
      expect(exdates[0]).toContain('TZID=Europe/Prague');
    });

    it('should handle event with no source timezone (falls back to system TZ)', () => {
      const event = {
        type: 'rrule',
        title: 'Local Event',
        rrule: 'FREQ=DAILY',
        startDate: '2025-01-01',
        startTime: '09:00',
        endTime: '10:00',
        allDay: false,
        // No timezone property! Should fall back to system TZ
        skipDates: [],
        endDate: null
      } as OFCEvent;

      const result = toEventInput('local-id', event, {
        ...DEFAULT_SETTINGS,
        displayTimezone: 'Europe/Budapest'
      });

      expect(result).not.toBeNull();
      const rrule = result!.rrule as string;
      // Should use system timezone (we can't predict the exact zone, but it should exist)
      expect(rrule).toContain('DTSTART;TZID=');
      expect(rrule).toContain('T090000');
    });
  });

  describe('No-DST timezone validation', () => {
    it('should handle Japan timezone (no DST ever) correctly', () => {
      const event = {
        type: 'rrule',
        title: 'Tokyo Standup',
        rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
        startDate: '2025-01-06',
        startTime: '09:00',
        endTime: '09:15',
        allDay: false,
        timezone: 'Asia/Tokyo',
        skipDates: ['2025-06-16', '2025-12-22'], // Summer and winter dates
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...DEFAULT_SETTINGS,
        displayTimezone: 'Asia/Tokyo'
      };

      const result = toEventInput('tokyo-standup-id', event, settings);
      const rrule = result!.rrule as string;

      expect(rrule).toContain('DTSTART;TZID=Asia/Tokyo:20250106T090000');

      const exdates = extractExdates(rrule);
      // Both summer and winter dates should use 09:00
      exdates.forEach(exdate => {
        expect(exdate).toContain('T090000');
        expect(exdate).toContain('TZID=Asia/Tokyo');
      });
    });

    it('should handle UTC (no DST) correctly', () => {
      const event = {
        type: 'rrule',
        title: 'UTC Event',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        startDate: '2025-01-06',
        startTime: '12:00',
        endTime: '13:00',
        allDay: false,
        timezone: 'UTC',
        skipDates: ['2025-06-16'], // Summer date
        endDate: null
      } as OFCEvent;

      const settings: FullCalendarSettings = {
        ...DEFAULT_SETTINGS,
        displayTimezone: 'UTC'
      };

      const result = toEventInput('utc-id', event, settings);
      const rrule = result!.rrule as string;

      expect(rrule).toContain('DTSTART;TZID=UTC:20250106T120000');
      const exdates = extractExdates(rrule);
      expect(exdates[0]).toContain('T120000');
    });
  });
});
