/**
 * @file AgentEngine.ts
 * @brief Conversation runner, resilient tool dispatcher, and proposal coordinator.
 *
 * @description
 * Coordinates the full conversational agent loop:
 * 1. Prompts LLM with dynamic context & tools.
 * 2. Streams token responses to the UI.
 * 3. Handles tool calling with resilient JSON repair for local LLMs (Ollama, LM Studio).
 * 4. Silently resolves read queries; intercepts write mutations into staged proposals.
 * 5. Persists conversation history & audit logs.
 *
 * @license See LICENSE.md
 */

import { AGENT_TOOLS } from '../tools/toolDefinitions';
import { browseScheduleOnline } from '../tools/webBrowseTool';
import type {
  ChatMessage,
  ChatToolCall,
  EventProposal,
  AgentSession,
  AgentSessionSummary
} from '../types';
import type { AgentClient, StreamCallbacks, CompletionResult } from './AgentClient';
import type { AgentStorage } from './AgentStorage';
import type { AgentAuditLogger } from './AgentAuditLogger';
import type { AgentCalendarBridge } from '../tools/AgentCalendarBridge';
import type { SpecLoader } from './SpecLoader';

const MAX_TURNS = 5;

export interface EngineCallbacks extends StreamCallbacks {
  onStatus?: (statusText: string) => void;
  onProposal?: (proposal: EventProposal) => void;
  onError?: (error: string) => void;
  onDone?: () => void;
  onSessionChanged?: (session: AgentSession) => void;
}

export class AgentEngine {
  private client: AgentClient;
  private storage: AgentStorage;
  private logger: AgentAuditLogger;
  private bridge: AgentCalendarBridge;
  private specLoader: SpecLoader;
  private currentSession: AgentSession | null = null;
  private messages: ChatMessage[] = [];
  private isProcessing = false;

  constructor(
    client: AgentClient,
    storage: AgentStorage,
    logger: AgentAuditLogger,
    bridge: AgentCalendarBridge,
    specLoader: SpecLoader
  ) {
    this.client = client;
    this.storage = storage;
    this.logger = logger;
    this.bridge = bridge;
    this.specLoader = specLoader;
  }

  public getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  public getProposals(): EventProposal[] {
    return this.currentSession?.proposals ? [...this.currentSession.proposals] : [];
  }

  public async init(): Promise<void> {
    this.currentSession = await this.storage.getActiveSession();
    this.messages = this.currentSession.messages;
  }

  public async listSessions(): Promise<AgentSessionSummary[]> {
    const data = await this.storage.loadAllSessions();
    return data.sessions.map(s => ({
      id: s.id,
      title: s.title,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messageCount: s.messages.length,
      proposalCount: s.proposals?.length || 0
    }));
  }

  public async getActiveSession(): Promise<AgentSession> {
    if (!this.currentSession) {
      await this.init();
    }
    return this.currentSession as AgentSession;
  }

  public async createNewSession(title?: string): Promise<AgentSession> {
    const session = await this.storage.createSession(title);
    this.currentSession = session;
    this.messages = session.messages;
    this.logger.info(`Created new session: ${session.id} (${session.title})`);
    return session;
  }

  public async switchSession(sessionId: string): Promise<AgentSession | null> {
    const session = await this.storage.setActiveSessionId(sessionId);
    if (session) {
      this.currentSession = session;
      this.messages = session.messages;
      this.logger.info(`Switched to session: ${session.id} (${session.title})`);
    }
    return session;
  }

  public async deleteSession(sessionId: string): Promise<AgentSession> {
    const newActive = await this.storage.deleteSession(sessionId);
    this.currentSession = newActive;
    this.messages = newActive.messages;
    this.logger.info(`Deleted session: ${sessionId}, now on: ${newActive.id}`);
    return newActive;
  }

  public async clearHistory(): Promise<void> {
    this.messages = [];
    if (this.currentSession) {
      this.currentSession.messages = [];
      this.currentSession.proposals = [];
      await this.storage.saveSession(this.currentSession);
    } else {
      await this.storage.clearHistory();
    }
    this.logger.info('Conversation history cleared by user');
  }

