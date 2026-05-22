import payloadEnRaw from './payloads/en.json';
import { processNaturalLanguage } from './engine';
import type { NLPPayload, NLPActionObject } from './types';
import { resolveSmartCalendar } from './smartCalendar';

const payloadEn = payloadEnRaw as NLPPayload;
describe('NLP engine', () => {
  describe('AM/PM edge cases', () => {
    it('converts 4 pm to 16:00', () => {
      const now = new Date('2026-05-07T09:00:00');
      const result = processNaturalLanguage('Meeting at 4 pm', payloadEn, now);

      expect(result.hours).toBe(16);
      expect(result.minutes).toBe(0);
      expect(result.title).toBe('Meeting');
    });

    it('handles "working in team stand up on 4th at 3 pm for 7 hrs"', () => {
      const now = new Date('2026-05-01T09:00:00');
      const result = processNaturalLanguage(
        'working in team stand up on 4th at 3 pm for 7 hrs',
        payloadEn,
        now
      );

      expect(result.date).toBe('2026-05-04');
      expect(result.hours).toBe(15);
      expect(result.endHours).toBe(22);
      expect(result.title).toBe('working in team stand up');
    });

    it('handles "for 5 hours" duration syntax', () => {
      const now = new Date('2026-05-01T09:00:00');
      const result = processNaturalLanguage('seminar tomorrow at 3 pm for 5 hours', payloadEn, now);

      expect(result.date).toBe('2026-05-02');
      expect(result.hours).toBe(15);
      expect(result.endHours).toBe(20);
      expect(result.title).toBe('seminar');
    });

    it('converts 12 am to 00:00 (midnight)', () => {
      const now = new Date('2026-05-07T09:00:00');
      const result = processNaturalLanguage('Backup at 12 am', payloadEn, now);

      expect(result.hours).toBe(0);
      expect(result.minutes).toBe(0);
    });

    it('keeps 12 pm as 12:00 (noon)', () => {
      const now = new Date('2026-05-07T09:00:00');
      const result = processNaturalLanguage('Lunch at 12 pm', payloadEn, now);

      expect(result.hours).toBe(12);
      expect(result.minutes).toBe(0);
    });

    it('parses exact time with minutes', () => {
      const now = new Date('2026-05-07T09:00:00');
      const result = processNaturalLanguage('Call at 4:30 pm', payloadEn, now);

      expect(result.hours).toBe(16);
      expect(result.minutes).toBe(30);
      expect(result.title).toBe('Call');
    });

    it('parses compact time token like 430pm', () => {
      const now = new Date('2026-05-07T09:00:00');
      const result = processNaturalLanguage('Call at 430pm', payloadEn, now);

      expect(result.hours).toBe(16);
      expect(result.minutes).toBe(30);
      expect(result.title).toBe('Call');
    });

    it('parses explicit range from 3pm to 5 pm', () => {
      const now = new Date('2026-05-07T09:00:00');
      const result = processNaturalLanguage('Focus from 3pm to 5 pm', payloadEn, now);

      expect(result.hours).toBe(15);
      expect(result.minutes).toBe(0);
      expect(result.endHours).toBe(17);
      expect(result.endMinutes).toBe(0);
      expect(result.title).toBe('Focus');
      expect(result.matchedRules).toContain('time_range_ampm');
    });

    it('prefers anchored trigger and keeps title numbers untouched', () => {
      const now = new Date('2026-05-07T09:00:00');
      const result = processNaturalLanguage('FINA 3203 N19 at 5pm', payloadEn, now);

      expect(result.hours).toBe(17);
      expect(result.minutes).toBe(0);
      expect(result.title).toBe('FINA 3203 N19');
    });
  });

  describe('named time anchors', () => {
    it('handles "at noon" as 12:00', () => {
      const now = new Date('2026-05-07T09:00:00');
      const result = processNaturalLanguage('Lunch at noon', payloadEn, now);

      expect(result.hours).toBe(12);
      expect(result.minutes).toBe(0);
      expect(result.title).toBe('Lunch');
    });

    it('handles "at midnight" as 00:00', () => {
      const now = new Date('2026-05-07T09:00:00');
      const result = processNaturalLanguage('Deploy at midnight', payloadEn, now);

      expect(result.hours).toBe(0);
      expect(result.minutes).toBe(0);
      expect(result.title).toBe('Deploy');
    });
  });

  describe('relative days', () => {
    it('handles "today"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('today Standup', payloadEn, now);

      expect(result.date).toBe('2026-05-07');
      expect(result.title).toBe('Standup');
    });

    it('handles "tomorrow"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('tomorrow Dentist', payloadEn, now);

      expect(result.date).toBe('2026-05-08');
      expect(result.title).toBe('Dentist');
    });

    it('handles "yesterday"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('yesterday Retro', payloadEn, now);

      expect(result.date).toBe('2026-05-06');
      expect(result.title).toBe('Retro');
    });

    it('handles "day after tomorrow"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('day after tomorrow Workshop', payloadEn, now);

      expect(result.date).toBe('2026-05-09');
      expect(result.title).toBe('Workshop');
    });

    it('handles "in 3 days"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('in 3 days Conference', payloadEn, now);

      expect(result.date).toBe('2026-05-10');
      expect(result.title).toBe('Conference');
    });

    it('handles "in 2 weeks"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('in 2 weeks Sprint review', payloadEn, now);

      expect(result.date).toBe('2026-05-21');
      expect(result.title).toBe('Sprint review');
    });
  });

  describe('the "next" problem (weekday wrap-around)', () => {
    it('handles next weekday with explicit pm time', () => {
      const now = new Date('2026-05-06T09:00:00'); // Wednesday
      const result = processNaturalLanguage('next tuesday at 4:30 pm Team sync', payloadEn, now);

      // Wednesday → next Tuesday = +6 days
      expect(result.intent).toBe('CREATE_EVENT');
      expect(result.date).toBe('2026-05-12');
      expect(result.hours).toBe(16);
      expect(result.minutes).toBe(30);
      expect(result.title).toBe('Team sync');
      expect(result.matchedRules).toEqual(
        expect.arrayContaining(['next_weekday', 'time_exact_ampm'])
      );
    });

    it('wraps to next week when target is same day', () => {
      const now = new Date('2026-05-06T09:00:00'); // Wednesday (day 3)
      const result = processNaturalLanguage('next wednesday Planning', payloadEn, now);

      // Same day → must wrap to +7
      expect(result.date).toBe('2026-05-13');
    });

    it('wraps correctly when target is earlier in the week', () => {
      const now = new Date('2026-05-08T09:00:00'); // Friday (day 5)
      const result = processNaturalLanguage('next monday Standup', payloadEn, now);

      // Friday → Monday = +3 days
      expect(result.date).toBe('2026-05-11');
    });
  });

  describe('rollover edge cases', () => {
    it('rolls hours over to next day', () => {
      const now = new Date('2026-05-07T22:00:00');
      const result = processNaturalLanguage('in 3 hours Deploy release', payloadEn, now);

      expect(result.date).toBe('2026-05-08');
      expect(result.hours).toBe(1);
      expect(result.minutes).toBe(0);
      expect(result.title).toBe('Deploy release');
    });

    it('rolls minutes over to next hour and next day', () => {
      const now = new Date('2026-05-07T23:30:00');
      const result = processNaturalLanguage('in 90 minutes Checkpoint', payloadEn, now);

      expect(result.date).toBe('2026-05-08');
      expect(result.hours).toBe(1);
      expect(result.minutes).toBe(0);
      expect(result.title).toBe('Checkpoint');
    });
  });

  describe('collision guards', () => {
    it('"in 3 hours" does NOT match "in Work calendar"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('Meeting in Work calendar', payloadEn, now);

      // Should match target_calendar, NOT in_hours
      expect(result.targetCalendar).toBe('Work');
      expect(result.matchedRules).toContain('target_calendar');
      expect(result.matchedRules).not.toContain('in_hours');
      expect(result.matchedRules).not.toContain('in_minutes');
      expect(result.matchedRules).not.toContain('in_days');
    });
  });

  describe('multi-pass pipeline', () => {
    it('parses full compound sentence correctly', () => {
      const now = new Date('2026-05-07T09:00:00'); // Thursday
      const result = processNaturalLanguage(
        'next tuesday at 4 pm Team sync in Work calendar',
        payloadEn,
        now
      );

      expect(result.intent).toBe('CREATE_EVENT');
      expect(result.date).toBe('2026-05-12');
      expect(result.hours).toBe(16);
      expect(result.minutes).toBe(0);
      expect(result.title).toBe('Team sync');
      expect(result.targetCalendar).toBe('Work');
      expect(result.matchedRules).toEqual(
        expect.arrayContaining(['next_weekday', 'time_exact_ampm', 'target_calendar'])
      );
    });

    it('strips all matched fragments to leave only the title', () => {
      const now = new Date('2026-05-07T09:00:00');
      const result = processNaturalLanguage('tomorrow at 3 pm Sprint review', payloadEn, now);

      expect(result.date).toBe('2026-05-08');
      expect(result.hours).toBe(15);
      expect(result.title).toBe('Sprint review');
    });
  });

  describe('navigation short-circuits', () => {
    it('short-circuits on NAVIGATE_WEEK', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('open weekly view', payloadEn, now);

      expect(result.intent).toBe('NAVIGATE_WEEK');
      expect(result.title).toBe('');
      expect(result.matchedRules).toEqual(['navigate_week']);
    });

    it('short-circuits on NAVIGATE_MONTH', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('show month view', payloadEn, now);

      expect(result.intent).toBe('NAVIGATE_MONTH');
      expect(result.title).toBe('');
    });

    it('short-circuits on NAVIGATE_DAY', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('view day view', payloadEn, now);

      expect(result.intent).toBe('NAVIGATE_DAY');
      expect(result.title).toBe('');
    });

    it('short-circuits on OPEN_CALENDAR', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('open calendar', payloadEn, now);

      expect(result.intent).toBe('OPEN_CALENDAR');
      expect(result.title).toBe('');
    });

    it('short-circuits on OPEN_SIDEBAR', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('open sidebar', payloadEn, now);

      expect(result.intent).toBe('OPEN_SIDEBAR');
      expect(result.title).toBe('');
    });
  });

  describe('recurrence', () => {
    it('parses basic weekly recurrence', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('every monday Standup', payloadEn, now);

      expect(result.intent).toBe('CREATE_EVENT');
      expect(result.recurrence).toEqual({
        freq: 'WEEKLY',
        interval: 1,
        byDay: ['MO']
      });
      expect(result.title).toBe('Standup');
    });

    it('parses daily recurrence', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('daily Standup at 9 am', payloadEn, now);

      expect(result.recurrence).toEqual({
        freq: 'DAILY',
        interval: 1,
        byDay: undefined
      });
      expect(result.hours).toBe(9);
      expect(result.title).toBe('Standup');
    });
  });

  describe('no-match fallback', () => {
    it('returns raw input as title when no rules match', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('Random meeting title', payloadEn, now);

      expect(result.intent).toBe('CREATE_EVENT');
      expect(result.title).toBe('Random meeting title');
      expect(result.matchedRules).toEqual([]);
    });

    it('returns empty string as title for empty input', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('', payloadEn, now);

      expect(result.intent).toBe('CREATE_EVENT');
      expect(result.title).toBe('');
    });
  });

  describe('ADD_MINUTES and ADD_WEEKS', () => {
    it('handles "in 30 minutes"', () => {
      const now = new Date('2026-05-07T14:15:00');
      const result = processNaturalLanguage('in 30 minutes Break', payloadEn, now);

      expect(result.hours).toBe(14);
      expect(result.minutes).toBe(45);
      expect(result.title).toBe('Break');
    });

    it('handles "in 2 weeks"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('in 2 weeks Sprint review', payloadEn, now);

      expect(result.date).toBe('2026-05-21');
      expect(result.title).toBe('Sprint review');
    });
  });

  describe('relative navigation', () => {
    it('handles "next week"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('next week Planning', payloadEn, now);

      expect(result.date).toBe('2026-05-14');
      expect(result.title).toBe('Planning');
    });

    it('handles "next month"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('next month Review', payloadEn, now);

      expect(result.date).toBe('2026-06-06');
      expect(result.title).toBe('Review');
    });
  });

  describe('orchestrator intents', () => {
    it('short-circuits on OPEN_SETTINGS', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('open settings', payloadEn, now);

      expect(result.intent).toBe('OPEN_SETTINGS');
      expect(result.title).toBe('');
      expect(result.matchedRules).toEqual(['open_settings']);
    });

    it('short-circuits on OPEN_CHRONO', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('open chrono', payloadEn, now);

      expect(result.intent).toBe('OPEN_CHRONO');
      expect(result.title).toBe('');
    });

    it('recognizes "show analyser"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('show analyser', payloadEn, now);

      expect(result.intent).toBe('OPEN_CHRONO');
    });

    it('short-circuits on SHOW_CHANGELOG', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('show changelog', payloadEn, now);

      expect(result.intent).toBe('SHOW_CHANGELOG');
      expect(result.title).toBe('');
    });

    it('recognizes "show whats new"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('show whats new', payloadEn, now);

      expect(result.intent).toBe('SHOW_CHANGELOG');
    });

    it('short-circuits on SHOW_MILESTONES', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('open milestones', payloadEn, now);

      expect(result.intent).toBe('SHOW_MILESTONES');
      expect(result.title).toBe('');
      expect(result.matchedRules).toEqual(['show_milestones']);
    });

    it('recognizes "show achievements"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('show achievements', payloadEn, now);

      expect(result.intent).toBe('SHOW_MILESTONES');
    });

    it('short-circuits on RESET_CACHE', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('reset cache', payloadEn, now);

      expect(result.intent).toBe('RESET_CACHE');
      expect(result.title).toBe('');
    });

    it('recognizes "clear event cache"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('clear event cache', payloadEn, now);

      expect(result.intent).toBe('RESET_CACHE');
    });

    it('short-circuits on REVALIDATE_REMOTE', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('revalidate remote calendars', payloadEn, now);

      expect(result.intent).toBe('REVALIDATE_REMOTE');
      expect(result.title).toBe('');
    });

    it('recognizes "refresh calendars"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('refresh calendars', payloadEn, now);

      expect(result.intent).toBe('REVALIDATE_REMOTE');
    });

    it('short-circuits on SYNC_ACTIVITYWATCH', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('sync activitywatch', payloadEn, now);

      expect(result.intent).toBe('SYNC_ACTIVITYWATCH');
      expect(result.title).toBe('');
    });

    it('recognizes "sync aw"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('sync aw', payloadEn, now);

      expect(result.intent).toBe('SYNC_ACTIVITYWATCH');
    });

    it('short-circuits on SYNC_FCR_REMINDER', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('sync companion', payloadEn, now);

      expect(result.intent).toBe('SYNC_FCR_REMINDER');
      expect(result.title).toBe('');
    });

    it('recognizes "update reminder companion"', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('update reminder companion', payloadEn, now);

      expect(result.intent).toBe('SYNC_FCR_REMINDER');
    });
  });

  describe('GOTO_DATE (non-short-circuiting)', () => {
    it('"go to tomorrow" sets intent and advances date', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('go to tomorrow', payloadEn, now);

      expect(result.intent).toBe('GOTO_DATE');
      expect(result.date).toBe('2026-05-08');
      expect(result.matchedRules).toContain('goto_date');
      expect(result.matchedRules).toContain('tomorrow');
    });

    it('"goto next tuesday" advances to next Tuesday', () => {
      const now = new Date('2026-05-07T10:00:00'); // Thursday
      const result = processNaturalLanguage('goto next tuesday', payloadEn, now);

      expect(result.intent).toBe('GOTO_DATE');
      expect(result.date).toBe('2026-05-12');
    });

    it('"jump to next week" advances by 7 days', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('jump to next week', payloadEn, now);

      expect(result.intent).toBe('GOTO_DATE');
      expect(result.date).toBe('2026-05-14');
    });
  });

  describe('new event prefix strip', () => {
    it('"new event tomorrow Dentist" strips prefix and keeps title', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('new event tomorrow Dentist', payloadEn, now);

      expect(result.intent).toBe('CREATE_EVENT');
      expect(result.date).toBe('2026-05-08');
      expect(result.title).toBe('Dentist');
      expect(result.matchedRules).toContain('new_event');
    });

    it('"create an event at 3 pm Meeting" strips prefix', () => {
      const now = new Date('2026-05-07T10:00:00');
      const result = processNaturalLanguage('create an event at 3 pm Meeting', payloadEn, now);

      expect(result.intent).toBe('CREATE_EVENT');
      expect(result.hours).toBe(15);
      expect(result.title).toBe('Meeting');
    });
  });
});

