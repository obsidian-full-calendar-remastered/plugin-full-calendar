/**
 * @file AgentCalendarBridge.ts
 * @brief Sandboxed bridge between Agent and the Full Calendar core API.
 *
 * @description
 * Enforces strict architectural boundaries:
 * 1. ZERO VAULT ACCESS: Does not touch or expose app.vault.
 * 2. WRITE-APPROVAL GATE: Calendar mutations are intercepted and returned as staged proposals.
 *    No event is ever written to disk or cache without explicit user confirmation.
 * 3. CATEGORY TAXONOMY: Enforces the 'Category - SubCategory - Title' standard.
 *
 * @license See LICENSE.md
 */

import { PluginState } from '../../../core/PluginState';
import type { OFCEvent } from '../../../types';
import { validateEvent } from '../../../types/schema';
import { CATEGORY_TITLE_DELIMITER } from '../../category/categoryParser';
import type {
  EventProposal,
  CreateEventProposal,
  UpdateEventProposal,
  DeleteEventProposal,
  BatchCreateProposal,
  BatchCreateItem,
  CurrentTimeInfo
} from '../types';
import type { AgentAuditLogger } from '../core/AgentAuditLogger';

export class AgentCalendarBridge {
  private pendingProposals: Map<string, EventProposal> = new Map();
  private logger?: AgentAuditLogger;

  constructor(logger?: AgentAuditLogger) {
    this.logger = logger;
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
  }

  public getPendingProposals(): EventProposal[] {
    return Array.from(this.pendingProposals.values());
  }

  // ==========================================================================
  // UNLIMITED READ API (SILENT EXECUTION)
  // ==========================================================================

  public getCurrentTime(): CurrentTimeInfo {
    const now = new Date();
    const settings = PluginState.getSettings();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const pad = (n: number) => String(n).padStart(2, '0');

    const isoDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    return {
      currentIsoTimestamp: now.toISOString(),
      currentDate: isoDate,
      currentTime24h: timeStr,
      dayOfWeek: days[now.getDay()],
      displayTimezone: settings.displayTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      timeFormat24h: settings.timeFormat24h
    };
  }

  public getCalendarSources(): {
    id: string;
    name: string;
    color: string;
    type: string;
    canCreate: boolean;
    canEdit: boolean;
    isDefault: boolean;
  }[] {
    const registry = PluginState.getProviderRegistry();
    const sources = registry.getAllSources();
    const defaultCalId = PluginState.getSettings().defaultCalendarId;

    return sources.map(s => {
      const instance = registry.getInstance(s.id);
      const caps = instance ? instance.getCapabilities() : { canCreate: false, canEdit: false };
      return {
        id: s.id,
        name: s.name || 'Unnamed Calendar',
        color: s.color,
        type: s.type,
        canCreate: caps.canCreate,
        canEdit: caps.canEdit,
        isDefault: s.id === defaultCalId
      };
    });
  }

  public getUserCategories(): { name: string; color: string }[] {
    const settings = PluginState.getSettings();
    return settings.categorySettings || [];
  }

  public getEvents(
    startDate: string,
    endDate: string,
    calendarId?: string,
    category?: string
  ): Record<string, unknown>[] {
    const cache = PluginState.getCache();
    const allSources = cache.getAllEvents();
    const results: Record<string, unknown>[] = [];

    const normStart = startDate.trim();
    const normEnd = endDate.trim();
    const normCategory = category?.toLowerCase().trim();

    for (const source of allSources) {
      if (calendarId && source.id !== calendarId) {
        continue;
      }
      for (const event of source.events) {
        const details = cache.store.getEventDetails(event.id);
        const eventData = details ? details.event : event.event;
        const evDate =
          eventData.type === 'single'
            ? eventData.date
            : eventData.type === 'rrule'
              ? eventData.startDate
              : '';

        // Basic date range filter
        if (evDate) {
          if (evDate < normStart || evDate > normEnd) {
            continue;
          }
        }

        // Category filter
        if (normCategory) {
          const evCat = (eventData.category || '').toLowerCase().trim();
          if (evCat !== normCategory) {
            continue;
          }
        }

        const calSources = PluginState.getSettings().calendarSources;
        const calName = calSources.find(s => s.id === source.id)?.name || 'Unnamed';

        results.push({
          id: event.id,
          calendarId: source.id,
          calendarName: calName,
          title: eventData.title,
          category: eventData.category,
          subCategory: eventData.subCategory,
          type: eventData.type,
          date: evDate,
          allDay: eventData.allDay,
          startTime: eventData.allDay ? undefined : eventData.startTime,
          endTime: eventData.allDay ? undefined : eventData.endTime,
          description: eventData.description,
          location: eventData.location
        });

        if (results.length >= 60) {
          break; // Safety limit
        }
      }
    }

    return results;
  }

