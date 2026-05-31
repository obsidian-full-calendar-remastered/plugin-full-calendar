import { showNotice } from '../../utils/showNotice';
import { PluginState } from '../PluginState';
import { OFCEvent } from '../../types';

import { t } from '../../features/i18n/i18n';
import { CacheEntry } from './types';
import { CalendarProvider, TaskBacklogProvider } from '../../providers/Provider';
import { CacheContext } from './CacheSyncHandler';
import { EventPathLocation } from '../EventStore';
import { DateTime } from 'luxon';
import { DelegatedProviderActionError } from '../../providers/Provider';
import {
  recordMilestoneAction,
  type MilestoneRecordOptions
} from '../../features/milestones/milestones';

export interface MutationContext extends CacheContext {
  calendars: Map<string, CalendarProvider<unknown>>;
  getRecurringEventManager: () => Promise<
    import('../../features/recur_events/RecurringEventManager').RecurringEventManager
  >;
  getProviderForEvent: (eventId: string) => {
    provider: CalendarProvider<unknown>;
    location: EventPathLocation | null;
    event: OFCEvent;
  };
}

export class CacheMutationHandler {
  constructor(private ctx: MutationContext) {}

  private ensureDefaultTimedDurationOnAllDayTransition(
    oldEvent: OFCEvent,
    newEvent: OFCEvent
  ): OFCEvent {
    if (!oldEvent.allDay || newEvent.allDay) {
      return newEvent;
    }

    const hasEndTime = typeof newEvent.endTime === 'string' && newEvent.endTime.trim().length > 0;
    if (hasEndTime) {
      return newEvent;
    }

    const parsedStart = DateTime.fromFormat(newEvent.startTime, 'H:mm');
    if (!parsedStart.isValid) {
      return newEvent;
    }

    return {
      ...newEvent,
      endTime: parsedStart.plus({ hours: 1 }).toFormat('HH:mm')
    };
  }

  async addEvent(
    calendarId: string,
    event: OFCEvent,
    options?: MilestoneRecordOptions
  ): Promise<boolean> {
    if (!event.allDay && !event.timezone) {
      const displayTimezone =
        PluginState.getSettings().displayTimezone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone;
      event.timezone = displayTimezone;
    }
    const calendarInfo = PluginState.getProviderRegistry().getSource(calendarId);
    if (!calendarInfo) {
      showNotice(t('eventCache.calendarNotFound', { calendarId }));
      return false;
    }
    const capabilities = PluginState.getProviderRegistry().getCapabilities(calendarId);
    if (!capabilities) {
      showNotice(t('eventCache.providerNotFound', { type: calendarInfo.type }));
      return false;
    }

    if (!capabilities.canCreate) {
      showNotice(t('eventCache.readOnly'));
      return false;
    }

    const optimisticId = this.ctx.generateId();
    const optimisticEvent = event;

    this.ctx.store.add({
      calendarId: calendarId,
      location: null,
      id: optimisticId,
      event: optimisticEvent
    });
    PluginState.getProviderRegistry().addMapping(optimisticEvent, calendarId, optimisticId);

    const optimisticCacheEntry: CacheEntry = {
      event: optimisticEvent,
      id: optimisticId,
      calendarId: calendarId
    };

    if (options?.silent) {
      this.ctx.updateQueue.toAdd.set(optimisticId, optimisticCacheEntry);
    } else {
      this.ctx.flushUpdateQueue([], [optimisticCacheEntry], [calendarId]);
    }

    try {
      const eventForStorage = this.ctx.enhancer.prepareForStorage(event);
      const [finalEvent, newLocation] =
        await PluginState.getProviderRegistry().createEventInProvider(calendarId, eventForStorage);

      const authoritativeEvent = this.ctx.enhancer.enhance(finalEvent);

      this.ctx.store.delete(optimisticId);
      this.ctx.store.add({
        calendarId: calendarId,
        location: newLocation,
        id: optimisticId,
        event: authoritativeEvent
      });

      PluginState.getProviderRegistry().removeMapping(optimisticId);
      PluginState.getProviderRegistry().addMapping(authoritativeEvent, calendarId, optimisticId);

      this.ctx.timeEngine.scheduleCacheRebuild();
      await recordMilestoneAction('created', calendarId, {
        ...options,
        milestoneMeta: {
          ...options?.milestoneMeta,
          event: authoritativeEvent
        }
      });
      return true;
    } catch (e) {
      if (e instanceof DelegatedProviderActionError) {
        PluginState.getProviderRegistry().removeMapping(optimisticId);
        this.ctx.store.delete(optimisticId);

        if (options?.silent) {
          this.ctx.updateQueue.toAdd.delete(optimisticId);
        } else {
          this.ctx.flushUpdateQueue([optimisticId], [], [calendarId]);
        }

        return true;
      }

      console.error(`Failed to create event with provider. Rolling back cache state.`, {
        error: e
      });

      PluginState.getProviderRegistry().removeMapping(optimisticId);
      this.ctx.store.delete(optimisticId);

      if (options?.silent) {
        this.ctx.updateQueue.toAdd.delete(optimisticId);
      } else {
        this.ctx.flushUpdateQueue([optimisticId], [], [calendarId]);
      }

      showNotice(t('eventCache.createFailed'));
      return false;
    }
  }

