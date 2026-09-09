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

  it('should return current time and timezone correctly in read API', () => {
    const bridge = new AgentCalendarBridge();
    const timeInfo = bridge.getCurrentTime();

    expect(timeInfo.displayTimezone).toBe('America/New_York');
    expect(typeof timeInfo.currentDate).toBe('string');
    expect(typeof timeInfo.currentTime24h).toBe('string');
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
});