  public getEventById(eventId: string): Record<string, unknown> | null {
    const cache = PluginState.getCache();
    const event = cache.getEventById(eventId);
    if (!event) return null;
    const details = cache.store.getEventDetails(eventId);

    return {
      id: eventId,
      calendarId: details?.calendarId,
      event
    };
  }

  // ==========================================================================
  // GATED MUTATION STAGING (CREATES PROPOSALS)
  // ==========================================================================

  private normalizeIsoDate(dateStr: string): string {
    const trimmed = (dateStr || '').trim().replace(/\//g, '-');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new Error(`Invalid date format: "${dateStr}". Expected ISO format YYYY-MM-DD.`);
    }
    const [y, m, d] = trimmed.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    if (dateObj.getFullYear() !== y || dateObj.getMonth() !== m - 1 || dateObj.getDate() !== d) {
      throw new Error(`Invalid calendar date: "${dateStr}" does not exist.`);
    }
    return trimmed;
  }

  private normalizeIsoTime(timeStr?: string, defaultTime = '09:00'): string {
    if (!timeStr) return defaultTime;
    let trimmed = timeStr.trim();
    if (/^\d{1}:\d{2}$/.test(trimmed)) {
      trimmed = `0${trimmed}`;
    }
    if (!/^\d{2}:\d{2}$/.test(trimmed)) {
      return defaultTime;
    }
    const [h, m] = trimmed.split(':').map(Number);
    if (h < 0 || h > 23 || m < 0 || m > 59) {
      return defaultTime;
    }
    return trimmed;
  }

  private resolveWritableCalendar(targetCalendarId?: string): { id: string; name: string } {
    const allSources = this.getCalendarSources();
    const writableSources = allSources.filter(s => s.canCreate);
    if (writableSources.length === 0) {
      throw new Error('No writable calendars are configured in Full Calendar.');
    }

    if (targetCalendarId) {
      const normalized = targetCalendarId.toLowerCase().trim();
      const readOnlyMatch = allSources.find(
        s =>
          !s.canCreate && (s.id.toLowerCase() === normalized || s.name.toLowerCase() === normalized)
      );
      if (readOnlyMatch) {
        const available = writableSources.map(s => `"${s.name}"`).join(', ');
        throw new Error(
          `Calendar "${readOnlyMatch.name}" is read-only. Please select a writable calendar: ${available}`
        );
      }

      const match = writableSources.find(
        s => s.id.toLowerCase() === normalized || s.name.toLowerCase() === normalized
      );
      if (match) return { id: match.id, name: match.name };
    }

    // Default to default calendar or first writable
    const defaultCal = writableSources.find(s => s.isDefault) || writableSources[0];
    return { id: defaultCal.id, name: defaultCal.name };
  }

  private constructFullTitle(cleanTitle: string, category?: string, subCategory?: string): string {
    const parts: string[] = [];
    if (category && category.trim().length > 0) {
      parts.push(category.trim());
      if (subCategory && subCategory.trim().length > 0) {
        parts.push(subCategory.trim());
      }
    }
    parts.push(cleanTitle.trim());
    return parts.join(CATEGORY_TITLE_DELIMITER);
  }

