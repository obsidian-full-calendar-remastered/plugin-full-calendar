/**
 * @file AgentStorage.test.ts
 * @brief Unit tests for AgentStorage and plugin directory confinement.
 */

import { AgentStorage } from './AgentStorage';
import type FullCalendarPlugin from '../../../main';

describe('AgentStorage', () => {
  const mockAdapter = {
    exists: jest.fn().mockResolvedValue(true),
    mkdir: jest.fn().mockResolvedValue(undefined),
    read: jest.fn(),
    write: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined)
  };

  const mockPlugin = {
    manifest: { id: 'full-calendar-remastered' },
    app: {
      vault: {
        configDir: 'custom-config',
        adapter: mockAdapter
      }
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should store files strictly inside plugin directory', async () => {
    const storage = new AgentStorage(mockPlugin as unknown as FullCalendarPlugin);
    await storage.saveCachedSpec('# Test Spec');

    expect(mockAdapter.write).toHaveBeenCalledWith(
      'custom-config/plugins/full-calendar-remastered/agent/agent-spec.md',
      '# Test Spec'
    );
  });

  it('should save and load conversation history', async () => {
    const storage = new AgentStorage(mockPlugin as unknown as FullCalendarPlugin);
    const messages = [{ role: 'user' as const, content: 'Test message' }];

    await storage.saveHistory(messages);
    expect(mockAdapter.write).toHaveBeenCalledWith(
      'custom-config/plugins/full-calendar-remastered/agent/history.json',
      expect.stringContaining('Test message')
    );
    expect(mockAdapter.write).toHaveBeenCalledWith(
      'custom-config/plugins/full-calendar-remastered/agent/sessions.json',
      expect.stringContaining('Test message')
    );

    const loaded = await storage.loadHistory();
    expect(loaded).toEqual(messages);
  });

  it('should create, switch, and delete sessions with persistence', async () => {
    const storage = new AgentStorage(mockPlugin as unknown as FullCalendarPlugin);
    const s1 = await storage.getActiveSession();
    expect(s1.title).toBe('Default session');

    const s2 = await storage.createSession('Meeting Prep');
    expect(s2.title).toBe('Meeting Prep');

    const active = await storage.getActiveSession();
    expect(active.id).toBe(s2.id);

    // Switch back to s1
    await storage.setActiveSessionId(s1.id);
    expect((await storage.getActiveSession()).id).toBe(s1.id);

    // Delete s2
    const remaining = await storage.deleteSession(s2.id);
    expect(remaining.id).toBe(s1.id);
    const all = await storage.loadAllSessions();
    expect(all.sessions.length).toBe(1);
    expect(all.sessions[0].id).toBe(s1.id);
  });

  it('should append audit log entries as JSONL', async () => {
    const storage = new AgentStorage(mockPlugin as unknown as FullCalendarPlugin);
    mockAdapter.read.mockResolvedValueOnce(''); // Existing log

    await storage.appendAuditEntry({
      id: 'aud_1',
      timestamp: Date.now(),
      level: 'INFO',
      action: 'test_action'
    });

    expect(mockAdapter.write).toHaveBeenCalledWith(
      'custom-config/plugins/full-calendar-remastered/agent/audit.jsonl',
      expect.stringContaining('"action":"test_action"')
    );
  });
});
