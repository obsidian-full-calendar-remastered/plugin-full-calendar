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

export interface AgentActiveRunSnapshot {
  runId: string;
  sessionId: string | null;
  startedAt: number;
  statusText: string;
  streamingText: string;
  steps: AgentToolStepRecord[];
  inFlightTools: { id: string; name: string; label: string }[];
}

export type AgentEngineEvent =
  | { type: 'run-start'; runId: string; startedAt: number; userMessage: ChatMessage }
  | { type: 'status'; runId: string; statusText: string }
  | { type: 'turn-start'; runId: string; turn: number; maxTurns: number }
  | { type: 'chunk'; runId: string; chunk: string }
  | {
      type: 'turn-complete';
      runId: string;
      turn: number;
      cleanContent: string;
      suggestions: string[];
    }
  | { type: 'tool-start'; runId: string; info: { id: string; name: string; label: string } }
  | { type: 'tool-end'; runId: string; step: AgentToolStepRecord }
  | { type: 'proposal-staged'; runId: string; proposal: EventProposal }
  | {
      type: 'proposal-updated';
      proposalId: string;
      status: EventProposal['status'];
      errorMessage?: string;
      originPanelId?: string;
    }
  | {
      type: 'proposal-selection-changed';
      proposalId: string;
      originPanelId?: string;
    }
  | { type: 'settings-changed' }
  | {
      type: 'retry';
      runId: string;
      attempt: number;
      maxRetries: number;
      delayMs: number;
      reason: string;
    }
  | { type: 'session-changed'; sessionId: string | null }
  | { type: 'run-end'; runId: string; outcome: 'done' | 'cancelled' | 'error'; error?: string };

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

