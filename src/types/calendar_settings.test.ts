/**
 * @file calendar_settings.test.ts
 * @brief Test suite for calendar_settings functions
 * @description Tests for ID generation and validation to prevent regressions
 */

import { generateCalendarId, parseCalendarInfo } from './calendar_settings';

describe('calendar_settings', () => {
  describe('generateCalendarId', () => {
    it('should generate first ID when no existing IDs', () => {
      const id = generateCalendarId('local', []);
      expect(id).toBe('local_1');
    });

    it('should generate second ID when first exists', () => {
      const id = generateCalendarId('local', ['local_1']);
      expect(id).toBe('local_2');
    });

    it('should generate next ID in sequence when multiple exist', () => {
      const id = generateCalendarId('local', ['local_1', 'local_2', 'local_3']);
      expect(id).toBe('local_4');
    });

    it('should not be affected by IDs of different types', () => {
      const id = generateCalendarId('local', ['local_1', 'caldav_1', 'caldav_2', 'ical_1']);
      expect(id).toBe('local_2');
    });

    it('should handle mixed ordering of IDs', () => {
      const id = generateCalendarId('local', ['local_3', 'local_1', 'local_2']);
      expect(id).toBe('local_4');
    });

    it('should skip malformed IDs and use valid ones only', () => {
      const id = generateCalendarId('local', ['local_', 'local_abc', 'local_1', 'local_2']);
      expect(id).toBe('local_3');
    });

    it('should handle IDs with extra underscores gracefully', () => {
      const id = generateCalendarId('local', ['local_1', 'local_1_extra', 'local_2']);
      expect(id).toBe('local_3');
    });

    it('should not duplicate IDs when called multiple times with same input', () => {
      const existingIds: string[] = ['local_1', 'local_2'];
      const id1 = generateCalendarId('local', existingIds);
      const id2 = generateCalendarId('local', existingIds);

      expect(id1).toBe('local_3');
      expect(id2).toBe('local_3');
    });

    it('should increment correctly when IDs are added to the list', () => {
      const existingIds: string[] = ['local_1'];

      const id1 = generateCalendarId('local', existingIds);
      existingIds.push(id1);

      const id2 = generateCalendarId('local', existingIds);
      existingIds.push(id2);

      const id3 = generateCalendarId('local', existingIds);

      expect(id1).toBe('local_2');
      expect(id2).toBe('local_3');
      expect(id3).toBe('local_4');
    });

    it('should handle caldav type correctly', () => {
      const id = generateCalendarId('caldav', ['caldav_1', 'caldav_2']);
      expect(id).toBe('caldav_3');
    });

    it('should handle ical type correctly', () => {
      const id = generateCalendarId('ical', ['ical_5']);
      expect(id).toBe('ical_6');
    });

    it('should handle google type correctly', () => {
      const id = generateCalendarId('google', []);
      expect(id).toBe('google_1');
    });

    it('should handle empty string IDs without crashing', () => {
      const id = generateCalendarId('local', ['', 'local_1', '']);
      expect(id).toBe('local_2');
    });

    it('should handle IDs with numbers in type prefix', () => {
      const id = generateCalendarId('local', ['local123_1', 'local_1']);
      expect(id).toBe('local_2');
    });

    /**
     * Race condition test: Simulates rapid additions where multiple calls
     * use the same initial state before updates are persisted
     */
    it('should handle race condition when multiple calls use same state', () => {
      const initialState = ['local_1'];

      // Simulate two rapid calls before settings are updated
      const id1 = generateCalendarId('local', initialState);
      const id2 = generateCalendarId('local', initialState);

      // Both should generate the same ID from the same state
      // (This is expected behavior - the deduplication happens at a higher level)
      expect(id1).toBe('local_2');
      expect(id2).toBe('local_2');
    });

    it('should prevent duplicate when combined with both settings and registry IDs', () => {
      // Simulates the fix in SettingsTab.tsx where we combine IDs
      const settingsIds = ['local_1', 'caldav_1'];
      const registryIds = ['local_2', 'ical_1']; // local_2 added to registry before settings updated
      const allIds = Array.from(new Set([...settingsIds, ...registryIds]));

      const id = generateCalendarId('local', allIds);

      // Should correctly identify local_2 as already in use
      expect(id).toBe('local_3');
      expect(allIds).toContain('local_2');
    });
  });

  describe('parseCalendarInfo schema validation', () => {
    it('should validate ical source with local vault file path', () => {
      const parsed = parseCalendarInfo({
        type: 'ical',
        id: 'ical_1',
        name: 'Local Vault ICS',
        url: 'Calendars/my-calendar.ics',
        color: '#ff0000'
      });

      expect(parsed.type).toBe('ical');
      if (parsed.type === 'ical') {
        expect(parsed.url).toBe('Calendars/my-calendar.ics');
      }
    });

    it('should validate ical source with remote http/https/webcal URLs', () => {
      const httpsParsed = parseCalendarInfo({
        type: 'ical',
        id: 'ical_1',
        name: 'Remote ICS',
        url: 'https://calendar.google.com/calendar/ical/basic.ics',
        color: '#00ff00'
      });
      expect(httpsParsed.type).toBe('ical');

      const webcalParsed = parseCalendarInfo({
        type: 'ical',
        id: 'ical_2',
        name: 'Webcal ICS',
        url: 'webcal://example.com/feed.ics',
        color: '#0000ff'
      });
      expect(webcalParsed.type).toBe('ical');
    });

    it('should validate local source with taskCompletionStyle', () => {
      const parsedDatetime = parseCalendarInfo({
        type: 'local',
        id: 'local_1',
        name: 'My Notes',
        directory: 'CalendarNotes',
        taskCompletionStyle: 'datetime',
        color: '#ff9900'
      });
      expect(parsedDatetime.type).toBe('local');
      if (parsedDatetime.type === 'local') {
        expect(parsedDatetime.taskCompletionStyle).toBe('datetime');
      }

      const parsedBoolean = parseCalendarInfo({
        type: 'local',
        id: 'local_2',
        name: 'My Notes 2',
        directory: 'CalendarNotes',
        taskCompletionStyle: 'boolean',
        color: '#ff9900'
      });
      expect(parsedBoolean.type).toBe('local');
      if (parsedBoolean.type === 'local') {
        expect(parsedBoolean.taskCompletionStyle).toBe('boolean');
      }
    });
  });
});
