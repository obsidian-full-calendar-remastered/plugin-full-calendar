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
  AgentToolStepRecord,
  ChatMessage,
  ChatToolCall,
  EventProposal,
  AgentSession,
  AgentSessionSummary
} from '../types';
import type {
  CompletionResult,
  IAgentClient,
  StreamCallbacks
} from '../domain/contracts/IAgentClient';
import type { AgentStorage } from './AgentStorage';
import type { AgentAuditLogger } from './AgentAuditLogger';
import type { AgentCalendarBridge } from '../tools/AgentCalendarBridge';
import type { SpecLoader } from './SpecLoader';
import { buildContextWindowMessages } from './contextWindowBuilder';
import { generateRandomId } from '../domain/crypto/randomId';
import { extractFollowUpSuggestions } from '../domain/suggestionsParser';

const MAX_TURNS = 5;

export interface EngineCallbacks extends StreamCallbacks {
  onStatus?: (statusText: string) => void;
  onUserMessageRecorded?: () => void;
  onTurnStart?: (turn: number, maxTurns: number) => void;
  onTurnComplete?: (turn: number, cleanContent: string, suggestions: string[]) => void;
  onToolCallStart?: (info: { id: string; name: string; label: string }) => void;
  onToolCallEnd?: (step: AgentToolStepRecord) => void;
  onProposal?: (proposal: EventProposal) => void;
  onError?: (error: string) => void;
  onDone?: () => void;
  onSessionChanged?: (session: AgentSession) => void;
}

function formatToolStartLabel(fnName: string, args: Record<string, unknown>): string {
  switch (fnName) {
    case 'get_events': {
      const start = typeof args.startDate === 'string' ? args.startDate : '';
      const end = typeof args.endDate === 'string' ? args.endDate : '';
      return start && end ? `Reading events (${start} to ${end})` : 'Reading calendar events';
    }
    case 'get_event_by_id':
      return 'Inspecting event details';
    case 'get_calendar_sources':
      return 'Listing calendar sources';
    case 'get_user_categories':
      return 'Loading configured categories';
    case 'get_current_time':
      return 'Checking local time';
    case 'browse_schedule_online': {
      const url = typeof args.url === 'string' ? args.url : 'URL';
      return `Fetching schedule from ${url.slice(0, 48)}`;
    }
    case 'propose_create_event':
      return typeof args.title === 'string' && args.title.trim()
        ? `Staging new event: ${args.title.trim().slice(0, 40)}`
        : 'Staging new event';
    case 'propose_update_event':
      return typeof args.title === 'string' && args.title.trim()
        ? `Staging update: ${args.title.trim().slice(0, 40)}`
        : 'Staging event update';
    case 'propose_delete_event':
      return 'Staging event deletion';
    case 'propose_batch_create_events': {
      const count = Array.isArray(args.events) ? args.events.length : 0;
      return `Staging batch import (${count} items)`;
    }
    default:
      return `Running ${fnName}`;
  }
}

function formatToolResultSummary(
  fnName: string,
  resultJson: string,
  proposal?: EventProposal
): { summary: string; ok: boolean } {
  try {
    const parsed = JSON.parse(resultJson) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && typeof parsed.error === 'string') {
      return { summary: parsed.error.slice(0, 60), ok: false };
    }
    if (fnName === 'get_events' && typeof parsed?.count === 'number') {
      return {
        summary: `${parsed.count} event${parsed.count === 1 ? '' : 's'}`,
        ok: true
      };
    }
    if (fnName === 'get_calendar_sources' && Array.isArray(parsed)) {
      return { summary: `${parsed.length} calendars`, ok: true };
    }
    if (fnName === 'get_user_categories' && Array.isArray(parsed)) {
      return { summary: `${parsed.length} categories`, ok: true };
    }
    if (fnName === 'get_event_by_id') {
      return { summary: parsed?.id ? 'Loaded event' : 'Not found', ok: Boolean(parsed?.id) };
    }
  } catch {
    // Non-JSON result (e.g. browse_schedule_online text)
  }

  if (fnName === 'browse_schedule_online') {
    const failed = resultJson.startsWith('Failed') || resultJson.startsWith('Error');
    return { summary: failed ? 'Fetch failed' : 'Page fetched', ok: !failed };
  }
  if (fnName === 'propose_batch_create_events') {
    const count = proposal?.type === 'BATCH_CREATE' ? proposal.items.length : 0;
    return { summary: `${count} items staged`, ok: true };
  }
  if (
    fnName === 'propose_create_event' ||
    fnName === 'propose_update_event' ||
    fnName === 'propose_delete_event'
  ) {
    return { summary: 'Staged for approval', ok: true };
  }
  return { summary: 'Done', ok: true };
}

