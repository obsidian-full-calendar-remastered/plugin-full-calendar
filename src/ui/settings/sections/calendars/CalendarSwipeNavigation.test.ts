jest.mock(
  'obsidian',
  () => ({
    App: jest.fn(),
    Modal: jest.fn(),
    PluginSettingTab: jest.fn(),
    Setting: jest.fn(),
    normalizePath: (p: string) => p,
    Platform: {
      isMobile: true,
      isPhone: true,
      isDesktop: false
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

interface MockCalendarOptions {
  eventDragStart?: () => void;
  eventDragStop?: (info: { event: unknown; jsEvent: unknown }) => void;
  eventResizeStart?: () => void;
  eventResizeStop?: () => void;
  select?: (info: {
    start: Date;
    end: Date;
    allDay: boolean;
    view: { type: string; calendar: { unselect: () => void } };
  }) => void;
  _mockCalendarInstance?: unknown;
  [key: string]: unknown;
}

interface MockCalendarInstance {
  el: HTMLElement;
  options: MockCalendarOptions;
  render: jest.Mock;
  destroy: jest.Mock;
  prev: jest.Mock;
  next: jest.Mock;
  getEvents: jest.Mock;
  view: { type: string };
}

jest.mock('@fullcalendar/core', () => {
  return {
    Calendar: jest.fn().mockImplementation((el: HTMLElement, options: MockCalendarOptions) => {
      const mockInstance: MockCalendarInstance = {
        el,
        options,
        render: jest.fn(),
        destroy: jest.fn(),
        prev: jest.fn(),
        next: jest.fn(),
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

describe('Swipe Navigation in renderCalendar', () => {
  let container: HTMLElement;

  beforeEach(() => {
    window.ResizeObserver = jest.fn().mockImplementation(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn()
    }));
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 800
    });
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  const fireTouchEvent = (
    element: HTMLElement,
    type: 'touchstart' | 'touchend' | 'touchcancel',
    touches: Array<{ clientX: number; clientY: number }>
  ) => {
    const touchList = touches.map(t => ({
      clientX: t.clientX,
      clientY: t.clientY,
      target: element
    }));

    const event = new Event(type, { bubbles: true, cancelable: true }) as unknown as TouchEvent;
    Object.defineProperty(event, 'touches', {
      value: type === 'touchend' ? [] : touchList
    });
    Object.defineProperty(event, 'changedTouches', {
      value: touchList
    });
    element.dispatchEvent(event);
  };

  it('triggers next/prev navigation on normal horizontal swipe', async () => {
    const cal = (await renderCalendar(container, [])) as unknown as MockCalendarInstance;

    // Swipe left (next): start at X=200, end at X=100 (deltaX = -100)
    fireTouchEvent(container, 'touchstart', [{ clientX: 200, clientY: 200 }]);
    fireTouchEvent(container, 'touchend', [{ clientX: 100, clientY: 200 }]);
    expect(cal.next).toHaveBeenCalledTimes(1);
    expect(cal.prev).not.toHaveBeenCalled();

    // Swipe right (prev): start at X=200, end at X=300 (deltaX = +100)
    fireTouchEvent(container, 'touchstart', [{ clientX: 200, clientY: 200 }]);
    fireTouchEvent(container, 'touchend', [{ clientX: 300, clientY: 200 }]);
    expect(cal.prev).toHaveBeenCalledTimes(1);
  });

  it('cancels swipe when event drag occurs', async () => {
    const cal = (await renderCalendar(container, [])) as unknown as MockCalendarInstance;

    // Start touch
    fireTouchEvent(container, 'touchstart', [{ clientX: 200, clientY: 200 }]);

    // FullCalendar begins event drag
    cal.options.eventDragStart?.();

    // Release touch (e.g. drop event horizontally)
    fireTouchEvent(container, 'touchend', [{ clientX: 100, clientY: 200 }]);

    // Swipe should NOT navigate!
    expect(cal.next).not.toHaveBeenCalled();
    expect(cal.prev).not.toHaveBeenCalled();
  });

  it('cancels swipe when event resize occurs', async () => {
    const cal = (await renderCalendar(container, [])) as unknown as MockCalendarInstance;

    fireTouchEvent(container, 'touchstart', [{ clientX: 200, clientY: 200 }]);
    cal.options.eventResizeStart?.();
    fireTouchEvent(container, 'touchend', [{ clientX: 100, clientY: 200 }]);

    expect(cal.next).not.toHaveBeenCalled();
    expect(cal.prev).not.toHaveBeenCalled();
  });

  it('cancels swipe when date selection occurs', async () => {
    const selectMock = jest.fn().mockResolvedValue(undefined);
    const cal = (await renderCalendar(container, [], {
      select: selectMock
    })) as unknown as MockCalendarInstance;

    fireTouchEvent(container, 'touchstart', [{ clientX: 200, clientY: 200 }]);
    cal.options.select?.({
      start: new Date(),
      end: new Date(),
      allDay: true,
      view: { type: 'dayGridMonth', calendar: { unselect: jest.fn() } }
    });
    fireTouchEvent(container, 'touchend', [{ clientX: 100, clientY: 200 }]);

    expect(cal.next).not.toHaveBeenCalled();
    expect(cal.prev).not.toHaveBeenCalled();
    expect(selectMock).toHaveBeenCalled();
  });

  it('suppresses swipe when touch starts near screen edge (Obsidian sidebar margin)', async () => {
    const cal = (await renderCalendar(container, [])) as unknown as MockCalendarInstance;

    // Left edge (clientX <= 30)
    fireTouchEvent(container, 'touchstart', [{ clientX: 15, clientY: 200 }]);
    fireTouchEvent(container, 'touchend', [{ clientX: 150, clientY: 200 }]);
    expect(cal.prev).not.toHaveBeenCalled();

    // Right edge (clientX >= 800 - 30 = 770)
    fireTouchEvent(container, 'touchstart', [{ clientX: 785, clientY: 200 }]);
    fireTouchEvent(container, 'touchend', [{ clientX: 650, clientY: 200 }]);
    expect(cal.next).not.toHaveBeenCalled();
  });

  it('cancels swipe on touchcancel event', async () => {
    const cal = (await renderCalendar(container, [])) as unknown as MockCalendarInstance;

    fireTouchEvent(container, 'touchstart', [{ clientX: 200, clientY: 200 }]);
    fireTouchEvent(container, 'touchcancel', [{ clientX: 200, clientY: 200 }]);
    fireTouchEvent(container, 'touchend', [{ clientX: 100, clientY: 200 }]);

    expect(cal.next).not.toHaveBeenCalled();
    expect(cal.prev).not.toHaveBeenCalled();
  });
});
