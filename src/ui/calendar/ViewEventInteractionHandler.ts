import { showNotice } from '../../utils/showNotice';

import { DateTime } from 'luxon';
import { EventApi, EventClickArg } from '@fullcalendar/core';
import { PluginState } from '../../core/PluginState';
import { FullCalendarSettings } from '../../types/settings';
import type {
  RecurringInstanceState,
  RecurringInstanceStateProvider
} from '../../providers/Provider';
import { t } from '../../features/i18n/i18n';
import { dateEndpointsToFrontmatter, fromEventApi } from '../../core/interop';
import { ViewContext } from './ViewContext';
import { LinkedNoteIndex } from '../../providers/utils/LinkedNoteIndex';
import { OFCEvent } from '../../types';
import { openLinkedFileInExistingLeafOrNew } from '../../utils/leafUtils';
import { getEventInstanceDate, resolveEffectiveTimezone } from '../../features/timezone/Timezone';

const shiftIsoDate = (date: string | undefined, days: number): string | undefined => {
  if (!date || days === 0) {
    return date;
  }

  return DateTime.fromISO(date).plus({ days }).toISODate() || date;
};

const getEventDate = (eventApi: EventApi, timezone?: string | null): string | null =>
  getEventInstanceDate(eventApi.start, eventApi.allDay, timezone, eventApi.startStr) ?? null;

const getDayDelta = (oldEvent: EventApi, newEvent: EventApi, timezone?: string | null): number => {
  if (!oldEvent.start || !newEvent.start) {
    return 0;
  }

  const zone = resolveEffectiveTimezone(timezone);
  const oldStart = DateTime.fromJSDate(oldEvent.start).setZone(zone).startOf('day');
  const newStart = DateTime.fromJSDate(newEvent.start).setZone(zone).startOf('day');
  return Math.round(newStart.diff(oldStart, 'days').days);
};

