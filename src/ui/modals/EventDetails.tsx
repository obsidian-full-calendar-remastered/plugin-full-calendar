import * as React from 'react';
import { OFCEvent } from '../../types';
import { t } from '../../features/i18n/i18n';
import { DateTime } from 'luxon';
import { setIcon } from 'obsidian';
import { rrulestr } from 'rrule';

interface EventDetailsProps {
  event: OFCEvent;
  calendarName: string;
  location?: { path: string; lineNumber?: number } | null;
  onClose: () => void;
  onOpenNote?: () => void;
  onCreateLinkedNote?: () => void;
}

const Icon = ({ name }: { name: string }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (ref.current) {
      setIcon(ref.current, name);
    }
  }, [name]);
  return <div ref={ref} className="event-details-icon" />;
};

export const EventDetails: React.FC<EventDetailsProps> = ({
  event,
  calendarName,
  location,
  onClose,
  onOpenNote,
  onCreateLinkedNote
}) => {
  const [showInstances, setShowInstances] = React.useState(false);
  const [instances, setInstances] = React.useState<Date[]>([]);

  React.useEffect(() => {
    if (showInstances && event.type === 'rrule' && event.rrule) {
      try {
        const rule = rrulestr(event.rrule);
        const nextInstances = rule.between(
          new Date(),
          new Date(Date.now() + 31536000000 * 2),
          true,
          (_date, i) => i < 5
        );
        setInstances(nextInstances);
      } catch (e) {
        console.error('Failed to parse RRULE', e);
      }
    }
  }, [showInstances, event]);

  const formatDate = (dateStr: string) => {
    return DateTime.fromISO(dateStr).toLocaleString({
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const formatJsDate = (date: Date) => {
    return DateTime.fromJSDate(date).toLocaleString({
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const formatTime = (timeStr: string) => {
    return DateTime.fromFormat(timeStr, 'HH:mm').toLocaleString(DateTime.TIME_SIMPLE);
  };

  const dateString =
    event.type === 'single'
      ? formatDate(event.date)
      : event.type === 'recurring' && event.startRecur
        ? formatDate(event.startRecur)
        : event.type === 'rrule'
          ? formatDate(event.startDate)
          : '';

  const timeString = event.allDay
    ? t('modals.editEvent.fields.options.allDay')
    : `${event.startTime ? formatTime(event.startTime) : ''} - ${event.endTime ? formatTime(event.endTime) : ''}`;

  const isRecurring = event.type === 'rrule' || event.type === 'recurring';

  return (
    <div className="full-calendar-event-details">
      <div className="event-details-header">
        <div className="event-details-icon-box">
          <Icon name="calendar" />
        </div>
        <h2 className="event-details-title">{event.title || t('modals.editEvent.title.edit')}</h2>
      </div>

      <div className="event-details-row">
        <Icon name="clock" />
        <div className="event-details-content">
          <span>
            {dateString} {timeString}
          </span>
          {isRecurring && (
            <span className="event-details-action" onClick={() => setShowInstances(!showInstances)}>
              <Icon name="refresh-ccw" />
              {showInstances ? 'Hide series' : 'View series'}
            </span>
          )}
        </div>
      </div>

      {showInstances && instances.length > 0 && (
        <div className="event-details-row">
          <div className="event-details-icon" /> {/* Spacer */}
          <div className="event-details-content">
            <div className="upcoming-instances">
              <strong>Upcoming Instances:</strong>
              <ul>
                {instances.map((date, i) => (
                  <li key={i}>{formatJsDate(date)}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {(event.url || (location && location.path)) && (
        <div className="event-details-row">
          <Icon name="map-pin" />
          <div className="event-details-content">
            {event.url && (
              <div style={{ marginBottom: location && location.path ? '8px' : '0px' }}>
                <a
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="event-link"
                >
                  {event.url}
                </a>
              </div>
            )}
            {location && location.path && (
              <span className="u-selectable u-clickable-accent" onClick={onOpenNote}>
                {location.path}
              </span>
            )}
          </div>
        </div>
      )}

      {event.description && (
        <div className="event-details-row">
          <Icon name="align-left" />
          <div className="event-details-content description">
            {event.description.split('\n').map((line, i) => (
              <React.Fragment key={i}>
                {line}
                <br />
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      <div className="event-details-row">
        <Icon name="calendar-days" />
        <div className="event-details-content">
          <span className="u-muted">{calendarName}</span>
        </div>
      </div>

      <hr className="modal-hr" />

      <div className="modal-footer">
        {onCreateLinkedNote && !location && (
          <button
            type="button"
            className="mod-cta fc-create-linked-note-btn"
            onClick={onCreateLinkedNote}
            style={{ marginRight: 'auto' }}
          >
            Create Linked Note
          </button>
        )}
        <div className="footer-actions-right">
          <button type="button" className="mod-cta" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
