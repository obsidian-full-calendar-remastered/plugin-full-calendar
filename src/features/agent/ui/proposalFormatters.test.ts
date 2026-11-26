/**
 * @file proposalFormatters.test.ts
 * @brief Unit tests for proposalFormatters (12h/24h formatting, categorization toggle, schedule extraction).
 */

import { PluginState } from '../../../core/PluginState';
import { DEFAULT_SETTINGS } from '../../../types/settings';
import type { EventProposal } from '../types';
import {
  extractProposalCategory,
  extractProposalHeadingTitle,
  extractProposalSchedule,
  formatDiffFieldValue,
  formatProposalDate,
  formatProposalSchedule,
  formatProposalTime,
  readProposalDisplayContext,
  type ProposalDisplayContext
} from './proposalFormatters';

const ctx24On: ProposalDisplayContext = {
  timeFormat24h: true,
  enableAdvancedCategorization: true,
  categoryColors: new Map([['Wellness', '#a0a000']])
};

const ctx12Off: ProposalDisplayContext = {
  timeFormat24h: false,
  enableAdvancedCategorization: false,
  categoryColors: new Map()
};

describe('proposalFormatters', () => {
  afterEach(() => {
    PluginState.clear();
  });

  it('formats times in 24h and 12h AM/PM modes', () => {
    expect(formatProposalTime('09:24', true)).toBe('09:24');
    expect(formatProposalTime('14:05', true)).toBe('14:05');
    expect(formatProposalTime('09:24', false)).toBe('9:24 AM');
    expect(formatProposalTime('13:14', false)).toBe('1:14 PM');
    expect(formatProposalTime('00:15', false)).toBe('12:15 AM');
    expect(formatProposalTime('12:00', false)).toBe('12:00 PM');
    expect(formatProposalTime(null, false)).toBe('');
  });

  it('formats ISO dates locally without UTC off-by-one shift', () => {
    expect(formatProposalDate('2026-11-15')).toBe('Sun, Nov 15');
    expect(formatProposalDate('2026-11-16')).toBe('Mon, Nov 16');
    expect(formatProposalDate('2026-01-01')).toBe('Thu, Jan 1');
    expect(formatProposalDate('2026-02-31')).toBe('2026-02-31');
  });

  it('formats single, all-day, and batch schedules cleanly', () => {
    expect(
      formatProposalSchedule(
        { date: '2026-11-16', allDay: false, startTime: '09:24', endTime: '11:14' },
        ctx24On
      )
    ).toBe('Mon, Nov 16 \u00b7 09:24\u201311:14');

    expect(
      formatProposalSchedule(
        { date: '2026-11-16', allDay: false, startTime: '09:24', endTime: '13:14' },
        ctx12Off
      )
    ).toBe('Mon, Nov 16 \u00b7 9:24 AM\u20131:14 PM');

    expect(formatProposalSchedule({ date: '2026-11-17', allDay: true }, ctx24On)).toBe(
      'Tue, Nov 17 \u00b7 All day'
    );
  });

  it('hides category/subcategory metadata and preserves literal title when advanced categorization is off', () => {
    const updateProposal: EventProposal = {
      id: 'prop_u1',
      type: 'UPDATE',
      status: 'PENDING',
      createdAt: 1000,
      calendarId: 'daily',
      calendarName: 'DailyNote',
      eventId: 'ev_1',
      originalEvent: {
        id: 'ev_1',
        type: 'single',
        date: '2026-11-16',
        endDate: null,
        allDay: false,
        startTime: '09:24',
        endTime: '11:14',
        title: 'Wellness - YouTube - Watch AI',
        category: 'Wellness',
        subCategory: 'YouTube'
      },
      updatedEvent: {
        id: 'ev_1',
        type: 'single',
        date: '2026-11-16',
        endDate: null,
        allDay: false,
        startTime: '09:24',
        endTime: '11:14',
        title: 'Wellness - Watch AI',
        category: 'Wellness',
        subCategory: 'YouTube'
      },
      changedFields: {
        title: { old: 'Wellness - YouTube - Watch AI', new: 'Wellness - Watch AI' }
      }
    };

    expect(extractProposalCategory(updateProposal, ctx24On)).toEqual({
      category: 'Wellness',
      subCategory: 'YouTube',
      color: '#a0a000'
    });
    expect(extractProposalCategory(updateProposal, ctx12Off)).toEqual({});

    expect(extractProposalHeadingTitle(updateProposal, ctx24On)).toBe('Watch AI');
    expect(extractProposalHeadingTitle(updateProposal, ctx12Off)).toBe('Wellness - Watch AI');
    expect(extractProposalSchedule(updateProposal, ctx24On)).toBe(
      'Mon, Nov 16 \u00b7 09:24\u201311:14'
    );
  });

  it('extracts schedule and strips prefixes on DELETE proposals when enabled', () => {
    const deleteProposal: EventProposal = {
      id: 'prop_d1',
      type: 'DELETE',
      status: 'PENDING',
      createdAt: 1000,
      calendarId: 'daily',
      calendarName: 'DailyNote',
      eventId: 'ev_2',
      eventTitle: 'Wellness - YouTube - Old Watch',
      eventDate: '2026-11-20',
      eventAllDay: false,
      eventStartTime: '13:50',
      eventEndTime: '14:11',
      eventCategory: 'Wellness',
      eventSubCategory: 'YouTube',
      reason: 'Duplicate'
    };

    expect(extractProposalSchedule(deleteProposal, ctx12Off)).toBe(
      'Fri, Nov 20 \u00b7 1:50 PM\u20132:11 PM'
    );
    expect(extractProposalHeadingTitle(deleteProposal, ctx24On)).toBe('Old Watch');
    expect(extractProposalHeadingTitle(deleteProposal, ctx12Off)).toBe(
      'Wellness - YouTube - Old Watch'
    );
    expect(extractProposalCategory(deleteProposal, ctx12Off)).toEqual({});
    expect(extractProposalCategory(deleteProposal, ctx24On)).toEqual({
      category: 'Wellness',
      subCategory: 'YouTube',
      color: '#a0a000'
    });
  });

  it('formats diff field values consistently', () => {
    expect(formatDiffFieldValue('startTime', '13:30', ctx12Off)).toBe('1:30 PM');
    expect(formatDiffFieldValue('startTime', '13:30', ctx24On)).toBe('13:30');
    expect(formatDiffFieldValue('date', '2026-11-16', ctx12Off)).toBe('Mon, Nov 16');
    expect(formatDiffFieldValue('allDay', true, ctx12Off)).toBe('All day');
    expect(formatDiffFieldValue('category', undefined, ctx12Off)).toBe('None');
  });

  it('reads PluginState settings safely with fallback when uninitialized', () => {
    expect(readProposalDisplayContext().enableAdvancedCategorization).toBe(false);

    PluginState.setSettings({
      ...DEFAULT_SETTINGS,
      timeFormat24h: true,
      enableAdvancedCategorization: true,
      categorySettings: [{ name: 'Study', color: '#8844cc' }]
    });
    const ctx = readProposalDisplayContext();
    expect(ctx.timeFormat24h).toBe(true);
    expect(ctx.enableAdvancedCategorization).toBe(true);
    expect(ctx.categoryColors.get('Study')).toBe('#8844cc');
  });

  it('handles multi-day ranges, recurring events with start dates, cross-year dates, invalid minutes, and batch items', async () => {
    expect(formatProposalTime('09:75', true)).toBe('09:75');
    expect(formatProposalDate('2027-03-15')).toContain('2027');

    expect(
      formatProposalSchedule(
        { date: '2026-11-16', endDate: '2026-11-18', allDay: true, recurring: true },
        ctx24On
      )
    ).toBe('Mon, Nov 16\u2013Wed, Nov 18 \u00b7 Recurring \u00b7 All day');

    const { extractBatchItemDisplay } = await import('./proposalFormatters');
    const batchItem = {
      id: 'b_1',
      selected: true,
      calendarId: 'daily',
      cleanTitle: 'Standup',
      category: 'Wellness',
      subCategory: 'YouTube',
      eventData: {
        title: 'Wellness - YouTube - Standup',
        type: 'single' as const,
        date: '2026-11-16',
        endDate: null,
        allDay: false,
        startTime: '09:00',
        endTime: '09:30',
        category: 'Wellness',
        subCategory: 'YouTube'
      }
    };

    expect(extractBatchItemDisplay(batchItem, ctx24On)).toEqual({
      title: 'Standup',
      schedule: 'Mon, Nov 16 \u00b7 09:00\u201309:30',
      category: 'Wellness',
      subCategory: 'YouTube',
      color: '#a0a000'
    });
    expect(extractBatchItemDisplay(batchItem, ctx12Off)).toEqual({
      title: 'Wellness - YouTube - Standup',
      schedule: 'Mon, Nov 16 \u00b7 9:00 AM\u20139:30 AM'
    });

    const rescheduledUpdate: EventProposal = {
      id: 'u_move',
      type: 'UPDATE',
      status: 'APPROVED',
      createdAt: 1000,
      calendarId: 'daily',
      calendarName: 'Daily',
      eventId: 'ev_m',
      originalEvent: {
        title: 'Sync',
        type: 'single',
        date: '2026-11-16',
        endDate: null,
        allDay: false,
        startTime: '09:00',
        endTime: '10:00'
      },
      updatedEvent: {
        title: 'Sync',
        type: 'single',
        date: '2026-11-17',
        endDate: null,
        allDay: false,
        startTime: '14:00',
        endTime: '15:00'
      },
      changedFields: { date: { old: '2026-11-16', new: '2026-11-17' } }
    };
    expect(extractProposalSchedule(rescheduledUpdate, ctx24On, 'All day', 'Recurring', false)).toBe(
      'Mon, Nov 16 \u00b7 09:00\u201310:00'
    );
    expect(extractProposalSchedule(rescheduledUpdate, ctx24On, 'All day', 'Recurring', true)).toBe(
      'Tue, Nov 17 \u00b7 14:00\u201315:00'
    );
  });
});