  async deleteEvent(
    eventId: string,
    options?: MilestoneRecordOptions & { instanceDate?: string }
  ): Promise<void> {
    const originalDetails = this.ctx.store.getEventDetails(eventId);
    if (!originalDetails) {
      throw new Error(`Event with ID ${eventId} not found for deletion.`);
    }
    const { event, calendarId } = originalDetails;
    const { provider } = this.ctx.getProviderForEvent(eventId);

    if (!provider.getCapabilities().canDelete) {
      throw new Error(`Calendar of type "${provider.type}" does not support deleting events.`);
    }

    if (!options?.force) {
      const recurringManager = await this.ctx.getRecurringEventManager();
      if (await recurringManager.handleDelete(eventId, event, options)) {
        return;
      }
    }

    const handle = provider.getEventHandle(event);

    PluginState.getProviderRegistry().removeMapping(eventId);
    this.ctx.store.delete(eventId);

    if (options?.silent) {
      this.ctx.updateQueue.toRemove.add(eventId);
    } else {
      this.ctx.flushUpdateQueue([eventId], [], [calendarId]);
    }

    if (!handle) {
      console.warn(
        `Could not generate a persistent handle for the event being deleted. Proceeding with deletion from cache only.`
      );
      this.ctx.timeEngine.scheduleCacheRebuild();
      return;
    }

    try {
      await PluginState.getProviderRegistry().deleteEventInProvider(eventId, event, calendarId);
      this.ctx.timeEngine.scheduleCacheRebuild();
      await recordMilestoneAction('deleted', calendarId, options);
    } catch (e) {
      console.error(`Failed to delete event with provider. Rolling back cache state.`, {
        eventId,
        error: e
      });

      const locationForStore = originalDetails.location
        ? {
            file: { path: originalDetails.location.path },
            lineNumber: originalDetails.location.lineNumber
          }
        : null;

      this.ctx.store.add({
        calendarId: originalDetails.calendarId,
        location: locationForStore,
        id: originalDetails.id,
        event: originalDetails.event
      });

      PluginState.getProviderRegistry().addMapping(
        originalDetails.event,
        originalDetails.calendarId,
        originalDetails.id
      );

      const cacheEntry: CacheEntry = {
        event: originalDetails.event,
        id: originalDetails.id,
        calendarId: originalDetails.calendarId
      };

      if (options?.silent) {
        this.ctx.updateQueue.toRemove.delete(eventId);
        this.ctx.updateQueue.toAdd.set(eventId, cacheEntry);
      } else {
        this.ctx.flushUpdateQueue([], [cacheEntry], [calendarId]);
      }

      showNotice(t('eventCache.deleteFailed'));
      throw e;
    }
  }

