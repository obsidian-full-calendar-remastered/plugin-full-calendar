/**
 * @file EventHighlightManager.test.ts
 * @brief Unit tests for current/next event highlighting, verifying robust recurring
 * event handling where only the single immediate next instance is highlighted.
 */

import type { EventApi } from '@fullcalendar/core';
import {
  createEventHighlightManager,
  findCurrentOrNextEvent,
  getEventInstanceKey
} from './calendarInteractions';

describe('EventHighlightManager - Recurring & Next Event Highlighting', () => {
  describe('getEventInstanceKey', () => {
    it('creates deterministic keys for different instances of the same recurring event', () => {
      const instance1 = {
        id: 'gym-yoga-flow',
        title: 'Gym - Yoga Flow',
        start: new Date('2026-10-12T20:08:00+02:00')
      };
      const instance2 = {
        id: 'gym-yoga-flow',
        title: 'Gym - Yoga Flow',
        start: new Date('2026-10-16T20:08:00+02:00')
      };
      const instance3 = {
        id: 'gym-yoga-flow',
        title: 'Gym - Yoga Flow',
        start: new Date('2026-10-19T20:08:00+02:00')
      };

      const key1 = getEventInstanceKey(instance1);
      const key2 = getEventInstanceKey(instance2);
      const key3 = getEventInstanceKey(instance3);

      expect(key1).not.toBe(key2);
      expect(key2).not.toBe(key3);
      expect(key1).toBe(`gym-yoga-flow::${instance1.start.getTime()}`);
      expect(key2).toBe(`gym-yoga-flow::${instance2.start.getTime()}`);
    });

    it('falls back to title when id is missing', () => {
      const eventWithoutId = {
        title: 'Team Standup',
        start: new Date('2026-10-16T09:00:00+02:00')
      };
      expect(getEventInstanceKey(eventWithoutId)).toBe(
        `Team Standup::${eventWithoutId.start.getTime()}`
      );
    });

    it('handles startStr when start Date object is not provided', () => {
      const eventWithStartStr = {
        id: 'evt-1',
        startStr: '2026-10-16T14:00:00Z'
      };
      const expectedMs = new Date('2026-10-16T14:00:00Z').getTime();
      expect(getEventInstanceKey(eventWithStartStr)).toBe(`evt-1::${expectedMs}`);
    });
  });

  describe('findCurrentOrNextEvent', () => {
    const fixedNow = new Date('2026-10-16T18:55:00+02:00').getTime();

    it('returns null if highlightCurrentOrNextEvent is disabled', () => {
      const event = {
        id: 'gym-flow',
        start: new Date('2026-10-16T20:08:00+02:00'),
        end: new Date('2026-10-16T21:38:00+02:00'),
        allDay: false
      } as unknown as EventApi;

      const result = findCurrentOrNextEvent([event], {
        highlightCurrentOrNextEvent: false,
        nowMs: fixedNow
      });
      expect(result).toBeNull();
    });

    it('ignores all-day and shadow events', () => {
      const allDayEvent = {
        id: 'all-day',
        start: new Date('2026-10-16T00:00:00+02:00'),
        allDay: true
      } as unknown as EventApi;
      const shadowEvent = {
        id: 'shadow',
        start: new Date('2026-10-16T20:08:00+02:00'),
        allDay: false,
        extendedProps: { isShadow: true }
      } as unknown as EventApi;

      const result = findCurrentOrNextEvent([allDayEvent, shadowEvent], {
        highlightCurrentOrNextEvent: true,
        nowMs: fixedNow
      });
      expect(result).toBeNull();
    });

    it('selects ONLY the immediate next instance of a recurring sequence, ignoring past and distant future instances', () => {
      const pastInstance = {
        id: 'gym-yoga-flow',
        title: 'Gym - Yoga Flow',
        start: new Date('2026-10-12T20:08:00+02:00'),
        end: new Date('2026-10-12T21:38:00+02:00'),
        allDay: false
      } as unknown as EventApi;

      const immediateNextInstance = {
        id: 'gym-yoga-flow',
        title: 'Gym - Yoga Flow',
        start: new Date('2026-10-16T20:08:00+02:00'),
        end: new Date('2026-10-16T21:38:00+02:00'),
        allDay: false
      } as unknown as EventApi;

      const futureInstance1 = {
        id: 'gym-yoga-flow',
        title: 'Gym - Yoga Flow',
        start: new Date('2026-10-19T20:08:00+02:00'),
        end: new Date('2026-10-19T21:38:00+02:00'),
        allDay: false
      } as unknown as EventApi;

      const futureInstance2 = {
        id: 'gym-yoga-flow',
        title: 'Gym - Yoga Flow',
        start: new Date('2026-10-23T20:08:00+02:00'),
        end: new Date('2026-10-23T21:38:00+02:00'),
        allDay: false
      } as unknown as EventApi;

      const events = [pastInstance, immediateNextInstance, futureInstance1, futureInstance2];
      const selected = findCurrentOrNextEvent(events, {
        highlightCurrentOrNextEvent: true,
        nowMs: fixedNow
      });

      expect(selected).toBe(immediateNextInstance);
      expect(getEventInstanceKey(selected!)).toBe(
        `gym-yoga-flow::${immediateNextInstance.start!.getTime()}`
      );
    });

    it('selects the currently active event if one is in progress', () => {
      const currentEvent = {
        id: 'meeting',
        title: 'Ongoing Meeting',
        start: new Date('2026-10-16T18:30:00+02:00'),
        end: new Date('2026-10-16T19:30:00+02:00'),
        allDay: false
      } as unknown as EventApi;

      const nextEvent = {
        id: 'gym-yoga-flow',
        title: 'Gym - Yoga Flow',
        start: new Date('2026-10-16T20:08:00+02:00'),
        end: new Date('2026-10-16T21:38:00+02:00'),
        allDay: false
      } as unknown as EventApi;

      const selected = findCurrentOrNextEvent([currentEvent, nextEvent], {
        highlightCurrentOrNextEvent: true,
        nowMs: fixedNow
      });

      expect(selected).toBe(currentEvent);
    });
  });

  describe('createEventHighlightManager DOM highlighting', () => {
    let containerEl: HTMLElement;
    let mockDoc: Document;

    beforeEach(() => {
      containerEl = document.createElement('div');
      mockDoc = document;
    });

    const createMockEventDomElement = (
      eventId: string,
      instanceKey: string,
      harnessClass: string = 'fc-timegrid-event-harness'
    ): { harness: HTMLElement; eventEl: HTMLElement } => {
      const harness = document.createElement('div');
      harness.className = harnessClass;
      const eventEl = document.createElement('div');
      eventEl.className = 'fc-event';
      eventEl.setAttribute('data-event-id', eventId);
      eventEl.setAttribute('data-event-instance-key', instanceKey);
      harness.appendChild(eventEl);
      containerEl.appendChild(harness);
      return { harness, eventEl };
    };

    it('highlights ONLY the immediate next recurring instance and leaves past/future recurring instances untouched', () => {
      const pastStart = new Date('2026-10-12T20:08:00Z');
      const nextStart = new Date('2026-10-16T20:08:00Z');
      const futureStart = new Date('2026-10-19T20:08:00Z');

      const pastInstance = {
        id: 'gym-flow',
        title: 'Gym - Yoga Flow',
        start: pastStart,
        end: new Date('2026-10-12T21:38:00Z'),
        allDay: false
      } as unknown as EventApi;
      const nextInstance = {
        id: 'gym-flow',
        title: 'Gym - Yoga Flow',
        start: nextStart,
        end: new Date('2026-10-16T21:38:00Z'),
        allDay: false
      } as unknown as EventApi;
      const futureInstance = {
        id: 'gym-flow',
        title: 'Gym - Yoga Flow',
        start: futureStart,
        end: new Date('2026-10-19T21:38:00Z'),
        allDay: false
      } as unknown as EventApi;

      const keyPast = getEventInstanceKey(pastInstance);
      const keyNext = getEventInstanceKey(nextInstance);
      const keyFuture = getEventInstanceKey(futureInstance);

      const pastDom = createMockEventDomElement('gym-flow', keyPast);
      const nextDom = createMockEventDomElement('gym-flow', keyNext);
      const futureDom = createMockEventDomElement('gym-flow', keyFuture);

      const events = [pastInstance, nextInstance, futureInstance];
      const manager = createEventHighlightManager(
        containerEl,
        { highlightCurrentOrNextEvent: true },
        () => events as unknown as import('@fullcalendar/core').Calendar,
        mockDoc
      );

      // Spy on Date.now to simulate 18:55 on 2026-10-16
      const dateSpy = jest
        .spyOn(Date, 'now')
        .mockReturnValue(new Date('2026-10-16T18:55:00Z').getTime());

      manager.updateCurrentOrNextEventHighlight(events);

      // Verify ONLY nextDom is highlighted
      expect(nextDom.eventEl.classList.contains('ofc-event-current-or-next')).toBe(true);
      expect(nextDom.harness.classList.contains('ofc-event-current-or-next-harness')).toBe(true);

      // Verify past instance is NOT highlighted
      expect(pastDom.eventEl.classList.contains('ofc-event-current-or-next')).toBe(false);
      expect(pastDom.harness.classList.contains('ofc-event-current-or-next-harness')).toBe(false);

      // Verify future instance is NOT highlighted
      expect(futureDom.eventEl.classList.contains('ofc-event-current-or-next')).toBe(false);
      expect(futureDom.harness.classList.contains('ofc-event-current-or-next-harness')).toBe(false);

      // Verify isInstanceHighlighted helper
      expect(manager.isInstanceHighlighted(keyNext)).toBe(true);
      expect(manager.isInstanceHighlighted(keyPast)).toBe(false);
      expect(manager.isInstanceHighlighted(keyFuture)).toBe(false);

      dateSpy.mockRestore();
      manager.destroy();
    });

    it('highlights a non-recurring event when it is the immediate next event', () => {
      const nextStart = new Date('2026-10-16T20:00:00Z');
      const singleEvent = {
        id: 'single-interview',
        title: 'Interview',
        start: nextStart,
        end: new Date('2026-10-16T21:00:00Z'),
        allDay: false
      } as unknown as EventApi;

      const singleKey = getEventInstanceKey(singleEvent);
      const singleDom = createMockEventDomElement('single-interview', singleKey);

      const manager = createEventHighlightManager(
        containerEl,
        { highlightCurrentOrNextEvent: true },
        () => [singleEvent] as unknown as import('@fullcalendar/core').Calendar,
        mockDoc
      );

      const dateSpy = jest
        .spyOn(Date, 'now')
        .mockReturnValue(new Date('2026-10-16T19:00:00Z').getTime());

      manager.updateCurrentOrNextEventHighlight([singleEvent]);

      expect(singleDom.eventEl.classList.contains('ofc-event-current-or-next')).toBe(true);
      expect(singleDom.harness.classList.contains('ofc-event-current-or-next-harness')).toBe(true);

      dateSpy.mockRestore();
      manager.destroy();
    });

    it('clears all highlights when highlightCurrentOrNextEvent is disabled', () => {
      const nextStart = new Date('2026-10-16T20:00:00Z');
      const singleEvent = {
        id: 'single-interview',
        title: 'Interview',
        start: nextStart,
        end: new Date('2026-10-16T21:00:00Z'),
        allDay: false
      } as unknown as EventApi;

      const singleKey = getEventInstanceKey(singleEvent);
      const singleDom = createMockEventDomElement('single-interview', singleKey);

      const settings = { highlightCurrentOrNextEvent: true };
      const manager = createEventHighlightManager(
        containerEl,
        settings,
        () => [singleEvent] as unknown as import('@fullcalendar/core').Calendar,
        mockDoc
      );

      const dateSpy = jest
        .spyOn(Date, 'now')
        .mockReturnValue(new Date('2026-10-16T19:00:00Z').getTime());

      manager.updateCurrentOrNextEventHighlight([singleEvent]);
      expect(singleDom.eventEl.classList.contains('ofc-event-current-or-next')).toBe(true);

      // Disable setting
      settings.highlightCurrentOrNextEvent = false;
      manager.updateCurrentOrNextEventHighlight([singleEvent]);

      expect(singleDom.eventEl.classList.contains('ofc-event-current-or-next')).toBe(false);
      expect(singleDom.harness.classList.contains('ofc-event-current-or-next-harness')).toBe(false);

      dateSpy.mockRestore();
      manager.destroy();
    });
  });
});
