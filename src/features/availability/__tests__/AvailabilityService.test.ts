/**
 * @file AvailabilityService.test.ts
 * @brief Unit tests for the AvailabilityService logic.
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import { PluginState } from '../../../core/PluginState';
import { AvailabilityService, AvailabilityOptions } from '../AvailabilityService';
import { QueryableEvent } from '../../../core/EventFilterSortEngine';
import { FullCalendarSettings } from '../../../types/settings';
import { InternalAPI } from '../../../api/FullCalendarAPI';

describe('AvailabilityService Unit Tests', () => {
  const mockSettings = {
    displayTimezone: 'America/New_York',
    availabilityDefaultTimeRange: { startTime: '09:00', endTime: '17:00' }
  };

  let mockEvents: QueryableEvent[] = [];

  beforeAll(() => {
    // Setup PluginState mocks
    PluginState.setSettings(mockSettings as unknown as FullCalendarSettings);
    PluginState.setInternalAPI({
      getEvents: () => mockEvents,
      getCalendarSources: () => []
    } as unknown as InternalAPI);
  });

  beforeEach(() => {
    mockEvents = [];
  });

  test('should generate free slots when there are no events', async () => {
    const options: AvailabilityOptions = {
      startDate: '2026-06-22', // Monday
      endDate: '2026-06-22',
      startTime: '09:00',
      endTime: '17:00',
      excludeWeekends: true,
      calendarIds: [],
      anonymize: true
    };

    const res = await AvailabilityService.computeAvailability(options);

    expect(res.timezone).toBe('America/New_York');
    // Should have 1 single free slot from 09:00 to 17:00
    expect(res.slots.length).toBe(1);
    expect(res.slots[0].status).toBe('free');

    const startDt = DateTime.fromISO(res.slots[0].start).setZone('America/New_York');
    const endDt = DateTime.fromISO(res.slots[0].end).setZone('America/New_York');

    expect(startDt.toFormat('HH:mm')).toBe('09:00');
    expect(endDt.toFormat('HH:mm')).toBe('17:00');
  });

  test('should correctly ignore all-day events', async () => {
    // Adding an all-day event
    mockEvents = [
      {
        id: '1',
        title: 'All Day Birthday Party',
        allDay: true,
        startMillis: DateTime.fromISO('2026-06-22T00:00:00', {
          zone: 'America/New_York'
        }).toMillis(),
        endMillis: DateTime.fromISO('2026-06-23T00:00:00', { zone: 'America/New_York' }).toMillis()
      }
    ];

    const options: AvailabilityOptions = {
      startDate: '2026-06-22',
      endDate: '2026-06-22',
      startTime: '09:00',
      endTime: '17:00',
      excludeWeekends: true,
      calendarIds: [],
      anonymize: true
    };

    const res = await AvailabilityService.computeAvailability(options);
    // Since the birthday is all-day, it should be ignored and the day should remain free
    expect(res.slots.length).toBe(1);
    expect(res.slots[0].status).toBe('free');
  });

  test('should calculate busy slots and split free slots accordingly', async () => {
    // Event from 10:00 to 11:30 and another from 14:00 to 15:00
    mockEvents = [
      {
        id: '2',
        title: 'Morning Sync',
        allDay: false,
        startMillis: DateTime.fromISO('2026-06-22T10:00:00', {
          zone: 'America/New_York'
        }).toMillis(),
        endMillis: DateTime.fromISO('2026-06-22T11:30:00', { zone: 'America/New_York' }).toMillis()
      },
      {
        id: '3',
        title: 'Focus Time',
        allDay: false,
        startMillis: DateTime.fromISO('2026-06-22T14:00:00', {
          zone: 'America/New_York'
        }).toMillis(),
        endMillis: DateTime.fromISO('2026-06-22T15:00:00', { zone: 'America/New_York' }).toMillis()
      }
    ];

    const options: AvailabilityOptions = {
      startDate: '2026-06-22',
      endDate: '2026-06-22',
      startTime: '09:00',
      endTime: '17:00',
      excludeWeekends: true,
      calendarIds: [],
      anonymize: true
    };

    const res = await AvailabilityService.computeAvailability(options);

    // Slots structure:
    // 1. Free: 09:00 - 10:00
    // 2. Busy: 10:00 - 11:30 (Anonymized title "Busy")
    // 3. Free: 11:30 - 14:00
    // 4. Busy: 14:00 - 15:00 (Anonymized title "Busy")
    // 5. Free: 15:00 - 17:00
    expect(res.slots.length).toBe(5);

    expect(res.slots[0].status).toBe('free');
    expect(DateTime.fromISO(res.slots[0].start).setZone('America/New_York').toFormat('HH:mm')).toBe(
      '09:00'
    );
    expect(DateTime.fromISO(res.slots[0].end).setZone('America/New_York').toFormat('HH:mm')).toBe(
      '10:00'
    );

    expect(res.slots[1].status).toBe('busy');
    expect(res.slots[1].title).toBe('Busy');
    expect(DateTime.fromISO(res.slots[1].start).setZone('America/New_York').toFormat('HH:mm')).toBe(
      '10:00'
    );
    expect(DateTime.fromISO(res.slots[1].end).setZone('America/New_York').toFormat('HH:mm')).toBe(
      '11:30'
    );

    expect(res.slots[2].status).toBe('free');
    expect(DateTime.fromISO(res.slots[2].start).setZone('America/New_York').toFormat('HH:mm')).toBe(
      '11:30'
    );
    expect(DateTime.fromISO(res.slots[2].end).setZone('America/New_York').toFormat('HH:mm')).toBe(
      '14:00'
    );
  });

  test('should merge overlapping and adjacent busy slots', async () => {
    // Event A: 10:00 - 11:00
    // Event B: 10:30 - 12:00 (Overlapping Event A)
    // Event C: 12:00 - 13:00 (Adjacent to Event B)
    mockEvents = [
      {
        id: 'a',
        title: 'Event A',
        allDay: false,
        startMillis: DateTime.fromISO('2026-06-22T10:00:00', {
          zone: 'America/New_York'
        }).toMillis(),
        endMillis: DateTime.fromISO('2026-06-22T11:00:00', { zone: 'America/New_York' }).toMillis()
      },
      {
        id: 'b',
        title: 'Event B',
        allDay: false,
        startMillis: DateTime.fromISO('2026-06-22T10:30:00', {
          zone: 'America/New_York'
        }).toMillis(),
        endMillis: DateTime.fromISO('2026-06-22T12:00:00', { zone: 'America/New_York' }).toMillis()
      },
      {
        id: 'c',
        title: 'Event C',
        allDay: false,
        startMillis: DateTime.fromISO('2026-06-22T12:00:00', {
          zone: 'America/New_York'
        }).toMillis(),
        endMillis: DateTime.fromISO('2026-06-22T13:00:00', { zone: 'America/New_York' }).toMillis()
      }
    ];

    const options: AvailabilityOptions = {
      startDate: '2026-06-22',
      endDate: '2026-06-22',
      startTime: '09:00',
      endTime: '17:00',
      excludeWeekends: true,
      calendarIds: [],
      anonymize: false // Semi-anonymized: should merge titles
    };

    const res = await AvailabilityService.computeAvailability(options);

    // We should get 3 slots:
    // 1. Free: 09:00 - 10:00
    // 2. Busy: 10:00 - 13:00 (Merged Event A, B, C)
    // 3. Free: 13:00 - 17:00
    expect(res.slots.length).toBe(3);

    expect(res.slots[1].status).toBe('busy');
    expect(DateTime.fromISO(res.slots[1].start).setZone('America/New_York').toFormat('HH:mm')).toBe(
      '10:00'
    );
    expect(DateTime.fromISO(res.slots[1].end).setZone('America/New_York').toFormat('HH:mm')).toBe(
      '13:00'
    );

    // Titles should be merged and separated by ' / '
    expect(res.slots[1].title).toContain('Event A');
    expect(res.slots[1].title).toContain('Event B');
    expect(res.slots[1].title).toContain('Event C');
  });

  test('should exclude weekends', async () => {
    const options: AvailabilityOptions = {
      startDate: '2026-06-20', // Saturday
      endDate: '2026-06-22', // Monday
      startTime: '09:00',
      endTime: '17:00',
      excludeWeekends: true,
      calendarIds: [],
      anonymize: true
    };

    const res = await AvailabilityService.computeAvailability(options);

    // Since Saturday and Sunday are excluded, we should only have slots for Monday
    const days = new Set(
      res.slots.map(s => DateTime.fromISO(s.start).setZone('America/New_York').toISODate())
    );

    expect(days.size).toBe(1);
    expect(days.has('2026-06-22')).toBe(true);
    expect(days.has('2026-06-20')).toBe(false);
    expect(days.has('2026-06-21')).toBe(false);
  });

  test('should throw error when start date is after end date', async () => {
    const options: AvailabilityOptions = {
      startDate: '2026-06-23',
      endDate: '2026-06-22',
      startTime: '09:00',
      endTime: '17:00',
      excludeWeekends: true,
      calendarIds: [],
      anonymize: true
    };

    await expect(AvailabilityService.computeAvailability(options)).rejects.toThrow(
      'Start date must be before or equal to end date.'
    );
  });

  test('should throw error when daily start time is after or equal to end time', async () => {
    const options: AvailabilityOptions = {
      startDate: '2026-06-22',
      endDate: '2026-06-22',
      startTime: '17:00',
      endTime: '09:00',
      excludeWeekends: true,
      calendarIds: [],
      anonymize: true
    };

    await expect(AvailabilityService.computeAvailability(options)).rejects.toThrow(
      'Daily start time must be before end time.'
    );
  });

  test('should fallback to defaults when time values are malformed', async () => {
    const options: AvailabilityOptions = {
      startDate: '2026-06-22',
      endDate: '2026-06-22',
      startTime: 'invalid', // should fallback to 09:00
      endTime: '17:xx', // should fallback to 17:00
      excludeWeekends: true,
      calendarIds: [],
      anonymize: true
    };

    const res = await AvailabilityService.computeAvailability(options);
    expect(res.slots.length).toBe(1);
    const startDt = DateTime.fromISO(res.slots[0].start).setZone('America/New_York');
    const endDt = DateTime.fromISO(res.slots[0].end).setZone('America/New_York');
    expect(startDt.toFormat('HH:mm')).toBe('09:00');
    expect(endDt.toFormat('HH:mm')).toBe('17:00');
  });
});
