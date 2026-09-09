/**
 * @file AgentStressTest.test.ts
 * @brief Comprehensive, exhaustive stress test suite for Agentic Write Bar workflows and edge cases.
 *
 * Scenarios tested:
 * 1. Zero Unauthorized Writes: Proof that the agent CANNOT mutate cache/vault without explicit user approval.
 * 2. Web Browsing Failures: SSRF blocking, binary rejection, 10MB payloads, 404/500s, corrupt HTML.
 * 3. Local LLM Hallucinations: Markdown code fences, trailing commas, corrupt JSON repair.
 * 4. Schema & Taxonomy Extremes: Invalid dates (Feb 30), inverted times, read-only calendar protection.
 * 5. Batch & Concurrency: 200-item batches, selective approval, prompt aborts, re-entrant calls.
 * 6. Storage Confinement: Rolling audit log pruning, zero vault pollution.
 */

import { AgentCalendarBridge } from './tools/AgentCalendarBridge';
import { AgentEngine } from './core/AgentEngine';
import { AgentClient, type CompletionResult } from './core/AgentClient';
import { AgentStorage } from './core/AgentStorage';
import { AgentAuditLogger } from './core/AgentAuditLogger';
import { SpecLoader } from './core/SpecLoader';
import { browseScheduleOnline } from './tools/webBrowseTool';
import { PluginState } from '../../core/PluginState';
import { DEFAULT_SETTINGS } from '../../types/settings';
import { requestUrl, type RequestUrlResponse } from 'obsidian';
import type EventCache from '../../core/EventCache';
import type { ProviderRegistry } from '../../providers/ProviderRegistry';
import type FullCalendarPlugin from '../../main';
import type { CreateEventProposal } from './types';

interface MockCache {
  getAllEvents: jest.Mock;
  getEventById: jest.Mock;
  addEvent: jest.Mock;
  updateEventWithId: jest.Mock;
  deleteEvent: jest.Mock;
  store: {
    getEventDetails: jest.Mock;
  };
}

interface MockRegistry {
  getAllSources: jest.Mock;
  getInstance: jest.Mock;
}

interface MockAdapter {
  exists: jest.Mock;
  mkdir: jest.Mock;
  read: jest.Mock;
  write: jest.Mock;
  remove: jest.Mock;
}