describe('Smart calendar resolution', () => {
  const baseAction: NLPActionObject = {
    intent: 'CREATE_EVENT',
    title: 'Matthews 2 in daily1',
    date: '2026-05-08',
    hours: 16,
    minutes: 0,
    endHours: null,
    endMinutes: null,
    targetCalendar: null,
    recurrence: null,
    matchedRules: ['tomorrow', 'time_exact_ampm']
  };

  it('strips calendar name from title when it matches a configured calendar', () => {
    const result = resolveSmartCalendar(baseAction, ['daily1', 'Work', 'Personal']);

    expect(result.title).toBe('Matthews 2');
    expect(result.targetCalendar).toBe('daily1');
    expect(result.matchedRules).toContain('smart_calendar');
  });

  it('preserves title unchanged when no calendar matches', () => {
    const result = resolveSmartCalendar(baseAction, ['Work', 'Personal']);

    expect(result.title).toBe('Matthews 2 in daily1');
    expect(result.targetCalendar).toBeNull();
  });

  it('is case-insensitive', () => {
    const action = { ...baseAction, title: 'Meeting in WORK' };
    const result = resolveSmartCalendar(action, ['work', 'Personal']);

    expect(result.title).toBe('Meeting');
    expect(result.targetCalendar).toBe('work');
  });

  it('skips if targetCalendar is already set by explicit rule', () => {
    const action = { ...baseAction, targetCalendar: 'ExplicitCal' };
    const result = resolveSmartCalendar(action, ['daily1']);

    expect(result.targetCalendar).toBe('ExplicitCal');
    expect(result.title).toBe('Matthews 2 in daily1');
  });

  it('skips for non-CREATE_EVENT intents', () => {
    const action = { ...baseAction, intent: 'NAVIGATE_WEEK' as const };
    const result = resolveSmartCalendar(action, ['daily1']);

    expect(result.title).toBe('Matthews 2 in daily1');
    expect(result.targetCalendar).toBeNull();
  });

  it('handles "Meeting in London in daily1" correctly (matches last "in")', () => {
    const action = { ...baseAction, title: 'Meeting in London in daily1' };
    const result = resolveSmartCalendar(action, ['daily1', 'London']);

    // Should match the LAST "in <name>" that resolves to a calendar
    expect(result.title).toBe('Meeting in London');
    expect(result.targetCalendar).toBe('daily1');
  });
});