function formatPreparingToolCallsStatus(toolCalls: ChatToolCall[]): string {
  const count = toolCalls.length;
  let latestName = '';
  for (let i = toolCalls.length - 1; i >= 0; i--) {
    const candidate = toolCalls[i]?.function?.name?.trim();
    if (candidate) {
      latestName = candidate;
      break;
    }
  }

  switch (latestName) {
    case 'propose_update_event':
      return count > 1 ? `Preparing ${count} event updates...` : 'Preparing event update...';
    case 'propose_create_event':
      return count > 1 ? `Preparing ${count} new events...` : 'Preparing new event...';
    case 'propose_delete_event':
      return count > 1 ? `Preparing ${count} deletions...` : 'Preparing event deletion...';
    case 'propose_batch_create_events':
      return 'Preparing batch import...';
    case 'get_events':
      return 'Preparing calendar query...';
    case 'get_event_by_id':
      return 'Preparing event inspection...';
    case 'browse_schedule_online':
      return 'Preparing web schedule fetch...';
    default:
      return latestName ? `Preparing ${latestName}...` : 'Preparing tool call...';
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
  private initPromise: Promise<void> | null = null;
  private listeners = new Set<(event: AgentEngineEvent) => void>();
  private activeRunId: string | null = null;
  private activeRunController: AbortController | null = null;
  private activeRunSnapshot: AgentActiveRunSnapshot | null = null;

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

  /**
   * Subscribes a view or observer to live run, session, and proposal events.
   */
  public subscribe(listener: (event: AgentEngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: AgentEngineEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (err) {
        this.logger.warn(
          'Engine subscriber listener failed',
          { eventType: event.type },
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  }

  public isRunning(): boolean {
    return this.isProcessing;
  }

  public getActiveRunSnapshot(): AgentActiveRunSnapshot | null {
    const currentSessionId = this.currentSession?.id ?? null;
    if (!this.activeRunSnapshot || this.activeRunSnapshot.sessionId !== currentSessionId) {
      return null;
    }
    return {
      ...this.activeRunSnapshot,
      steps: [...this.activeRunSnapshot.steps],
      inFlightTools: [...this.activeRunSnapshot.inFlightTools]
    };
  }

  /**
   * Aborts whichever run is currently in flight regardless of which UI panel started it.
   */
  public abortActiveRun(): void {
    if (this.activeRunController && !this.activeRunController.signal.aborted) {
      this.activeRunController.abort();
    }
  }

  /**
   * Aborts and immediately detaches the active run before switching or clearing sessions
   * so stale run state/snapshots never leak into the new session.
   */
  private detachActiveRun(): void {
    const prevRunId = this.activeRunId;
    if (this.activeRunController && !this.activeRunController.signal.aborted) {
      this.activeRunController.abort();
    }
    this.isProcessing = false;
    this.activeRunId = null;
    this.activeRunController = null;
    this.activeRunSnapshot = null;
    if (prevRunId) {
      this.emit({ type: 'status', runId: prevRunId, statusText: '' });
      this.emit({ type: 'run-end', runId: prevRunId, outcome: 'cancelled' });
    }
  }

  /**
   * Broadcasts an interactive proposal decision across all mounted panels.
   */
  public notifyProposalUpdated(
    proposalId: string,
    status: EventProposal['status'],
    errorMessage?: string,
    originPanelId?: string
  ): void {
    const stored = this.currentSession?.proposals?.find(p => p.id === proposalId);
    if (stored) {
      stored.status = status;
    }
    this.emit({ type: 'proposal-updated', proposalId, status, errorMessage, originPanelId });
  }

  /**
   * Broadcasts a batch item checkbox selection change across mounted panels.
   */
  public notifyProposalSelectionChanged(proposalId: string, originPanelId?: string): void {
    this.emit({ type: 'proposal-selection-changed', proposalId, originPanelId });
  }

  /**
   * Broadcasts settings updates (e.g., time format or advanced categorization toggles).
   */
  public notifySettingsUpdated(): void {
    this.emit({ type: 'settings-changed' });
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
    if (this.isProcessing || this.currentSession) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = (async () => {
      try {
        const session = await this.storage.getActiveSession();
        if (!this.isProcessing && !this.currentSession) {
          this.currentSession = session;
          this.messages = session.messages;
          this.emit({ type: 'session-changed', sessionId: this.currentSession?.id ?? null });
        }
      } finally {
        this.initPromise = null;
      }
    })();
    return this.initPromise;
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
    this.detachActiveRun();
    const session = await this.storage.createSession(title);
    this.currentSession = session;
    this.messages = session.messages;
    this.logger.info(`Created new session: ${session.id} (${session.title})`);
    this.emit({ type: 'session-changed', sessionId: session.id });
    return session;
  }

  public async switchSession(sessionId: string): Promise<AgentSession | null> {
    const session = await this.storage.setActiveSessionId(sessionId);
    if (session) {
      this.detachActiveRun();
      this.currentSession = session;
      this.messages = session.messages;
      this.logger.info(`Switched to session: ${session.id} (${session.title})`);
      this.emit({ type: 'session-changed', sessionId: session.id });
    }
    return session;
  }

  public async deleteSession(sessionId: string): Promise<AgentSession> {
    this.detachActiveRun();
    const newActive = await this.storage.deleteSession(sessionId);
    this.currentSession = newActive;
    this.messages = newActive.messages;
    this.logger.info(`Deleted session: ${sessionId}, now on: ${newActive.id}`);
    this.emit({ type: 'session-changed', sessionId: newActive.id });
    return newActive;
  }

  public async saveCurrentSession(): Promise<void> {
    if (this.currentSession) {
      await this.storage.saveSession(this.currentSession);
    }
  }

  public async clearHistory(): Promise<void> {
    this.detachActiveRun();
    this.messages = [];
    if (this.currentSession) {
      this.currentSession.messages = [];
      this.currentSession.proposals = [];
      await this.storage.saveSession(this.currentSession);
    } else {
      await this.storage.clearHistory();
    }
    this.logger.info('Conversation history cleared by user');
    this.emit({ type: 'session-changed', sessionId: this.currentSession?.id ?? null });
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

  private isRunCurrent(runId: string): boolean {
    return (
      this.activeRunId === runId &&
      Boolean(this.activeRunController && !this.activeRunController.signal.aborted)
    );
  }

  private notifyToolStart(
    runId: string,
    info: { id: string; name: string; label: string },
    callbacks?: EngineCallbacks
  ): void {
    if (!this.isRunCurrent(runId)) {
      return;
    }
    if (this.activeRunSnapshot && this.activeRunSnapshot.runId === runId) {
      this.activeRunSnapshot.inFlightTools.push(info);
      this.activeRunSnapshot.statusText = info.label;
    }
    this.emit({ type: 'tool-start', runId, info });
    this.emit({ type: 'status', runId, statusText: info.label });
    callbacks?.onToolCallStart?.(info);
    callbacks?.onStatus?.(info.label);
  }

  private notifyToolEnd(
    runId: string,
    step: AgentToolStepRecord,
    callbacks?: EngineCallbacks
  ): void {
    if (!this.isRunCurrent(runId)) {
      return;
    }
    if (this.activeRunSnapshot && this.activeRunSnapshot.runId === runId) {
      this.activeRunSnapshot.inFlightTools = this.activeRunSnapshot.inFlightTools.filter(
        t => t.id !== step.id
      );
      this.activeRunSnapshot.steps.push(step);
    }
    this.emit({ type: 'tool-end', runId, step });
    callbacks?.onToolCallEnd?.(step);
  }

  private recordStagedProposal(
    runId: string,
    proposal: EventProposal,
    callbacks?: EngineCallbacks
  ): void {
    if (!this.isRunCurrent(runId)) {
      return;
    }
    if (this.currentSession) {
      if (!this.currentSession.proposals) {
        this.currentSession.proposals = [];
      }
      this.currentSession.proposals.push(proposal);
    }
    this.emit({ type: 'proposal-staged', runId, proposal });
    callbacks?.onProposal?.(proposal);
  }

  /**
   * Executes a tool called by the LLM against the calendar bridge or web tool.
   */
  private async executeTool(
    toolCall: ChatToolCall,
    runId: string,
    signal: AbortSignal,
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
      this.notifyToolStart(runId, { id: toolCall.id, name: fnName, label }, callbacks);
      const step: AgentToolStepRecord = {
        id: toolCall.id,
        name: fnName,
        label,
        summary: 'Invalid tool arguments',
        ok: false,
        durationMs: Date.now() - startedAt
      };
      this.notifyToolEnd(runId, step, callbacks);
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
    this.notifyToolStart(runId, { id: toolCall.id, name: fnName, label }, callbacks);
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
      this.notifyToolEnd(runId, step, callbacks);
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
          const text = await browseScheduleOnline(url, signal);
          if (signal.aborted) {
            throw new Error('Agent request was cancelled by user.');
          }
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
          this.recordStagedProposal(runId, proposal, callbacks);
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
          this.recordStagedProposal(runId, proposal, callbacks);
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
          this.recordStagedProposal(runId, proposal, callbacks);
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
          this.recordStagedProposal(runId, proposal, callbacks);
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
    const runId = generateRandomId('run');
    const startedAt = Date.now();
    const runController = new AbortController();
    this.activeRunId = runId;
    this.activeRunController = runController;
    const onExternalAbort = (): void => {
      runController.abort();
    };
    if (signal) {
      if (signal.aborted) {
        runController.abort();
      } else {
        signal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }
    const runSignal = runController.signal;
    const activeSessionAtStart = this.currentSession;

    this.activeRunSnapshot = {
      runId,
      sessionId: activeSessionAtStart?.id ?? null,
      startedAt,
      statusText: 'Thinking...',
      streamingText: '',
      steps: [],
      inFlightTools: []
    };

    let outcome: 'done' | 'cancelled' | 'error' = 'done';
    let runError: string | undefined;
    const isRunActive = (): boolean =>
      !runSignal.aborted &&
      this.activeRunId === runId &&
      this.currentSession === activeSessionAtStart;

    try {
      // 1. Append user message
      const userMsg: ChatMessage = {
        role: 'user',
        content: trimmedInput,
        timestamp: Date.now()
      };
      this.messages.push(userMsg);
      this.emit({ type: 'run-start', runId, startedAt, userMessage: userMsg });
      this.emit({ type: 'status', runId, statusText: 'Thinking...' });
      callbacks?.onUserMessageRecorded?.();
      callbacks?.onStatus?.('Thinking...');

      let turns = 0;
      let firstProposalTurn: number | null = null;
      const sessionToolSteps: AgentToolStepRecord[] = [];

      while (turns < MAX_TURNS || (firstProposalTurn !== null && turns === firstProposalTurn)) {
        if (!isRunActive()) {
          outcome = 'cancelled';
          if (this.activeRunId === runId) {
            callbacks?.onStatus?.('Cancelled');
          }
          return;
        }

        turns++;
        if (this.activeRunSnapshot && this.activeRunSnapshot.runId === runId) {
          this.activeRunSnapshot.streamingText = '';
        }
        this.emit({ type: 'turn-start', runId, turn: turns, maxTurns: MAX_TURNS });
        callbacks?.onTurnStart?.(turns, MAX_TURNS);

        // 2. Build system prompt with dynamic real-time context and prefix-cache-safe wire messages
        const systemPrompt = await this.specLoader.buildSystemPrompt();
        if (!isRunActive()) {
          outcome = 'cancelled';
          if (this.activeRunId === runId) {
            callbacks?.onStatus?.('Cancelled');
          }
          return;
        }

        const windowedMessages = buildContextWindowMessages(this.messages, this.bridge);
        const fullMessages: ChatMessage[] = [
          { role: 'system', content: systemPrompt },
          ...windowedMessages
        ];

        // 3. Call LLM with a fresh per-turn idempotency key
        const idempotencyKey = generateRandomId('turn');
        const isForcedSummaryTurn = firstProposalTurn !== null && turns > MAX_TURNS;
        const toolsForTurn = isForcedSummaryTurn ? [] : AGENT_TOOLS;
        if (this.activeRunSnapshot && this.activeRunSnapshot.runId === runId) {
          this.activeRunSnapshot.statusText = 'Generating response...';
        }
        this.emit({ type: 'status', runId, statusText: 'Generating response...' });
        callbacks?.onStatus?.('Generating response...');

        let lastStreamingStatus = '';
        const updateStreamingStatus = (nextStatus: string): void => {
          if (!isRunActive() || !nextStatus || nextStatus === lastStreamingStatus) {
            return;
          }
          lastStreamingStatus = nextStatus;
          if (this.activeRunSnapshot && this.activeRunSnapshot.runId === runId) {
            this.activeRunSnapshot.statusText = nextStatus;
          }
          this.emit({ type: 'status', runId, statusText: nextStatus });
          callbacks?.onStatus?.(nextStatus);
        };

        let completion: CompletionResult;
        try {
          completion = await this.client.chatCompletion(fullMessages, toolsForTurn, {
            stream: true,
            signal: runSignal,
            idempotencyKey,
            callbacks: {
              onChunk: (chunk: string) => {
                if (!isRunActive()) {
                  return;
                }
                lastStreamingStatus = '';
                if (this.activeRunSnapshot && this.activeRunSnapshot.runId === runId) {
                  this.activeRunSnapshot.streamingText += chunk;
                  this.activeRunSnapshot.statusText = '';
                }
                this.emit({ type: 'chunk', runId, chunk });
                callbacks?.onChunk?.(chunk);
              },
              onReasoningDelta: (delta: string) => {
                if (!isRunActive()) {
                  return;
                }
                updateStreamingStatus('Reasoning...');
                callbacks?.onReasoningDelta?.(delta);
              },
              onToolCallDelta: (toolCalls: ChatToolCall[]) => {
                if (!isRunActive()) {
                  return;
                }
                updateStreamingStatus(formatPreparingToolCallsStatus(toolCalls));
                callbacks?.onToolCallDelta?.(toolCalls);
              },
              onRetry: (attempt: number, maxRetries: number, delayMs: number, reason: string) => {
                if (!isRunActive()) {
                  return;
                }
                const lowerReason = (reason || '').toLowerCase();
                const isRateLimit = lowerReason.includes('429') || lowerReason.includes('rate');
                const retryStatus = isRateLimit
                  ? `Rate limited - retrying (${attempt}/${maxRetries})...`
                  : `Retrying request (${attempt}/${maxRetries})...`;
                lastStreamingStatus = retryStatus;
                if (this.activeRunSnapshot && this.activeRunSnapshot.runId === runId) {
                  this.activeRunSnapshot.statusText = retryStatus;
                }
                this.emit({ type: 'retry', runId, attempt, maxRetries, delayMs, reason });
                this.emit({ type: 'status', runId, statusText: retryStatus });
                callbacks?.onRetry?.(attempt, maxRetries, delayMs, reason);
              }
            }
          });
        } catch (callErr) {
          if (runSignal.aborted || this.activeRunId !== runId) {
            outcome = 'cancelled';
            if (this.activeRunId === runId) {
              callbacks?.onStatus?.('Cancelled');
            }
            return;
          }
          throw callErr;
        }

        if (!isRunActive()) {
          outcome = 'cancelled';
          if (this.activeRunId === runId) {
            callbacks?.onStatus?.('Cancelled');
          }
          return;
        }

        // Response received: immediately clear status indicator
        if (this.activeRunSnapshot && this.activeRunSnapshot.runId === runId) {
          this.activeRunSnapshot.statusText = '';
          this.activeRunSnapshot.streamingText = '';
        }
        this.emit({ type: 'status', runId, statusText: '' });
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
        this.emit({
          type: 'turn-complete',
          runId,
          turn: turns,
          cleanContent,
          suggestions
        });
        callbacks?.onTurnComplete?.(turns, cleanContent, suggestions);

        // 5. If no tools were invoked, we are done
        if (!hasToolCalls) {
          break;
        }

        // 6. Execute tool calls
        for (const tc of completion.toolCalls) {
          if (!isRunActive()) {
            outcome = 'cancelled';
            if (this.activeRunId === runId) {
              callbacks?.onStatus?.('Cancelled');
            }
            return;
          }

          const { result, proposal, step } = await this.executeTool(
            tc,
            runId,
            runSignal,
            callbacks
          );
          sessionToolSteps.push(step);
          if (proposal && firstProposalTurn === null) {
            firstProposalTurn = turns;
          }

          if (!isRunActive()) {
            outcome = 'cancelled';
            if (this.activeRunId === runId) {
              callbacks?.onStatus?.('Cancelled');
            }
            return;
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

      if (!isRunActive()) {
        outcome = 'cancelled';
        return;
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
      if (!isRunActive()) {
        outcome = 'cancelled';
        return;
      }
      callbacks?.onDone?.();
    } catch (err) {
      if (
        runSignal.aborted ||
        this.activeRunId !== runId ||
        this.currentSession !== activeSessionAtStart
      ) {
        outcome = 'cancelled';
        if (this.activeRunId === runId) {
          callbacks?.onStatus?.('Cancelled');
        }
        return;
      }
      outcome = 'error';
      const msg = err instanceof Error ? err.message : String(err);
      runError = msg;
      this.logger.error('Agent Engine failed', err as Error);
      callbacks?.onError?.(msg);
      throw err;
    } finally {
      signal?.removeEventListener('abort', onExternalAbort);
      if (this.activeRunId === runId) {
        this.isProcessing = false;
        this.activeRunId = null;
        this.activeRunController = null;
        this.activeRunSnapshot = null;
        callbacks?.onStatus?.('');
        this.emit({ type: 'status', runId, statusText: '' });
        this.emit({ type: 'run-end', runId, outcome, error: runError });
      }
    }
  }
}