  async updateEventWithId(
    eventId: string,
    newEvent: OFCEvent,
    options?: MilestoneRecordOptions
  ): Promise<boolean> {
    if (!newEvent.allDay && !newEvent.timezone) {
      const displayTimezone =
        PluginState.getSettings().displayTimezone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone;
      newEvent.timezone = displayTimezone;
    }

    const originalDetails = this.ctx.store.getEventDetails(eventId);
    if (!originalDetails) {
      throw new Error(`Event with ID ${eventId} not present in event store.`);
    }

    const { provider, event: oldEvent } = this.ctx.getProviderForEvent(eventId);
    newEvent = this.ensureDefaultTimedDurationOnAllDayTransition(oldEvent, newEvent);
    const calendarId = originalDetails.calendarId;

    if (!provider.getCapabilities().canEdit) {
      throw new Error(`Calendar of type "${provider.type}" does not support editing events.`);
    }

    const recurringManager = await this.ctx.getRecurringEventManager();
    const handledByRecurringManager = await recurringManager.handleUpdate(
      oldEvent,
      newEvent,
      calendarId
    );
    if (handledByRecurringManager) {
      return true;
    }

    const handle = provider.getEventHandle(oldEvent);
    if (!handle) {
      throw new Error(`Could not generate a persistent handle for the event being modified.`);
    }

    this.ctx.setBulkUpdating(true);
    try {
      PluginState.getProviderRegistry().removeMapping(eventId);
      this.ctx.store.delete(eventId);

      const locationForStore = originalDetails.location
        ? {
            file: { path: originalDetails.location.path },
            lineNumber: originalDetails.location.lineNumber
          }
        : null;

      this.ctx.store.add({
        calendarId: calendarId,
        location: locationForStore,
        id: eventId,
        event: newEvent
      });
      PluginState.getProviderRegistry().addMapping(newEvent, calendarId, eventId);

      const newCacheEntry: CacheEntry = {
        event: newEvent,
        id: eventId,
        calendarId: calendarId
      };

      if (options?.silent) {
        this.ctx.updateQueue.toRemove.add(eventId);
        this.ctx.updateQueue.toAdd.set(eventId, newCacheEntry);
      } else {
        this.ctx.flushUpdateQueue([eventId], [newCacheEntry], [calendarId]);
      }

      try {
        const preparedOldEvent = this.ctx.enhancer.prepareForStorage(oldEvent);
        const preparedNewEvent = this.ctx.enhancer.prepareForStorage(newEvent);

        const updatedLocation = await PluginState.getProviderRegistry().updateEventInProvider(
          eventId,
          calendarId,
          preparedOldEvent,
          preparedNewEvent
        );

        const authoritativeUpdatedEvent = this.ctx.enhancer.enhance(preparedNewEvent);

        PluginState.getProviderRegistry().removeMapping(eventId);
        this.ctx.store.delete(eventId);

        const finalLocation = updatedLocation || locationForStore;
        this.ctx.store.add({
          calendarId: calendarId,
          location: finalLocation,
          id: eventId,
          event: authoritativeUpdatedEvent
        });
        PluginState.getProviderRegistry().addMapping(
          authoritativeUpdatedEvent,
          calendarId,
          eventId
        );

        this.ctx.timeEngine.scheduleCacheRebuild();
        await recordMilestoneAction('updated', calendarId, options);
        return true;
      } catch (e) {
        console.error(`Failed to update event with provider. Rolling back cache state.`, {
          eventId,
          error: e
        });

        PluginState.getProviderRegistry().removeMapping(eventId);
        this.ctx.store.delete(eventId);

        const locationForStoreRollback = originalDetails.location
          ? {
              file: { path: originalDetails.location.path },
              lineNumber: originalDetails.location.lineNumber
            }
          : null;

        this.ctx.store.add({
          calendarId: originalDetails.calendarId,
          location: locationForStoreRollback,
          id: originalDetails.id,
          event: originalDetails.event
        });
        PluginState.getProviderRegistry().addMapping(
          originalDetails.event,
          originalDetails.calendarId,
          originalDetails.id
        );

        const originalCacheEntry: CacheEntry = {
          event: originalDetails.event,
          id: originalDetails.id,
          calendarId: originalDetails.calendarId
        };

        if (options?.silent) {
          this.ctx.updateQueue.toRemove.delete(eventId);
          this.ctx.updateQueue.toAdd.set(eventId, originalCacheEntry);
        } else {
          this.ctx.flushUpdateQueue([eventId], [originalCacheEntry], [calendarId]);
        }

        showNotice(t('eventCache.updateFailed'));
        return false;
      }
    } finally {
      this.ctx.setBulkUpdating(false);
    }
  }

