import { areEventsEqual } from './areEventsEqual';
import { OFCEvent } from '../../types';

describe('areEventsEqual', () => {
  const baseSingleEvent: OFCEvent = {
    type: 'single',
    title: 'Team Sync',
    date: '2026-07-28',
    endDate: '2026-07-28',
    startTime: '10:00',
    endTime: '11:00',
    allDay: false,
    category: 'Work',
    description: 'Weekly sync'
  };

  it('should return true for identical single event references or copies', () => {
    expect(areEventsEqual(baseSingleEvent, baseSingleEvent)).toBe(true);
    expect(areEventsEqual(baseSingleEvent, { ...baseSingleEvent })).toBe(true);
  });

  it('should return false when a primitive field changes', () => {
    expect(areEventsEqual(baseSingleEvent, { ...baseSingleEvent, title: 'Updated Sync' })).toBe(
      false
    );
    expect(areEventsEqual(baseSingleEvent, { ...baseSingleEvent, startTime: '10:30' })).toBe(false);
    expect(areEventsEqual(baseSingleEvent, { ...baseSingleEvent, category: 'Personal' })).toBe(
      false
    );
    expect(areEventsEqual(baseSingleEvent, { ...baseSingleEvent, completed: true })).toBe(false);
  });

  it('should return true for matching recurring and rrule events', () => {
    const rrule1: OFCEvent = {
      type: 'rrule',
      title: 'Standup',
      startDate: '2026-01-01',
      endDate: null,
      rrule: 'FREQ=DAILY;INTERVAL=1',
      allDay: true,
      skipDates: []
    };
    const rrule2: OFCEvent = { ...rrule1 };
    expect(areEventsEqual(rrule1, rrule2)).toBe(true);

    const modifiedRrule: OFCEvent = { ...rrule1, rrule: 'FREQ=WEEKLY;BYDAY=MO' };
    expect(areEventsEqual(rrule1, modifiedRrule)).toBe(false);
  });

  it('should detect differences in optional common fields like description and location', () => {
    const event1: OFCEvent = { ...baseSingleEvent, location: 'Room 101' };
    const event2: OFCEvent = { ...baseSingleEvent, location: 'Room 101' };
    const event3: OFCEvent = { ...baseSingleEvent, location: 'Room 102' };

    expect(areEventsEqual(event1, event2)).toBe(true);
    expect(areEventsEqual(event1, event3)).toBe(false);
  });
});
