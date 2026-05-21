import { DEFAULT_SETTINGS } from '../../types/settings';
import { getInlineEventFromLine } from './parser_dailyN';
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
});
