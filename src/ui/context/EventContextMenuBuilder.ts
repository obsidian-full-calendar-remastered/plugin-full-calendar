import { PluginState } from '../../core/PluginState';
import { EventApi } from '@fullcalendar/core';
import { Menu } from 'obsidian';
import FullCalendarPlugin from '../../main';
import {
  CalendarProvider,
  CalendarProviderCapabilities,
  EventContextAction,
  ProviderEventContext
} from '../../providers/Provider';
import { t } from '../../features/i18n/i18n';
import { LinkedNoteIndex } from '../../providers/utils/LinkedNoteIndex';
import { OFCEvent } from '../../types';
import { getEventInstanceDate } from '../../features/timezone/Timezone';

/**
 * Returns true when `str` is an absolute URL with an http or https scheme.
 */
function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

type ActionGroup = EventContextAction[];

function shouldShow(action: EventContextAction): boolean {
  return action.visible !== false;
}

function addActionGroup(menu: Menu, group: ActionGroup, hasPriorItems: { value: boolean }): void {
  const visibleActions = group.filter(shouldShow);
  if (visibleActions.length === 0) {
    return;
  }

  if (hasPriorItems.value) {
    menu.addSeparator();
  }

  for (const action of visibleActions) {
    menu.addItem(item => {
      item.setTitle(action.title);
      if (action.icon) {
        item.setIcon(action.icon);
      }
      if (action.disabled) {
        item.setDisabled(true);
      } else {
        item.onClick(() => {
          void action.run();
        });
      }
    });
  }

  hasPriorItems.value = true;
}

export function getContextMenuCapabilities(capabilities: CalendarProviderCapabilities): {
  allowGenericTaskActions: boolean;
  allowDisplayActions: boolean;
} {
  return {
    allowGenericTaskActions:
      capabilities.contextMenu?.allowGenericTaskActions ??
      !capabilities.contextMenu?.providesNativeTaskSemantics,
    allowDisplayActions: capabilities.contextMenu?.allowDisplayActions ?? true
  };
}

export async function openEventContextMenu(
  plugin: FullCalendarPlugin,
  eventApi: EventApi,
  mouseEvent: MouseEvent
): Promise<void> {
  const menu = new Menu();
  if (!PluginState.getCache()) {
    return;
  }

  const eventDetails = PluginState.getCache().store.getEventDetails(eventApi.id);
  if (!eventDetails) {
    return;
  }

  const { event, calendarId, location } = eventDetails;

  // Location URL action: available for all events regardless of provider or editability.
  const hasPriorItems = { value: false };
  const locationStr = event.location;
  if (locationStr && isValidUrl(locationStr)) {
    addActionGroup(
      menu,
      [
        {
          id: 'location:open-url',
          title: t('ui.view.contextMenu.openLocationUrl'),
          icon: 'external-link',
          run: async () => {
            window.open(locationStr, '_blank');
          }
        }
      ],
      hasPriorItems
    );
  }

  const provider = PluginState.getProviderRegistry().getInstance(calendarId);
  const capabilities = PluginState.getProviderRegistry().getCapabilities(calendarId);

  if (provider && capabilities) {
    const context: ProviderEventContext = {
      eventId: eventApi.id,
      event,
      calendarId,
      location,
      display: eventApi.display,
      title: eventApi.title,
      start: eventApi.start,
      plugin
    };

    if (PluginState.getCache().isEventEditable(eventApi.id)) {
      const menuCapabilities = getContextMenuCapabilities(capabilities);

      addActionGroup(menu, buildDisplayActions(plugin, eventApi, menuCapabilities), hasPriorItems);
      addActionGroup(
        menu,
        await buildGenericTaskActions(plugin, context, menuCapabilities),
        hasPriorItems
      );
      addActionGroup(menu, await buildProviderActions(provider, context), hasPriorItems);
      addActionGroup(menu, await buildNavigationActions(plugin, context), hasPriorItems);
      addActionGroup(menu, buildDeleteActions(plugin, context), hasPriorItems);
    }
  }

  if (!hasPriorItems.value) {
    menu.addItem(item => {
      item.setTitle(t('ui.view.contextMenu.noActions')).setIcon('info').setDisabled(true);
    });
  }

  menu.showAtMouseEvent(mouseEvent);
}

