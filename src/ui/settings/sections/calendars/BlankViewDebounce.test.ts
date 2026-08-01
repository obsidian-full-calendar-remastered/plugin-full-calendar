jest.mock(
  'obsidian',
  () => ({
    App: jest.fn(),
    Modal: jest.fn(),
    PluginSettingTab: jest.fn(),
    Setting: jest.fn(),
    normalizePath: (p: string) => p,
    Platform: {
      isMobile: false,
      isPhone: false,
      isDesktop: true
    },
    ItemView: jest.fn(),
    WorkspaceLeaf: jest.fn(),
    TFile: jest.fn(),
    TFolder: jest.fn(),
    Menu: jest.fn().mockImplementation(() => ({
      addItem: jest.fn().mockReturnThis(),
      showAtMouseEvent: jest.fn()
    })),
    activeDocument: typeof document !== 'undefined' ? document : undefined
  }),
  { virtual: true }
);

jest.mock('../../../../features/i18n/i18n', () => ({
  i18n: { language: 'en' },
  t: jest.fn().mockImplementation((key: string) => key)
}));

import { renderCalendar } from './calendar';
import type { Calendar } from '@fullcalendar/core';

// Mock FullCalendar core and plugins
jest.mock('@fullcalendar/core', () => {
  return {
    Calendar: jest.fn().mockImplementation((el, options) => {
      const mockInstance = {
        el,
        options,
        render: jest.fn(),
        destroy: jest.fn(),
        getEvents: jest.fn().mockReturnValue([]),
        view: { type: 'timeGridWeek' }
      };
      options._mockCalendarInstance = mockInstance;
      return mockInstance;
    })
  };
});

jest.mock('@fullcalendar/list', () => ({}));
jest.mock('@fullcalendar/rrule', () => {
  const plugin = { recurringTypes: [{ expand: jest.fn() }] };
  return {
    __esModule: true,
    default: plugin,
    recurringTypes: [{ expand: jest.fn() }]
  };
});
jest.mock('@fullcalendar/daygrid', () => ({}));
jest.mock('@fullcalendar/timegrid', () => ({}));
jest.mock('@fullcalendar/interaction', () => ({}));
jest.mock('@fullcalendar/luxon3', () => ({}));

describe('BlankViewDebounce in renderCalendar', () => {
  let container: HTMLElement;

  beforeEach(() => {
    jest.useFakeTimers();
    global.ResizeObserver = jest.fn().mockImplementation(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn()
    }));
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    document.body.innerHTML = '';
  });

  it('should defer onBlankView and NOT fire if events are rendered before timeout', async () => {
    const onBlankViewMock = jest.fn();
    const renderPromise = renderCalendar(container, [], {
      onBlankView: onBlankViewMock
    });
    const cal = await renderPromise;
    const options = (cal as any).options;

    // Simulate removeAllEventSources triggering eventsSet with 0 events
    (cal.getEvents as jest.Mock).mockReturnValue([]);
    options.eventsSet();

    // Immediately or shortly after, events are populated and eventsSet fires again with events
    jest.advanceTimersByTime(100);
    expect(onBlankViewMock).not.toHaveBeenCalled();

    (cal.getEvents as jest.Mock).mockReturnValue([{ id: '1', extendedProps: { isShadow: false } }]);
    options.eventsSet();

    // Advance past 300ms total
    jest.advanceTimersByTime(300);
    expect(onBlankViewMock).not.toHaveBeenCalled();
  });

  it('should fire onBlankView after 300ms if view remains truly blank', async () => {
    const onBlankViewMock = jest.fn();
    const renderPromise = renderCalendar(container, [], {
      onBlankView: onBlankViewMock
    });
    const cal = await renderPromise;
    const options = (cal as any).options;

    // Simulate eventsSet firing with 0 events
    (cal.getEvents as jest.Mock).mockReturnValue([]);
    options.eventsSet();

    expect(onBlankViewMock).not.toHaveBeenCalled();

    // Advance past 300ms
    jest.advanceTimersByTime(300);
    expect(onBlankViewMock).toHaveBeenCalledTimes(1);
    expect(onBlankViewMock).toHaveBeenCalledWith(cal);
  });

  it('should cancel timer if calendar is destroyed before timeout', async () => {
    const onBlankViewMock = jest.fn();
    const renderPromise = renderCalendar(container, [], {
      onBlankView: onBlankViewMock
    });
    const cal = await renderPromise;
    const options = (cal as any).options;

    (cal.getEvents as jest.Mock).mockReturnValue([]);
    options.eventsSet();

    // Destroy calendar
    cal.destroy();

    jest.advanceTimersByTime(300);
    expect(onBlankViewMock).not.toHaveBeenCalled();
  });
});
