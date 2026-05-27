import { EventFilterSortEngine, QueryableEvent } from './EventFilterSortEngine';
import { OFCEvent } from '../types';
import { StoredEvent } from './EventStore';

describe('EventFilterSortEngine', () => {
  const events: QueryableEvent[] = [
    {
      id: '1',
      title: 'Discuss project roadmap',
      category: 'Work',
      subCategory: 'Planning',
      description: 'Review milestones and backlog items',
      filePath: 'work/roadmap.md',
      calendarId: 'cal-work',
      calendarName: 'Work Tasks',
      startMillis: 1000,
      endMillis: 2000,
      allDay: false,
      completed: false,
      isTask: true
    },
    {
      id: '2',
      title: 'Family dinner',
      category: 'Personal',
      subCategory: 'Family',
      description: 'Weekly family dinner',
      filePath: 'personal/dinner.md',
      calendarId: 'cal-personal',
      calendarName: 'Family Calendar',
      startMillis: 5000,
      endMillis: 6000,
      allDay: true,
      completed: false,
      isTask: false
    },
    {
      id: '3',
      title: 'Doctors appointment',
      category: 'Health',
      subCategory: 'Checkup',
      description: 'Annual health checkup',
      filePath: 'health/doctor.md',
      calendarId: 'cal-health',
      calendarName: 'Health Care',
      startMillis: 3000,
      endMillis: 4000,
      allDay: false,
      completed: true,
      isTask: true
    }
  ];

  describe('Basic Filters', () => {
    it('filters by calendarIds', () => {
      const res = EventFilterSortEngine.filterEvents(events, { calendarIds: ['cal-work'] });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('1');
    });

    it('filters by category', () => {
      const res = EventFilterSortEngine.filterEvents(events, { categories: ['work'] });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('1');
    });

    it('filters by subCategory', () => {
      const res = EventFilterSortEngine.filterEvents(events, { subCategories: ['Checkup'] });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('3');
    });

    it('filters by filePath substring', () => {
      const res = EventFilterSortEngine.filterEvents(events, { filePathSubstring: 'personal/' });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('2');
    });

    it('filters by task completion status', () => {
      const res = EventFilterSortEngine.filterEvents(events, { isCompleted: true });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('3');
    });

    it('filters by isTask', () => {
      const res = EventFilterSortEngine.filterEvents(events, { isTask: true });
      expect(res).toHaveLength(2);
      expect(res.map(e => e.id)).toEqual(['1', '3']);
    });
  });

  describe('Text Search Modes', () => {
    it('matches default mode with substring', () => {
      const res = EventFilterSortEngine.filterEvents(events, {
        textSearch: { query: 'dinner', mode: 'default' }
      });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('2');
    });

    it('matches default mode with edit distance <= 1', () => {
      // "roadmp" has edit distance 1 from "roadmap"
      const res = EventFilterSortEngine.filterEvents(events, {
        textSearch: { query: 'roadmp', mode: 'default' }
      });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('1');
    });

    it('matches backlog mode with fuzzy subsequence', () => {
      // "prjct rdmp" should match "Discuss project roadmap" fuzzy subsequence
      const res = EventFilterSortEngine.filterEvents(events, {
        textSearch: { query: 'prjct rdmp', mode: 'backlog' }
      });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('1');
    });

    it('matches embedded mode tagFilter', () => {
      const res = EventFilterSortEngine.filterEvents(events, {
        textSearch: { query: 'Planning', mode: 'embedded' }
      });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('1');
    });
  });

  describe('Sorting', () => {
    it('sorts events by start time ascending', () => {
      const res = EventFilterSortEngine.sortEvents(events, [{ field: 'start', order: 'asc' }]);
      expect(res.map(e => e.id)).toEqual(['1', '3', '2']);
    });

    it('sorts events by title descending', () => {
      const res = EventFilterSortEngine.sortEvents(events, [{ field: 'title', order: 'desc' }]);
      expect(res.map(e => e.id)).toEqual(['2', '3', '1']);
    });
  });

  describe('Adapters', () => {
    it('adapts a StoredEvent correctly', () => {
      const ofcEvent = {
        type: 'single',
        title: 'Meeting',
        date: '2026-06-15',
        startTime: '10:00',
        endTime: '11:00',
        allDay: false
      } as OFCEvent;

      const stored: StoredEvent = {
        id: 'evt-100',
        event: ofcEvent,
        location: { path: 'notes/meeting.md', lineNumber: 5 },
        calendarId: 'cal-custom'
      };

      const queryable = EventFilterSortEngine.fromStoredEvent(stored, id => `Name: ${id}`);
      expect(queryable.id).toBe('evt-100');
      expect(queryable.title).toBe('Meeting');
      expect(queryable.calendarId).toBe('cal-custom');
      expect(queryable.calendarName).toBe('Name: cal-custom');
      expect(queryable.filePath).toBe('notes/meeting.md');
      expect(queryable.startMillis).toBeDefined();
      expect(queryable.endMillis).toBeDefined();
    });
  });
});
