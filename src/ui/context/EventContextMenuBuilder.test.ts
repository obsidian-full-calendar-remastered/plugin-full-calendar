import { getContextMenuCapabilities } from './EventContextMenuBuilder';

const mockMenuItems: { title: string; onClick?: () => void }[] = [];

jest.mock(
  'obsidian',
  () => ({
    Menu: class {
      addItem = (
        cb: (item: {
          setTitle: (t: string) => { setIcon: () => void };
          setIcon: () => void;
          setDisabled: () => void;
          onClick: (fn: () => void) => void;
        }) => void
      ) => {
        let title = '';
        let clickHandler: (() => void) | undefined;
        cb({
          setTitle: (t: string) => {
            title = t;
            return { setIcon: () => {} };
          },
          setIcon: () => {},
          setDisabled: () => {},
          onClick: (fn: () => void) => {
            clickHandler = fn;
          }
        });
        mockMenuItems.push({ title, onClick: clickHandler });
      };
      addSeparator = jest.fn();
      showAtMouseEvent = jest.fn();
    },
    Modal: class {
      open = jest.fn();
      close = jest.fn();
    },
    Notice: class {},
    App: class {},
    TFile: class {}
  }),
  { virtual: true }
);

jest.mock('../../features/i18n/i18n', () => ({
  t: (key: string) => key
}));

describe('EventContextMenuBuilder capabilities', () => {
  it('preserves generic task actions by default for existing providers', () => {
    expect(
      getContextMenuCapabilities({
        canCreate: true,
        canEdit: true,
        canDelete: true
      }).allowGenericTaskActions
    ).toBe(true);
  });

  it('omits generic task actions for providers with native task semantics', () => {
    expect(
      getContextMenuCapabilities({
        canCreate: false,
        canEdit: true,
        canDelete: true,
        contextMenu: {
          providesNativeTaskSemantics: true
        }
      }).allowGenericTaskActions
    ).toBe(false);
  });

  it('lets a provider explicitly override native-task generic action defaults', () => {
    expect(
      getContextMenuCapabilities({
        canCreate: false,
        canEdit: true,
        canDelete: true,
        contextMenu: {
          providesNativeTaskSemantics: true,
          allowGenericTaskActions: true
        }
      }).allowGenericTaskActions
    ).toBe(true);
  });
});

describe('EventContextMenuBuilder timezone instanceDate handling', () => {
  beforeEach(() => {
    mockMenuItems.length = 0;
  });

  it('correctly resolves instanceDate for early morning events in positive UTC offset zones (Brisbane UTC+10)', async () => {
    const { openEventContextMenu } = await import('./EventContextMenuBuilder');
    const { PluginState } = await import('../../core/PluginState');
    const eventActions = await import('../../utils/eventActions');

    const openOrCreateSpy = jest
      .spyOn(eventActions, 'openOrCreateLinkedNote')
      .mockImplementation(async () => {});

    // 08:30 Brisbane on 2026-08-22 is 22:30 UTC on 2026-08-21
    const brisbaneMorningDate = new Date('2026-08-21T22:30:00.000Z');

    const mockEvent = {
      id: 'gcal-event-1',
      title: 'Chiro',
      type: 'rrule' as const,
      startDate: '2026-08-01',
      startTime: '08:30',
      endTime: '09:00',
      timezone: 'Australia/Brisbane',
      allDay: false
    };

    jest.spyOn(PluginState, 'getCache').mockReturnValue({
      store: {
        getEventDetails: () => ({
          calendarId: 'gcal-cal',
          event: mockEvent,
          location: null
        })
      },
      isEventEditable: () => true,
      deleteEvent: jest.fn()
    } as unknown as ReturnType<typeof PluginState.getCache>);

    jest.spyOn(PluginState, 'getProviderRegistry').mockReturnValue({
      getInstance: () => ({
        createLinkedNote: jest.fn()
      }),
      getCapabilities: () => ({
        canCreate: true,
        canEdit: true,
        canDelete: true
      })
    } as unknown as ReturnType<typeof PluginState.getProviderRegistry>);

    jest.spyOn(PluginState, 'getSettings').mockReturnValue({
      displayTimezone: 'Australia/Brisbane'
    } as unknown as ReturnType<typeof PluginState.getSettings>);

    const mockEventApi = {
      id: 'gcal-event-1',
      title: 'Chiro',
      start: brisbaneMorningDate,
      display: 'auto'
    };

    await openEventContextMenu(
      {} as unknown as import('../../main').default,
      mockEventApi as unknown as import('@fullcalendar/core').EventApi,
      {} as MouseEvent
    );

    const openLinkedNoteItem = mockMenuItems.find(
      i => i.title === 'ui.view.contextMenu.openLinkedNote'
    );
    expect(openLinkedNoteItem).toBeDefined();

    openLinkedNoteItem?.onClick?.();
    await new Promise(resolve => window.setTimeout(resolve, 10));

    expect(openOrCreateSpy).toHaveBeenCalledWith(
      expect.anything(),
      'gcal-cal',
      mockEvent,
      true,
      '2026-08-22' // Must be August 22 in Brisbane, NOT August 21 (UTC)
    );

    openOrCreateSpy.mockRestore();
  });
});
