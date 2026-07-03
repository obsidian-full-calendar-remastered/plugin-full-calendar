import { DEFAULT_SETTINGS } from '../../types/settings';
import { getInlineAttributes, getInlineEventFromLine, addToHeading } from './parser_dailyN';
import { EventEnhancer } from '../../core/EventEnhancer';
import { OFCEvent } from '../../types';

// ...existing test logic adapted to use DailyNoteProvider...
// Example:
// const provider = new DailyNoteProvider(app, plugin, settings);
// const config: DailyNoteProviderConfig = { id: 'dailynote_1', heading: 'My Calendar' };
// const events = await provider.getEvents(config);

describe('DailyNoteCalendar', () => {
  describe('getInlineEventFromLine (raw parser)', () => {
    const MOCK_GLOBALS = { date: '2023-01-01', type: 'single' as const };

    it('should parse raw title literally, including category strings', () => {
      const line = '- [ ] Work - Review PR [startTime:: 09:00]';
      const result = getInlineEventFromLine(line, MOCK_GLOBALS);
      expect(result?.title).toBe('Work - Review PR');
    });

    it('should return null if there are no inline fields', () => {
      const line = '- [ ] Just a title';
      expect(getInlineEventFromLine(line, MOCK_GLOBALS)).toBeNull();
    });

    it('should handle extra whitespace gracefully', () => {
      const line = '  - [ ]   Work   -   Deploy to production  [startTime:: 10:00]';
      const result = getInlineEventFromLine(line, MOCK_GLOBALS);
      expect(result).not.toBeNull();
      expect(result?.title).toBe('Work - Deploy to production');
    });

    it('should parse day planner format when inline time fields are absent', () => {
      const line = '- 02:30 - 03:30 Work - Review PR [uid:: 2]  [timezone:: Europe/Budapest]';
      const result = getInlineEventFromLine(line, MOCK_GLOBALS);
      expect(result).not.toBeNull();
      expect(result).toEqual(
        expect.objectContaining({
          title: 'Work - Review PR',
          startTime: '02:30',
          endTime: '03:30',
          uid: '2',
          timezone: 'Europe/Budapest',
          allDay: false
        })
      );
    });

    it('should prioritize inline start and end time fields over day planner title parsing', () => {
      const line =
        '- 02:30 - 03:30 Work - Review PR [startTime:: 09:00]  [endTime:: 10:00]  [uid:: 2]';
      const result = getInlineEventFromLine(line, MOCK_GLOBALS);
      expect(result).not.toBeNull();
      expect(result).toEqual(
        expect.objectContaining({
          title: '02:30 - 03:30 Work - Review PR',
          startTime: '09:00',
          endTime: '10:00',
          uid: '2',
          allDay: false
        })
      );
    });
  });

  describe('enhanceEvent (logic layer)', () => {
    const settingsWithCategory = {
      ...DEFAULT_SETTINGS,
      enableAdvancedCategorization: true,
      categorySettings: [
        { name: 'Work', color: 'blue' },
        { name: 'Chores', color: 'green' }
      ]
    };
    const settingsWithoutCategory = { ...DEFAULT_SETTINGS, enableAdvancedCategorization: false };

    it('should return event as-is when categorization is off', () => {
      const rawEvent: OFCEvent = {
        title: 'Work - Review PR',
        type: 'single' as const,
        allDay: true,
        date: '2023-01-01',
        endDate: null
      };
      const enhancer = new EventEnhancer(settingsWithoutCategory);
      const result = enhancer.enhance(rawEvent);
      expect(result.title).toBe('Work - Review PR');
      expect(result.category).toBeUndefined();
    });

    it('should parse category and title when categorization is on', () => {
      const rawEvent: OFCEvent = {
        title: 'Work - Review PR',
        type: 'single' as const,
        allDay: true,
        date: '2023-01-01',
        endDate: null
      };
      const enhancer = new EventEnhancer(settingsWithCategory);
      const result = enhancer.enhance(rawEvent);
      expect(result.title).toBe('Review PR');
      expect(result.category).toBe('Work');
    });

    it('should parse category and sub-category', () => {
      const rawEvent: OFCEvent = {
        title: 'Chores - Home - Clean garage',
        type: 'single' as const,
        allDay: true,
        date: '2023-01-01',
        endDate: null
      };
      const enhancer = new EventEnhancer(settingsWithCategory);
      const result = enhancer.enhance(rawEvent);
      expect(result.title).toBe('Home - Clean garage');
      expect(result.category).toBe('Chores');
      expect(result.subCategory).toBe('Home');
    });

    it('should handle titles with no category gracefully', () => {
      const rawEvent: OFCEvent = {
        title: 'A task with a time',
        type: 'single' as const,
        allDay: true,
        date: '2023-01-01',
        endDate: null
      };
      const enhancer = new EventEnhancer(settingsWithCategory);
      const result = enhancer.enhance(rawEvent);
      expect(result.title).toBe('A task with a time');
      expect(result.category).toBeUndefined();
      expect(result.subCategory).toBeUndefined();
    });
  });

  describe('description with newlines (issue #321)', () => {
    const MOCK_GLOBALS = { date: '2023-01-01', type: 'single' as const };
    const SOURCE = { format: 'default' as const };

    it('getInlineAttributes should unescape \\n sequences back to real newlines', () => {
      const line = '- Meeting [startTime:: 09:00]  [description:: line1\\nline2\\nline3]';
      const attrs = getInlineAttributes(line);
      expect(attrs.description).toBe('line1\nline2\nline3');
    });

    it('getInlineAttributes should leave values without \\n unchanged', () => {
      const line = '- Meeting [startTime:: 09:00]  [description:: plain text]';
      const attrs = getInlineAttributes(line);
      expect(attrs.description).toBe('plain text');
    });

    it('round-trip: serialising an event with a multi-line description produces a single list item', () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'Team sync',
        date: '2023-01-01',
        endDate: null,
        allDay: true,
        description: 'Agenda:\n- Point 1\n- Point 2'
      };

      // Serialise into a fresh page.
      const { page, lineNumber } = addToHeading(
        '',
        { heading: undefined, item: event, headingText: 'Events' },
        SOURCE
      );
      const lines = page.split('\n');

      // The list item must occupy exactly ONE line.
      const listItemLine = lines[lineNumber];
      expect(listItemLine).not.toBeUndefined();
      expect(listItemLine).toContain('[description::');
      expect(listItemLine).not.toMatch(/\n/);

      // Parse the single line back and verify the description is restored.
      const parsed = getInlineEventFromLine(listItemLine, MOCK_GLOBALS);
      expect(parsed).not.toBeNull();
      expect(parsed?.description).toBe('Agenda:\n- Point 1\n- Point 2');
    });

    it('round-trip: CRLF line endings in description are normalised to \\n on parse', () => {
      const event: OFCEvent = {
        type: 'single',
        title: 'Meeting',
        date: '2023-01-01',
        endDate: null,
        allDay: true,
        description: 'Notes:\r\nLine 1\r\nLine 2'
      };

      const { page, lineNumber } = addToHeading(
        '',
        { heading: undefined, item: event, headingText: 'Events' },
        SOURCE
      );
      const lines = page.split('\n');
      const listItemLine = lines[lineNumber];

      // CRLF sequences must NOT appear as literal line breaks in the file.
      expect(listItemLine).not.toContain('\r');

      const parsed = getInlineEventFromLine(listItemLine, MOCK_GLOBALS);
      expect(parsed).not.toBeNull();
      // \r\n should be normalised to \n after the round-trip.
      expect(parsed?.description).toBe('Notes:\nLine 1\nLine 2');
    });
  });
});
