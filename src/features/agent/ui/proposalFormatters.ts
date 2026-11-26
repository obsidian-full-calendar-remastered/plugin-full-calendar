/**
 * @file proposalFormatters.ts
 * @brief Pure presentation formatters for staged calendar proposal cards.
 *
 * @description
 * Formats schedule dates/times (honoring 12h/24h setting without UTC shift,
 * multi-day end dates, recurring indicators, and cross-year dates), extracts
 * clean titles and hierarchical category breadcrumbs when
 * `enableAdvancedCategorization` is enabled, and omits category metadata cleanly
 * when advanced categorization is toggled off.
 */

import { PluginState } from '../../../core/PluginState';
import type { OFCEvent } from '../../../types';
import { extractCleanTitle, normalizeOptionalField } from '../domain/eventTitleNormalizer';
import type { BatchCreateItem, EventProposal } from '../types';

export interface ProposalDisplayContext {
  timeFormat24h: boolean;
  enableAdvancedCategorization: boolean;
  categoryColors: ReadonlyMap<string, string>;
}

export interface ProposalScheduleFields {
  date?: string;
  endDate?: string | null;
  allDay?: boolean;
  startTime?: string;
  endTime?: string;
  recurring?: boolean;
}

export interface ProposalCategoryMeta {
  category?: string;
  subCategory?: string;
  color?: string;
}

export interface BatchItemDisplay {
  title: string;
  schedule: string;
  category?: string;
  subCategory?: string;
  color?: string;
}

const DEFAULT_DISPLAY_CONTEXT: ProposalDisplayContext = {
  timeFormat24h: false,
  enableAdvancedCategorization: false,
  categoryColors: new Map()
};

/**
 * Safely reads display preferences from PluginState, falling back to safe
 * defaults when invoked inside isolated unit tests without initialized settings.
 */
export function readProposalDisplayContext(): ProposalDisplayContext {
  try {
    const settings = PluginState.getSettings();
    const enableAdvancedCategorization = Boolean(settings.enableAdvancedCategorization);
    const categoryColors = new Map<string, string>();
    if (enableAdvancedCategorization && Array.isArray(settings.categorySettings)) {
      for (const item of settings.categorySettings) {
        const name = item?.name?.trim();
        const color = item?.color?.trim();
        if (name && color) {
          categoryColors.set(name, color);
        }
      }
    }
    return {
      timeFormat24h: Boolean(settings.timeFormat24h),
      enableAdvancedCategorization,
      categoryColors
    };
  } catch {
    return DEFAULT_DISPLAY_CONTEXT;
  }
}

/**
 * Formats an HH:mm time string into either 24h (`09:24`) or 12h (`9:24 AM`) form.
 */
