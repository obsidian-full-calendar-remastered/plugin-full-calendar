import { showNotice } from '../../utils/showNotice';

import { DateTime } from 'luxon';
import { EventApi, EventClickArg } from '@fullcalendar/core';
import { PluginState } from '../../core/PluginState';
import type {
  RecurringInstanceState,
  RecurringInstanceStateProvider
} from '../../providers/Provider';
import { t } from '../../features/i18n/i18n';
import { dateEndpointsToFrontmatter, fromEventApi } from '../../core/interop';
import { ViewContext } from './ViewContext';

export class ViewEventInteractionHandler {
  constructor(private ctx: ViewContext) {}

  public async getRecurringTaskInstanceState(
    eventApi: EventApi
  ): Promise<RecurringInstanceState | null> {
    const eventId = eventApi.id;
    const eventDetails = PluginState.getCache().store.getEventDetails(eventId);
    if (!eventDetails) return null;

    const { event, calendarId } = eventDetails;
    const provider = PluginState.getProviderRegistry().getInstance(calendarId);
    const isRecurringSystem =
      event.type === 'recurring' || event.type === 'rrule' || !!event.recurringEventId;
    if (!provider || !isRecurringSystem || !eventApi.start) {
      return null;
    }

    if (
      'getRecurringInstanceState' in provider &&
      typeof provider.getRecurringInstanceState === 'function'
    ) {
      const instanceDate = DateTime.fromJSDate(eventApi.start).toISODate();
      if (!instanceDate) {
        return null;
      }

      return await (
        provider as unknown as RecurringInstanceStateProvider
      ).getRecurringInstanceState(event, instanceDate);
    }

    return null;
  }

  public async handleEventClick(info: EventClickArg): Promise<void> {
    try {
      if (info.jsEvent.getModifierState('Control') || info.jsEvent.getModifierState('Meta')) {
        const { openFileForEvent } = await import('../../utils/eventActions');
        await openFileForEvent(PluginState.getCache(), this.ctx.app, info.event.id);
        return;
      }

      if (!PluginState.getCache().isEventEditable(info.event.id)) {
        const { launchEventDetailsModal } = await import('../modals/event_modal');
        launchEventDetailsModal(this.ctx.plugin, info.event.id);
        return;
      }

      const eventDetails = PluginState.getCache().store.getEventDetails(info.event.id);
      if (!eventDetails) return;

      const { calendarId } = eventDetails;
      const capabilities = PluginState.getProviderRegistry().getCapabilities(calendarId);

      if (capabilities?.hasCustomEditUI) {
        const provider = PluginState.getProviderRegistry().getInstance(calendarId);
        if (
          provider &&
          'editInProviderUI' in provider &&
          typeof provider.editInProviderUI === 'function'
        ) {
          await (
            provider as unknown as { editInProviderUI: (id: string) => Promise<void> }
          ).editInProviderUI(info.event.id);
        } else {
          console.error(
            `Provider for ${calendarId} claims hasCustomEditUI but method is not implemented.`
          );
          const { launchEditModal } = await import('../modals/event_modal');
          launchEditModal(this.ctx.plugin, info.event.id);
        }
      } else {
        const { launchEditModal } = await import('../modals/event_modal');
        launchEditModal(this.ctx.plugin, info.event.id);
      }
    } catch (e) {
      if (e instanceof Error) {
        console.warn(e);
        showNotice(e.message);
      }
    }
  }

  public async handleSelect(
    start: Date,
    end: Date,
    allDay: boolean,
    viewType: string
  ): Promise<void> {
    if (viewType === 'dayGridMonth') {
      end.setDate(end.getDate() - 1);
    }
    const displayZone =
      PluginState.getSettings().displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const partialEvent = dateEndpointsToFrontmatter(start, end, allDay, displayZone);
    try {
      if (
        PluginState.getSettings().clickToCreateEventFromMonthView ||
        viewType !== 'dayGridMonth'
      ) {
        const { launchCreateModal } = await import('../modals/event_modal');
        launchCreateModal(this.ctx.plugin, partialEvent);
      } else {
        this.ctx.fullCalendarView?.changeView('timeGridDay');
        this.ctx.fullCalendarView?.gotoDate(start);
      }
    } catch (e) {
      if (e instanceof Error) {
        console.error(e);
        showNotice(e.message);
      }
    }
  }

