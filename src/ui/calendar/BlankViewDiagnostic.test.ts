import { Calendar } from '@fullcalendar/core';
import { runBlankViewDiagnostic, buildReport } from './BlankViewDiagnostic';
import { showNotice } from '../../utils/showNotice';
import type { ExtraRenderProps } from '../settings/sections/calendars/calendar';

jest.mock('../../utils/showNotice', () => ({
  showNotice: jest.fn()
}));

describe('BlankViewDiagnostic', () => {
  let mockCal: Partial<Calendar>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const mockEl = document.createElement('div');
    document.body.appendChild(mockEl);

    mockCal = {
      el: mockEl,
      view: { type: 'timeGridWeek' } as any,
      getEvents: jest.fn().mockReturnValue([])
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('buildReport', () => {
    it('should report zero-width time window as critical', () => {
      const renderProps: ExtraRenderProps = {
        slotMinTime: '08:00',
        slotMaxTime: '08:00'
      };
      const report = buildReport(mockCal as Calendar, renderProps, 100, null);

      expect(report.viewType).toBe('timeGridWeek');
      expect(report.storeEventCount).toBe(100);
      expect(report.renderedEventCount).toBe(0);

      const timeWindowFinding = report.findings.find(f => f.key === 'zeroWidthTimeWindow');
      expect(timeWindowFinding).toBeDefined();
      expect(timeWindowFinding?.isCritical).toBe(true);
      expect(timeWindowFinding?.value).toContain('ZERO-WIDTH');
    });

    it('should include hidden days, weekends, search query, and timezone in findings', () => {
      const renderProps: ExtraRenderProps = {
        slotMinTime: '00:00',
        slotMaxTime: '24:00',
        hiddenDays: [0, 6],
        weekends: false,
        initialSearchQuery: 'Meeting',
        timeZone: 'Europe/Budapest'
      };
      const activeWorkspace = {
        id: 'ws-1',
        name: 'Work',
        visibleCalendars: ['cal-1'],
        categoryFilter: { mode: 'show-only' as const, categories: ['Work'] }
      } as any;

      const report = buildReport(mockCal as Calendar, renderProps, 50, activeWorkspace);

      const keys = report.findings.map(f => f.key);
      expect(keys).toContain('timeWindow');
      expect(keys).toContain('hiddenDays');
      expect(keys).toContain('weekendsHidden');
      expect(keys).toContain('activeWorkspace');
      expect(keys).toContain('workspaceCalendarFilter');
      expect(keys).toContain('workspaceCategoryFilter');
      expect(keys).toContain('activeSearchQuery');
      expect(keys).toContain('displayTimezone');
    });
  });

  describe('runBlankViewDiagnostic', () => {
    it('should return early if view is not timeGrid', () => {
      Object.defineProperty(mockCal, 'view', {
        value: { type: 'dayGridMonth' },
        configurable: true,
        writable: true
      });
      runBlankViewDiagnostic(mockCal as Calendar, {}, 10, null);

      expect(console.warn).not.toHaveBeenCalled();
      expect(showNotice).not.toHaveBeenCalled();
    });

    it('should return early if rendered events > 0', () => {
      (mockCal.getEvents as jest.Mock).mockReturnValue([
        { id: '1', extendedProps: { isShadow: false } }
      ]);
      runBlankViewDiagnostic(mockCal as Calendar, {}, 10, null);

      expect(console.warn).not.toHaveBeenCalled();
      expect(showNotice).not.toHaveBeenCalled();
    });

    it('should ignore shadow events when counting rendered events', () => {
      (mockCal.getEvents as jest.Mock).mockReturnValue([
        { id: 'shadow-1', extendedProps: { isShadow: true } }
      ]);
      runBlankViewDiagnostic(mockCal as Calendar, {}, 10, null);

      expect(console.warn).toHaveBeenCalled();
      expect(showNotice).toHaveBeenCalled();
    });

    it('should return early if store count is 0', () => {
      runBlankViewDiagnostic(mockCal as Calendar, {}, 0, null);

      expect(console.warn).not.toHaveBeenCalled();
      expect(showNotice).not.toHaveBeenCalled();
    });

    it('should return early if calendar element is unmounted', () => {
      const unmountedEl = document.createElement('div');
      // Not appended to document.body
      mockCal.el = unmountedEl;

      runBlankViewDiagnostic(mockCal as Calendar, {}, 10, null);

      expect(console.warn).not.toHaveBeenCalled();
      expect(showNotice).not.toHaveBeenCalled();
    });
  });
});
