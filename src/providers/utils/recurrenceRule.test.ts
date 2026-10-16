import { getRecurringEventRule } from './recurrenceRule';
import { OFCEvent } from '../../types';

describe('getRecurringEventRule', () => {
  it('generates daily recurrence rule with optional interval and until', () => {
    const dailyEvent = {
      type: 'recurring',
      title: 'Daily Event',
      allDay: true,
      fcrDaily: true,
      repeatInterval: 1
    } as Extract<OFCEvent, { type: 'recurring' }>;
    expect(getRecurringEventRule(dailyEvent)).toBe('FREQ=DAILY');

    const intervalEvent = {
      type: 'recurring',
      title: 'Every 3 days',
      allDay: true,
      fcrDaily: true,
      repeatInterval: 3,
      endRecur: '2026-11-20'
    } as Extract<OFCEvent, { type: 'recurring' }>;
    expect(getRecurringEventRule(intervalEvent)).toMatch(
      /^FREQ=DAILY;INTERVAL=3;UNTIL=\d{8}T\d{6}Z$/
    );
  });

  it('generates weekly recurrence rule with days of week', () => {
    const weeklyEvent = {
      type: 'recurring',
      title: 'Weekly Meeting',
      allDay: true,
      daysOfWeek: ['M', 'W', 'F'],
      repeatInterval: 2
    } as Extract<OFCEvent, { type: 'recurring' }>;
    expect(getRecurringEventRule(weeklyEvent)).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR;INTERVAL=2');
  });

  it('generates monthly recurrence rule by day of month', () => {
    const monthlyEvent = {
      type: 'recurring',
      title: 'Monthly Bill',
      allDay: true,
      dayOfMonth: 15
    } as Extract<OFCEvent, { type: 'recurring' }>;
    expect(getRecurringEventRule(monthlyEvent)).toBe('FREQ=MONTHLY;BYMONTHDAY=15');
  });

  it('generates monthly recurrence rule by position (repeatOn)', () => {
    const monthlyEvent = {
      type: 'recurring',
      title: 'Monthly First Monday',
      allDay: true,
      repeatOn: { week: 1, weekday: 1 }
    } as Extract<OFCEvent, { type: 'recurring' }>;
    expect(getRecurringEventRule(monthlyEvent)).toBe('FREQ=MONTHLY;BYDAY=1MO');

    const lastSunday = {
      type: 'recurring',
      title: 'Monthly Last Sunday',
      allDay: true,
      repeatOn: { week: -1, weekday: 0 }
    } as Extract<OFCEvent, { type: 'recurring' }>;
    expect(getRecurringEventRule(lastSunday)).toBe('FREQ=MONTHLY;BYDAY=-1SU');
  });

  it('generates yearly recurrence rule with month and dayOfMonth', () => {
    const yearlyEvent = {
      type: 'recurring',
      title: 'Birthday',
      allDay: true,
      month: 5,
      dayOfMonth: 21
    } as Extract<OFCEvent, { type: 'recurring' }>;
    expect(getRecurringEventRule(yearlyEvent)).toBe('FREQ=YEARLY;BYMONTH=5;BYMONTHDAY=21');
  });

  it('generates yearly recurrence rule with month and repeatOn', () => {
    const yearlyEvent = {
      type: 'recurring',
      title: 'Thanksgiving',
      allDay: true,
      month: 11,
      repeatOn: { week: 4, weekday: 4 }
    } as Extract<OFCEvent, { type: 'recurring' }>;
    expect(getRecurringEventRule(yearlyEvent)).toBe('FREQ=YEARLY;BYMONTH=11;BYDAY=4TH');
  });
});