  public async handleModifyEvent(
    newEvent: EventApi,
    oldEvent: EventApi,
    newResource?: string
  ): Promise<boolean> {
    try {
      const originalEvent = PluginState.getCache().getEventById(oldEvent.id);
      if (!originalEvent) {
        throw new Error('Original event not found in cache.');
      }

      if (originalEvent.type === 'single' && originalEvent.recurringEventId) {
        const oldDate = oldEvent.start ? DateTime.fromJSDate(oldEvent.start).toISODate() : null;
        const newDate = newEvent.start ? DateTime.fromJSDate(newEvent.start).toISODate() : null;

        if (oldDate && newDate && oldDate !== newDate) {
          showNotice(t('ui.view.errors.moveRecurringDayError'), 6000);
          return false;
        }
      }

      if (originalEvent.type === 'rrule' || originalEvent.type === 'recurring') {
        const oldDate = oldEvent.start ? DateTime.fromJSDate(oldEvent.start).toISODate() : null;
        const newDate = newEvent.start ? DateTime.fromJSDate(newEvent.start).toISODate() : null;

        if (oldDate && newDate && oldDate !== newDate) {
          showNotice(t('ui.view.errors.moveRecurringInstanceError'), 6000);
          return false;
        }

        if (!oldEvent.start) {
          throw new Error('Recurring instance is missing original start date.');
        }

        const instanceDate = DateTime.fromJSDate(oldEvent.start).toISODate();
        if (!instanceDate) {
          throw new Error('Could not determine instance date from recurring event.');
        }

        const modifiedEvent = fromEventApi(newEvent, PluginState.getSettings(), newResource);

        await PluginState.getCache().modifyRecurringInstance(
          oldEvent.id,
          instanceDate,
          modifiedEvent
        );
        return true;
      }
      const didModify = await PluginState.getCache().updateEventWithId(
        oldEvent.id,
        fromEventApi(newEvent, PluginState.getSettings(), newResource)
      );
      return !!didModify;
    } catch (e: unknown) {
      console.error(e);
      if (e instanceof Error) {
        showNotice(e.message);
      } else {
        showNotice(t('ui.view.errors.modifyEventFailed'));
      }
      return false;
    }
  }

  public async handleToggleTask(eventApi: EventApi, isDone: boolean): Promise<boolean> {
    const eventId = eventApi.id;
    const eventDetails = PluginState.getCache().store.getEventDetails(eventId);
    if (!eventDetails) return false;

    const { event, calendarId } = eventDetails;
    const provider = PluginState.getProviderRegistry().getInstance(calendarId);

    const isRecurringSystem =
      event.type === 'recurring' || event.type === 'rrule' || event.recurringEventId;

    if (provider && isRecurringSystem && eventApi.start) {
      const instanceDate = DateTime.fromJSDate(eventApi.start).toISODate();
      if (instanceDate) {
        if (
          'getRecurringInstanceState' in provider &&
          typeof provider.getRecurringInstanceState === 'function' &&
          'setRecurringInstanceState' in provider &&
          typeof provider.setRecurringInstanceState === 'function'
        ) {
          const recurringProvider = provider as unknown as RecurringInstanceStateProvider;
          const currentState = (await recurringProvider.getRecurringInstanceState(
            event,
            instanceDate
          )) ?? {
            completed: false,
            skipped: false
          };

          return await recurringProvider.setRecurringInstanceState(event, instanceDate, {
            ...currentState,
            completed: isDone
          });
        }
      }
    }

    if (provider && provider.toggleComplete) {
      return await provider.toggleComplete(eventId, isDone);
    }

    if (!isRecurringSystem) {
      const { toggleTask } = await import('../../types/tasks');
      await PluginState.getCache().updateEventWithId(eventId, toggleTask(event, isDone));
      return true;
    }

    if (!eventApi.start) return false;

    const instanceDate = DateTime.fromJSDate(eventApi.start).toISODate();
    if (!instanceDate) return false;

    try {
      await PluginState.getCache().toggleRecurringInstance(eventId, instanceDate, isDone);
      return true;
    } catch (e) {
      if (e instanceof Error) {
        showNotice(e.message);
      }
      return false;
    }
  }

  public async handleDrop(taskId: string, date: Date, allDay: boolean): Promise<void> {
    try {
      if (!PluginState.getCache()) {
        throw new Error('Event cache not available');
      }

      const validation = await PluginState.getCache().validateTaskSchedule(taskId, date);
      if (!validation.isValid) {
        showNotice(validation.reason || 'This task cannot be scheduled on this date.');
        return;
      }

      await PluginState.getCache().scheduleTask(taskId, date, allDay);
      showNotice(t('ui.view.success.taskScheduled'));

      PluginState.getProviderRegistry().refreshBacklogViews();
      void this.ctx.refreshView();
    } catch (error) {
      console.error('Failed to schedule task:', error);
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      showNotice(t('ui.view.errors.taskScheduleFailed', { message }));
    }
  }
}
