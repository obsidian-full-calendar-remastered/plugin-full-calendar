/**
 * @file utils.test.ts
 * @brief Tests for ChronoAnalyser utility functions, focusing on skipDate handling
 */

import { TimeRecord } from './types';
import {
  getRecurringInstances,
  calculateRecurringInstancesInDateRange,
  getRruleInstances,
  calculateRruleInstancesInDateRange
} from './utils';
import { OFCEvent } from '../../types';

describe('ChronoAnalyser Utils - skipDates handling', () => {
  const createRecurringEvent = (skipDates: string[] = []): OFCEvent => ({
    type: 'recurring',
    id: 'test-recurring',
    title: 'Test Recurring Event',
    daysOfWeek: ['M', 'W', 'F'], // Monday, Wednesday, Friday (using string format)
    startRecur: '2023-11-01',
    endRecur: '2023-11-30',
    allDay: true,
    skipDates,
    endDate: null
  });

  const createTimeRecord = (event: OFCEvent): TimeRecord => ({
    _id: 'test-record',
    path: '/test/path',
    hierarchy: 'Test',
    project: 'Test Project',
    subproject: 'Test Subproject',
    subprojectFull: 'Test Subproject',
    duration: 60,
    file: 'test.md',
    date: new Date('2023-11-01'),
    metadata: event
  });

  describe('getRecurringInstances', () => {
    it('should return all instances when skipDates is empty', () => {
      const event = createRecurringEvent([]);
      const record = createTimeRecord(event);

      const instances = getRecurringInstances(
        record,
        new Date('2023-11-01'),
        new Date('2023-11-10')
      );

      // Nov 1 2023 is Wednesday, so in the range Nov 1-10:
      // Wed Nov 1, Fri Nov 3, Mon Nov 6, Wed Nov 8, Fri Nov 10
      expect(instances).toHaveLength(5);
      expect(instances.map(d => d.toISOString().split('T')[0])).toEqual([
        '2023-11-01', // Wednesday
        '2023-11-03', // Friday
        '2023-11-06', // Monday
        '2023-11-08', // Wednesday
        '2023-11-10' // Friday
      ]);
    });

    it('should exclude instances that are in skipDates', () => {
      const event = createRecurringEvent(['2023-11-08']); // Skip Wednesday
      const record = createTimeRecord(event);

      const instances = getRecurringInstances(
        record,
        new Date('2023-11-01'),
        new Date('2023-11-10')
      );

      // Should include all EXCEPT Wed Nov 8th
      expect(instances).toHaveLength(4);
      expect(instances.map(d => d.toISOString().split('T')[0])).toEqual([
        '2023-11-01', // Wednesday
        '2023-11-03', // Friday
        '2023-11-06', // Monday
        '2023-11-10' // Friday (Wed 8th excluded)
      ]);
    });

    it('should exclude multiple skipDates', () => {
      const event = createRecurringEvent(['2023-11-01', '2023-11-06', '2023-11-10']); // Skip Wed 1st, Mon 6th, Fri 10th
      const record = createTimeRecord(event);

      const instances = getRecurringInstances(
        record,
        new Date('2023-11-01'),
        new Date('2023-11-10')
      );

      // Should only include Fri 3rd and Wed 8th
      expect(instances).toHaveLength(2);
      expect(instances.map(d => d.toISOString().split('T')[0])).toEqual([
        '2023-11-03', // Friday
        '2023-11-08' // Wednesday
      ]);
    });
  });

  describe('calculateRecurringInstancesInDateRange', () => {
    it('should count all instances when skipDates is empty', () => {
      const event = createRecurringEvent([]);

      const count = calculateRecurringInstancesInDateRange(
        event,
        new Date('2023-11-01'),
        new Date('2023-11-10')
      );

      expect(count).toBe(5); // Wed 1st, Fri 3rd, Mon 6th, Wed 8th, Fri 10th
    });

    it('should exclude skipDates from count', () => {
      const event = createRecurringEvent(['2023-11-08']); // Skip Wednesday

      const count = calculateRecurringInstancesInDateRange(
        event,
        new Date('2023-11-01'),
        new Date('2023-11-10')
      );

      expect(count).toBe(4); // All EXCEPT Wed 8th
    });

    it('should exclude multiple skipDates from count', () => {
      const event = createRecurringEvent(['2023-11-01', '2023-11-03', '2023-11-06']); // Skip Wed 1st, Fri 3rd, Mon 6th

      const count = calculateRecurringInstancesInDateRange(
        event,
        new Date('2023-11-01'),
        new Date('2023-11-10')
      );

      expect(count).toBe(2); // Only Wed 8th and Fri 10th remain
    });
  });
  describe('daily and complex recurrence expansions', () => {
    it('should expand daily event with interval', () => {
      const dailyEvent: OFCEvent = {
        type: 'recurring',
        id: 'test-daily',
        title: 'Daily Medication',
        fcrDaily: true,
        repeatInterval: 3,
        startRecur: '2023-11-01',
        endRecur: '2023-11-15',
        allDay: true,
        skipDates: ['2023-11-07'],
        endDate: null
      };
      const record = createTimeRecord(dailyEvent);

      const instances = getRecurringInstances(
        record,
        new Date('2023-11-01'),
        new Date('2023-11-15')
      );

      // Starting Nov 1 (Wednesday):
      // Nov 1, Nov 4, Nov 7 (skipped), Nov 10, Nov 13.
      expect(instances).toHaveLength(4);
      expect(instances.map(d => d.toISOString().split('T')[0])).toEqual([
        '2023-11-01',
        '2023-11-04',
        '2023-11-10',
        '2023-11-13'
      ]);
    });

    it('should expand monthly event on specific weekday (repeatOn)', () => {
      const repeatOnEvent: OFCEvent = {
        type: 'recurring',
        id: 'test-repeaton',
        title: 'Monthly repeatOn Event',
        repeatOn: { week: 2, weekday: 0 }, // 2nd Sunday of the month
        startRecur: '2023-11-01',
        endRecur: '2023-12-31',
        allDay: true,
        skipDates: [],
        endDate: null
      };
      const record = createTimeRecord(repeatOnEvent);

      const instances = getRecurringInstances(
        record,
        new Date('2023-11-01'),
        new Date('2023-12-31')
      );

      // In Nov 2023, Sundays are: 5th, 12th (2nd), 19th, 26th
      // In Dec 2023, Sundays are: 3rd, 10th (2nd), 17th, 24th, 31st
      expect(instances).toHaveLength(2);
      expect(instances.map(d => d.toISOString().split('T')[0])).toEqual([
        '2023-11-12',
        '2023-12-10'
      ]);
    });
  });

  describe('non-recurring events', () => {
    it('should return empty array for single events', () => {
      const singleEvent: OFCEvent = {
        type: 'single',
        id: 'test-single',
        title: 'Test Single Event',
        date: '2023-11-08',
        endDate: '2023-11-08',
        allDay: true
      };
      const record = createTimeRecord(singleEvent);

      const instances = getRecurringInstances(
        record,
        new Date('2023-11-01'),
        new Date('2023-11-10')
      );

      expect(instances).toHaveLength(0);
    });

    it('should return 0 count for single events', () => {
      const singleEvent: OFCEvent = {
        type: 'single',
        id: 'test-single',
        title: 'Test Single Event',
        date: '2023-11-08',
        endDate: '2023-11-08',
        allDay: true
      };

      const count = calculateRecurringInstancesInDateRange(
        singleEvent,
        new Date('2023-11-01'),
        new Date('2023-11-10')
      );

      expect(count).toBe(0);
    });
  });

  describe('rrule events - skipDates handling', () => {
    const createRruleEvent = (skipDates: string[] = []): OFCEvent => ({
      type: 'rrule',
      id: 'test-rrule',
      title: 'Test Rrule Event',
      rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR', // Monday, Wednesday, Friday
      startDate: '2023-11-01',
      allDay: true,
      skipDates,
      endDate: null
    });

    describe('getRruleInstances', () => {
      it('should return all instances when skipDates is empty', () => {
        const event = createRruleEvent([]);
        const record = createTimeRecord(event);

        const instances = getRruleInstances(record, new Date('2023-11-01'), new Date('2023-11-10'));

        // Should find Mon, Wed, Fri instances in range
        expect(instances.length).toBeGreaterThan(0);
        // Verify they are actual dates
        instances.forEach(instance => {
          expect(instance).toBeInstanceOf(Date);
          expect(instance.getTime()).toBeGreaterThanOrEqual(new Date('2023-11-01').getTime());
          expect(instance.getTime()).toBeLessThanOrEqual(new Date('2023-11-10').getTime());
        });
      });

      it('should exclude instances that are in skipDates', () => {
        const event = createRruleEvent(['2023-11-08']); // Skip a Wednesday
        const record = createTimeRecord(event);

        const instancesWithSkip = getRruleInstances(
          record,
          new Date('2023-11-01'),
          new Date('2023-11-10')
        );

        const instancesWithoutSkip = getRruleInstances(
          createTimeRecord(createRruleEvent([])),
          new Date('2023-11-01'),
          new Date('2023-11-10')
        );

        // Should have one fewer instance when skipDate is applied
        expect(instancesWithSkip.length).toBe(instancesWithoutSkip.length - 1);

        // The skipped date should not be in the results
        const dateStrings = instancesWithSkip.map(d => d.toISOString().split('T')[0]);
        expect(dateStrings).not.toContain('2023-11-08');
      });

      it('should handle invalid rrule gracefully', () => {
        const invalidRruleEvent: OFCEvent = {
          type: 'rrule',
          id: 'test-invalid',
          title: 'Test Invalid Rrule',
          rrule: 'INVALID_RRULE',
          startDate: '2023-11-01',
          allDay: true,
          skipDates: [],
          endDate: null
        };
        const record = createTimeRecord(invalidRruleEvent);

        const instances = getRruleInstances(record, new Date('2023-11-01'), new Date('2023-11-10'));

        expect(instances).toHaveLength(0);
      });
    });

    describe('calculateRruleInstancesInDateRange', () => {
      it('should count all instances when skipDates is empty', () => {
        const event = createRruleEvent([]);

        const count = calculateRruleInstancesInDateRange(
          event,
          new Date('2023-11-01'),
          new Date('2023-11-10')
        );

        expect(count).toBeGreaterThan(0);
      });

      it('should exclude skipDates from count', () => {
        const event = createRruleEvent(['2023-11-08']); // Skip a Wednesday

        const countWithSkip = calculateRruleInstancesInDateRange(
          event,
          new Date('2023-11-01'),
          new Date('2023-11-10')
        );

        const countWithoutSkip = calculateRruleInstancesInDateRange(
          createRruleEvent([]),
          new Date('2023-11-01'),
          new Date('2023-11-10')
        );

        expect(countWithSkip).toBe(countWithoutSkip - 1);
      });

      it('should handle invalid rrule gracefully', () => {
        const invalidRruleEvent: OFCEvent = {
          type: 'rrule',
          id: 'test-invalid',
          title: 'Test Invalid Rrule',
          rrule: 'INVALID_RRULE',
          startDate: '2023-11-01',
          allDay: true,
          skipDates: [],
          endDate: null
        };

        const count = calculateRruleInstancesInDateRange(
          invalidRruleEvent,
          new Date('2023-11-01'),
          new Date('2023-11-10')
        );

        expect(count).toBe(0);
      });
    });

    describe('non-rrule events', () => {
      it('should return empty array for single events', () => {
        const singleEvent: OFCEvent = {
          type: 'single',
          id: 'test-single',
          title: 'Test Single Event',
          date: '2023-11-08',
          endDate: '2023-11-08',
          allDay: true
        };
        const record = createTimeRecord(singleEvent);

        const instances = getRruleInstances(record, new Date('2023-11-01'), new Date('2023-11-10'));

        expect(instances).toHaveLength(0);
      });

      it('should return 0 count for single events', () => {
        const singleEvent: OFCEvent = {
          type: 'single',
          id: 'test-single',
          title: 'Test Single Event',
          date: '2023-11-08',
          endDate: '2023-11-08',
          allDay: true
        };

        const count = calculateRruleInstancesInDateRange(
          singleEvent,
          new Date('2023-11-01'),
          new Date('2023-11-10')
        );

        expect(count).toBe(0);
      });
    });
  });
});
