/**
 * @file TemplateEngine.test.ts
 * @brief Tests for the Event Linked Note TemplateEngine.
 */

import { TemplateEngine } from './TemplateEngine';
import { OFCEvent } from '../../types';
import { DateTime } from 'luxon';

describe('TemplateEngine', () => {
  const mockEvent: OFCEvent = {
    title: 'Brainstorming Session',
    description: 'Discuss next major features and UI remastering.',
    type: 'single',
    date: '2026-05-20',
    endDate: null,
    allDay: false,
    startTime: '10:00',
    endTime: '11:30',
    url: 'https://zoom.us/j/123456789'
  };

  // Add the custom location to mock event safely
  const mockEventWithLocation: OFCEvent = {
    ...mockEvent,
    location: 'Meeting Room A'
  };

  it('should render default template with all placeholders replaced', () => {
    const template = TemplateEngine.DEFAULT_TEMPLATE;
    const result = TemplateEngine.render(template, mockEventWithLocation, 'Work Calendar');

    const expectedDate = DateTime.fromISO('2026-05-20').toLocaleString(DateTime.DATE_HUGE);
    const expectedTime = `${DateTime.fromFormat('10:00', 'HH:mm').toLocaleString(DateTime.TIME_SIMPLE)} - ${DateTime.fromFormat('11:30', 'HH:mm').toLocaleString(DateTime.TIME_SIMPLE)}`;

    expect(result).toContain('# Brainstorming Session');
    expect(result).toContain(`**Date**: ${expectedDate}`);
    expect(result).toContain(`**Time**: ${expectedTime}`);
    expect(result).toContain('**Location**: Meeting Room A');
    expect(result).toContain('**Calendar**: Work Calendar');
    expect(result).toContain('Discuss next major features and UI remastering.');
  });

  it('should support spaces inside double braces and case insensitivity', () => {
    const template = 'Title: {{ TITLE }}, Date: {{  date  }}, Location: {{LOCATION}}';
    const result = TemplateEngine.render(template, mockEventWithLocation, 'Test Cal');

    const expectedDate = DateTime.fromISO('2026-05-20').toLocaleString(DateTime.DATE_HUGE);

    expect(result).toBe(
      `Title: Brainstorming Session, Date: ${expectedDate}, Location: Meeting Room A`
    );
  });

  it('should render all-day string correctly', () => {
    const allDayEvent: OFCEvent = {
      ...mockEvent,
      allDay: true
    };
    const template = 'Time: {{timeString}}';
    const result = TemplateEngine.render(template, allDayEvent, 'Test Cal');

    expect(result).toBe('Time: All Day');
  });

  it('should handle empty or missing properties gracefully', () => {
    const minimalEvent: OFCEvent = {
      title: 'Minimal Event',
      type: 'single',
      date: '2026-05-20',
      endDate: null,
      allDay: true
    };

    const template =
      'Title: {{title}}, Desc: {{description}}, Loc: {{location}}, URL: {{url}}, Cal: {{calendarName}}';
    const result = TemplateEngine.render(template, minimalEvent, 'Test Cal');

    expect(result).toBe('Title: Minimal Event, Desc: , Loc: , URL: , Cal: Test Cal');
  });

  it('should format and inject instanceDate if provided', () => {
    const recurringEvent: OFCEvent = {
      title: 'Weekly Standup',
      type: 'recurring',
      startRecur: '2026-05-01',
      endRecur: '2026-06-01',
      endDate: null,
      skipDates: [],
      allDay: true
    };
    const template = 'Date: {{date}}';
    const result = TemplateEngine.render(template, recurringEvent, 'Test Cal', '2026-05-22');

    const expectedDate = DateTime.fromISO('2026-05-22').toLocaleString(DateTime.DATE_HUGE);
    expect(result).toBe(`Date: ${expectedDate}`);
  });
});