  public stageCreateEvent(params: {
    calendarId: string;
    title: string;
    category?: string;
    subCategory?: string;
    date: string;
    endDate?: string;
    allDay: boolean;
    startTime?: string;
    endTime?: string;
    description?: string;
    location?: string;
  }): CreateEventProposal {
    const cal = this.resolveWritableCalendar(params.calendarId);
    const cleanTitle = (params.title || '').trim();
    if (!cleanTitle) {
      throw new Error('Event title cannot be empty.');
    }

    const normDate = this.normalizeIsoDate(params.date);
    const normEndDate = params.endDate ? this.normalizeIsoDate(params.endDate) : null;
    const fullTitle = this.constructFullTitle(cleanTitle, params.category, params.subCategory);

    let eventData: OFCEvent;
    if (params.allDay) {
      eventData = {
        title: fullTitle,
        type: 'single',
        date: normDate,
        endDate: normEndDate,
        allDay: true,
        category: params.category,
        subCategory: params.subCategory,
        description: params.description,
        location: params.location
      };
    } else {
      const startTime = this.normalizeIsoTime(params.startTime, '09:00');
      let endTime = this.normalizeIsoTime(params.endTime, '10:00');
      if (startTime >= endTime && !normEndDate) {
        // Automatically default end time to 1 hour after start time if invalid
        const [h, m] = startTime.split(':').map(Number);
        endTime = `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }

      eventData = {
        title: fullTitle,
        type: 'single',
        date: normDate,
        endDate: normEndDate,
        allDay: false,
        startTime,
        endTime,
        category: params.category,
        subCategory: params.subCategory,
        description: params.description,
        location: params.location
      };
    }

    // Validate using Zod schema
    const validation = validateEvent(eventData);
    if (!validation) {
      throw new Error(`Event validation failed for proposed event: ${fullTitle}`);
    }

    const proposal: CreateEventProposal = {
      id: this.generateId('prop_create'),
      type: 'CREATE',
      status: 'PENDING',
      createdAt: Date.now(),
      calendarId: cal.id,
      calendarName: cal.name,
      cleanTitle,
      category: params.category,
      subCategory: params.subCategory,
      eventData
    };

    this.pendingProposals.set(proposal.id, proposal);
    this.logger?.proposal('Created proposal', 'CREATE', {
      proposalId: proposal.id,
      title: fullTitle
    });
    return proposal;
  }

  public stageUpdateEvent(
    eventId: string,
    updates: Partial<{
      title: string;
      category: string;
      subCategory: string;
      date: string;
      allDay: boolean;
      startTime: string;
      endTime: string;
      description: string;
    }>
  ): UpdateEventProposal {
    const cache = PluginState.getCache();
    const original = cache.getEventById(eventId);
    if (!original) {
      throw new Error(`Event with ID "${eventId}" not found.`);
    }
    const details = cache.store.getEventDetails(eventId);
    const calId = details?.calendarId || '';
    const calSources = this.getCalendarSources();
    const calName = calSources.find(s => s.id === calId)?.name || 'Calendar';

    const updated = JSON.parse(JSON.stringify(original)) as OFCEvent;
    const changedFields: Record<string, { old: unknown; new: unknown }> = {};

    if (updates.category !== undefined) {
      changedFields['category'] = { old: updated.category, new: updates.category };
      updated.category = updates.category;
    }
    if (updates.subCategory !== undefined) {
      changedFields['subCategory'] = { old: updated.subCategory, new: updates.subCategory };
      updated.subCategory = updates.subCategory;
    }
    if (updates.title !== undefined) {
      changedFields['title'] = { old: updated.title, new: updates.title };
      updated.title = this.constructFullTitle(updates.title, updated.category, updated.subCategory);
    }
    if (updates.date !== undefined && updated.type === 'single') {
      changedFields['date'] = { old: updated.date, new: updates.date };
      updated.date = updates.date;
    }
    if (updates.allDay !== undefined) {
      changedFields['allDay'] = { old: updated.allDay, new: updates.allDay };
      updated.allDay = updates.allDay;
    }
    if (updates.startTime !== undefined && !updated.allDay) {
      changedFields['startTime'] = { old: updated.startTime, new: updates.startTime };
      updated.startTime = updates.startTime;
    }
    if (updates.endTime !== undefined && !updated.allDay) {
      changedFields['endTime'] = { old: updated.endTime, new: updates.endTime };
      updated.endTime = updates.endTime;
    }
    if (updates.description !== undefined) {
      changedFields['description'] = { old: updated.description, new: updates.description };
      updated.description = updates.description;
    }

    const proposal: UpdateEventProposal = {
      id: this.generateId('prop_update'),
      type: 'UPDATE',
      status: 'PENDING',
      createdAt: Date.now(),
      calendarId: calId,
      calendarName: calName,
      eventId,
      originalEvent: original,
      updatedEvent: updated,
      changedFields
    };

    this.pendingProposals.set(proposal.id, proposal);
    this.logger?.proposal('Created proposal', 'UPDATE', { proposalId: proposal.id, eventId });
    return proposal;
  }

  public stageDeleteEvent(eventId: string, reason?: string): DeleteEventProposal {
    const cache = PluginState.getCache();
    const event = cache.getEventById(eventId);
    if (!event) {
      throw new Error(`Event with ID "${eventId}" not found.`);
    }
    const details = cache.store.getEventDetails(eventId);
    const calId = details?.calendarId || '';
    const calName = this.getCalendarSources().find(s => s.id === calId)?.name || 'Calendar';

    const proposal: DeleteEventProposal = {
      id: this.generateId('prop_delete'),
      type: 'DELETE',
      status: 'PENDING',
      createdAt: Date.now(),
      calendarId: calId,
      calendarName: calName,
      eventId,
      eventTitle: event.title,
      reason
    };

    this.pendingProposals.set(proposal.id, proposal);
    this.logger?.proposal('Created proposal', 'DELETE', { proposalId: proposal.id, eventId });
    return proposal;
  }

  public stageBatchCreateEvents(
    calendarId: string,
    events: {
      title: string;
      category?: string;
      subCategory?: string;
      date: string;
      allDay: boolean;
      startTime?: string;
      endTime?: string;
      description?: string;
    }[]
  ): BatchCreateProposal {
    const cal = this.resolveWritableCalendar(calendarId);
    const items: BatchCreateItem[] = [];

    for (const ev of events) {
      const cleanTitle = (ev.title || '').trim();
      if (!cleanTitle) continue;

      let normDate: string;
      try {
        normDate = this.normalizeIsoDate(ev.date);
      } catch {
        continue;
      }

      const fullTitle = this.constructFullTitle(cleanTitle, ev.category, ev.subCategory);

      let eventData: OFCEvent;
      if (ev.allDay) {
        eventData = {
          title: fullTitle,
          type: 'single',
          date: normDate,
          endDate: null,
          allDay: true,
          category: ev.category,
          subCategory: ev.subCategory,
          description: ev.description
        };
      } else {
        const startTime = this.normalizeIsoTime(ev.startTime, '09:00');
        let endTime = this.normalizeIsoTime(ev.endTime, '10:00');
        if (startTime >= endTime) {
          const [h, m] = startTime.split(':').map(Number);
          endTime = `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }
        eventData = {
          title: fullTitle,
          type: 'single',
          date: normDate,
          endDate: null,
          allDay: false,
          startTime,
          endTime,
          category: ev.category,
          subCategory: ev.subCategory,
          description: ev.description
        };
      }

      const validation = validateEvent(eventData);
      if (!validation) continue;

      items.push({
        id: this.generateId('item'),
        selected: true,
        calendarId: cal.id,
        cleanTitle,
        category: ev.category,
        subCategory: ev.subCategory,
        eventData
      });
    }

