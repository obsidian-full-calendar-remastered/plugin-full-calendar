/**
 * @file AgentCalendarBridge.test.ts
 * @brief Unit tests for AgentCalendarBridge sandboxing, write-gating, and category formatting.
 */

import { AgentCalendarBridge } from './AgentCalendarBridge';
import { PluginState } from '../../../core/PluginState';
import { DEFAULT_SETTINGS } from '../../../types/settings';
import type EventCache from '../../../core/EventCache';
import type { ProviderRegistry } from '../../../providers/ProviderRegistry';

describe('AgentCalendarBridge', () => {
  const mockCache = {
    getAllEvents: jest.fn().mockReturnValue([]),
    getEventById: jest.fn(),
    addEvent: jest.fn().mockResolvedValue(true),
    updateEventWithId: jest.fn().mockResolvedValue(true),
    deleteEvent: jest.fn().mockResolvedValue(undefined),
    store: {
      getEventDetails: jest.fn()
    }
  };

  const mockRegistry = {
    getAllSources: jest.fn().mockReturnValue([
      { id: 'work-cal', name: 'Work Calendar', color: '#ff0000', type: 'local' },
      { id: 'readonly-cal', name: 'Readonly Calendar', color: '#00ff00', type: 'ical' }
    ]),
    getInstance: jest.fn().mockImplementation((id: string) => {
      if (id === 'work-cal') {
        return { getCapabilities: () => ({ canCreate: true, canEdit: true }) };
      }
      return { getCapabilities: () => ({ canCreate: false, canEdit: false }) };
    })
  };

  beforeEach(() => {
    jest.clearAllMocks();
    PluginState.setCache(mockCache as unknown as EventCache);
    PluginState.setProviderRegistry(mockRegistry as unknown as ProviderRegistry);
    PluginState.setSettings({
      ...DEFAULT_SETTINGS,
      displayTimezone: 'America/New_York',
      categorySettings: [
        { name: 'Work', color: '#ff0000' },
        { name: 'Personal', color: '#0000ff' }
      ]
    });
  });

  it('should return current time and timezone accurately including midnight h23 and explicit timestamps', () => {
    const bridge = new AgentCalendarBridge();
    const timeInfo = bridge.getCurrentTime();

    expect(timeInfo.displayTimezone).toBe('America/New_York');
    expect(typeof timeInfo.currentDate).toBe('string');
    expect(typeof timeInfo.currentTime24h).toBe('string');

    // 2026-11-19T05:05:00Z is 00:05 in America/New_York (EST, UTC-5) — must format as 00:05, never 24:05
    const midnightInfo = bridge.getCurrentTime(Date.UTC(2026, 10, 19, 5, 5, 0));
    expect(midnightInfo.currentDate).toBe('2026-11-19');
    expect(midnightInfo.currentTime24h).toBe('00:05');
    expect(midnightInfo.dayOfWeek).toBe('Thursday');
  });

  it('should return user categories accurately', () => {
    const bridge = new AgentCalendarBridge();
    const categories = bridge.getUserCategories();

    expect(categories).toEqual([
      { name: 'Work', color: '#ff0000' },
      { name: 'Personal', color: '#0000ff' }
    ]);
  });

  it('should stage create event as proposal WITHOUT touching cache directly', () => {
    const bridge = new AgentCalendarBridge();

    const proposal = bridge.stageCreateEvent({
      calendarId: 'work-cal',
      title: 'Project Sync',
      category: 'Work',
      subCategory: 'Dev',
      date: '2026-09-15',
      allDay: false,
      startTime: '14:00',
      endTime: '15:00'
    });

    expect(proposal.type).toBe('CREATE');
    expect(proposal.status).toBe('PENDING');
    expect(proposal.cleanTitle).toBe('Project Sync');
    expect(proposal.eventData.title).toBe('Work - Dev - Project Sync');
    expect(mockCache.addEvent).not.toHaveBeenCalled(); // Cache untouched!
  });

  it('should execute commitProposal and write to cache only on user approval', async () => {
    const bridge = new AgentCalendarBridge();

    const proposal = bridge.stageCreateEvent({
      calendarId: 'work-cal',
      title: 'Coffee Chat',
      category: 'Personal',
      date: '2026-09-16',
      allDay: true
    });

    expect(mockCache.addEvent).not.toHaveBeenCalled();

    const result = await bridge.commitProposal(proposal.id);

    expect(result.success).toBe(true);
    expect(mockCache.addEvent).toHaveBeenCalledTimes(1);
    expect(mockCache.addEvent).toHaveBeenCalledWith('work-cal', proposal.eventData);
    expect(proposal.status).toBe('APPROVED');
  });

  it('should mark proposal as rejected and not call cache on rejection', () => {
    const bridge = new AgentCalendarBridge();

    const proposal = bridge.stageCreateEvent({
      calendarId: 'work-cal',
      title: 'Tentative Meeting',
      date: '2026-09-17',
      allDay: true
    });

    const rejected = bridge.rejectProposal(proposal.id, 'User clicked Reject');
    expect(rejected).toBe(true);
    expect(proposal.status).toBe('REJECTED');
    expect(mockCache.addEvent).not.toHaveBeenCalled();
  });

  it('should handle batch event staging with selectable checklist', async () => {
    const bridge = new AgentCalendarBridge();

    const proposal = bridge.stageBatchCreateEvents('work-cal', [
      { title: 'Lecture 1', category: 'Work', date: '2026-09-18', allDay: true },
      { title: 'Lecture 2', category: 'Work', date: '2026-09-20', allDay: true }
    ]);

    expect(proposal.type).toBe('BATCH_CREATE');
    expect(proposal.items.length).toBe(2);
    expect(proposal.items[0].selected).toBe(true);

    // Deselect lecture 2
    proposal.items[1].selected = false;

    await bridge.commitProposal(proposal.id);

    expect(mockCache.addEvent).toHaveBeenCalledTimes(1);
    expect(mockCache.addEvent).toHaveBeenCalledWith('work-cal', proposal.items[0].eventData);
  });

  it('should reject expired proposals after the 5-minute TTL without touching cache', async () => {
    const bridge = new AgentCalendarBridge();
    const proposal = bridge.stageCreateEvent({
      calendarId: 'work-cal',
      title: 'Stale Meeting',
      date: '2026-09-21',
      allDay: true
    });

    proposal.expiresAt = Date.now() - 1000;
    const res = await bridge.commitProposal(proposal.id, undefined, proposal.approvalHash);

    expect(res.success).toBe(false);
    expect(res.message).toContain('expired');
    expect(mockCache.addEvent).not.toHaveBeenCalled();
  });

  it('should reject argument tampering after staging via approval hash mismatch', async () => {
    const bridge = new AgentCalendarBridge();
    const proposal = bridge.stageCreateEvent({
      calendarId: 'work-cal',
      title: 'Original Meeting',
      date: '2026-09-22',
      allDay: true
    });
    const previewHash = proposal.approvalHash;

    // Simulate tampering after preview
    proposal.eventData.title = 'Malicious hijacked meeting';

    const res = await bridge.commitProposal(proposal.id, undefined, previewHash);
    expect(res.success).toBe(false);
    expect(res.message).toContain('changed after preview');
    expect(mockCache.addEvent).not.toHaveBeenCalled();
  });

  it('should reject update/delete if source event changed between preview and commit', async () => {
    const initialEvent = {
      id: 'ev-1',
      title: 'Team Sync',
      type: 'single' as const,
      date: '2026-09-23',
      endDate: null,
      allDay: false,
      startTime: '10:00',
      endTime: '11:00'
    };
    mockCache.getEventById.mockReturnValue(initialEvent);
    mockCache.store.getEventDetails.mockReturnValue({
      calendarId: 'work-cal',
      event: initialEvent
    });

    const bridge = new AgentCalendarBridge();
    const proposal = bridge.stageUpdateEvent('ev-1', { title: 'Updated Sync' });

    // Source event changes externally before user clicks approve
    mockCache.getEventById.mockReturnValue({
      ...initialEvent,
      startTime: '12:00',
      endTime: '13:00'
    });

    const res = await bridge.commitProposal(proposal.id, undefined, proposal.approvalHash);
    expect(res.success).toBe(false);
    expect(res.message).toContain('Target event changed');
    expect(mockCache.updateEventWithId).not.toHaveBeenCalled();
  });

  it('should block duplicate mutation execution even if proposal is re-submitted', async () => {
    const bridge = new AgentCalendarBridge();
    const proposal = bridge.stageCreateEvent({
      calendarId: 'work-cal',
      title: 'Idempotent Meeting',
      date: '2026-09-24',
      allDay: true
    });
    const hash = proposal.approvalHash;
    const first = await bridge.commitProposal(proposal.id, undefined, hash);
    expect(first.success).toBe(true);

    // Simulate re-inserting same mutation key into pending map
    proposal.status = 'PENDING';
    (bridge as unknown as { pendingProposals: Map<string, unknown> }).pendingProposals.set(
      proposal.id,
      proposal
    );

    const second = await bridge.commitProposal(proposal.id, undefined, hash);
    expect(second.success).toBe(false);
    expect(second.message).toContain('duplicate idempotency key');
    expect(mockCache.addEvent).toHaveBeenCalledTimes(1);
  });

  it('should deduplicate category prefixes in constructFullTitle and validate/track updates accurately in stageUpdateEvent', () => {
    const bridge = new AgentCalendarBridge();

    // LLM supplies "Work - Standup" along with category: "Work" -> must NOT become "Work - Work - Standup"
    const createProp = bridge.stageCreateEvent({
      calendarId: 'work-cal',
      title: 'Work - Standup',
      category: 'Work',
      date: '2026-09-25',
      allDay: true
    });
    expect(createProp.eventData.title).toBe('Work - Standup');

    const subCatProp = bridge.stageCreateEvent({
      calendarId: 'work-cal',
      title: 'Work - Dev - API Review',
      category: 'Work',
      subCategory: 'Dev',
      date: '2026-09-25',
      allDay: true
    });
    expect(subCatProp.eventData.title).toBe('Work - Dev - API Review');

    const originalEvent = {
      id: 'ev-upd-1',
      title: 'Work - Old Sync',
      category: 'Work',
      type: 'single' as const,
      date: '2026-09-25',
      endDate: null,
      allDay: false,
      startTime: '10:00',
      endTime: '11:00'
    };
    mockCache.getEventById.mockReturnValue(originalEvent);
    mockCache.store.getEventDetails.mockReturnValue({
      calendarId: 'work-cal',
      event: originalEvent
    });

    // Invalid date in stageUpdateEvent must throw
    expect(() => bridge.stageUpdateEvent('ev-upd-1', { date: '2026-02-30' })).toThrow(
      /does not exist/i
    );

    // Valid update strips duplicate prefix and records full new title in changedFields
    const updProp = bridge.stageUpdateEvent('ev-upd-1', {
      title: 'Work - New Sync',
      date: '2026-09-26',
      startTime: '9:30'
    });
    expect(updProp.updatedEvent.title).toBe('Work - New Sync');
    expect(updProp.changedFields.title).toEqual({
      old: 'Work - Old Sync',
      new: 'Work - New Sync'
    });
    expect(updProp.changedFields.startTime).toEqual({ old: '10:00', new: '09:30' });
  });
});
