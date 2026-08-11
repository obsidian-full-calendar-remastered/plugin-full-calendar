/**
 * @file ReminderModal.tsx
 * @brief React component for the Reminder/Snooze modal.
 */
import * as React from 'react';
import { useState } from 'react';
import { DateTime } from 'luxon';
import { t } from '../../i18n/i18n';
import { EnrichedOFCEvent } from '../../../core/TimeEngine';

interface ReminderModalProps {
  occurrence: EnrichedOFCEvent;
  type: 'default' | 'custom';
  defaultReminderMinutes: number;
  onSnooze: (minutes: number) => void;
  onDismiss: () => void;
  onOpen: () => void;
}

export const ReminderModal = ({
  occurrence,
  type,
  defaultReminderMinutes: _defaultReminderMinutes,
  onSnooze,
  onDismiss,
  onOpen
}: ReminderModalProps) => {
  const [snoozeDuration, setSnoozeDuration] = useState(10); // Default 10m

  const event = occurrence.event;

  const formatDateTime = (dt: DateTime) => dt.toLocal().toFormat('h:mm a');

  const snoozeOptions = [
    { label: t('modals.reminder.presets.5m'), value: 5 },
    { label: t('modals.reminder.presets.10m'), value: 10 },
    { label: t('modals.reminder.presets.15m'), value: 15 },
    { label: t('modals.reminder.presets.30m'), value: 30 },
    { label: t('modals.reminder.presets.1h'), value: 60 }
  ];

  const handleSnooze = (e: React.SyntheticEvent) => {
    e.preventDefault();
    onSnooze(snoozeDuration);
  };

  return (
    <div className="full-calendar-reminder-modal">
      <div className="modal-header">
        <h2>{t('notifications.eventStarting.title')}</h2>
      </div>

      <div className="reminder-content">
        <h3>{event.title}</h3>
        {event.allDay ? (
          <p>{t('notifications.allDaySuffix')}</p>
        ) : (
          <p>
            {occurrence.start && formatDateTime(occurrence.start)}
            {occurrence.end && ` - ${formatDateTime(occurrence.end)}`}
          </p>
        )}

        {type === 'default' && (
          <div className="callout callout-warning u-mt-1rem">
            <div className="callout-title">{t('modals.reminder.snoozeWarningTitle')}</div>
            <div className="callout-content">
              <p>{t('modals.reminder.snoozeWarningBody')}</p>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSnooze} className="reminder-controls u-mt-1-5rem">
        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">{t('modals.reminder.snoozeFor')}</div>
          </div>
          <div className="setting-item-control">
            <select
              value={snoozeDuration}
              onChange={e => setSnoozeDuration(parseInt(e.target.value))}
            >
              {snoozeOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onDismiss}>
            {t('modals.reminder.dismiss')}
          </button>
          <button type="button" onClick={onOpen} className="mod-cta">
            {t('modals.reminder.openNote')}
          </button>
          <button type="submit" className="mod-primary">
            {t('modals.reminder.snooze')}
          </button>
        </div>
      </form>
    </div>
  );
};