  /**
   * Cleans and repairs potentially malformed JSON emitted by local LLMs.
   */
  private repairJson(rawArgs: string): string {
    let clean = (rawArgs || '').trim();
    // 1. Remove markdown code fences if present: ```json ... ```
    if (clean.startsWith('```')) {
      clean = clean
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
    }
    // 2. Remove trailing commas before closing braces or brackets: { "a": 1, } -> { "a": 1 }
    clean = clean.replace(/,\s*([}\]])/g, '$1');
    return clean;
  }

  /**
   * Executes a tool called by the LLM against the calendar bridge or web tool.
   */
  private async executeTool(
    toolCall: ChatToolCall,
    callbacks?: EngineCallbacks
  ): Promise<{ result: string; proposal?: EventProposal }> {
    const fnName = toolCall.function.name;
    const rawArgs = toolCall.function.arguments;
    let args: Record<string, unknown>;

    try {
      const repaired = this.repairJson(rawArgs);
      args = JSON.parse(repaired || '{}') as Record<string, unknown>;
    } catch (parseErr) {
      const errStr = `Malformed tool arguments from LLM: ${String(parseErr)}. Raw: ${rawArgs}`;
      this.logger.warn('Failed to parse tool call JSON', { fnName, rawArgs }, errStr);
      return {
        result: JSON.stringify({ error: errStr })
      };
    }

    const asString = (val: unknown, fallback = ''): string => {
      if (typeof val === 'string') {
        return val;
      }
      if (typeof val === 'number') {
        return `${val}`;
      }
      return fallback;
    };

    const asOptionalString = (val: unknown): string | undefined => {
      if (typeof val === 'string') {
        return val;
      }
      if (typeof val === 'number') {
        return `${val}`;
      }
      return undefined;
    };

    const asBoolean = (val: unknown, fallback = false): boolean => {
      return typeof val === 'boolean' ? val : fallback;
    };

    const asOptionalBoolean = (val: unknown): boolean | undefined => {
      return typeof val === 'boolean' ? val : undefined;
    };

    callbacks?.onStatus?.(`Executing: ${fnName}...`);
    this.logger.info(`Tool invocation: ${fnName}`, { args });

    try {
      switch (fnName) {
        case 'get_current_time': {
          const res = this.bridge.getCurrentTime();
          return { result: JSON.stringify(res) };
        }

        case 'get_calendar_sources': {
          const res = this.bridge.getCalendarSources();
          return { result: JSON.stringify(res) };
        }

        case 'get_user_categories': {
          const res = this.bridge.getUserCategories();
          return { result: JSON.stringify(res) };
        }

        case 'get_events': {
          const start = asString(args.startDate);
          const end = asString(args.endDate);
          const calId = asOptionalString(args.calendarId);
          const cat = asOptionalString(args.category);
          const res = this.bridge.getEvents(start, end, calId, cat);
          return { result: JSON.stringify({ count: res.length, events: res }) };
        }

        case 'get_event_by_id': {
          const id = asString(args.eventId);
          const res = this.bridge.getEventById(id);
          return { result: JSON.stringify(res || { error: 'Event not found' }) };
        }

        case 'browse_schedule_online': {
          const url = asString(args.url);
          callbacks?.onStatus?.(`Fetching schedule from ${url}...`);
          const text = await browseScheduleOnline(url);
          return { result: text };
        }

        // ====================================================================
        // GATED PROPOSAL ACTIONS (NO DIRECT WRITE)
        // ====================================================================
        case 'propose_create_event': {
          const proposal = this.bridge.stageCreateEvent({
            calendarId: asString(args.calendarId),
            title: asString(args.title, 'Untitled Event'),
            category: asOptionalString(args.category),
            subCategory: asOptionalString(args.subCategory),
            date: asString(args.date),
            endDate: asOptionalString(args.endDate),
            allDay: asBoolean(args.allDay),
            startTime: asOptionalString(args.startTime),
            endTime: asOptionalString(args.endTime),
            description: asOptionalString(args.description),
            location: asOptionalString(args.location)
          });
          callbacks?.onProposal?.(proposal);
          return {
            result: JSON.stringify({
              status: 'PROPOSAL_STAGED',
              proposalId: proposal.id,
              message:
                'Proposal created and displayed to the user in the write bar. Awaiting user approval.'
            }),
            proposal
          };
        }

        case 'propose_update_event': {
          const proposal = this.bridge.stageUpdateEvent(asString(args.eventId), {
            title: asOptionalString(args.title),
            category: asOptionalString(args.category),
            subCategory: asOptionalString(args.subCategory),
            date: asOptionalString(args.date),
            allDay: asOptionalBoolean(args.allDay),
            startTime: asOptionalString(args.startTime),
            endTime: asOptionalString(args.endTime),
            description: asOptionalString(args.description)
          });
          callbacks?.onProposal?.(proposal);
          return {
            result: JSON.stringify({
              status: 'PROPOSAL_STAGED',
              proposalId: proposal.id,
              message: 'Update proposal displayed for user approval.'
            }),
            proposal
          };
        }

        case 'propose_delete_event': {
          const proposal = this.bridge.stageDeleteEvent(
            asString(args.eventId),
            asOptionalString(args.reason)
          );
          callbacks?.onProposal?.(proposal);
          return {
            result: JSON.stringify({
              status: 'PROPOSAL_STAGED',
              proposalId: proposal.id,
              message: 'Delete proposal displayed for user approval.'
            }),
            proposal
          };
        }

        case 'propose_batch_create_events': {
          const rawEvents = (args.events as Record<string, unknown>[]) || [];
          const proposal = this.bridge.stageBatchCreateEvents(
            asString(args.calendarId),
            rawEvents.map(e => ({
              title: asString(e.title, 'Untitled'),
              category: asOptionalString(e.category),
              subCategory: asOptionalString(e.subCategory),
              date: asString(e.date),
              allDay: asBoolean(e.allDay),
              startTime: asOptionalString(e.startTime),
              endTime: asOptionalString(e.endTime),
              description: asOptionalString(e.description)
            }))
          );
          callbacks?.onProposal?.(proposal);
          return {
            result: JSON.stringify({
              status: 'PROPOSAL_STAGED',
              proposalId: proposal.id,
              count: proposal.items.length,
              message: `Batch proposal created with ${proposal.items.length} items. Displayed for user approval.`
            }),
            proposal
          };
        }

        default:
          return {
            result: JSON.stringify({ error: `Unknown tool function: ${fnName}` })
          };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error executing tool ${fnName}`, err as Error);
      return {
        result: JSON.stringify({ error: `Tool execution failed: ${msg}` })
      };
    }
  }

  /**
   * Main entry point: sends user input to the agent and runs the conversational loop.
   */
  public async prompt(
    userInput: string,
    callbacks?: EngineCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    if (this.isProcessing) {
      throw new Error('Agent is already processing a request. Please wait or cancel.');
    }

    const trimmedInput = userInput.trim();
    if (!trimmedInput) return;

    this.isProcessing = true;
    callbacks?.onStatus?.('Thinking...');

    try {
      // 1. Append user message
      const userMsg: ChatMessage = {
        role: 'user',
        content: trimmedInput,
        timestamp: Date.now()
      };
      this.messages.push(userMsg);

      let turns = 0;
      let stagedAnyProposal = false;

      while (turns < MAX_TURNS) {
        turns++;

        // 2. Build system prompt with dynamic real-time context
        const systemPrompt = await this.specLoader.buildSystemPrompt();
        const fullMessages: ChatMessage[] = [
          { role: 'system', content: systemPrompt },
          ...this.messages
        ];

        // 3. Call LLM
        callbacks?.onStatus?.('Generating response...');
        let completion: CompletionResult;
        try {
          completion = await this.client.chatCompletion(fullMessages, AGENT_TOOLS, {
            stream: true,
            signal,
            callbacks: {
              onChunk: callbacks?.onChunk,
              onRetry: callbacks?.onRetry
            }
          });
        } catch (callErr) {
          if (signal?.aborted) {
            callbacks?.onStatus?.('Cancelled');
            return;
          }
          throw callErr;
        }

        // Response received: immediately clear status indicator
        callbacks?.onStatus?.('');

        // 4. Append assistant response
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: completion.content || null,
          tool_calls: completion.toolCalls.length > 0 ? completion.toolCalls : undefined,
          timestamp: Date.now()
        };
        this.messages.push(assistantMsg);

        // 5. If no tools were invoked, we are done
        if (!completion.toolCalls || completion.toolCalls.length === 0) {
          break;
        }

        // 6. Execute tool calls
        for (const tc of completion.toolCalls) {
          const { result, proposal } = await this.executeTool(tc, callbacks);
          if (proposal) {
            stagedAnyProposal = true;
            if (this.currentSession) {
              if (!this.currentSession.proposals) this.currentSession.proposals = [];
              this.currentSession.proposals.push(proposal);
            }
          }

          const toolMsg: ChatMessage = {
            role: 'tool',
            content: result,
            tool_call_id: tc.id,
            timestamp: Date.now()
          };
          this.messages.push(toolMsg);
        }

        // If proposals were staged, give the assistant a chance to explain the proposals
        if (stagedAnyProposal && turns >= 2) {
          break;
        }
      }

      // Persist conversation history to active session
      if (this.currentSession) {
        this.currentSession.messages = this.messages;
        if (
          this.currentSession.title.startsWith('Session ') ||
          this.currentSession.title === 'Default session'
        ) {
          this.currentSession.title = trimmedInput.slice(0, 32).trim();
        }
        await this.storage.saveSession(this.currentSession);
      } else {
        await this.storage.saveHistory(this.messages);
      }
      callbacks?.onDone?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error('Agent Engine failed', err as Error);
      callbacks?.onError?.(msg);
      throw err;
    } finally {
      this.isProcessing = false;
      callbacks?.onStatus?.('');
    }
  }
}