function buildRecurringSequenceReschedule(
  masterEvent: OFCEvent,
  oldEvent: EventApi,
  newEvent: EventApi,
  modifiedInstance: OFCEvent
): OFCEvent {
  if (masterEvent.type !== 'recurring' && masterEvent.type !== 'rrule') {
    return masterEvent;
  }

  const dayDelta = getDayDelta(oldEvent, newEvent, masterEvent.timezone);
  const nextEvent = {
    ...masterEvent,
    allDay: modifiedInstance.allDay,
    timezone: modifiedInstance.timezone || masterEvent.timezone
  } as Record<string, unknown>;

  if (modifiedInstance.allDay) {
    delete nextEvent.startTime;
    delete nextEvent.endTime;
  } else if ('startTime' in modifiedInstance) {
    nextEvent.startTime = modifiedInstance.startTime;
    nextEvent.endTime = modifiedInstance.endTime;
  }

  if (masterEvent.type === 'recurring') {
    return {
      ...nextEvent,
      startRecur: shiftIsoDate(masterEvent.startRecur, dayDelta),
      endRecur: shiftIsoDate(masterEvent.endRecur, dayDelta)
    } as OFCEvent;
  }

  return {
    ...nextEvent,
    startDate: shiftIsoDate(masterEvent.startDate, dayDelta) || masterEvent.startDate
  } as OFCEvent;
}

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
      const instanceDate = getEventDate(eventApi, event.timezone);
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
      const eventDetails = PluginState.getCache().store.getEventDetails(info.event.id);
      const instanceDate = getEventDate(info.event, eventDetails?.event?.timezone) || undefined;

      if (info.jsEvent.getModifierState('Control') || info.jsEvent.getModifierState('Meta')) {
        if (eventDetails) {
          const { calendarId, event } = eventDetails;
          const provider = PluginState.getProviderRegistry().getInstance(calendarId);
          if (provider && 'linkedNoteIndex' in provider && provider.linkedNoteIndex) {
            const linkedFile = (provider.linkedNoteIndex as LinkedNoteIndex).getFileForEvent(
              event.uid || '',
              instanceDate
            );
            if (linkedFile) {
              // Reuse an existing tab if this note is already open.
              await openLinkedFileInExistingLeafOrNew(this.ctx.app, linkedFile);
              return;
            }
            // No existing linked note — if the provider can create one, do so now.
            const linkedNoteProvider = provider as unknown as {
              createLinkedNote?: (event: OFCEvent, instanceDate?: string) => Promise<unknown>;
            };
            if (typeof linkedNoteProvider.createLinkedNote === 'function') {
              const { openOrCreateLinkedNote } = await import('../../utils/eventActions');
              await openOrCreateLinkedNote(this.ctx.plugin, calendarId, event, true, instanceDate);
              return;
            }
          }
        }
        const { openFileForEvent } = await import('../../utils/eventActions');
        await openFileForEvent(PluginState.getCache(), this.ctx.app, info.event.id);
        return;
      }

      if (!PluginState.getCache().isEventEditable(info.event.id)) {
        const { launchEventDetailsModal } = await import('../modals/event_modal');
        launchEventDetailsModal(this.ctx.plugin, info.event.id, instanceDate);
        return;
      }

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
          launchEditModal(this.ctx.plugin, info.event.id, instanceDate);
        }
      } else {
        const { launchEditModal } = await import('../modals/event_modal');
        launchEditModal(this.ctx.plugin, info.event.id, instanceDate);
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
    if (allDay) {
      end.setDate(end.getDate() - 1);
    }
    const config = this.ctx.viewEnhancer
      ? (this.ctx.viewEnhancer.getCalendarConfig() as FullCalendarSettings)
      : PluginState.getSettings();

    const displayZone = config.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const partialEvent = dateEndpointsToFrontmatter(start, end, allDay, displayZone);
    try {
      if (config.clickToCreateEventFromMonthView || viewType !== 'dayGridMonth') {
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
      const config = this.ctx.viewEnhancer
        ? (this.ctx.viewEnhancer.getCalendarConfig() as FullCalendarSettings)
        : PluginState.getSettings();

      const originalEvent = PluginState.getCache().getEventById(oldEvent.id);
      if (!originalEvent) {
        throw new Error('Original event not found in cache.');
      }

      if (originalEvent.type === 'rrule' || originalEvent.type === 'recurring') {
        if (!oldEvent.start) {
          throw new Error('Recurring instance is missing original start date.');
        }

        const instanceDate = getEventDate(oldEvent, originalEvent.timezone);
        if (!instanceDate) {
          throw new Error('Could not determine instance date from recurring event.');
        }

        const modifiedEvent = fromEventApi(newEvent, config, newResource);
        const singleInstanceOverride = fromEventApi(newEvent, config, newResource, {
          forceSingle: true
        });
        const { RescheduleRecurringModal } = await import('../modals/RescheduleRecurringModal');
        new RescheduleRecurringModal(
          this.ctx.app,
          () => {
            void PluginState.getCache().modifyRecurringInstance(
              oldEvent.id,
              instanceDate,
              singleInstanceOverride
            );
          },
          () => {
            void PluginState.getCache().updateEventWithId(
              oldEvent.id,
              buildRecurringSequenceReschedule(originalEvent, oldEvent, newEvent, modifiedEvent)
            );
          },
          instanceDate
        ).open();
        return false;
      }

      if (
        originalEvent.type === 'single' &&
        (originalEvent.recurringEventId || originalEvent.recurrenceId)
      ) {
        const oldDate = getEventDate(oldEvent, originalEvent.timezone);
        const modifiedEvent = fromEventApi(newEvent, config, newResource, { forceSingle: true });
        const masterDetails = PluginState.getCache()
          .store.getAllEvents()
          .find(candidate => {
            if (candidate.event.type !== 'recurring' && candidate.event.type !== 'rrule') {
              return false;
            }
            if (candidate.event.uid && candidate.event.uid === originalEvent.uid) {
              return true;
            }
            if (
              originalEvent.recurringEventId &&
              candidate.event.uid === originalEvent.recurringEventId
            ) {
              return true;
            }
            const parentFilename = originalEvent.recurringEventId?.split('/').pop();
            const candidateFilename = candidate.location?.path.split('/').pop();
            return Boolean(parentFilename && candidateFilename === parentFilename);
          });

        if (!oldDate || !masterDetails) {
          return await PluginState.getCache().updateEventWithId(oldEvent.id, modifiedEvent);
        }

        const { RescheduleRecurringModal } = await import('../modals/RescheduleRecurringModal');
        new RescheduleRecurringModal(
          this.ctx.app,
          () => {
            void PluginState.getCache().updateEventWithId(oldEvent.id, modifiedEvent);
          },
          () => {
            void PluginState.getCache().updateEventWithId(
              masterDetails.id,
              buildRecurringSequenceReschedule(
                masterDetails.event,
                oldEvent,
                newEvent,
                modifiedEvent
              )
            );
          },
          oldDate
        ).open();
        return false;
      }

      const didModify = await PluginState.getCache().updateEventWithId(
        oldEvent.id,
        fromEventApi(newEvent, config, newResource)
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
      event.type === 'recurring' || event.type === 'rrule' || !!event.recurringEventId;

    if (provider && isRecurringSystem && eventApi.start) {
      const instanceDate = getEventDate(eventApi, event.timezone);
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

    if (isRecurringSystem) {
      if (!eventApi.start) return false;

      const instanceDate = getEventDate(eventApi, event.timezone);
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

    if (provider && provider.toggleComplete) {
      return await provider.toggleComplete(eventId, isDone);
    }

    const { toggleTask } = await import('../../types/tasks');
    await PluginState.getCache().updateEventWithId(eventId, toggleTask(event, isDone));
    return true;
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
    } catch (error) {
      console.error('Failed to schedule task:', error);
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      showNotice(t('ui.view.errors.taskScheduleFailed', { message }));
    }
  }

  public async handleEventDragStop(eventApi: EventApi, mouseEvent: MouseEvent): Promise<void> {
    const target = mouseEvent.view?.document.elementFromPoint(
      mouseEvent.clientX,
      mouseEvent.clientY
    );
    if (!target?.instanceOf(Element) || !target.closest('.tasks-backlog-view')) {
      return;
    }

    try {
      if (!PluginState.getCache()) {
        throw new Error('Event cache not available');
      }

      await PluginState.getCache().unscheduleTaskEvent(eventApi.id);
      showNotice('Task returned to backlog');
    } catch (error) {
      console.error('Failed to return task to backlog:', error);
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      showNotice(`Failed to return task to backlog: ${message}`);
    }
  }
}
