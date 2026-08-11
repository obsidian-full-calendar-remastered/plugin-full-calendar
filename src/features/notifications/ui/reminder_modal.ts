import { showNotice } from '../../../utils/showNotice';
/**
 * @file reminder_modal.ts
 * @brief Launcher for the Reminder Modal.
 */
import { PluginState } from '../../../core/PluginState';
import * as React from 'react';
import { DateTime } from 'luxon';
import ReactModal from '../../../ui/ReactModal';
import { ReminderModal } from './ReminderModal';
import FullCalendarPlugin from '../../../main';
import { openFileForEvent } from '../../../utils/eventActions';
import { EnrichedOFCEvent } from '../../../core/TimeEngine';

export function launchReminderModal(
  plugin: FullCalendarPlugin,
  occurrence: EnrichedOFCEvent,
  eventId: string,
  type: 'default' | 'custom'
) {
  new ReactModal(plugin.app, closeModal => {
    return Promise.resolve(
      React.createElement(ReminderModal, {
        occurrence,
        type,
        defaultReminderMinutes: PluginState.getSettings().defaultReminderMinutes,
        onDismiss: () => {
          closeModal();
        },
        onOpen: () => {
          void (async () => {
            try {
              await openFileForEvent(PluginState.getCache(), plugin.app, eventId);
            } catch (e) {
              showNotice('Could not open event file.');
              console.error(e);
            }
            closeModal();
          })();
        },
        onSnooze: (minutes: number) => {
          void (async () => {
            try {
              await PluginState.getCache().processEvent(eventId, e => {
                if (type === 'default') {
                  // Destructive Snooze: Move Start Time
                  if (e.allDay) {
                    showNotice('Cannot snooze start time of all-day events.');
                    return e;
                  }

                  const oldStart = DateTime.fromFormat(e.startTime, 'HH:mm');
                  if (!oldStart.isValid) return e;

                  const newStart = oldStart.plus({ minutes });

                  if (e.endTime) {
                    const end = DateTime.fromFormat(e.endTime, 'HH:mm');
                    if (end.isValid && newStart >= end) {
                      throw new Error('Cannot snooze: New start time would be after end time.');
                    }
                  }

                  return {
                    ...e,
                    startTime: newStart.toFormat('HH:mm')
                  };
                }
                // Custom Snooze: Reduce notify value
                const currentNotify = e.notify?.value || 0;
                const newNotify = Math.max(0, currentNotify - minutes);
                return {
                  ...e,
                  notify: { value: newNotify }
                };
              });
              showNotice(`Snoozed for ${minutes} minutes.`);
            } catch (e) {
              console.error('Snooze failed', e);
              if (e instanceof Error) {
                showNotice(e.message);
              } else {
                showNotice('Failed to snooze event.');
              }
            }
            closeModal();
          })();
        }
      })
    );
  }).open();
}