  async moveEventToCalendar(
    eventId: string,
    newCalendarId: string,
    newEventData?: OFCEvent
  ): Promise<void> {
    const originalDetails = this.ctx.store.getEventDetails(eventId);
    if (!originalDetails) {
      throw new Error(`Event with ID ${eventId} not found.`);
    }

    const recurringManager = await this.ctx.getRecurringEventManager();
    const isRecurringHandled = await recurringManager.moveRecurringEvent(
      eventId,
      newCalendarId,
      newEventData
    );
    if (isRecurringHandled) {
      return;
    }

    const eventToCreate = newEventData || originalDetails.event;
    const success = await this.addEvent(newCalendarId, eventToCreate, { trackMilestone: false });

    if (!success) {
      throw new Error(`Failed to move event: Could not create event in destination calendar.`);
    }

    try {
      await this.deleteEvent(eventId, { trackMilestone: false });
      await recordMilestoneAction('moved', newCalendarId);
    } catch (e) {
      console.error('Failed to delete event from old calendar after moving it.', e);
      showNotice(t('eventCache.movePartialSuccess'));
      throw e;
    }
  }

  async toggleRecurringInstance(
    eventId: string,
    instanceDate: string,
    isDone: boolean
  ): Promise<void> {
    const originalDetails = this.ctx.store.getEventDetails(eventId);
    const calendarId = originalDetails?.calendarId;
    const recurringManager = await this.ctx.getRecurringEventManager();
    await recurringManager.toggleRecurringInstance(eventId, instanceDate, isDone);
    this.ctx.flushUpdateQueue([], [], calendarId ? [calendarId] : []);
    if (calendarId) {
      await recordMilestoneAction('updated', calendarId);
    }
  }

  async modifyRecurringInstance(
    masterEventId: string,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<void> {
    const originalDetails = this.ctx.store.getEventDetails(masterEventId);
    const calendarId = originalDetails?.calendarId;
    const eventForStorage = this.ctx.enhancer.prepareForStorage(newEventData);
    const recurringManager = await this.ctx.getRecurringEventManager();
    await recurringManager.modifyRecurringInstance(masterEventId, instanceDate, eventForStorage);
    this.ctx.flushUpdateQueue([], [], calendarId ? [calendarId] : []);
    if (calendarId) {
      await recordMilestoneAction('updated', calendarId);
    }
  }

  public async scheduleTask(taskId: string, date: Date, allDay = true): Promise<void> {
    const provider = PluginState.getProviderRegistry().getBacklogProviderForTask(taskId);
    if (!provider) {
      throw new Error(`No task backlog provider found that owns task ID: ${taskId}`);
    }

    await provider.scheduleTask(taskId, date, allDay);

    const events = await provider.getEvents();
    PluginState.getCache()?.syncCalendar(provider.getTaskBacklogInfo().id, events);
    PluginState.getProviderRegistry().refreshBacklogViews();
    PluginState.getProviderRegistry().refreshCalDAVTaskInboxViews();
  }

  public async unscheduleTaskEvent(eventId: string): Promise<void> {
    const details = this.ctx.store.getEventDetails(eventId);
    if (!details?.event.uid) {
      throw new Error(`No scheduled task found for event ID: ${eventId}`);
    }

    const provider = this.ctx.calendars.get(details.calendarId) as
      | (CalendarProvider<unknown> & TaskBacklogProvider)
      | undefined;
    if (!provider?.unscheduleTask) {
      throw new Error(`Task provider does not support returning tasks to the backlog.`);
    }

    await provider.unscheduleTask(details.event.uid);

    const events = await provider.getEvents();
    PluginState.getCache()?.syncCalendar(details.calendarId, events);
    PluginState.getProviderRegistry().refreshBacklogViews();
    PluginState.getProviderRegistry().refreshCalDAVTaskInboxViews();
  }

  public async validateTaskSchedule(
    taskId: string,
    date: Date
  ): Promise<{ isValid: boolean; reason?: string }> {
    const provider = PluginState.getProviderRegistry().getBacklogProviderForTask(taskId);
    if (provider && typeof provider.validateTaskSchedule === 'function') {
      return provider.validateTaskSchedule(taskId, date);
    }
    return { isValid: true };
  }
}
