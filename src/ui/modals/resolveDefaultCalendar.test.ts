/**
 * @file resolveDefaultCalendar.test.ts
 * @brief Unit tests for default-calendar resolution in the event creation modal.
 *
 * @license See LICENSE.md
 */

import { resolveDefaultCalendarIndex } from './resolveDefaultCalendar';

const candidates = [{ id: 'local_1' }, { id: 'google_1' }, { id: 'caldav_1' }];

describe('resolveDefaultCalendarIndex', () => {
  describe('fallback to first writable calendar (pre-existing behavior)', () => {
    it('returns 0 when no default is configured anywhere', () => {
      expect(resolveDefaultCalendarIndex({ candidates })).toBe(0);
    });

    it('returns 0 when the candidate list is empty', () => {
      expect(resolveDefaultCalendarIndex({ candidates: [] })).toBe(0);
    });

    it('returns 0 when the global default is not a writable candidate', () => {
      // The default pointed at a calendar that was deleted, or at an ICS/Holiday
      // source that cannot create events.
      expect(resolveDefaultCalendarIndex({ candidates, globalDefaultId: 'deleted_9' })).toBe(0);
    });

    it('treats null and undefined defaults identically', () => {
      expect(resolveDefaultCalendarIndex({ candidates, globalDefaultId: null })).toBe(0);
      expect(resolveDefaultCalendarIndex({ candidates, globalDefaultId: undefined })).toBe(0);
    });
  });

  describe('global default (no workspace active)', () => {
    it('selects the global default when it is a writable candidate', () => {
      expect(resolveDefaultCalendarIndex({ candidates, globalDefaultId: 'google_1' })).toBe(1);
    });

    it('selects the last candidate correctly', () => {
      expect(resolveDefaultCalendarIndex({ candidates, globalDefaultId: 'caldav_1' })).toBe(2);
    });
  });

  describe('workspace override', () => {
    it('prefers the workspace default over the global default', () => {
      expect(
        resolveDefaultCalendarIndex({
          candidates,
          workspaceDefaultId: 'caldav_1',
          globalDefaultId: 'google_1'
        })
      ).toBe(2);
    });

    it('falls back to the global default when the workspace sets none', () => {
      expect(
        resolveDefaultCalendarIndex({
          candidates,
          workspaceDefaultId: undefined,
          globalDefaultId: 'google_1'
        })
      ).toBe(1);
    });

    it('falls back to the global default when the workspace default was deleted', () => {
      expect(
        resolveDefaultCalendarIndex({
          candidates,
          workspaceDefaultId: 'deleted_9',
          globalDefaultId: 'google_1'
        })
      ).toBe(1);
    });

    it('falls back to first writable when neither default is usable', () => {
      expect(
        resolveDefaultCalendarIndex({
          candidates,
          workspaceDefaultId: 'deleted_9',
          globalDefaultId: 'deleted_8'
        })
      ).toBe(0);
    });
  });

  describe('workspace visibility', () => {
    it('ignores a global default that the active workspace hides', () => {
      // Creating into a hidden calendar would make the new event vanish on save.
      expect(
        resolveDefaultCalendarIndex({
          candidates,
          globalDefaultId: 'google_1',
          visibleCalendarIds: ['local_1', 'caldav_1']
        })
      ).toBe(0);
    });

    it('ignores a workspace default that the same workspace hides', () => {
      expect(
        resolveDefaultCalendarIndex({
          candidates,
          workspaceDefaultId: 'google_1',
          globalDefaultId: 'caldav_1',
          visibleCalendarIds: ['local_1', 'caldav_1']
        })
      ).toBe(2);
    });

    it('honours a default that the active workspace shows', () => {
      expect(
        resolveDefaultCalendarIndex({
          candidates,
          globalDefaultId: 'google_1',
          visibleCalendarIds: ['google_1', 'caldav_1']
        })
      ).toBe(1);
    });

    it('treats an empty visible list as "all calendars visible"', () => {
      // WorkspaceSettings documents visibleCalendars as: if empty, show all.
      expect(
        resolveDefaultCalendarIndex({
          candidates,
          globalDefaultId: 'google_1',
          visibleCalendarIds: []
        })
      ).toBe(1);
    });

    it('treats an absent visible list as "all calendars visible"', () => {
      expect(
        resolveDefaultCalendarIndex({
          candidates,
          globalDefaultId: 'google_1',
          visibleCalendarIds: undefined
        })
      ).toBe(1);
    });
  });

  describe('fallback never lands on a workspace-hidden calendar', () => {
    it('skips hidden calendars when falling back with no default configured', () => {
      expect(
        resolveDefaultCalendarIndex({
          candidates,
          visibleCalendarIds: ['caldav_1']
        })
      ).toBe(2);
    });

    it('skips hidden calendars when every configured default is unusable', () => {
      expect(
        resolveDefaultCalendarIndex({
          candidates,
          workspaceDefaultId: 'deleted_9',
          globalDefaultId: 'deleted_8',
          visibleCalendarIds: ['google_1', 'caldav_1']
        })
      ).toBe(1);
    });

    it('skips a hidden calendar that the global default points at', () => {
      expect(
        resolveDefaultCalendarIndex({
          candidates,
          globalDefaultId: 'local_1',
          visibleCalendarIds: ['caldav_1']
        })
      ).toBe(2);
    });

    it('falls back to the first writable calendar when the workspace hides all of them', () => {
      // Degenerate config: selecting something actionable beats selecting nothing.
      expect(
        resolveDefaultCalendarIndex({
          candidates,
          visibleCalendarIds: ['some_other_calendar']
        })
      ).toBe(0);
    });
  });

  describe('explicit caller override', () => {
    it('prefers an explicit id over both configured defaults', () => {
      expect(
        resolveDefaultCalendarIndex({
          candidates,
          explicitId: 'caldav_1',
          workspaceDefaultId: 'local_1',
          globalDefaultId: 'google_1'
        })
      ).toBe(2);
    });

    it('honours an explicit id even when the workspace hides that calendar', () => {
      // A programmatic caller naming a calendar outranks presentation filtering.
      expect(
        resolveDefaultCalendarIndex({
          candidates,
          explicitId: 'google_1',
          visibleCalendarIds: ['local_1']
        })
      ).toBe(1);
    });

    it('falls through to the configured defaults when the explicit id is unknown', () => {
      expect(
        resolveDefaultCalendarIndex({
          candidates,
          explicitId: 'deleted_9',
          globalDefaultId: 'caldav_1'
        })
      ).toBe(2);
    });
  });
});