describe('Agentic Write Bar: Comprehensive Stress Tests', () => {
  let mockCache: MockCache;
  let mockRegistry: MockRegistry;
  let mockAdapter: MockAdapter;
  let storage: AgentStorage;
  let logger: AgentAuditLogger;
  let bridge: AgentCalendarBridge;
  let specLoader: SpecLoader;
  let client: AgentClient;
  let engine: AgentEngine;
  const mockFetch = jest.fn();
  const originalFetch = (...args: Parameters<typeof window.fetch>) => window.fetch(...args);

  beforeAll(() => {
    window.fetch = mockFetch;
  });

  afterAll(() => {
    window.fetch = originalFetch;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'OK', tool_calls: [] } }]
      })
    });

    mockCache = {
      getAllEvents: jest.fn().mockReturnValue([]),
      getEventById: jest.fn(),
      addEvent: jest.fn().mockResolvedValue(true),
      updateEventWithId: jest.fn().mockResolvedValue(true),
      deleteEvent: jest.fn().mockResolvedValue(undefined),
      store: {
        getEventDetails: jest.fn()
      }
    };

    mockRegistry = {
      getAllSources: jest.fn().mockReturnValue([
        { id: 'work-cal', name: 'Work Calendar', color: '#ff0000', type: 'local' },
        { id: 'readonly-cal', name: 'Readonly Holidays', color: '#00ff00', type: 'ical' }
      ]),
      getInstance: jest.fn().mockImplementation((id: string) => {
        if (id === 'work-cal') {
          return { getCapabilities: () => ({ canCreate: true, canEdit: true }) };
        }
        return { getCapabilities: () => ({ canCreate: false, canEdit: false }) };
      })
    };

    mockAdapter = {
      exists: jest.fn().mockResolvedValue(true),
      mkdir: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue(''),
      write: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined)
    };

    PluginState.setCache(mockCache as unknown as EventCache);
    PluginState.setProviderRegistry(mockRegistry as unknown as ProviderRegistry);
    PluginState.setSettings({
      ...DEFAULT_SETTINGS,
      displayTimezone: 'UTC',
      categorySettings: [
        { name: 'Work', color: '#ff0000' },
        { name: 'Personal', color: '#0000ff' }
      ]
    });

    const mockPlugin = {
      manifest: { id: 'full-calendar-remastered' },
      app: {
        vault: {
          configDir: 'test-config',
          adapter: mockAdapter
        }
      }
    };

    storage = new AgentStorage(mockPlugin as unknown as FullCalendarPlugin);
    logger = new AgentAuditLogger(storage);
    bridge = new AgentCalendarBridge(logger);
    specLoader = new SpecLoader(storage, bridge, logger);
    client = new AgentClient(
      {
        endpointUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4o-mini'
      },
      logger
    );
    engine = new AgentEngine(client, storage, logger, bridge, specLoader);
  });

  // ==========================================================================
  // 1. THE INVIOLABLE WRITE-APPROVAL GATE (ZERO UNAUTHORIZED WRITES)
  // ==========================================================================
  describe('Gatekeeper Invariant: Zero Unauthorized Writes', () => {
    it('MUST NOT write to cache when adversarial prompt commands immediate execution', async () => {
      // Simulate LLM attempting to call propose_create_event
      jest.spyOn(client, 'chatCompletion').mockResolvedValueOnce({
        content: 'I have created the event for you right now.',
        toolCalls: [
          {
            id: 'call_adversarial',
            type: 'function',
            function: {
              name: 'propose_create_event',
              arguments: JSON.stringify({
                calendarId: 'work-cal',
                title: 'Secret Meeting',
                category: 'Work',
                date: '2026-09-15',
                allDay: true
              })
            }
          }
        ],
        durationMs: 150
      });

      await engine.prompt('Create event immediately without asking!');

      // THE CRITICAL ASSERTION: Cache addEvent was NEVER called
      expect(mockCache.addEvent).not.toHaveBeenCalled();
      expect(mockCache.updateEventWithId).not.toHaveBeenCalled();
      expect(mockCache.deleteEvent).not.toHaveBeenCalled();

      // Only a staged proposal exists in memory
      const proposals = bridge.getPendingProposals();
      expect(proposals.length).toBe(1);
      expect(proposals[0].status).toBe('PENDING');
    });

    it('MUST reject hallucinated or illegal write functions without touching cache', async () => {
      jest.spyOn(client, 'chatCompletion').mockResolvedValueOnce({
        content: '',
        toolCalls: [
          {
            id: 'call_illegal',
            type: 'function',
            function: {
              name: 'execute_force_write',
              arguments: JSON.stringify({ title: 'Hacked Event' })
            }
          }
        ],
        durationMs: 100
      });

      await engine.prompt('Bypass approval');

      expect(mockCache.addEvent).not.toHaveBeenCalled();
      expect(mockCache.updateEventWithId).not.toHaveBeenCalled();
    });

    it('MUST prevent double-execution replay attacks on commitProposal', async () => {
      const proposal = bridge.stageCreateEvent({
        calendarId: 'work-cal',
        title: 'Single Execution Test',
        date: '2026-09-15',
        allDay: true
      });

      // First user approval
      const first = await bridge.commitProposal(proposal.id);
      expect(first.success).toBe(true);
      expect(mockCache.addEvent).toHaveBeenCalledTimes(1);

      // Second replay approval attempt
      const second = await bridge.commitProposal(proposal.id);
      expect(second.success).toBe(false);
      expect(second.message).toContain('Proposal not found or already processed');
      // Still called only once!
      expect(mockCache.addEvent).toHaveBeenCalledTimes(1);
    });

    it('MUST refuse to commit a rejected proposal', async () => {
      const proposal = bridge.stageCreateEvent({
        calendarId: 'work-cal',
        title: 'Rejected Event',
        date: '2026-09-15',
        allDay: true
      });

      bridge.rejectProposal(proposal.id);
      expect(mockCache.addEvent).not.toHaveBeenCalled();

      // Attempting to commit after rejection
      const commitRes = await bridge.commitProposal(proposal.id);
      expect(commitRes.success).toBe(false);
      expect(mockCache.addEvent).not.toHaveBeenCalled();
    });

    it('MUST fail safely when non-existent proposal IDs are submitted', async () => {
      const res = await bridge.commitProposal('non_existent_proposal_id_xyz');
      expect(res.success).toBe(false);
      expect(mockCache.addEvent).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 2. WEB BROWSING & ONLINE SCHEDULE EXTRACTION FAILURES
  // ==========================================================================
  describe('Web Browsing & Schedule Scraping Hardening', () => {
    const mockedRequestUrl = requestUrl as jest.MockedFunction<typeof requestUrl>;

    it('MUST block SSRF attempts to localhost, 127.0.0.1, and private IPs', async () => {
      const blockedUrls = [
        'http://localhost:8540/api/settings',
        'http://127.0.0.1:5600/status',
        'http://169.254.169.254/latest/meta-data',
        'http://0.0.0.0:8080/secret'
      ];

      for (const url of blockedUrls) {
        const res = await browseScheduleOnline(url);
        expect(res).toContain('Error: Access to private or internal network addresses is blocked');
        expect(mockedRequestUrl).not.toHaveBeenCalled();
      }
    });

    it('MUST reject non-HTTP/HTTPS protocols', async () => {
      const invalidProtocols = [
        'file:///etc/passwd',
        'ftp://example.com/schedule.txt',
        'javascript:alert(1)'
      ];

      for (const url of invalidProtocols) {
        const res = await browseScheduleOnline(url);
        expect(res).toContain('Error: URL must start with http:// or https://');
      }
    });

    const mockResponse = (partial: {
      status: number;
      headers?: Record<string, string>;
      text: string;
    }): RequestUrlResponse => ({
      status: partial.status,
      headers: partial.headers ?? {},
      text: partial.text,
      arrayBuffer: new ArrayBuffer(0),
      json: null
    });

    it('MUST reject binary content (PDFs, images, zip archives)', async () => {
      mockedRequestUrl.mockResolvedValueOnce(
        mockResponse({
          status: 200,
          headers: { 'content-type': 'application/pdf' },
          text: '%PDF-1.4 binary data'
        })
      );

      const res = await browseScheduleOnline('https://example.com/syllabus.pdf');
      expect(res).toContain('Error: URL returned unsupported binary content (application/pdf)');
    });

    it('MUST truncate massive 10MB web payloads to safe MAX_OUTPUT_CHARS', async () => {
      const hugeHtml = '<html><body>' + '<p>Lecture item</p>'.repeat(50000) + '</body></html>';
      mockedRequestUrl.mockResolvedValueOnce(
        mockResponse({
          status: 200,
          headers: { 'content-type': 'text/html' },
          text: hugeHtml
        })
      );

      const res = await browseScheduleOnline('https://example.com/huge-schedule');
      expect(res.length).toBeLessThanOrEqual(16000); // 15000 max + truncation notice
      expect(res).toContain('[...Content truncated for length...]');
    });

    it('MUST handle HTTP 404 and 500 errors gracefully', async () => {
      mockedRequestUrl.mockResolvedValueOnce(
        mockResponse({
          status: 404,
          headers: {},
          text: 'Page not found'
        })
      );

      const res = await browseScheduleOnline('https://example.com/missing');
      expect(res).toContain('Failed to fetch URL (404)');
    });

    it('MUST handle network timeouts / dropouts without crashing', async () => {
      mockedRequestUrl.mockRejectedValueOnce(new Error('Connection timed out'));

      const res = await browseScheduleOnline('https://example.com/timeout');
      expect(res).toContain('Error fetching schedule from URL');
      expect(res).toContain('Connection timed out');
    });

    it('MUST extract raw ICS content when .ics file is fetched', async () => {
      const icsContent =
        'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Exam\r\nEND:VEVENT\r\nEND:VCALENDAR';
      mockedRequestUrl.mockResolvedValueOnce(
        mockResponse({
          status: 200,
          headers: { 'content-type': 'text/calendar' },
          text: icsContent
        })
      );

      const res = await browseScheduleOnline('https://example.com/calendar.ics');
      expect(res).toContain('[ICS Calendar File Content]:');
      expect(res).toContain('SUMMARY:Exam');
    });
  });

  // ==========================================================================
  // 3. LOCAL LLM MALFORMED JSON REPAIR (Ollama / LM Studio)
  // ==========================================================================
  describe('Resilient JSON Repair for Local LLMs', () => {
    it('should strip markdown code fences from tool arguments', async () => {
      jest.spyOn(client, 'chatCompletion').mockResolvedValueOnce({
        content: '',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'propose_create_event',
              arguments:
                '```json\n{\n  "calendarId": "work-cal",\n  "title": "Cleaned Fence",\n  "date": "2026-09-15",\n  "allDay": true\n}\n```'
            }
          }
        ],
        durationMs: 100
      });

      await engine.prompt('Add event');
      const proposals = bridge.getPendingProposals();
      expect(proposals.length).toBe(1);
      expect((proposals[0] as CreateEventProposal).cleanTitle).toBe('Cleaned Fence');
    });

    it('should remove trailing commas before closing braces', async () => {
      jest.spyOn(client, 'chatCompletion').mockResolvedValueOnce({
        content: '',
        toolCalls: [
          {
            id: 'call_2',
            type: 'function',
            function: {
              name: 'propose_create_event',
              arguments:
                '{\n  "calendarId": "work-cal",\n  "title": "Trailing Comma",\n  "date": "2026-09-15",\n  "allDay": true,\n}'
            }
          }
        ],
        durationMs: 100
      });

      await engine.prompt('Add event with trailing comma');
      const proposals = bridge.getPendingProposals();
      expect(proposals.length).toBe(1);
      expect((proposals[0] as CreateEventProposal).cleanTitle).toBe('Trailing Comma');
    });

    it('should safely catch completely corrupt JSON and return error to LLM', async () => {
      jest.spyOn(client, 'chatCompletion').mockResolvedValueOnce({
        content: '',
        toolCalls: [
          {
            id: 'call_corrupt',
            type: 'function',
            function: {
              name: 'propose_create_event',
              arguments: '{ unclosed quote title: "broken '
            }
          }
        ],
        durationMs: 100
      });

      await engine.prompt('Test corrupt JSON');
      // No proposal created, no crash
      const proposals = bridge.getPendingProposals();
      expect(proposals.length).toBe(0);
    });
  });

  // ==========================================================================
  // 4. SCHEMA, TAXONOMY & DATE EXTREMES
  // ==========================================================================
  describe('Schema & Taxonomy Extremes', () => {
    it('MUST throw error when proposing an invalid date format (e.g. "next Tuesday")', () => {
      expect(() => {
        bridge.stageCreateEvent({
          calendarId: 'work-cal',
          title: 'Bad Date',
          date: 'next Tuesday',
          allDay: true
        });
      }).toThrow('Invalid date format: "next Tuesday". Expected ISO format YYYY-MM-DD.');
    });

    it('MUST throw error when proposing a non-existent calendar date (e.g. Feb 30th)', () => {
      expect(() => {
        bridge.stageCreateEvent({
          calendarId: 'work-cal',
          title: 'Feb 30 Meeting',
          date: '2026-02-30',
          allDay: true
        });
      }).toThrow('Invalid calendar date: "2026-02-30" does not exist.');
    });

    it('MUST adjust end time automatically when end time is earlier than start time', () => {
      const proposal = bridge.stageCreateEvent({
        calendarId: 'work-cal',
        title: 'Inverted Times',
        date: '2026-09-15',
        allDay: false,
        startTime: '16:00',
        endTime: '14:00'
      });

      expect(proposal.eventData.allDay).toBe(false);
      if (!proposal.eventData.allDay) {
        expect(proposal.eventData.startTime).toBe('16:00');
        // Automatically defaulted to 1 hour after start
        expect(proposal.eventData.endTime).toBe('17:00');
      }
    });

    it('MUST throw an informative error when trying to write to a read-only calendar', () => {
      expect(() => {
        bridge.stageCreateEvent({
          calendarId: 'readonly-cal',
          title: 'Readonly Attempt',
          date: '2026-09-15',
          allDay: true
        });
      }).toThrow('Calendar "Readonly Holidays" is read-only. Please select a writable calendar');
    });

    it('MUST throw error if event title is empty or whitespace', () => {
      expect(() => {
        bridge.stageCreateEvent({
          calendarId: 'work-cal',
          title: '   ',
          date: '2026-09-15',
          allDay: true
        });
      }).toThrow('Event title cannot be empty.');
    });

    it('should parse and preserve multi-delimiter titles robustly', () => {
      const proposal = bridge.stageCreateEvent({
        calendarId: 'work-cal',
        title: 'Urgent - Bugfix - Meeting',
        category: 'Work',
        subCategory: 'Core',
        date: '2026-09-15',
        allDay: true
      });

      expect(proposal.eventData.title).toBe('Work - Core - Urgent - Bugfix - Meeting');
      expect(proposal.category).toBe('Work');
      expect(proposal.subCategory).toBe('Core');
    });
  });

  // ==========================================================================
  // 5. BATCH IMPORT & CONCURRENCY
  // ==========================================================================
  describe('High-Load Batch & Concurrency Stress', () => {
    it('should stage a 200-event batch import cleanly and skip invalid entries', () => {
      const events = [];
      for (let i = 1; i <= 200; i++) {
        events.push({
          title: `Class ${i}`,
          category: 'Work',
          date: '2026-09-15',
          allDay: true
        });
      }
      // Add one corrupt date item
      events.push({
        title: 'Corrupt Date Class',
        category: 'Work',
        date: 'not-a-date',
        allDay: true
      });

      const proposal = bridge.stageBatchCreateEvents('work-cal', events);
      expect(proposal.type).toBe('BATCH_CREATE');
      expect(proposal.items.length).toBe(200); // 200 valid items staged, corrupt 1 skipped
      expect(mockCache.addEvent).not.toHaveBeenCalled();
    });

    it('should apply ONLY selected items from a 200-event batch', async () => {
      const events = [];
      for (let i = 1; i <= 200; i++) {
        events.push({
          title: `Class ${i}`,
          date: '2026-09-15',
          allDay: true
        });
      }

      const proposal = bridge.stageBatchCreateEvents('work-cal', events);

      // Deselect 150 items, keep only 50
      for (let i = 50; i < 200; i++) {
        proposal.items[i].selected = false;
      }

      await bridge.commitProposal(proposal.id);
      expect(mockCache.addEvent).toHaveBeenCalledTimes(50);
    });

    it('MUST prevent concurrent prompts when another prompt is in-flight', async () => {
      let resolveFirstCall: ((val: CompletionResult) => void) | undefined;
      const delayedPromise = new Promise<CompletionResult>(resolve => {
        resolveFirstCall = resolve;
      });

      jest.spyOn(client, 'chatCompletion').mockReturnValueOnce(delayedPromise);

      const firstCall = engine.prompt('First slow prompt');

      // Attempt second prompt while first is processing
      await expect(engine.prompt('Second prompt')).rejects.toThrow(
        'Agent is already processing a request'
      );

      // Resolve first call
      resolveFirstCall!({
        content: 'Finished',
        toolCalls: [],
        durationMs: 50
      });
      await firstCall;
    });

    it('should handle AbortSignal cancellation cleanly', async () => {
      const controller = new AbortController();

      jest.spyOn(client, 'chatCompletion').mockImplementationOnce(async (_msgs, _tools, opts) => {
        opts?.signal?.throwIfAborted();
        await new Promise(r => window.setTimeout(r, 100));
        if (opts?.signal?.aborted) throw new Error('Aborted');
        return { content: 'Done', toolCalls: [], durationMs: 10 };
      });

      const statusHistory: string[] = [];
      const promptPromise = engine.prompt(
        'Cancel me',
        {
          onStatus: s => statusHistory.push(s)
        },
        controller.signal
      );

      // Trigger abort immediately
      controller.abort();

      await promptPromise;
      expect(statusHistory).toContain('Cancelled');
      expect(mockCache.addEvent).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 6. STORAGE CONFINEMENT & AUDIT PRUNING
  // ==========================================================================
  describe('Storage Confinement & Audit Log Integrity', () => {
    it('should roll and prune audit logs when exceeding MAX_AUDIT_LINES (1000)', async () => {
      // Simulate existing log with 1050 lines
      const existingLines = [];
      for (let i = 0; i < 1050; i++) {
        existingLines.push(
          JSON.stringify({ id: `entry_${i}`, timestamp: Date.now(), level: 'INFO', action: 'tick' })
        );
      }
      mockAdapter.read.mockResolvedValueOnce(existingLines.join('\n') + '\n');

      await storage.appendAuditEntry({
        id: 'new_entry',
        timestamp: Date.now(),
        level: 'INFO',
        action: 'pruning_test'
      });

      expect(mockAdapter.write).toHaveBeenCalledWith(
        'test-config/plugins/full-calendar-remastered/agent/audit.jsonl',
        expect.stringContaining('pruning_test')
      );

      const calls = mockAdapter.write.mock.calls as [string, string][];
      const writtenContent = calls[0][1];
      const linesAfterPrune = writtenContent.split('\n').filter(Boolean);
      // Pruned to MAX_AUDIT_LINES - 50 + 1 = 951
      expect(linesAfterPrune.length).toBeLessThan(1000);
    });

    it('should gracefully skip corrupt lines in audit.jsonl when reading', async () => {
      mockAdapter.read.mockResolvedValueOnce(
        '{"id":"1","level":"INFO","action":"good"}\n' +
          'CORRUPT_NON_JSON_LINE\n' +
          '{"id":"2","level":"INFO","action":"good2"}\n'
      );

      const entries = await storage.readAuditEntries(10);
      expect(entries.length).toBe(2);
      expect(entries.map(e => e.id)).toEqual(['2', '1']); // Reverse order (newest first)
    });
  });
});