    if (items.length === 0) {
      throw new Error('No valid events could be staged from the provided batch data.');
    }

    const proposal: BatchCreateProposal = {
      id: this.generateId('prop_batch'),
      type: 'BATCH_CREATE',
      status: 'PENDING',
      createdAt: Date.now(),
      calendarId: cal.id,
      calendarName: cal.name,
      items
    };

    this.pendingProposals.set(proposal.id, proposal);
    this.logger?.proposal('Created proposal', 'BATCH_CREATE', {
      proposalId: proposal.id,
      itemCount: items.length
    });
    return proposal;
  }

  // ==========================================================================
  // PROPOSAL EXECUTION / REJECTION (ONLY ON EXPLICIT USER CLICK)
  // ==========================================================================

  public getProposal(proposalId: string): EventProposal | undefined {
    return this.pendingProposals.get(proposalId);
  }

  public async commitProposal(
    proposalId: string,
    overrideCalendarId?: string
  ): Promise<{ success: boolean; message: string }> {
    const proposal = this.pendingProposals.get(proposalId);
    if (!proposal) {
      return { success: false, message: 'Proposal not found or already processed.' };
    }
    if (proposal.status !== 'PENDING') {
      return { success: false, message: `Proposal is already in status: ${proposal.status}` };
    }

    const cache = PluginState.getCache();
    const targetCalendarId = overrideCalendarId || proposal.calendarId;

    try {
      if (proposal.type === 'CREATE') {
        const ok = await cache.addEvent(targetCalendarId, proposal.eventData);
        if (!ok) throw new Error('Cache refused to add event.');
      } else if (proposal.type === 'UPDATE') {
        const ok = await cache.updateEventWithId(proposal.eventId, proposal.updatedEvent);
        if (!ok) throw new Error('Cache refused to update event.');
      } else if (proposal.type === 'DELETE') {
        await cache.deleteEvent(proposal.eventId);
      } else if (proposal.type === 'BATCH_CREATE') {
        const selected = proposal.items.filter(i => i.selected);
        if (selected.length === 0) {
          return { success: false, message: 'No items selected to import.' };
        }
        for (const item of selected) {
          await cache.addEvent(targetCalendarId, item.eventData);
        }
      }

      proposal.status = 'APPROVED';
      this.pendingProposals.delete(proposalId);
      this.logger?.proposal('Proposal approved and applied', proposal.type, { proposalId });
      return { success: true, message: 'Event action applied successfully.' };
    } catch (err) {
      proposal.status = 'FAILED';
      const msg = err instanceof Error ? err.message : String(err);
      this.logger?.error('Failed to apply proposal', err as Error, { proposalId });
      return { success: false, message: `Failed to apply: ${msg}` };
    }
  }

  public rejectProposal(proposalId: string, reason = 'Rejected by user'): boolean {
    const proposal = this.pendingProposals.get(proposalId);
    if (!proposal) return false;

    proposal.status = 'REJECTED';
    this.pendingProposals.delete(proposalId);
    this.logger?.proposal('Proposal rejected', proposal.type, { proposalId, reason });
    return true;
  }
}
