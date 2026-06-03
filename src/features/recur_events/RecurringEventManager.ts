import { showNotice } from '../../utils/showNotice';
/**
 * @file RecurringEventManager.ts
 * @brief Manages all complex business logic related to recurring events.
 *
 * @description
 * This class is an internal component of the EventCache and is not intended
 * to be used directly. It encapsulates the logic for handling recurring event
 * modifications, deletions, and overrides (exceptions).
 *
 * @see EventCache.ts
 *
 * @license See LICENSE.md
 */

import { PluginState } from '../../core/PluginState';

import { OFCEvent } from '../../types';
import EventCache from '../../core/EventCache';
import { StoredEvent } from '../../core/EventStore';
import { toggleTask } from '../../types/tasks';
import FullCalendarPlugin from '../../main';
import { t } from '../../features/i18n/i18n';
import { recordMilestoneAction } from '../milestones/milestones';

/**
 * Manages all complex business logic related to recurring events.
 * This class is intended for internal use by the EventCache only.
 */
export interface DeleteOptions {
  silent?: boolean;
  force?: boolean;
  instanceDate?: string; // date of a specific instance to target when deleting an override
}

export class RecurringEventManager {
  private cache: EventCache;
  private plugin: FullCalendarPlugin;

  private _sanitizeTitleForFilename(title: string): string {
    return title
      .replace(/[\\/:"*?<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  constructor(cache: EventCache, plugin: FullCalendarPlugin) {
    this.cache = cache;
    this.plugin = plugin;
  }

  private getProviderAndConfig(calendarId: string) {
    const calendarInfo = PluginState.getProviderRegistry().getSource(calendarId);
    if (!calendarInfo) return null;
    const provider = PluginState.getProviderRegistry().getInstance(calendarId);
    if (!provider) return null;
    return { provider, config: calendarInfo };
  }

  /**
   * Checks if an override event's timing differs from what the original recurring instance would have been.
   * @param overrideEvent The override event to check
   * @param masterEvent The master recurring event
   * @param instanceDate The date of the instance
   * @returns true if the timing has been modified, false if it matches the original
   */
  private hasModifiedTiming(
    overrideEvent: OFCEvent,
    masterEvent: OFCEvent,
    _instanceDate: string
  ): boolean {
    if (overrideEvent.type !== 'single') return false;
    if (masterEvent.type !== 'recurring' && masterEvent.type !== 'rrule') return false;

    // Check allDay status
    if (overrideEvent.allDay !== masterEvent.allDay) {
      return true;
    }

    // Check endDate - if override has an endDate but it's not the same as the instance date, it's modified
    if (overrideEvent.endDate && overrideEvent.endDate !== overrideEvent.date) {
      return true;
    }

    // For non-all-day events, check start and end times
    if (!masterEvent.allDay && 'startTime' in masterEvent && 'endTime' in masterEvent) {
      const masterStartTime = masterEvent.startTime;
      const masterEndTime = masterEvent.endTime;

      if (!overrideEvent.allDay && 'startTime' in overrideEvent && 'endTime' in overrideEvent) {
        const overrideStartTime = overrideEvent.startTime;
        const overrideEndTime = overrideEvent.endTime;

        if (overrideStartTime !== masterStartTime || overrideEndTime !== masterEndTime) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Finds all override events that are children of a given master recurring event.
   * @param masterEventId The session ID of the master recurring event.
   * @returns An array of StoredEvent objects representing the child overrides.
   */
  private findRecurringChildren(masterEventId: string): StoredEvent[] {
    const masterEventDetails = this.cache.store.getEventDetails(masterEventId);
    if (!masterEventDetails) return [];

    const { calendarId, event: masterEvent } = masterEventDetails;

    const globalId = this.cache.getGlobalIdentifier(masterEvent, calendarId);
    if (!globalId) return [];
    // Global ID is "CalendarID::Path". We want the filename from the path.
    const masterLocalIdentifier = globalId.split('::').pop()?.split('/').pop();
    if (!masterLocalIdentifier) return [];

    return this.cache.store
      .getAllEvents()
      .filter(
        e => e.calendarId === calendarId && e.event.recurringEventId === masterLocalIdentifier
      );
  }

  public async promoteRecurringChildren(masterEventId: string): Promise<void> {
    const children = this.findRecurringChildren(masterEventId);
    if (children.length === 0) {
      // No children to promote, just delete the master.
      await this.cache.deleteEvent(masterEventId, { force: true });
      return;
    }

    showNotice(t('recurEvents.promotingChildren', { count: children.length }));
    for (const child of children) {
      await this.cache.processEvent(
        child.id,
        e => ({
          ...e,
          recurringEventId: undefined
        }),
        { silent: true }
      );
    }

    // Now delete the original master event
    await this.cache.deleteEvent(masterEventId, { force: true, silent: true });
    this.cache.flushUpdateQueue([], []);
    showNotice(t('recurEvents.deletedAndPromoted'));
  }

  public async deleteAllRecurring(masterEventId: string): Promise<void> {
    const children = this.findRecurringChildren(masterEventId);
    showNotice(t('recurEvents.deletingWithChildren', { count: children.length }));

    for (const child of children) {
      await this.cache.deleteEvent(child.id, { force: true, silent: true });
    }

    // Finally, delete the master event itself
    await this.cache.deleteEvent(masterEventId, { force: true, silent: true });
    this.cache.flushUpdateQueue([], []);
    showNotice(t('recurEvents.deletedAll'));
  }

  /**
   * Intercepts a delete request to see if it's a recurring master with children.
   * If so, it opens a modal to ask the user how to proceed.
   * @returns `true` if the deletion was handled (modal opened), `false` otherwise.
   */
  public async handleDelete(
    eventId: string,
    event: OFCEvent,
    options?: DeleteOptions
  ): Promise<boolean> {
    // Check if we are "undoing" an override. This is now the full operation.
    if (event.type === 'single' && event.recurringEventId) {
      const eventDetails = this.cache.store.getEventDetails(eventId);
      if (!eventDetails) return false;
      const { calendarId } = eventDetails;

      const masterFilename = event.recurringEventId;
      const providerResult = this.getProviderAndConfig(calendarId);
      if (!providerResult) {
        // Cannot proceed if provider/config is not found.
        console.warn(
          `Could not find provider for calendar ID ${calendarId}. Deleting orphan override.`
        );
        await this.cache.deleteEvent(eventId, { silent: true, force: true });
        this.cache.flushUpdateQueue([], []);
        return true;
      }
      const { config } = providerResult;
      // Reconstruct the master event's full path (only for local sources)
      if (config.type !== 'local') {
        console.warn('Expected local calendar for recurring override cleanup.');
        await this.cache.deleteEvent(eventId, { silent: true, force: true });
        this.cache.flushUpdateQueue([], []);
        return true;
      }
      const masterPath = `${config.directory}/${masterFilename}`;
      const globalMasterIdentifier = `${calendarId}::${masterPath}`;

      const masterSessionId = await this.cache.getSessionId(globalMasterIdentifier);

      if (masterSessionId) {
        await this.cache.processEvent(
          masterSessionId,
          e => {
            if (e.type !== 'recurring' && e.type !== 'rrule') return e;
            const dateToUnskip = event.date;
            return {
              ...e,
              skipDates: e.skipDates.filter((d: string) => d !== dateToUnskip)
            };
          },
          { silent: true }
        );
      } else {
        console.warn(
          `Master recurring event with identifier "${globalMasterIdentifier}" not found. Deleting orphan override.`
        );
      }
      await this.cache.deleteEvent(eventId, { silent: true, force: true });
      this.cache.flushUpdateQueue([], []);
      return true;
    }

    const isRecurringMaster = event.type === 'recurring' || event.type === 'rrule';
    if (!isRecurringMaster) {
      return false;
    }

    const eventDetails = this.cache.store.getEventDetails(eventId);
    if (!eventDetails) return false;
    const { calendarId } = eventDetails;

    // REPLACE calendar lookup with provider lookup
    const providerResult = this.getProviderAndConfig(calendarId);
    if (!providerResult) return false;
    const isGoogle = providerResult.provider.type === 'google';

    const children = this.findRecurringChildren(eventId);

    if (children.length > 0 || options?.instanceDate) {
      // LAZY LOAD MODAL
      const { DeleteRecurringModal } = await import('../../ui/modals/DeleteRecurringModal');
      new DeleteRecurringModal(
        this.cache.plugin.app,
        () => void this.promoteRecurringChildren(eventId),
        () => void this.deleteAllRecurring(eventId),
        options?.instanceDate
          ? () => {
              void (async () => {
                const instanceDate = options.instanceDate;
                if (!instanceDate) {
                  return;
                }
                const updated = await this.cache.processEvent(eventId, e => {
                  if (e.type !== 'recurring' && e.type !== 'rrule') return e;
                  const skipDates = e.skipDates?.includes(instanceDate)
                    ? e.skipDates
                    : [...(e.skipDates || []), instanceDate];
                  return { ...e, skipDates };
                });

                if (updated) {
                  const details = this.cache.store.getEventDetails(eventId);
                  if (details) {
                    const calendarSource = this.cache
                      .getAllEvents()
                      .find(s => s.id === details.calendarId);
                    if (calendarSource) {
                      this.cache.updateCalendar(calendarSource);
                    }
                  }
                }
              })();
            }
          : undefined,
        options?.instanceDate,
        isGoogle
      ).open();
      return true;
    }

    return false;
  }

  /**
   * Private helper to perform the "skip and override" logic for recurring events.
   * It creates the new single-instance override AND updates the master event to skip that date.
   * @param masterEventId The session ID of the master recurring event.
   * @param instanceDateToSkip The date of the original instance to add to the parent's skipDates.
   * @param overrideEventData The complete OFCEvent object for the new single-instance override.
   */
  private async _createRecurringOverride(
    masterEventId: string,
    instanceDateToSkip: string,
    overrideEventData: OFCEvent
  ): Promise<void> {
    const masterDetails = this.cache.store.getEventDetails(masterEventId);
    if (!masterDetails) throw new Error('Master event not found');
    const { calendarId: masterCalendarId, event: masterEvent } = masterDetails;

    // CORRECTED: This was the source of the calendarInfo error.
    const calendarInfo = PluginState.getProviderRegistry().getSource(masterCalendarId);
    if (!calendarInfo) {
      throw new Error(`Could not find calendar info for ${masterCalendarId}`);
    }

    const globalIdentifier = this.cache.getGlobalIdentifier(masterEvent, masterCalendarId);
    if (!globalIdentifier) {
      throw new Error('Could not generate global identifier for master event.');
    }
    const masterPath = globalIdentifier.substring(masterCalendarId.length + 2);

    const masterFilename = masterPath.split('/').pop();
    if (!masterFilename) {
      throw new Error(`Could not extract filename from master event path: ${masterPath}`);
    }

    const finalOverrideEvent: OFCEvent = {
      ...overrideEventData,
      recurringEventId: masterFilename
    };

    // CORRECTED: The calendar ID for addEvent comes from the source info.
    await this.cache.addEvent(calendarInfo.id, finalOverrideEvent, { silent: true });

    await this.cache.processEvent(
      masterEventId,
      e => {
        if (e.type !== 'recurring' && e.type !== 'rrule') return e;
        const skipDates = e.skipDates.includes(instanceDateToSkip)
          ? e.skipDates
          : [...e.skipDates, instanceDateToSkip];
        return { ...e, skipDates };
      },
      { silent: true }
    );
  }

  private updateMasterSkipDateInCache(masterEventId: string, instanceDate: string): void {
    const details = this.cache.store.getEventDetails(masterEventId);
    if (!details) {
      throw new Error('Master event not found for cache update.');
    }

    const { calendarId, event: masterEvent, location } = details;
    if (masterEvent.type !== 'recurring' && masterEvent.type !== 'rrule') {
      return;
    }

    const updatedMasterEvent: OFCEvent = {
      ...masterEvent,
      skipDates: masterEvent.skipDates.includes(instanceDate)
        ? masterEvent.skipDates
        : [...masterEvent.skipDates, instanceDate]
    };

    this.cache.store.delete(masterEventId);
    this.cache.store.add({
      calendarId,
      location: location
        ? { file: { path: location.path }, lineNumber: location.lineNumber }
        : null,
      id: masterEventId,
      event: updatedMasterEvent
    });

    this.cache.updateQueue.toRemove.add(masterEventId);
    this.cache.updateQueue.toAdd.set(masterEventId, {
      id: masterEventId,
      calendarId,
      event: updatedMasterEvent
    });
  }

  private providerOwnsRecurringInstanceOverrides(providerType: string): boolean {
    return providerType === 'caldav' || providerType === 'google' || providerType === 'outlook';
  }

  private inheritReminderFields(overrideEvent: OFCEvent, masterEvent: OFCEvent): OFCEvent {
    return {
      ...overrideEvent,
      notify: overrideEvent.notify !== undefined ? overrideEvent.notify : masterEvent.notify,
      alarms: overrideEvent.alarms !== undefined ? overrideEvent.alarms : masterEvent.alarms
    };
  }

  /**
   * Handles the modification of a single instance of a recurring event.
   * This is triggered when a user drags or resizes an instance in the calendar view.
   * It creates an override event and adds an exception to the parent.
   * @param masterEventId The session ID of the master recurring event.
   * @param instanceDate The original date of the instance that is being modified.
   * @param newEventData The new event data for the single-instance override.
   */
  public async modifyRecurringInstance(
    masterEventId: string,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<void> {
    if (newEventData.type !== 'single') {
      throw new Error('Cannot create a recurring override from a non-single event.');
    }

    const details = this.cache.store.getEventDetails(masterEventId);
    if (!details) {
      throw new Error('Master event not found for instance modification.');
    }
    const { calendarId, event: masterEvent } = details;
    const providerResult = this.getProviderAndConfig(calendarId);
    if (!providerResult) {
      throw new Error(`Provider for calendar ${calendarId} not found.`);
    }

    const overrideEventWithInheritedReminders = this.inheritReminderFields(
      newEventData,
      masterEvent
    );

    // CORRECTED: Delegate the entire provider operation to the registry.
    const [authoritativeOverrideEvent, overrideLocation] =
      await PluginState.getProviderRegistry().createInstanceOverrideInProvider(
        calendarId,
        masterEvent,
        instanceDate,
        overrideEventWithInheritedReminders
      );

    const enhancedEvent = this.cache.enhancer.enhance(authoritativeOverrideEvent);

    const overrideId = this.cache.generateId();
    this.cache.store.add({
      calendarId: calendarId,
      location: overrideLocation,
      id: overrideId,
      event: enhancedEvent
    });
    this.cache.updateQueue.toAdd.set(overrideId, {
      id: overrideId,
      calendarId: calendarId,
      event: enhancedEvent
    });
    this.cache.isBulkUpdating = true;

    if (this.providerOwnsRecurringInstanceOverrides(providerResult.provider.type)) {
      this.updateMasterSkipDateInCache(masterEventId, instanceDate);
    } else {
      await this.cache.processEvent(
        masterEventId,
        e => {
          if (e.type !== 'recurring' && e.type !== 'rrule') return e;
          const skipDates = e.skipDates.includes(instanceDate)
            ? e.skipDates
            : [...e.skipDates, instanceDate];
          return { ...e, skipDates };
        },
        { silent: true }
      );
    }
  }

  /**
   * Handles the logic for marking an instance of a recurring event as complete or not.
   * This uses the "exception and override" strategy.
   * @param eventId The ID of the event instance clicked in the UI. This could be the parent recurring event or a single-event override.
   * @param instanceDate The specific date of the instance to modify (e.g., '2023-11-20').
   * @param isDone The desired completion state.
   */
  public async toggleRecurringInstance(
    eventId: string,
    instanceDate: string,
    isDone: boolean
  ): Promise<void> {
    // Get the event that was actually clicked.
    const clickedEventDetails = this.cache.store.getEventDetails(eventId);
    if (!clickedEventDetails) return;
    const { event: clickedEvent, calendarId } = clickedEventDetails;

    if (isDone) {
      // === USE CASE: COMPLETING A TASK ===
      if (clickedEvent.type === 'single') {
        // The user clicked the checkbox on an existing, incomplete override.
        // We just need to update its status to complete.
        await this.cache.updateEventWithId(eventId, toggleTask(clickedEvent, true));
      } else {
        // The user clicked the checkbox on a master recurring instance.
        // We need to create a new, completed override by explicitly picking properties.

        let overrideEvent: OFCEvent;

        if (clickedEvent.allDay === false) {
          // This is a TIMED recurring event.
          overrideEvent = {
            // Inherit common properties
            title: clickedEvent.title,
            category: clickedEvent.category,
            subCategory: clickedEvent.subCategory,
            timezone: clickedEvent.timezone,

            // Inherit timed properties
            allDay: false,
            startTime: clickedEvent.startTime,
            endTime: clickedEvent.endTime,

            // Set specific properties for a single event
            type: 'single',
            date: instanceDate,
            endDate: null,
            completed: null // Will be set by toggleTask
          };
        } else {
          // This is an ALL-DAY recurring event.
          overrideEvent = {
            // Inherit common properties
            title: clickedEvent.title,
            category: clickedEvent.category,
            subCategory: clickedEvent.subCategory,
            timezone: clickedEvent.timezone,

            // Inherit all-day property
            allDay: true,

            // Set specific properties for a single event
            type: 'single',
            date: instanceDate,
            endDate: null,
            completed: null // Will be set by toggleTask
          };
        }

        const completedOverrideEvent = toggleTask(overrideEvent, true);
        await this._createRecurringOverride(eventId, instanceDate, completedOverrideEvent);
      }
    } else {
      // === USE CASE: UN-COMPLETING A TASK ===
      if (clickedEvent.type === 'single' && clickedEvent.recurringEventId) {
        const masterFilename = clickedEvent.recurringEventId;
        const providerResult = this.getProviderAndConfig(calendarId);
        if (!providerResult) {
          console.warn(
            `Could not find provider for calendar ID ${calendarId}. Deleting orphan override.`
          );
          await this.cache.deleteEvent(eventId);
          return;
        }

        const { config } = providerResult;
        const masterPath =
          config.type === 'local' && 'directory' in config
            ? `${config.directory}/${masterFilename}`
            : masterFilename;
        const globalMasterIdentifier = `${calendarId}::${masterPath}`;
        const masterSessionId = await this.cache.getSessionId(globalMasterIdentifier);

        if (masterSessionId) {
          const masterEvent = this.cache.getEventById(masterSessionId);
          if (
            masterEvent &&
            this.hasModifiedTiming(clickedEventDetails.event, masterEvent, instanceDate)
          ) {
            // Timing has been modified, preserve the override but change completion status
            showNotice(t('recurEvents.preservingTiming'));
            await this.cache.updateEventWithId(
              eventId,
              toggleTask(clickedEventDetails.event, false)
            );
            return;
          }
        }
      }

      // Original logic: delete the override to revert to main recurring sequence
      showNotice(t('recurEvents.revertingControl'));
      await this.cache.deleteEvent(eventId);
    }
  }

  public async updateRecurringChildren(
    calendarId: string,
    newParentFilename: string,
    newParentEvent: OFCEvent,
    oldParentEvent: OFCEvent
  ): Promise<void> {
    if (newParentEvent.type !== 'recurring' && newParentEvent.type !== 'rrule') {
      return;
    }

    const providerResult = this.getProviderAndConfig(calendarId);
    if (!providerResult) return;
    const { provider, config } = providerResult;
    if (config.type !== 'local') return;
    const directory = config.directory;
    if (!directory) return;

    const oldFullTitle = PluginState.getCache().enhancer.prepareForStorage(oldParentEvent).title;
    const sanitizedOldTitle = this._sanitizeTitleForFilename(oldFullTitle);

    const childrenToUpdate = (newParentEvent.skipDates || []).flatMap((date: string) => {
      const childFilename = `${date} ${sanitizedOldTitle}.md`;
      const childPath = `${directory}/${childFilename}`;
      return this.cache.store.getEventsInFile({ path: childPath });
    });

    if (childrenToUpdate.length === 0) {
      return;
    }

    showNotice(t('recurEvents.updatingChildren', { count: childrenToUpdate.length }));

    for (const childStoredEvent of childrenToUpdate) {
      const childDetails = this.cache.store.getEventDetails(childStoredEvent.id);
      if (!childDetails) continue;

      const { calendarId: childCalendarId, event: childEvent } = childDetails;

      // ====================================================================
      // THIS IS THE CORRECTED BLOCK
      // ====================================================================
      // 1. Create the version of the event for STORAGE on disk.
      // It has a flat title (e.g., "Category - Title") and no category fields.
      const storageChildEvent: OFCEvent = {
        ...childEvent,
        // Inherit the new full title from the parent that was prepared for storage.
        title: this.cache.enhancer.prepareForStorage(newParentEvent).title,
        recurringEventId: newParentFilename
      };
      delete storageChildEvent.category;
      delete storageChildEvent.subCategory;

      // 2. Create the version of the event for the in-memory CACHE and UI.
      // It has separate, structured fields for title, category, etc.
      const enhancedChildForCache: OFCEvent = {
        ...childEvent,
        // Inherit the new ENHANCED properties from the new parent event.
        title: newParentEvent.title,
        category: newParentEvent.category,
        subCategory: newParentEvent.subCategory,
        recurringEventId: newParentFilename
      };

      const handle = provider.getEventHandle(childEvent);
      if (!handle) continue;

      // 3. Pass the STORAGE version to the provider to write to the file.
      const newLocation = await provider.updateEvent(handle, childEvent, storageChildEvent);

      // 4. Pass the ENHANCED version to the cache store and the UI update queue.
      this.cache.store.delete(childStoredEvent.id);
      this.cache.store.add({
        calendarId: childCalendarId,
        location: newLocation,
        id: childStoredEvent.id,
        event: enhancedChildForCache // Use the correct version here
      });

      this.cache.isBulkUpdating = true; // This flag is still relevant for batching
      this.cache.updateQueue.toRemove.add(childStoredEvent.id);
      this.cache.updateQueue.toAdd.set(childStoredEvent.id, {
        id: childStoredEvent.id,
        calendarId: childCalendarId,
        event: enhancedChildForCache // And use the correct version here
      });
      // ====================================================================
    }
  }

  /**
   * Gatekeeper for update requests. Detects if a recurring parent is being renamed.
   * If so, it delegates to a private handler and returns true. Otherwise, returns false.
   * @returns `true` if the update was fully handled, `false` otherwise.
   */
  public async handleUpdate(
    oldEvent: OFCEvent,
    newEvent: OFCEvent,
    calendarId: string
  ): Promise<boolean> {
    if (oldEvent.type !== 'recurring' && oldEvent.type !== 'rrule') {
      return false; // Not a recurring master, let the standard process handle it.
    }

    const providerResult = this.getProviderAndConfig(calendarId);
    if (!providerResult) {
      return false;
    }
    const { provider } = providerResult;

    const oldHandle = provider.getEventHandle(oldEvent);
    const newHandle = provider.getEventHandle(newEvent);

    const oldPath = oldHandle?.persistentId;
    const newPath = newHandle?.persistentId;

    // A rename is happening if the persistent ID (the file path for notes) changes.
    if (oldPath && newPath && oldPath !== newPath) {
      // It's a rename. Delegate to the private handler to manage the entire atomic operation.
      await this._handleRecurringRename(oldEvent, newEvent, calendarId, oldHandle, newHandle);
      return true; // Signal that we've taken control.
    }

    return false; // Not a rename, let the standard process handle it.
  }

  /**
   * Private worker to handle the atomic update of a renamed recurring parent and all its children.
   * Manages the isBulkUpdating flag to prevent race conditions with the file watcher.
   */
  private async _handleRecurringRename(
    oldEvent: OFCEvent,
    newEvent: OFCEvent,
    calendarId: string,
    oldHandle: import('../../providers/typesProvider').EventHandle,
    newHandle: import('../../providers/typesProvider').EventHandle
  ): Promise<void> {
    this.cache.isBulkUpdating = true;
    try {
      const providerResult = this.getProviderAndConfig(calendarId);
      if (!providerResult) {
        throw new Error(`Provider for calendar ${calendarId} not found during rename.`);
      }
      const { provider } = providerResult;

      // 1. Find the parent's session ID in the cache before doing anything.
      const parentGlobalId = this.cache.getGlobalIdentifier(oldEvent, calendarId);
      const parentSessionId = parentGlobalId ? await this.cache.getSessionId(parentGlobalId) : null;
      if (!parentSessionId) {
        throw new Error('Could not find original parent event in cache to update.');
      }

      // 2. Update all child notes to point to the new parent filename.
      const oldFilename = oldHandle.persistentId.split('/').pop();
      const newFilename = newHandle.persistentId.split('/').pop();
      if (oldFilename && newFilename) {
        await this.updateRecurringChildren(calendarId, newFilename, newEvent, oldEvent);
      }

      // 3. Now, perform the update on the parent event's file itself.
      const preparedOldEvent = this.cache.enhancer.prepareForStorage(oldEvent);
      const preparedNewEvent = this.cache.enhancer.prepareForStorage(newEvent);
      await provider.updateEvent(oldHandle, preparedOldEvent, preparedNewEvent);

      // 4. Update the parent event's entry in the cache store and queue the UI change.
      this.cache.store.delete(parentSessionId);
      this.cache.store.add({
        calendarId,
        location: { file: { path: newHandle.persistentId }, lineNumber: undefined },
        id: parentSessionId,
        event: newEvent
      });
      this.cache.updateQueue.toRemove.add(parentSessionId);
      this.cache.updateQueue.toAdd.set(parentSessionId, {
        id: parentSessionId,
        calendarId,
        event: newEvent
      });
    } catch (e) {
      console.error('Error during recurring parent rename operation:', e);
      showNotice(t('recurEvents.updateError'));
      // The finally block will still run to clean up.
    } finally {
      this.cache.isBulkUpdating = false;
      // Flush all queued updates for the parent and children together.
      this.cache.flushUpdateQueue([], []);
    }
  }
  /**
   * Moves a recurring event (either a master or a specific instance) to a new calendar.
   * - If moving a Master: Moves the master and all its children (overrides), updating links.
   * - If moving a Child: Detaches it from the series and moves it as a standalone single event.
   * @returns true if the event was handled by this manager, false if it's not a recurring event.
   */
  public async moveRecurringEvent(
    eventId: string,
    newCalendarId: string,
    newEventData?: OFCEvent
  ): Promise<boolean> {
    const originalDetails = this.cache.store.getEventDetails(eventId);
    if (!originalDetails) return false;
    const { event: originalEvent } = originalDetails;

    const eventToCreate = newEventData || originalEvent;

    // === CASE 1: Moving a Child Instance (Override) ===
    if (originalEvent.type === 'single' && originalEvent.recurringEventId) {
      // 1. Create event in new calendar as a standalone event (remove recurring linkage)
      const standaloneEvent = { ...eventToCreate };
      delete standaloneEvent.recurringEventId;

      await this.cache.addEvent(newCalendarId, standaloneEvent, { trackMilestone: false });

      // 2. Detach from Old Master (add skip date)
      await this.cache.deleteEvent(eventId, { silent: true });

      await recordMilestoneAction('moved', newCalendarId);
      return true;
    }

    // === CASE 2: Moving a Master Event ===
    if (originalEvent.type === 'recurring' || originalEvent.type === 'rrule') {
      const children = this.findRecurringChildren(eventId);

      // 1. Create New Master in Destination
      // We use addEvent which handles ID generation and storage.
      const successful = await this.cache.addEvent(newCalendarId, eventToCreate, {
        trackMilestone: false
      });
      if (!successful) throw new Error('Failed to create new master event in destination.');

      // We need to find the NEW master event to get its linking ID (e.g. filename).
      // Strategy: Since I can't easily get the return value from `cache.addEvent`,
      // I will replicate its core steps here for the Master so I have the Location.
      const [newMasterEvent, newMasterLocation] =
        await PluginState.getProviderRegistry().createEventInProvider(newCalendarId, eventToCreate);

      // Add New Master to Cache
      const newMasterId = this.cache.generateId();
      const enhancedNewMaster = this.cache.enhancer.enhance(newMasterEvent);
      this.cache.store.add({
        calendarId: newCalendarId,
        location: newMasterLocation,
        id: newMasterId,
        event: enhancedNewMaster
      });
      // Notify UI
      this.cache.flushUpdateQueue(
        [],
        [
          {
            id: newMasterId,
            event: enhancedNewMaster,
            calendarId: newCalendarId
          }
        ]
      );

      // 2. Identify Link ID (Filename for Local)
      // New Master Location has the path.
      let newLinkId: string | undefined;
      const config = PluginState.getProviderRegistry().getSource(newCalendarId);
      if (config && config.type === 'local' && newMasterLocation && newMasterLocation.file) {
        // Local Calendar: Link ID is the filename
        newLinkId = newMasterLocation.file.path.split('/').pop();
      } else {
        // Remote Calendar: Link ID might be UID or not supported for manual linking.
        newLinkId = newMasterEvent.id;
      }

      if (children.length > 0 && newLinkId) {
        showNotice(t('recurEvents.movingChildren', { count: children.length }));

        for (const child of children) {
          const childEvent = child.event;
          const newChildEvent = {
            ...childEvent,
            recurringEventId: newLinkId
          };
          // Add Child to New Calendar
          await this.cache.addEvent(newCalendarId, newChildEvent, { trackMilestone: false });
        }
      }

      // 3. Delete Old Series (Master + Children)
      await this.deleteAllRecurring(eventId); // This deletes Master + Children from Old Calendar

      await recordMilestoneAction('moved', newCalendarId);
      return true;
    }

    return false;
  }
}
