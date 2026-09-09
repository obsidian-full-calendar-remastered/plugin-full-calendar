/**
 * @file AgentAuditLogger.ts
 * @brief Handles structured audit logging for all agent actions and diagnostics.
 *
 * @license See LICENSE.md
 */

import type { AgentStorage } from './AgentStorage';
import type { AuditEntry, AuditLevel } from '../types';

export class AgentAuditLogger {
  private storage: AgentStorage;

  constructor(storage: AgentStorage) {
    this.storage = storage;
  }

  private generateId(): string {
    return `aud_${Math.random().toString(36).substring(2, 9)}${Date.now().toString(36)}`;
  }

  public log(
    level: AuditLevel,
    action: string,
    options?: {
      model?: string;
      endpoint?: string;
      durationMs?: number;
      tokenUsage?: { prompt: number; completion: number; total: number };
      details?: Record<string, unknown>;
      error?: string;
    }
  ): void {
    const entry: AuditEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      level,
      action,
      model: options?.model,
      endpoint: options?.endpoint,
      durationMs: options?.durationMs,
      tokenUsage: options?.tokenUsage,
      details: options?.details,
      error: options?.error
    };

    // Non-blocking log persistence
    void this.storage.appendAuditEntry(entry);
  }

  public info(action: string, details?: Record<string, unknown>): void {
    this.log('INFO', action, { details });
  }

  public warn(action: string, details?: Record<string, unknown>, error?: string): void {
    this.log('WARN', action, { details, error });
  }

  public error(action: string, error: string | Error, details?: Record<string, unknown>): void {
    const errorMsg =
      error instanceof Error ? `${error.message}\n${error.stack || ''}` : String(error);
    this.log('ERROR', action, { details, error: errorMsg });
  }

  public proposal(action: string, proposalType: string, details?: Record<string, unknown>): void {
    this.log('PROPOSAL', action, {
      details: {
        proposalType,
        ...details
      }
    });
  }

  public getRecentEntries(limit = 100): Promise<AuditEntry[]> {
    return this.storage.readAuditEntries(limit);
  }

  public clearLogs(): Promise<void> {
    return this.storage.clearAuditLogs();
  }

  public exportLogs(): Promise<string> {
    return this.storage.exportAuditLogs();
  }
}