export function formatProposalTime(hhmm?: string | null, timeFormat24h = false): string {
  if (!hhmm) {
    return '';
  }
  const match = /^\s*(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!match) {
    return hhmm.trim();
  }
  const hours = Number(match[1]);
  const mins = match[2];
  const minsNum = Number(mins);
  if (
    Number.isNaN(hours) ||
    hours < 0 ||
    hours > 23 ||
    Number.isNaN(minsNum) ||
    minsNum < 0 ||
    minsNum > 59
  ) {
    return hhmm.trim();
  }

  if (timeFormat24h) {
    return `${String(hours).padStart(2, '0')}:${mins}`;
  }

  const period = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${mins} ${period}`;
}

/**
 * Formats an ISO `YYYY-MM-DD` date into a concise local label (`Sun, Nov 15`
 * or `Mon, Mar 15, 2027` when cross-year) using local date construction so
 * negative UTC offsets never shift the day.
 */
export function formatProposalDate(isoDate?: string, includeYearIfDifferent = true): string {
  if (!isoDate) {
    return '';
  }
  const trimmed = isoDate.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return trimmed;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const localDate = new Date(year, month - 1, day);
  if (
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day
  ) {
    return trimmed;
  }
  const includeYear = includeYearIfDifferent && year !== new Date().getFullYear();
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {})
  }).format(localDate);
}

/**
 * Formats date, multi-day range, recurrence, and time fields into a compact single-line schedule.
 */
export function formatProposalSchedule(
  info: ProposalScheduleFields,
  ctx: ProposalDisplayContext,
  allDayLabel = 'All day',
  recurringLabel = 'Recurring'
): string {
  const startDate = formatProposalDate(info.date);
  let datePart = startDate;
  if (startDate && info.endDate && info.endDate !== info.date) {
    const endDate = formatProposalDate(info.endDate);
    if (endDate && endDate !== startDate) {
      datePart = `${startDate}\u2013${endDate}`;
    }
  }

  let timePart = '';
  if (info.allDay) {
    timePart = allDayLabel;
  } else if (info.startTime) {
    const start = formatProposalTime(info.startTime, ctx.timeFormat24h);
    const end = formatProposalTime(info.endTime, ctx.timeFormat24h);
    timePart = end ? `${start}\u2013${end}` : start;
  }

  return [datePart, info.recurring ? recurringLabel : '', timePart]
    .filter(Boolean)
    .join(' \u00b7 ');
}

/**
 * Extracts raw schedule fields from an `OFCEvent` across single, rrule, and recurring shapes.
 */
export function extractEventScheduleFields(event: OFCEvent): ProposalScheduleFields {
  const date =
    event.type === 'single'
      ? event.date
      : event.type === 'rrule'
        ? event.startDate
        : event.startRecur;
  const recurring = event.type === 'recurring' || event.type === 'rrule';
  return {
    date,
    endDate: event.endDate ?? undefined,
    allDay: event.allDay,
    startTime: event.allDay ? undefined : event.startTime,
    endTime: event.allDay ? undefined : (event.endTime ?? undefined),
    recurring
  };
}

/**
 * Formats the display schedule line for any `EventProposal`.
 */
export function extractProposalSchedule(
  proposal: EventProposal,
  ctx: ProposalDisplayContext,
  allDayLabel = 'All day',
  recurringLabel = 'Recurring',
  useUpdatedForUpdate = false
): string {
  if (proposal.type === 'CREATE') {
    return formatProposalSchedule(
      extractEventScheduleFields(proposal.eventData),
      ctx,
      allDayLabel,
      recurringLabel
    );
  }
  if (proposal.type === 'UPDATE') {
    const targetEvent = useUpdatedForUpdate ? proposal.updatedEvent : proposal.originalEvent;
    return formatProposalSchedule(
      extractEventScheduleFields(targetEvent),
      ctx,
      allDayLabel,
      recurringLabel
    );
  }
  if (proposal.type === 'DELETE') {
    return formatProposalSchedule(
      {
        date: proposal.eventDate,
        endDate: proposal.eventEndDate,
        allDay: proposal.eventAllDay,
        startTime: proposal.eventStartTime,
        endTime: proposal.eventEndTime,
        recurring: proposal.eventRecurring
      },
      ctx,
      allDayLabel,
      recurringLabel
    );
  }

  const dates = proposal.items
    .map(item => extractEventScheduleFields(item.eventData).date)
    .filter((d): d is string => Boolean(d))
    .sort();
  if (dates.length === 0) {
    return '';
  }
  const first = formatProposalDate(dates[0]);
  const last = formatProposalDate(dates[dates.length - 1]);
  return dates[0] === dates[dates.length - 1] ? first : `${first} \u2013 ${last}`;
}

/**
 * Extracts hierarchical category and color metadata for a proposal.
 * Strictly returns `{}` when `ctx.enableAdvancedCategorization` is false.
 */
export function extractProposalCategory(
  proposal: EventProposal,
  ctx: ProposalDisplayContext
): ProposalCategoryMeta {
  if (!ctx.enableAdvancedCategorization) {
    return {};
  }

  let rawCat: string | undefined;
  let rawSub: string | undefined;

  if (proposal.type === 'CREATE') {
    rawCat = proposal.category ?? proposal.eventData.category;
    rawSub = proposal.subCategory ?? proposal.eventData.subCategory;
  } else if (proposal.type === 'UPDATE') {
    rawCat = proposal.updatedEvent.category;
    rawSub = proposal.updatedEvent.subCategory;
  } else if (proposal.type === 'DELETE') {
    rawCat = proposal.eventCategory;
    rawSub = proposal.eventSubCategory;
  } else {
    return {};
  }

  const category = normalizeOptionalField(rawCat);
  if (!category) {
    return {};
  }
  const subCategory = normalizeOptionalField(rawSub);
  const color = ctx.categoryColors.get(category);
  return { category, subCategory, color };
}

/**
 * Extracts clean title, schedule, and toggle-safe category metadata for a `BATCH_CREATE` item.
 */
export function extractBatchItemDisplay(
  item: BatchCreateItem,
  ctx: ProposalDisplayContext,
  allDayLabel = 'All day',
  recurringLabel = 'Recurring'
): BatchItemDisplay {
  const schedule = formatProposalSchedule(
    extractEventScheduleFields(item.eventData),
    ctx,
    allDayLabel,
    recurringLabel
  );

  if (!ctx.enableAdvancedCategorization) {
    return {
      title: item.eventData.title || item.cleanTitle,
      schedule
    };
  }

  const category = normalizeOptionalField(item.category ?? item.eventData.category);
  const subCategory = category
    ? normalizeOptionalField(item.subCategory ?? item.eventData.subCategory)
    : undefined;
  const color = category ? ctx.categoryColors.get(category) : undefined;
  const title =
    extractCleanTitle(item.cleanTitle || item.eventData.title, category, subCategory) ||
    item.cleanTitle ||
    item.eventData.title;

  return {
    title,
    schedule,
    ...(category ? { category } : {}),
    ...(subCategory ? { subCategory } : {}),
    ...(color ? { color } : {})
  };
}

/**
 * Extracts the clean target title for a proposal, stripping redundant
 * category prefixes only when advanced categorization is active.
 */
export function extractProposalHeadingTitle(
  proposal: EventProposal,
  ctx: ProposalDisplayContext
): string {
  if (proposal.type === 'CREATE') {
    if (!ctx.enableAdvancedCategorization) {
      return proposal.eventData.title || proposal.cleanTitle;
    }
    return (
      extractCleanTitle(
        proposal.cleanTitle || proposal.eventData.title,
        proposal.category ?? proposal.eventData.category,
        proposal.subCategory ?? proposal.eventData.subCategory
      ) ||
      proposal.cleanTitle ||
      proposal.eventData.title
    );
  }

  if (proposal.type === 'UPDATE') {
    if (!ctx.enableAdvancedCategorization) {
      return proposal.updatedEvent.title;
    }
    return (
      extractCleanTitle(
        proposal.updatedEvent.title,
        proposal.updatedEvent.category,
        proposal.updatedEvent.subCategory
      ) || proposal.updatedEvent.title
    );
  }

  if (proposal.type === 'DELETE') {
    if (!ctx.enableAdvancedCategorization) {
      return proposal.eventTitle;
    }
    return (
      extractCleanTitle(proposal.eventTitle, proposal.eventCategory, proposal.eventSubCategory) ||
      proposal.eventTitle
    );
  }

  return '';
}

/**
 * Formats an individual diff value for an `UPDATE` card row.
 */
export function formatDiffFieldValue(
  field: string,
  value: unknown,
  ctx: ProposalDisplayContext,
  emptyLabel = 'None',
  allDayLabel = 'All day',
  timedLabel = 'Timed'
): string {
  if (value === undefined || value === null || value === '') {
    return emptyLabel;
  }
  if ((field === 'startTime' || field === 'endTime') && typeof value === 'string') {
    return formatProposalTime(value, ctx.timeFormat24h);
  }
  if (field === 'date' && typeof value === 'string') {
    return formatProposalDate(value);
  }
  if (field === 'allDay' && typeof value === 'boolean') {
    return value ? allDayLabel : timedLabel;
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}
