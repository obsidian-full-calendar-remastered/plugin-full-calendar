/**
 * @file EditEvent.tsx
 * @brief React component for the "Create/Edit Event" modal form.
 *
 * @description
 * This file defines the `EditEvent` React component, which provides the form
 * for creating and editing events. It manages all form state, including title,
 * dates, times, recurrence rules, and associated calendar. It performs form
 * validation and calls a submit callback to persist changes.
 *
 * @license See LICENSE.md
 */

import { DateTime } from 'luxon';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { CalendarInfo, OFCEvent } from '../../types';
import { AutocompleteInput } from '../components/forms/AutocompleteInput';
import { parseSubcategoryTitle } from '../../features/category/categoryParser';
import { t } from '../../features/i18n/i18n';
import { setIcon } from 'obsidian';
import { PluginState } from '../../core/PluginState';

const Icon = ({ name }: { name: string }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (ref.current) {
      setIcon(ref.current, name);
    }
  }, [name]);
  return <div ref={ref} className="edit-event-icon" />;
};

interface DayChoiceProps {
  code: string;
  label: string;
  isSelected: boolean;
  onClick: (code: string) => void;
}
const DayChoice = ({ code, label, isSelected, onClick }: DayChoiceProps) => (
  <button
    type="button"
    className={`ofc-day-choice-button ${isSelected ? 'is-selected' : ''}`}
    onClick={() => onClick(code)}
  >
    <b>{label[0]}</b>
  </button>
);

const getDayMap = () => ({
  U: t('settings.weekdays.sunday'),
  M: t('settings.weekdays.monday'),
  T: t('settings.weekdays.tuesday'),
  W: t('settings.weekdays.wednesday'),
  R: t('settings.weekdays.thursday'),
  F: t('settings.weekdays.friday'),
  S: t('settings.weekdays.saturday')
});

const DaySelect = ({
  value: days,
  onChange
}: {
  value: string[];
  onChange: (days: string[]) => void;
}) => {
  const DAY_MAP = getDayMap();
  return (
    <div>
      {Object.entries(DAY_MAP).map(([code, label]) => (
        <DayChoice
          key={code}
          code={code}
          label={label}
          isSelected={days.includes(code)}
          onClick={() =>
            days.includes(code) ? onChange(days.filter(c => c !== code)) : onChange([code, ...days])
          }
        />
      ))}
    </div>
  );
};

type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

interface EditEventProps {
  submit: (frontmatter: OFCEvent, calendarIndex: number) => Promise<void>;
  readonly calendars: {
    id: string;
    name: string;
    type: CalendarInfo['type'];
  }[];
  defaultCalendarIndex: number;
  initialEvent?: Partial<OFCEvent>;
  availableCategories?: string[];
  enableCategory: boolean;
  enableBackgroundEvents?: boolean;
  enableReminders: boolean; // ADD THIS
  open?: () => Promise<void>;
  deleteEvent?: () => Promise<void>;
  onAttemptEditInherited?: () => void;
  mode: 'create' | 'edit';
}

function getInitialRecurrenceType(event?: Partial<OFCEvent>): RecurrenceType {
  if (event?.type !== 'recurring') {
    return 'none';
  }
  if (event.fcrDaily) {
    return 'daily';
  }
  if (event.daysOfWeek && event.daysOfWeek.length > 0) {
    return 'weekly';
  }
  if (event.month) {
    return 'yearly';
  }
  if (event.dayOfMonth) {
    return 'monthly';
  }
  return 'none';
}