function buildDisplayActions(
  _plugin: FullCalendarPlugin,
  eventApi: EventApi,
  menuCapabilities: { allowDisplayActions: boolean }
): ActionGroup {
  if (!menuCapabilities.allowDisplayActions || eventApi.display !== 'background') {
    return [];
  }

  return [
    {
      id: 'display:auto',
      title: `${t('modals.editEvent.fields.display.label')}: ${t(
        'modals.editEvent.fields.display.options.auto'
      )}`,
      icon: 'paintbrush',
      run: async () => {
        await PluginState.getCache().processEvent(eventApi.id, current => ({
          ...current,
          display: undefined
        }));
      }
    }
  ];
}

async function buildGenericTaskActions(
  _plugin: FullCalendarPlugin,
  context: ProviderEventContext,
  menuCapabilities: { allowGenericTaskActions: boolean }
): Promise<ActionGroup> {
  if (!menuCapabilities.allowGenericTaskActions) {
    return [];
  }

  const tasks = await import('../../types/tasks');
  if (!tasks.isTask(context.event)) {
    return [
      {
        id: 'generic-task:add-checkbox',
        title: t('ui.view.contextMenu.turnIntoTask'),
        icon: 'check',
        run: async () => {
          await PluginState.getCache().processEvent(context.eventId, event =>
            tasks.toggleTask(event, false)
          );
        }
      }
    ];
  }

  return [
    {
      id: 'generic-task:remove-checkbox',
      title: t('ui.view.contextMenu.removeCheckbox'),
      icon: 'x',
      run: async () => {
        await PluginState.getCache().processEvent(context.eventId, tasks.unmakeTask);
      }
    }
  ];
}

async function buildProviderActions(
  provider: CalendarProvider<unknown>,
  context: ProviderEventContext
): Promise<ActionGroup> {
  return (await provider.getEventContextActions?.(context)) ?? [];
}

function getContextInstanceDate(context: ProviderEventContext): string | undefined {
  return getEventInstanceDate(context.start, context.event.allDay, context.event.timezone);
}

async function buildNavigationActions(
  plugin: FullCalendarPlugin,
  context: ProviderEventContext
): Promise<ActionGroup> {
  const actions: ActionGroup = [];

  // For providers that support linked notes (Google, CalDAV, Outlook, ICS, Holidays),
  // offer a single "Open linked note" action that creates the note when none exists yet.
  const provider = PluginState.getProviderRegistry().getInstance(context.calendarId);
  const linkedNoteProvider = provider as unknown as {
    linkedNoteIndex?: LinkedNoteIndex;
    createLinkedNote?: (event: OFCEvent, instanceDate?: string) => Promise<unknown>;
  };
  if (provider && typeof linkedNoteProvider.createLinkedNote === 'function') {
    // Derive the instanceDate for recurring events the same way buildDeleteActions does.
    const instanceDate = getContextInstanceDate(context);
    actions.push({
      id: 'navigation:open-linked-note',
      title: t('ui.view.contextMenu.openLinkedNote'),
      icon: 'file-text',
      run: async () => {
        const { openOrCreateLinkedNote } = await import('../../utils/eventActions');
        await openOrCreateLinkedNote(plugin, context.calendarId, context.event, true, instanceDate);
      }
    });
  } else {
    // Local-note providers: navigate directly to the note file.
    actions.push({
      id: 'navigation:go-to-note',
      title: t('ui.view.contextMenu.goToNote'),
      icon: 'file-text',
      run: () => {
        if (!PluginState.getCache()) {
          return;
        }
        void import('../../utils/eventActions').then(({ openFileForEvent }) =>
          openFileForEvent(PluginState.getCache(), plugin.app, context.eventId)
        );
      }
    });
  }

  return actions;
}

function buildDeleteActions(
  _plugin: FullCalendarPlugin,
  context: ProviderEventContext
): ActionGroup {
  const capabilities = PluginState.getProviderRegistry().getCapabilities(context.calendarId);
  if (!capabilities?.canDelete) {
    return [];
  }

  return [
    {
      id: 'event:delete',
      title: t('ui.view.contextMenu.delete'),
      icon: 'trash-2',
      run: async () => {
        if (!PluginState.getCache()) {
          return;
        }

        if (
          (context.event.type === 'recurring' || context.event.type === 'rrule') &&
          context.start
        ) {
          const instanceDate = getContextInstanceDate(context);
          await PluginState.getCache().deleteEvent(context.eventId, { instanceDate });
        } else {
          await PluginState.getCache().deleteEvent(context.eventId);
        }
      }
    }
  ];
}
