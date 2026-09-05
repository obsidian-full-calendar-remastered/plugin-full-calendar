import { EventApi } from '@fullcalendar/core';
import { ViewEventInteractionHandler } from './ViewEventInteractionHandler';
import { ViewContext } from './ViewContext';
import { PluginState } from '../../core/PluginState';
import { OFCEvent } from '../../types';
import { CalendarProvider } from '../../providers/Provider';

jest.mock('../../utils/showNotice', () => ({
  showNotice: jest.fn()
}));

describe('ViewEventInteractionHandler - handleToggleTask', () => {
  let handler: ViewEventInteractionHandler;
  let mockCache: {
    store: {
      getEventDetails: jest.Mock;
    };
    toggleRecurringInstance: jest.Mock;
    updateEventWithId: jest.Mock;
  };
  let mockProviderRegistry: {
    getInstance: jest.Mock;
  };

  beforeEach(() => {
    mockCache = {
      store: {
        getEventDetails: jest.fn()
      },
      toggleRecurringInstance: jest.fn().mockResolvedValue(undefined),
      updateEventWithId: jest.fn().mockResolvedValue(undefined)
    };

    mockProviderRegistry = {
      getInstance: jest.fn()
    };

    (PluginState as unknown as { getCache: () => typeof mockCache }).getCache = () => mockCache;
    (
      PluginState as unknown as { getProviderRegistry: () => typeof mockProviderRegistry }
    ).getProviderRegistry = () => mockProviderRegistry;

    handler = new ViewEventInteractionHandler({} as ViewContext);
  });

  afterEach(() => {
    PluginState.clear();
    jest.clearAllMocks();
  });

  it('delegates recurring task master completion to toggleRecurringInstance instead of provider.toggleComplete', async () => {
    const recurringEvent: OFCEvent = {
      type: 'recurring',
      title: 'Running exercise',
      daysOfWeek: ['U', 'W'],
      allDay: false,
      startTime: '07:00',
      endTime: '08:00',
      endDate: null,
      isTask: true,
      skipDates: []
    };

    const mockToggleComplete = jest.fn().mockResolvedValue(false);
    const mockProvider = {
      toggleComplete: mockToggleComplete
    } as unknown as CalendarProvider<unknown>;

    mockCache.store.getEventDetails.mockReturnValue({
      event: recurringEvent,
      calendarId: 'local_cal'
    });
    mockProviderRegistry.getInstance.mockReturnValue(mockProvider);

    const mockEventApi = {
      id: 'session_1',
      start: new Date('2026-05-10T07:00:00Z'),
      startStr: '2026-05-10T07:00:00Z',
      allDay: false
    } as unknown as EventApi;

    const result = await handler.handleToggleTask(mockEventApi, true);

    expect(result).toBe(true);
    expect(mockToggleComplete).not.toHaveBeenCalled();
    expect(mockCache.toggleRecurringInstance).toHaveBeenCalledWith('session_1', '2026-05-10', true);
  });

  it('delegates child recurring override to toggleRecurringInstance instead of provider.toggleComplete', async () => {
    const overrideEvent: OFCEvent = {
      type: 'single',
      title: 'Running exercise',
      date: '2026-05-10',
      endDate: null,
      allDay: false,
      startTime: '07:00',
      endTime: '08:00',
      completed: '2026-05-10T08:00:00Z',
      recurringEventId: 'Running exercise.md'
    };

    const mockToggleComplete = jest.fn().mockResolvedValue(true);
    const mockProvider = {
      toggleComplete: mockToggleComplete
    } as unknown as CalendarProvider<unknown>;

    mockCache.store.getEventDetails.mockReturnValue({
      event: overrideEvent,
      calendarId: 'local_cal'
    });
    mockProviderRegistry.getInstance.mockReturnValue(mockProvider);

    const mockEventApi = {
      id: 'session_child',
      start: new Date('2026-05-10T07:00:00Z'),
      startStr: '2026-05-10T07:00:00Z',
      allDay: false
    } as unknown as EventApi;

    const result = await handler.handleToggleTask(mockEventApi, false);

    expect(result).toBe(true);
    expect(mockToggleComplete).not.toHaveBeenCalled();
    expect(mockCache.toggleRecurringInstance).toHaveBeenCalledWith(
      'session_child',
      '2026-05-10',
      false
    );
  });

  it('uses provider.toggleComplete for standalone single task events', async () => {
    const singleEvent: OFCEvent = {
      type: 'single',
      title: 'Single Task',
      date: '2026-05-10',
      endDate: null,
      allDay: true,
      completed: false
    };

    const mockToggleComplete = jest.fn().mockResolvedValue(true);
    const mockProvider = {
      toggleComplete: mockToggleComplete
    } as unknown as CalendarProvider<unknown>;

    mockCache.store.getEventDetails.mockReturnValue({
      event: singleEvent,
      calendarId: 'local_cal'
    });
    mockProviderRegistry.getInstance.mockReturnValue(mockProvider);

    const mockEventApi = {
      id: 'single_session',
      start: new Date('2026-05-10T00:00:00Z'),
      startStr: '2026-05-10',
      allDay: true
    } as unknown as EventApi;

    const result = await handler.handleToggleTask(mockEventApi, true);

    expect(result).toBe(true);
    expect(mockToggleComplete).toHaveBeenCalledWith('single_session', true);
    expect(mockCache.toggleRecurringInstance).not.toHaveBeenCalled();
  });

  it('uses provider recurring instance state if provider supports it', async () => {
    const recurringEvent: OFCEvent = {
      type: 'recurring',
      title: 'TaskNotes recurring',
      daysOfWeek: ['M'],
      allDay: true,
      endDate: null,
      isTask: true,
      skipDates: []
    };

    const mockSetRecurringInstanceState = jest.fn().mockResolvedValue(true);
    const mockToggleComplete = jest.fn();
    const mockProvider = {
      getRecurringInstanceState: jest.fn().mockResolvedValue({ completed: false, skipped: false }),
      setRecurringInstanceState: mockSetRecurringInstanceState,
      toggleComplete: mockToggleComplete
    };

    mockCache.store.getEventDetails.mockReturnValue({
      event: recurringEvent,
      calendarId: 'tasknotes_cal'
    });
    mockProviderRegistry.getInstance.mockReturnValue(mockProvider);

    const mockEventApi = {
      id: 'tasknotes_session',
      start: new Date('2026-05-11T00:00:00Z'),
      startStr: '2026-05-11',
      allDay: true
    } as unknown as EventApi;

    const result = await handler.handleToggleTask(mockEventApi, true);

    expect(result).toBe(true);
    expect(mockSetRecurringInstanceState).toHaveBeenCalledWith(recurringEvent, '2026-05-11', {
      completed: true,
      skipped: false
    });
    expect(mockCache.toggleRecurringInstance).not.toHaveBeenCalled();
    expect(mockToggleComplete).not.toHaveBeenCalled();
  });
});