export const EditEvent = ({
  initialEvent,
  submit,
  open,
  deleteEvent,
  calendars,
  defaultCalendarIndex,
  availableCategories = [],
  enableCategory,
  enableBackgroundEvents = false,
  enableReminders, // ADD THIS
  onAttemptEditInherited,
  mode
}: EditEventProps) => {
  const isChildOverride = !!initialEvent?.recurringEventId;

  const disabledTooltip = t('modals.editEvent.tooltips.inheritedProperty'); // Update tooltip

  const [date, setDate] = useState(
    initialEvent
      ? initialEvent.type === 'single'
        ? initialEvent.date
        : initialEvent.type === 'recurring'
          ? initialEvent.startRecur
          : initialEvent.type === 'rrule'
            ? initialEvent.startDate
            : ''
      : ''
  );
  const [endDate] = useState(
    initialEvent && initialEvent.type === 'single' ? initialEvent.endDate : undefined
  );
  const [startTime, setStartTime] = useState(
    initialEvent?.allDay === false ? initialEvent.startTime || '' : ''
  );
  const [endTime, setEndTime] = useState(
    initialEvent?.allDay === false ? initialEvent.endTime || '' : ''
  );
  const [title, setTitle] = useState(initialEvent?.title || '');
  const [category, setCategory] = useState(initialEvent?.category || '');
  const [location, setLocation] = useState(initialEvent?.location || '');
  const [description, setDescription] = useState(initialEvent?.description || '');
  // const [isRecurring, setIsRecurring] = useState(initialEvent?.type === 'recurring' || false);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(
    getInitialRecurrenceType(initialEvent)
  );
  const isRecurring = recurrenceType !== 'none';
  const [allDay, setAllDay] = useState(initialEvent?.allDay || false);
  const [calendarIndex, setCalendarIndex] = useState(defaultCalendarIndex);
  const [isTask, setIsTask] = useState(
    (initialEvent?.type === 'single' &&
      initialEvent.completed !== undefined &&
      initialEvent.completed !== null) ||
      (initialEvent?.type === 'recurring' && initialEvent.isTask) ||
      (initialEvent?.type === 'rrule' && initialEvent.isTask) ||
      false
  );
  const [complete, setComplete] = useState(
    initialEvent?.type === 'single' && initialEvent.completed
  );
  const [daysOfWeek, setDaysOfWeek] = useState<string[]>(
    initialEvent?.type === 'recurring' ? initialEvent.daysOfWeek || [] : []
  );
  const [endRecur, setEndRecur] = useState(
    initialEvent?.type === 'recurring' ? initialEvent.endRecur : undefined
  );
  const [repeatInterval, setRepeatInterval] = useState(
    initialEvent?.type === 'recurring' ? initialEvent.repeatInterval || 1 : 1
  );
  // START ADDITION
  const [notifyValue, setNotifyValue] = useState(
    initialEvent?.notify?.value !== undefined ? initialEvent.notify.value : ''
  );
  const [providerNotifyValue, setProviderNotifyValue] = useState(
    initialEvent?.alarms?.[0]?.minutesBefore !== undefined
      ? initialEvent.alarms[0].minutesBefore
      : initialEvent?.notify?.value !== undefined
        ? initialEvent.notify.value
        : ''
  );
  // END ADDITION
  type MonthlyMode = 'dayOfMonth' | 'onThe';
  const getInitialMonthlyMode = (): MonthlyMode =>
    initialEvent?.type === 'recurring' && initialEvent.repeatOn ? 'onThe' : 'dayOfMonth';

  const [monthlyMode, setMonthlyMode] = useState<MonthlyMode>(getInitialMonthlyMode());
  const [repeatOnWeek, setRepeatOnWeek] = useState(
    initialEvent?.type === 'recurring' ? initialEvent.repeatOn?.week || 1 : 1
  );
  const [repeatOnWeekday, setRepeatOnWeekday] = useState(
    initialEvent?.type === 'recurring' ? initialEvent.repeatOn?.weekday || 0 : 0
  );
  // END ADDITION
  const initialDisplay =
    initialEvent?.display === 'inverse-background' ? 'auto' : (initialEvent?.display ?? 'auto');
  const [display, setDisplay] = useState<'auto' | 'block' | 'list-item' | 'background' | 'none'>(
    initialDisplay
  );

  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.focus();
    }
  }, [titleRef]);

  const selectedCalendar = calendars[calendarIndex];
  const isDailyNoteCalendar =
    selectedCalendar.type === 'dailynote' || selectedCalendar.type === 'journals';
  const provider = PluginState.getProviderRegistry().getInstance(selectedCalendar.id);
  const useBooleanTaskCompletion = Boolean(
    provider &&
    'taskCompletionStyle' in provider &&
    (provider as { taskCompletionStyle: string }).taskCompletionStyle === 'boolean'
  );
  const supportsProviderNotifications = Boolean(
    PluginState.getProviderRegistry().getInstance(selectedCalendar.id)?.getCapabilities()
      .supportsAlarms
  );
  const recurringTooltip = isDailyNoteCalendar
    ? t('modals.editEvent.tooltips.dailyNoteRecurring')
    : '';

  useEffect(() => {
    // If user switches to a daily note calendar, force recurrence off.
    if (isDailyNoteCalendar) {
      setRecurrenceType('none');
    }
  }, [isDailyNoteCalendar]);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    let completedValue: string | boolean | null = null;
    if (isTask) {
      completedValue = complete || false;
    }

    const timeInfo = allDay
      ? { allDay: true as const }
      : { allDay: false as const, startTime: startTime || '', endTime: endTime || null };

    let eventData: Partial<OFCEvent>;

    if (recurrenceType === 'none') {
      eventData = {
        type: 'single',
        date: date || '',
        endDate: endDate || null,
        completed: completedValue
      };
    } else {
      const recurringData: Partial<OFCEvent> & { type: 'recurring' } = {
        type: 'recurring',
        startRecur: date || undefined,
        endRecur: endRecur,
        isTask: isTask,
        skipDates: initialEvent?.type === 'recurring' ? initialEvent.skipDates : [],
        repeatInterval: repeatInterval > 1 ? repeatInterval : undefined
      };

      if (recurrenceType === 'daily') {
        recurringData.fcrDaily = true;
      } else if (recurrenceType === 'weekly') {
        recurringData.daysOfWeek = daysOfWeek as ('U' | 'M' | 'T' | 'W' | 'R' | 'F' | 'S')[];
      } else if (recurrenceType === 'monthly' && date) {
        // START MODIFICATION
        if (monthlyMode === 'onThe') {
          recurringData.repeatOn = { week: repeatOnWeek, weekday: repeatOnWeekday };
          recurringData.dayOfMonth = undefined; // Ensure mutual exclusivity
        } else {
          recurringData.dayOfMonth = DateTime.fromISO(date).day;
          recurringData.repeatOn = undefined; // Ensure mutual exclusivity
        }
        // END MODIFICATION
      } else if (recurrenceType === 'yearly' && date) {
        const dt = DateTime.fromISO(date);
        recurringData.month = dt.month;
        recurringData.dayOfMonth = dt.day;
      }
      eventData = recurringData;
    }

    let parsedSubCategory: string | undefined;
    let parsedTitle: string;

    if (enableCategory) {
      // When advanced categorization is enabled, the title input contains "SubCategory - Title"
      // and the category is managed separately in the category input field
      const parsed = parseSubcategoryTitle(title);
      parsedSubCategory = parsed.subCategory;
      parsedTitle = parsed.title;
    } else {
      // When advanced categorization is disabled, keep user input literal.
      parsedSubCategory = undefined;
      parsedTitle = title;
    }

    const finalEvent = {
      title: parsedTitle,
      category: category || undefined,
      display: display !== 'auto' ? display : undefined,
      subCategory: parsedSubCategory,
      location: location || undefined,
      description: description || undefined,

      notify: notifyValue !== '' ? { value: Number(notifyValue) } : undefined,
      alarms:
        supportsProviderNotifications && providerNotifyValue !== ''
          ? [{ minutesBefore: Number(providerNotifyValue), action: 'DISPLAY' }]
          : undefined,
      ...timeInfo,
      ...eventData
    } as OFCEvent;

    await submit(finalEvent, calendarIndex);
  };

  return (
    <div className="full-calendar-edit-modal">
      <form onSubmit={e => void handleSubmit(e)}>
        <div className="modal-header">
          <h2>
            {mode === 'edit' ? t('modals.editEvent.title.edit') : t('modals.editEvent.title.new')}
          </h2>
          {open && (
            <button type="button" className="mod-subtle" onClick={() => void open()}>
              {t('modals.editEvent.buttons.openNote')}
            </button>
          )}
        </div>

        <div className="premium-title-item">
          <div
            className={`ofc-premium-title-wrap ${isChildOverride ? 'is-override-disabled' : ''}`}
            onClick={isChildOverride ? onAttemptEditInherited : undefined}
            title={isChildOverride ? disabledTooltip : ''}
          >
            <input
              ref={titleRef}
              type="text"
              value={title}
              placeholder={t('modals.editEvent.fields.title.placeholder') || 'Event Title'}
              required
              onChange={e => setTitle(e.target.value)}
              readOnly={isChildOverride}
              className="ofc-premium-title-input"
            />
          </div>
        </div>

        <div className="ofc-premium-fields-row">
          {enableCategory && (
            <div className="premium-field-col">
              <div
                className={`ofc-premium-input-wrap ${isChildOverride ? 'is-override-disabled' : ''}`}
                onClick={isChildOverride ? onAttemptEditInherited : undefined}
                title={isChildOverride ? disabledTooltip : ''}
              >
                <Icon name="tag" />
                <AutocompleteInput
                  id="category-autocomplete"
                  value={category}
                  onChange={setCategory}
                  suggestions={availableCategories}
                  placeholder={
                    t('modals.editEvent.fields.category.placeholder') || 'Category (optional)'
                  }
                  readOnly={isChildOverride}
                />
              </div>
            </div>
          )}

          <div className="premium-field-col">
            <div className="ofc-premium-input-wrap">
              <Icon name="map-pin" />
              <input
                type="text"
                value={location}
                placeholder={t('modals.editEvent.fields.location.placeholder') || 'Add location...'}
                onChange={e => setLocation(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="premium-field-full">
          <div className="ofc-premium-input-wrap ofc-premium-textarea-wrap">
            <Icon name="align-left" />
            <textarea
              value={description}
              placeholder={
                t('modals.editEvent.fields.description.placeholder') || 'Add description...'
              }
              onChange={e => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">{t('modals.editEvent.fields.inCalendar.label')}</div>
          </div>
          <div className="setting-item-control">
            <select
              value={calendarIndex}
              onChange={e => setCalendarIndex(parseInt(e.target.value))}
            >
              {calendars.map((cal, idx) => (
                <option key={idx} value={idx}>
                  {cal.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">{t('modals.editEvent.fields.date.label')}</div>
          </div>
          <div className="setting-item-control">
            <input type="date" value={date} required onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        <div className={`setting-item time-setting-item ${allDay ? 'is-disabled' : ''}`}>
          <div className="setting-item-info">
            <div className="setting-item-name">{t('modals.editEvent.fields.time.label')}</div>
          </div>
          <div className="setting-item-control time-group">
            <div className="ofc-time-inputs-wrap">
              <input
                type="time"
                value={startTime}
                required={!allDay}
                disabled={allDay}
                onChange={e => setStartTime(e.target.value)}
              />
              <span>➔</span>
              <input
                type="time"
                value={endTime}
                disabled={allDay}
                onChange={e => setEndTime(e.target.value)}
              />
            </div>
            <label
              className={`all-day-toggle-label ${allDay ? 'is-checked' : ''}`}
              title={isChildOverride ? disabledTooltip : ''}
            >
              <input
                type="checkbox"
                checked={allDay}
                onChange={e => setAllDay(e.target.checked)}
                disabled={isChildOverride}
              />
              <span>{t('modals.editEvent.fields.options.allDay')}</span>
            </label>
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-item-info">
            <div className="setting-item-name">{t('modals.editEvent.fields.options.label')}</div>
          </div>
          <div className="setting-item-control options-group">
            <label>
              <input type="checkbox" checked={isTask} onChange={e => setIsTask(e.target.checked)} />
              <span> {t('modals.editEvent.fields.options.isTask')}</span>
            </label>
            {isTask && (
              <label
                title={isRecurring ? t('modals.editEvent.tooltips.recurringTaskCompletion') : ''}
              >
                <input
                  type="checkbox"
                  checked={isRecurring ? false : !!complete}
                  onChange={e =>
                    !isRecurring &&
                    setComplete(
                      e.target.checked
                        ? useBooleanTaskCompletion
                          ? true
                          : DateTime.now().toISO()
                        : false
                    )
                  }
                  disabled={isRecurring}
                />
                <span> {t('modals.editEvent.fields.options.completed')}</span>
              </label>
            )}
          </div>
        </div>

        {enableReminders && (
          <div className="setting-item">
            <div className="setting-item-info">
              <div className="setting-item-name">
                {t('modals.editEvent.fields.notification.label')}
              </div>
            </div>
            <div className="setting-item-control ofc-notify-group">
              <label className="ofc-notify-field">
                <span>Obsidian reminder</span>
                <input
                  type="number"
                  min="0"
                  max="1440"
                  placeholder="Minutes before start"
                  value={notifyValue}
                  onChange={e => setNotifyValue(e.target.value)}
                  title="Minutes before the event starts"
                />
              </label>
              {supportsProviderNotifications && (
                <label className="ofc-notify-field">
                  <span>Calendar provider reminder</span>
                  <input
                    type="number"
                    min="0"
                    max="10080"
                    placeholder="Minutes before start"
                    value={providerNotifyValue}
                    onChange={e => setProviderNotifyValue(e.target.value)}
                    title="Minutes before the event starts"
                  />
                </label>
              )}
              <select
                onChange={e => {
                  const val = e.target.value;
                  if (val) {
                    setNotifyValue(val);
                    if (supportsProviderNotifications) {
                      setProviderNotifyValue(val);
                    }
                  }
                }}
                value="" // Always reset to allow re-selection
                title="Reminder time preset"
              >
                <option value="" disabled>
                  Preset
                </option>
                <option value="30">{t('modals.editEvent.fields.notification.presets.30m')}</option>
                <option value="60">{t('modals.editEvent.fields.notification.presets.1h')}</option>
                <option value="360">{t('modals.editEvent.fields.notification.presets.6h')}</option>
                <option value="720">{t('modals.editEvent.fields.notification.presets.12h')}</option>
                <option value="1440">
                  {t('modals.editEvent.fields.notification.presets.24h')}
                </option>
              </select>
            </div>
          </div>
        )}

        <details className="ofc-advanced-options-details">
          <summary>{t('modals.editEvent.advancedOptions') || 'Advanced Options'}</summary>
          <div className="ofc-advanced-options-content">
            {enableBackgroundEvents && (
              <div className="setting-item">
                <div
                  className="setting-item-info"
                  title={
                    t('modals.editEvent.fields.display.tooltip') ||
                    'Choose how this event appears on the calendar'
                  }
                >
                  <div className="setting-item-name">
                    {t('modals.editEvent.fields.display.label')}
                  </div>
                </div>
                <div
                  className={`setting-item-control ${isChildOverride ? 'is-override-disabled' : ''}`}
                  onClick={isChildOverride ? onAttemptEditInherited : undefined}
                  title={isChildOverride ? disabledTooltip : ''}
                >
                  <select
                    value={display}
                    onChange={e => setDisplay(e.target.value as typeof display)}
                    disabled={isChildOverride}
                  >
                    <option value="auto">
                      {t('modals.editEvent.fields.display.options.auto')}
                    </option>
                    <option value="background">
                      {t('modals.editEvent.fields.display.options.background')}
                    </option>
                    <option value="none">
                      {t('modals.editEvent.fields.display.options.none')}
                    </option>
                  </select>
                </div>
              </div>
            )}

            <div className="setting-item">
              <div className="setting-item-info">
                <div className="setting-item-name">
                  {t('modals.editEvent.fields.repeats.label')}
                </div>
              </div>
              <div className="setting-item-control">
                <select
                  value={recurrenceType}
                  onChange={e => setRecurrenceType(e.target.value as RecurrenceType)}
                  disabled={isDailyNoteCalendar}
                  title={recurringTooltip}
                >
                  <option value="none">{t('modals.editEvent.fields.repeats.options.none')}</option>
                  <option value="daily">
                    {t('modals.editEvent.fields.repeats.options.daily')}
                  </option>
                  <option value="weekly">
                    {t('modals.editEvent.fields.repeats.options.weekly')}
                  </option>
                  <option value="monthly">
                    {t('modals.editEvent.fields.repeats.options.monthly')}
                  </option>
                  <option value="yearly">
                    {t('modals.editEvent.fields.repeats.options.yearly')}
                  </option>
                </select>
              </div>
            </div>
            {isRecurring && (
              <div className="setting-item">
                <div className="setting-item-info"></div>
                <div className="setting-item-control u-flex-align-center u-gap-8px">
                  <span>{t('modals.editEvent.fields.repeats.repeatEvery')}</span>
                  <input
                    type="number"
                    min="1"
                    value={repeatInterval}
                    onChange={e => setRepeatInterval(parseInt(e.target.value, 10) || 1)}
                    className="u-w-60px"
                  />
                  <span>
                    {recurrenceType === 'daily' &&
                      (repeatInterval > 1
                        ? t('modals.editEvent.fields.repeats.days')
                        : t('modals.editEvent.fields.repeats.day'))}
                    {recurrenceType === 'weekly' &&
                      (repeatInterval > 1
                        ? t('modals.editEvent.fields.repeats.weeks')
                        : t('modals.editEvent.fields.repeats.week'))}
                    {recurrenceType === 'monthly' &&
                      (repeatInterval > 1
                        ? t('modals.editEvent.fields.repeats.months')
                        : t('modals.editEvent.fields.repeats.month'))}
                    {recurrenceType === 'yearly' &&
                      (repeatInterval > 1
                        ? t('modals.editEvent.fields.repeats.years')
                        : t('modals.editEvent.fields.repeats.year'))}
                  </span>
                </div>
              </div>
            )}

            {isRecurring && (
              <>
                {recurrenceType === 'weekly' && (
                  <div className="setting-item">
                    <div className="setting-item-info">
                      <div className="setting-item-name">
                        {t('modals.editEvent.fields.repeats.repeatOn')}
                      </div>
                    </div>
                    <div className="setting-item-control">
                      <DaySelect value={daysOfWeek} onChange={setDaysOfWeek} />
                    </div>
                  </div>
                )}
                {recurrenceType === 'monthly' && date && (
                  <div className="setting-item">
                    <div className="setting-item-info"></div>
                    <div className="setting-item-control u-display-block">
                      <div>
                        <input
                          type="radio"
                          id="monthly-day-of-month"
                          name="monthly-mode"
                          value="dayOfMonth"
                          checked={monthlyMode === 'dayOfMonth'}
                          onChange={() => setMonthlyMode('dayOfMonth')}
                        />
                        <label htmlFor="monthly-day-of-month">
                          {' '}
                          {t('modals.editEvent.fields.repeats.onDay', {
                            day: DateTime.fromISO(date).day
                          })}
                        </label>
                      </div>
                      <div className="u-flex-align-center u-gap-8px u-mt-8px">
                        <input
                          type="radio"
                          id="monthly-on-the"
                          name="monthly-mode"
                          value="onThe"
                          checked={monthlyMode === 'onThe'}
                          onChange={() => setMonthlyMode('onThe')}
                        />
                        <label htmlFor="monthly-on-the">
                          {t('modals.editEvent.fields.repeats.onThe')}
                        </label>
                        <select
                          value={repeatOnWeek}
                          onChange={e => setRepeatOnWeek(parseInt(e.target.value, 10))}
                          disabled={monthlyMode !== 'onThe'}
                        >
                          <option value="1">
                            {t('modals.editEvent.fields.repeats.ordinal.first')}
                          </option>
                          <option value="2">
                            {t('modals.editEvent.fields.repeats.ordinal.second')}
                          </option>
                          <option value="3">
                            {t('modals.editEvent.fields.repeats.ordinal.third')}
                          </option>
                          <option value="4">
                            {t('modals.editEvent.fields.repeats.ordinal.fourth')}
                          </option>
                          <option value="-1">
                            {t('modals.editEvent.fields.repeats.ordinal.last')}
                          </option>
                        </select>
                        <select
                          value={repeatOnWeekday}
                          onChange={e => setRepeatOnWeekday(parseInt(e.target.value, 10))}
                          disabled={monthlyMode !== 'onThe'}
                        >
                          {[
                            t('settings.weekdays.sunday'),
                            t('settings.weekdays.monday'),
                            t('settings.weekdays.tuesday'),
                            t('settings.weekdays.wednesday'),
                            t('settings.weekdays.thursday'),
                            t('settings.weekdays.friday'),
                            t('settings.weekdays.saturday')
                          ].map((day, index) => (
                            <option key={index} value={index}>
                              {day}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
                {recurrenceType === 'yearly' && date && (
                  <div className="setting-item">
                    <div className="setting-item-info"></div>
                    <div className="setting-item-control">
                      {t('modals.editEvent.fields.repeats.yearlyText', {
                        date: DateTime.fromISO(date).toFormat('MMMM d')
                      })}
                    </div>
                  </div>
                )}

                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t('modals.editEvent.fields.repeats.endRepeat')}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <input
                      type="date"
                      value={endRecur || ''}
                      onChange={e => setEndRecur(e.target.value || undefined)}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </details>

        <div className="modal-footer">
          <div className="footer-actions-left">
            {deleteEvent && (
              <button type="button" className="mod-warning" onClick={() => void deleteEvent()}>
                {t('modals.editEvent.buttons.delete') || 'Delete'}
              </button>
            )}
          </div>
          <div className="footer-actions-right">
            <button type="submit" className="mod-cta">
              {t('modals.editEvent.buttons.save') || 'Save Event'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
