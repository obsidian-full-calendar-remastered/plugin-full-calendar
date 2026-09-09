/**
 * @file types.ts
 * @brief Core types and interfaces for the Full Calendar Agent feature.
 *
 * @license See LICENSE.md
 */

import type { OFCEvent } from '../../types';

// ============================================================================
// CHAT & LLM PROTOCOL TYPES (OpenAI Compatible)
// ============================================================================

export interface CurrentTimeInfo {
  currentIsoTimestamp: string;
  currentDate: string;
  currentTime24h: string;
  dayOfWeek: string;
  displayTimezone: string;
  timeFormat24h: boolean;
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCallFunction {
  name: string;
  arguments: string; // JSON string
}

export interface ChatToolCall {
  id: string;
  type: 'function';
  function: ToolCallFunction;
}

export interface ChatMessage {
  id?: string;
  role: ChatRole;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ChatToolCall[];
  timestamp?: number;
}

export interface ToolParameterProperty {
  type: string;
  description?: string;
  items?: { type: string; properties?: Record<string, ToolParameterProperty>; required?: string[] };
  enum?: string[];
}

export interface ToolFunctionDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
  };
}

export interface ToolDefinition {
  type: 'function';
  function: ToolFunctionDefinition;
}

export interface ChatCompletionChunkDelta {
  role?: ChatRole;
  content?: string | null;
  tool_calls?: {
    index: number;
    id?: string;
    type?: 'function';
    function?: {
      name?: string;
      arguments?: string;
    };
  }[];
}

export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: ChatCompletionChunkDelta;
    finish_reason: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================================================
// STAGED PROPOSALS (WRITE-APPROVAL GATE)
// ============================================================================

export type ProposalType = 'CREATE' | 'UPDATE' | 'DELETE' | 'BATCH_CREATE';
export type ProposalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'APPLIED' | 'FAILED';

export interface BaseProposal {
  id: string;
  type: ProposalType;
  status: ProposalStatus;
  createdAt: number;
  calendarId: string;
  calendarName: string;
}

export interface CreateEventProposal extends BaseProposal {
  type: 'CREATE';
  eventData: OFCEvent;
  cleanTitle: string;
  category?: string;
  subCategory?: string;
}

export interface UpdateEventProposal extends BaseProposal {
  type: 'UPDATE';
  eventId: string;
  originalEvent: OFCEvent;
  updatedEvent: OFCEvent;
  changedFields: Record<string, { old: unknown; new: unknown }>;
}

export interface DeleteEventProposal extends BaseProposal {
  type: 'DELETE';
  eventId: string;
  eventTitle: string;
  reason?: string;
}

export interface BatchCreateItem {
  id: string;
  selected: boolean;
  calendarId: string;
  eventData: OFCEvent;
  cleanTitle: string;
  category?: string;
  subCategory?: string;
}

export interface BatchCreateProposal extends BaseProposal {
  type: 'BATCH_CREATE';
  items: BatchCreateItem[];
}

export type EventProposal =
  CreateEventProposal | UpdateEventProposal | DeleteEventProposal | BatchCreateProposal;

// ============================================================================
// AUDIT LOGGING & SESSION HISTORY
// ============================================================================

export type AuditLevel = 'INFO' | 'WARN' | 'ERROR' | 'PROPOSAL';

export interface AuditEntry {
  id: string;
  timestamp: number;
  level: AuditLevel;
  action: string;
  model?: string;
  endpoint?: string;
  durationMs?: number;
  tokenUsage?: { prompt: number; completion: number; total: number };
  details?: Record<string, unknown>;
  error?: string;
}

export interface AgentSessionState {
  conversationId: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  pendingProposals: EventProposal[];
}
