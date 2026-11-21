/**
 * @file AgentCalendarBridge.test.ts
 * @brief Unit tests for AgentCalendarBridge sandboxing, write-gating, and category formatting.
 */

import { AgentCalendarBridge } from './AgentCalendarBridge';
import { PluginState } from '../../../core/PluginState';
import { EventEnhancer } from '../../../core/EventEnhancer';
import { DEFAULT_SETTINGS } from '../../../types/settings';
import type { OFCEvent } from '../../../types';
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
      enableAdvancedCategorization: true,
      displayTimezone: 'America/New_York',
      categorySettings: [
        { name: 'Work', color: '#ff0000' },
        { name: 'Personal', color: '#0000ff' },
        { name: 'Wellness', color: '#00aa00' }
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
      { name: 'Personal', color: '#0000ff' },
      { name: 'Wellness', color: '#00aa00' }
    ]);
  });

  it('should stage create event as structured proposal WITHOUT pre-concatenating categories or touching cache', () => {
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
    expect(proposal.eventData.title).toBe('Project Sync');
    expect(proposal.eventData.category).toBe('Work');
    expect(proposal.eventData.subCategory).toBe('Dev');
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

  it('should strip redundant category/subcategory prefixes into clean structured fields and validate updates accurately', () => {
    const bridge = new AgentCalendarBridge();

    // LLM supplies "Work - Standup" along with category: "Work" -> clean title "Standup" + category "Work"
    const createProp = bridge.stageCreateEvent({
      calendarId: 'work-cal',
      title: 'Work - Standup',
      category: 'Work',
      date: '2026-09-25',
      allDay: true
    });
    expect(createProp.eventData.title).toBe('Standup');
    expect(createProp.eventData.category).toBe('Work');

    const subCatProp = bridge.stageCreateEvent({
      calendarId: 'work-cal',
      title: 'Work - Dev - API Review',
      category: 'Work',
      subCategory: 'Dev',
      date: '2026-09-25',
      allDay: true
    });
    expect(subCatProp.eventData.title).toBe('API Review');
    expect(subCatProp.eventData.category).toBe('Work');
    expect(subCatProp.eventData.subCategory).toBe('Dev');

    const originalEvent = {
      id: 'ev-upd-1',
      title: 'Old Sync',
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

    // Valid update strips duplicate prefix and records clean title diff
    const updProp = bridge.stageUpdateEvent('ev-upd-1', {
      title: 'Work - New Sync',
      date: '2026-09-26',
      startTime: '9:30'
    });
    expect(updProp.updatedEvent.title).toBe('New Sync');
    expect(updProp.updatedEvent.category).toBe('Work');
    expect(updProp.changedFields.title).toEqual({
      old: 'Old Sync',
      new: 'New Sync'
    });
    expect(updProp.changedFields.startTime).toEqual({ old: '10:00', new: '09:30' });
  });

  it('should round-trip Wellness/YouTube events through EventEnhancer without duplicating category or subCategory', async () => {
    const enhancer = new EventEnhancer(PluginState.getSettings());
    const storedRaw = {
      title: 'Wellness - YouTube - Watch - AI News: Things Will Never Be The Same - YouTube',
      type: 'single' as const,
      date: '2026-11-16',
      endDate: null,
      allDay: false,
      startTime: '14:00',
      endTime: '15:00'
    };
    const cachedEnhanced = enhancer.enhance(storedRaw);
    expect(cachedEnhanced.category).toBe('Wellness');
    expect(cachedEnhanced.subCategory).toBe('YouTube');
    expect(cachedEnhanced.title).toBe(
      'YouTube - Watch - AI News: Things Will Never Be The Same - YouTube'
    );

    mockCache.getAllEvents.mockReturnValue([
      { id: 'work-cal', editable: true, events: [{ id: 'ev-yt-1', event: cachedEnhanced }] }
    ]);
    mockCache.getEventById.mockReturnValue(cachedEnhanced);
    mockCache.store.getEventDetails.mockReturnValue({
      calendarId: 'work-cal',
      event: cachedEnhanced
    });

    const bridge = new AgentCalendarBridge();

    // Read API returns clean title without mutating live cached object
    const listed = bridge.getEvents('2026-11-15', '2026-11-20');
    expect(listed[0].title).toBe('Watch - AI News: Things Will Never Be The Same - YouTube');
    const byId = bridge.getEventById('ev-yt-1') as { event: { title: string } };
    expect(byId.event.title).toBe('Watch - AI News: Things Will Never Be The Same - YouTube');
    expect(cachedEnhanced.title).toBe(
      'YouTube - Watch - AI News: Things Will Never Be The Same - YouTube'
    );

    // Stage update where LLM passes "YouTube - Watch - AI News: Things Will Never Be The Same"
    const proposal = bridge.stageUpdateEvent('ev-yt-1', {
      title: 'YouTube - Watch - AI News: Things Will Never Be The Same'
    });
    expect(proposal.updatedEvent.title).toBe('Watch - AI News: Things Will Never Be The Same');
    expect(proposal.updatedEvent.category).toBe('Wellness');
    expect(proposal.updatedEvent.subCategory).toBe('YouTube');

    const commitRes = await bridge.commitProposal(proposal.id, undefined, proposal.approvalHash);
    expect(commitRes.success).toBe(true);

    const updateCall = mockCache.updateEventWithId.mock.calls[0] as [string, OFCEvent];
    const committedEvent = updateCall[1];
    const forDisk = enhancer.prepareForStorage(committedEvent);
    expect(forDisk.title).toBe(
      'Wellness - YouTube - Watch - AI News: Things Will Never Be The Same'
    );
    expect(forDisk.category).toBeUndefined();
    expect(forDisk.subCategory).toBeUndefined();

    const reEnhanced = enhancer.enhance(forDisk);
    expect(reEnhanced.title).toBe('YouTube - Watch - AI News: Things Will Never Be The Same');
    expect(reEnhanced.category).toBe('Wellness');
    expect(reEnhanced.subCategory).toBe('YouTube');
  });

  it('should handle partial subCategory rename/clear and CREATE/BATCH round-trips cleanly', () => {
    const enhancer = new EventEnhancer(PluginState.getSettings());
    const cachedEnhanced = enhancer.enhance({
      title: 'Wellness - YouTube - Watch',
      type: 'single',
      date: '2026-11-16',
      endDate: null,
      allDay: true
    });
    mockCache.getEventById.mockReturnValue(cachedEnhanced);
    mockCache.store.getEventDetails.mockReturnValue({
      calendarId: 'work-cal',
      event: cachedEnhanced
    });

    const bridge = new AgentCalendarBridge();

    // Rename only subCategory without passing title
    const renameSub = bridge.stageUpdateEvent('ev-1', { subCategory: 'Podcast' });
    expect(renameSub.updatedEvent.title).toBe('Watch');
    expect(enhancer.prepareForStorage(renameSub.updatedEvent).title).toBe(
      'Wellness - Podcast - Watch'
    );

    // Clear subCategory
    const clearSub = bridge.stageUpdateEvent('ev-1', { subCategory: '' });
    expect(clearSub.updatedEvent.title).toBe('Watch');
    expect(clearSub.updatedEvent.subCategory).toBeUndefined();
    expect(enhancer.prepareForStorage(clearSub.updatedEvent).title).toBe('Wellness - Watch');

    // Create + Batch Create round-trips
    const createProp = bridge.stageCreateEvent({
      calendarId: 'work-cal',
      title: 'Watch - Documentary',
      category: 'Wellness',
      subCategory: 'YouTube',
      date: '2026-11-18',
      allDay: true
    });
    expect(enhancer.prepareForStorage(createProp.eventData).title).toBe(
      'Wellness - YouTube - Watch - Documentary'
    );

    const batchProp = bridge.stageBatchCreateEvents('work-cal', [
      {
        title: 'Wellness - YouTube - Watch - Talk',
        category: 'Wellness',
        subCategory: 'YouTube',
        date: '2026-11-19',
        allDay: true
      }
    ]);
    expect(enhancer.prepareForStorage(batchProp.items[0].eventData).title).toBe(
      'Wellness - YouTube - Watch - Talk'
    );
  });

  it('should keep titles literal and omit category/subCategory when advanced categorization is disabled', () => {
    PluginState.setSettings({
      ...PluginState.getSettings(),
      enableAdvancedCategorization: false
    });
    const enhancer = new EventEnhancer(PluginState.getSettings());
    const bridge = new AgentCalendarBridge();

    const createProp = bridge.stageCreateEvent({
      calendarId: 'work-cal',
      title: 'Work - Meeting',
      category: 'Work',
      subCategory: 'Dev',
      date: '2026-11-20',
      allDay: true
    });
    expect(createProp.eventData.title).toBe('Work - Meeting');
    expect(createProp.eventData.category).toBeUndefined();
    expect(createProp.eventData.subCategory).toBeUndefined();
    const prepared = enhancer.prepareForStorage(createProp.eventData);
    expect(prepared.category).toBeUndefined();
    expect(prepared.subCategory).toBeUndefined();
  });

  it('should prevent TOCTOU duplicate execution on concurrent commitProposal calls and report actionability accurately', async () => {
    let resolveAdd!: (val: boolean) => void;
    mockCache.addEvent.mockImplementationOnce(
      () =>
        new Promise<boolean>(resolve => {
          resolveAdd = resolve;
        })
    );

    const bridge = new AgentCalendarBridge();
    const proposal = bridge.stageCreateEvent({
      calendarId: 'work-cal',
      title: 'Race Guard Meeting',
      date: '2026-09-28',
      allDay: true
    });

    expect(bridge.isProposalActionable(proposal)).toBe(true);

    const firstCommit = bridge.commitProposal(proposal.id, undefined, proposal.approvalHash);
    expect(bridge.isProposalActionable(proposal)).toBe(false);

    const secondCommit = await bridge.commitProposal(proposal.id, undefined, proposal.approvalHash);
    expect(secondCommit.success).toBe(false);
    expect(secondCommit.message).toContain('already being applied');

    resolveAdd(true);
    const firstRes = await firstCommit;
    expect(firstRes.success).toBe(true);
    expect(mockCache.addEvent).toHaveBeenCalledTimes(1);
    expect(bridge.isProposalActionable(proposal)).toBe(false);

    const staleProposal = {
      ...proposal,
      id: 'prop_stale',
      status: 'PENDING' as const
    };
    expect(bridge.isProposalActionable(staleProposal)).toBe(false);
  });

  it('captures delete metadata across ON/OFF toggles, strips category if toggled OFF before commit, and keeps transient FAILED retryable', async () => {
    const enhancer = new EventEnhancer(PluginState.getSettings());
    const enhanced = enhancer.enhance({
      id: 'ev-del-1',
      title: 'Wellness - YouTube - Old Session',
      type: 'single',
      date: '2026-11-20',
      endDate: '2026-11-21',
      allDay: false,
      startTime: '09:15',
      endTime: '10:30'
    });
    mockCache.getEventById.mockReturnValue(enhanced);
    mockCache.store.getEventDetails.mockReturnValue({ calendarId: 'work-cal', event: enhanced });

    const bridge = new AgentCalendarBridge();

    // 1. Delete proposal with categorization ON captures schedule and strips category prefix
    const delOn = bridge.stageDeleteEvent('ev-del-1', 'Duplicate');
    expect(delOn.eventTitle).toBe('Old Session');
    expect(delOn.eventDate).toBe('2026-11-20');
    expect(delOn.eventEndDate).toBe('2026-11-21');
    expect(delOn.eventAllDay).toBe(false);
    expect(delOn.eventStartTime).toBe('09:15');
    expect(delOn.eventEndTime).toBe('10:30');
    expect(delOn.eventCategory).toBe('Wellness');
    expect(delOn.eventSubCategory).toBe('YouTube');
    expect(delOn.eventRecurring).toBe(false);

    // 2. Stage CREATE + category-only UPDATE while ON, then toggle categorization OFF before commit
    const createOn = bridge.stageCreateEvent({
      calendarId: 'work-cal',
      title: 'Focus Block',
      category: 'Work',
      subCategory: 'Deep',
      date: '2026-11-22',
      allDay: true
    });
    const catOnlyUpdate = bridge.stageUpdateEvent('ev-del-1', { category: 'Work' });

    PluginState.setSettings({
      ...PluginState.getSettings(),
      enableAdvancedCategorization: false
    });

    const delOff = bridge.stageDeleteEvent('ev-del-1');
    expect(delOff.eventCategory).toBeUndefined();
    expect(delOff.eventSubCategory).toBeUndefined();

    const createCommit = await bridge.commitProposal(createOn.id, undefined, createOn.approvalHash);
    expect(createCommit.success).toBe(true);
    const addedEv = (mockCache.addEvent.mock.calls as [string, OFCEvent][])[0][1];
    expect(addedEv.category).toBeUndefined();
    expect(addedEv.subCategory).toBeUndefined();

    const catOnlyCommit = await bridge.commitProposal(
      catOnlyUpdate.id,
      undefined,
      catOnlyUpdate.approvalHash
    );
    expect(catOnlyCommit.success).toBe(false);
    expect(catOnlyCommit.message).toContain('disabled');
    expect(mockCache.updateEventWithId).not.toHaveBeenCalled();

    // 3. Transient FAILED proposal stays actionable while present in pendingProposals
    PluginState.setSettings({
      ...PluginState.getSettings(),
      enableAdvancedCategorization: true
    });
    mockCache.addEvent.mockRejectedValueOnce(new Error('Disk busy'));
    const failCreate = bridge.stageCreateEvent({
      calendarId: 'work-cal',
      title: 'Retryable',
      date: '2026-11-22',
      allDay: true
    });
    const failRes = await bridge.commitProposal(failCreate.id, undefined, failCreate.approvalHash);
    expect(failRes.success).toBe(false);
    expect(failCreate.status).toBe('FAILED');
    expect(bridge.isProposalActionable(failCreate)).toBe(true);
  });
});