export class AgentEngine {
  private client: IAgentClient;
  private storage: AgentStorage;
  private logger: AgentAuditLogger;
  private bridge: AgentCalendarBridge;
  private specLoader: SpecLoader;
  private currentSession: AgentSession | null = null;
  private messages: ChatMessage[] = [];
  private isProcessing = false;

  constructor(
    client: IAgentClient,
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

  public setClient(client: IAgentClient): void {
    this.client = client;
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

  public async saveCurrentSession(): Promise<void> {
    if (this.currentSession) {
      await this.storage.saveSession(this.currentSession);
    }
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
  ): Promise<{ result: string; proposal?: EventProposal; step: AgentToolStepRecord }> {
    const fnName = toolCall.function.name;
    const rawArgs = toolCall.function.arguments;
    const startedAt = Date.now();
    let args: Record<string, unknown>;

    try {
      const repaired = this.repairJson(rawArgs);
      args = JSON.parse(repaired || '{}') as Record<string, unknown>;
    } catch (parseErr) {
      const errStr = `Malformed tool arguments from LLM: ${String(parseErr)}. Raw: ${rawArgs}`;
      const label = formatToolStartLabel(fnName, {});
      callbacks?.onToolCallStart?.({ id: toolCall.id, name: fnName, label });
      const step: AgentToolStepRecord = {
        id: toolCall.id,
        name: fnName,
        label,
        summary: 'Invalid tool arguments',
        ok: false,
        durationMs: Date.now() - startedAt
      };
      callbacks?.onToolCallEnd?.(step);
      this.logger.warn('Failed to parse tool call JSON', { fnName, rawArgs }, errStr);
      return {
        result: JSON.stringify({ error: errStr }),
        step
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

    const label = formatToolStartLabel(fnName, args);
    callbacks?.onToolCallStart?.({ id: toolCall.id, name: fnName, label });
    callbacks?.onStatus?.(label);
    this.logger.info(`Tool invocation: ${fnName}`, { args });

    const emitFinished = (
      result: string,
      proposal?: EventProposal
    ): { result: string; proposal?: EventProposal; step: AgentToolStepRecord } => {
      const { summary, ok } = formatToolResultSummary(fnName, result, proposal);
      const step: AgentToolStepRecord = {
        id: toolCall.id,
        name: fnName,
        label,
        summary,
        ok,
        durationMs: Date.now() - startedAt
      };
      callbacks?.onToolCallEnd?.(step);
      return { result, proposal, step };
    };

    try {
      switch (fnName) {
        case 'get_current_time': {
          const res = this.bridge.getCurrentTime();
          return emitFinished(JSON.stringify(res));
        }

        case 'get_calendar_sources': {
          const res = this.bridge.getCalendarSources();
          return emitFinished(JSON.stringify(res));
        }

        case 'get_user_categories': {
          const res = this.bridge.getUserCategories();
          return emitFinished(JSON.stringify(res));
        }

        case 'get_events': {
          const start = asString(args.startDate);
          const end = asString(args.endDate);
          const calId = asOptionalString(args.calendarId);
          const cat = asOptionalString(args.category);
          const res = this.bridge.getEvents(start, end, calId, cat);
          return emitFinished(JSON.stringify({ count: res.length, events: res }));
        }

        case 'get_event_by_id': {
          const id = asString(args.eventId);
          const res = this.bridge.getEventById(id);
          return emitFinished(JSON.stringify(res || { error: 'Event not found' }));
        }

        case 'browse_schedule_online': {
          const url = asString(args.url);
          const text = await browseScheduleOnline(url);
          return emitFinished(text);
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
          return emitFinished(
            JSON.stringify({
              status: 'PROPOSAL_STAGED',
              proposalId: proposal.id,
              message:
                'Proposal created and displayed to the user in the write bar. Awaiting user approval.'
            }),
            proposal
          );
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
          return emitFinished(
            JSON.stringify({
              status: 'PROPOSAL_STAGED',
              proposalId: proposal.id,
              message: 'Update proposal displayed for user approval.'
            }),
            proposal
          );
        }

        case 'propose_delete_event': {
          const proposal = this.bridge.stageDeleteEvent(
            asString(args.eventId),
            asOptionalString(args.reason)
          );
          callbacks?.onProposal?.(proposal);
          return emitFinished(
            JSON.stringify({
              status: 'PROPOSAL_STAGED',
              proposalId: proposal.id,
              message: 'Delete proposal displayed for user approval.'
            }),
            proposal
          );
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
          return emitFinished(
            JSON.stringify({
              status: 'PROPOSAL_STAGED',
              proposalId: proposal.id,
              count: proposal.items.length,
              message: `Batch proposal created with ${proposal.items.length} items. Displayed for user approval.`
            }),
            proposal
          );
        }

        default:
          return emitFinished(JSON.stringify({ error: `Unknown tool function: ${fnName}` }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error executing tool ${fnName}`, err as Error);
      return emitFinished(JSON.stringify({ error: `Tool execution failed: ${msg}` }));
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
      callbacks?.onUserMessageRecorded?.();

      let turns = 0;
      let firstProposalTurn: number | null = null;
      const sessionToolSteps: AgentToolStepRecord[] = [];

      while (turns < MAX_TURNS || (firstProposalTurn !== null && turns === firstProposalTurn)) {
        turns++;
        callbacks?.onTurnStart?.(turns, MAX_TURNS);

        // 2. Build system prompt with dynamic real-time context and prefix-cache-safe wire messages
        const systemPrompt = await this.specLoader.buildSystemPrompt();
        const windowedMessages = buildContextWindowMessages(this.messages, this.bridge);
        const fullMessages: ChatMessage[] = [
          { role: 'system', content: systemPrompt },
          ...windowedMessages
        ];

        // 3. Call LLM with a fresh per-turn idempotency key
        const idempotencyKey = generateRandomId('turn');
        const isForcedSummaryTurn = firstProposalTurn !== null && turns > MAX_TURNS;
        const toolsForTurn = isForcedSummaryTurn ? [] : AGENT_TOOLS;
        callbacks?.onStatus?.('Generating response...');
        let completion: CompletionResult;
        try {
          completion = await this.client.chatCompletion(fullMessages, toolsForTurn, {
            stream: true,
            signal,
            idempotencyKey,
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

        const hasToolCalls = Boolean(completion.toolCalls && completion.toolCalls.length > 0);
        const parsedReply = extractFollowUpSuggestions(completion.content || '');
        const cleanContent = parsedReply.cleanText;
        const suggestions = hasToolCalls ? [] : parsedReply.suggestions;

        // 4. Append assistant response
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: cleanContent || null,
          tool_calls: hasToolCalls ? completion.toolCalls : undefined,
          timestamp: Date.now(),
          ...(suggestions.length > 0 ? { suggestions } : {}),
          ...(!hasToolCalls && sessionToolSteps.length > 0
            ? { toolSteps: [...sessionToolSteps] }
            : {})
        };
        this.messages.push(assistantMsg);
        callbacks?.onTurnComplete?.(turns, cleanContent, suggestions);

        // 5. If no tools were invoked, we are done
        if (!hasToolCalls) {
          break;
        }

        // 6. Execute tool calls
        for (const tc of completion.toolCalls) {
          if (signal?.aborted) {
            callbacks?.onStatus?.('Cancelled');
            return;
          }

          const { result, proposal, step } = await this.executeTool(tc, callbacks);
          sessionToolSteps.push(step);
          if (proposal) {
            if (firstProposalTurn === null) {
              firstProposalTurn = turns;
            }
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

        // Allow one follow-up turn after proposals are first staged so the assistant can summarize & suggest next steps
        if (firstProposalTurn !== null && turns > firstProposalTurn) {
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
