/**
 * @file AgentStorage.ts
 * @brief Manages agent file storage strictly within the plugin directory.
 *
 * @description
 * All agent files (cached specs, chat history, audit logs) reside strictly within
 * the plugin's installation directory in Obsidian's config directory:
 *   `<vault>/.obsidian/plugins/<plugin-id>/agent/`
 *
 * This ensures that:
 * 1. The vault root and user notes are never polluted.
 * 2. Deleting the plugin directory deletes all agent data completely.
 *
 * @license See LICENSE.md
 */

import { App, normalizePath } from 'obsidian';
import type FullCalendarPlugin from '../../../main';
import type { AuditEntry, ChatMessage, AgentSession } from '../types';

const AGENT_SUBDIR = 'agent';
const SPEC_FILE = 'agent-spec.md';
const HISTORY_FILE = 'history.json';
const SESSIONS_FILE = 'sessions.json';
const AUDIT_FILE = 'audit.jsonl';
const MAX_AUDIT_LINES = 1000;

interface SessionsData {
  activeSessionId: string | null;
  sessions: AgentSession[];
}

export class AgentStorage {
  private app: App;
  private plugin: FullCalendarPlugin;
  private baseDir: string;
  private initialized = false;
  private cachedSessions: SessionsData | null = null;

  constructor(plugin: FullCalendarPlugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    const configDir = this.app.vault.configDir;
    const pluginId = this.plugin.manifest.id;
    this.baseDir = normalizePath(`${configDir}/plugins/${pluginId}/${AGENT_SUBDIR}`);
  }

  /**
   * Ensures the agent storage directory exists inside the plugin folder.
   */
  public async ensureDir(): Promise<void> {
    if (this.initialized) return;
    try {
      const exists = await this.app.vault.adapter.exists(this.baseDir);
      if (!exists) {
        await this.app.vault.adapter.mkdir(this.baseDir);
      }
      this.initialized = true;
    } catch (err) {
      console.warn('AgentStorage: Failed to ensure directory exists:', err);
    }
  }

  private getFilePath(filename: string): string {
    return normalizePath(`${this.baseDir}/${filename}`);
  }

  // ==========================================================================
  // CACHED SPEC
  // ==========================================================================

  public async saveCachedSpec(content: string): Promise<void> {
    await this.ensureDir();
    try {
      await this.app.vault.adapter.write(this.getFilePath(SPEC_FILE), content);
    } catch (err) {
      console.error('AgentStorage: Failed to save cached spec:', err);
    }
  }

  public async loadCachedSpec(): Promise<string | null> {
    await this.ensureDir();
    try {
      const path = this.getFilePath(SPEC_FILE);
      const exists = await this.app.vault.adapter.exists(path);
      if (!exists) return null;
      return await this.app.vault.adapter.read(path);
    } catch {
      return null;
    }
  }

  // ==========================================================================
  // MULTI-SESSION STORAGE & HISTORY
  // ==========================================================================

  public async loadAllSessions(forceReload = false): Promise<SessionsData> {
    if (!forceReload && this.cachedSessions) {
      return this.cachedSessions;
    }

    await this.ensureDir();
    try {
      const sessionsPath = this.getFilePath(SESSIONS_FILE);
      if (await this.app.vault.adapter.exists(sessionsPath)) {
        const raw = await this.app.vault.adapter.read(sessionsPath);
        const parsed = JSON.parse(raw) as unknown;
        if (
          parsed &&
          typeof parsed === 'object' &&
          'sessions' in parsed &&
          Array.isArray((parsed as SessionsData).sessions)
        ) {
          const sessionsData = parsed as SessionsData;
          if (sessionsData.sessions.length > 0) {
            this.cachedSessions = sessionsData;
            return sessionsData;
          }
        }
      }

      // Backward compatibility: migrate legacy history.json if present
      const historyPath = this.getFilePath(HISTORY_FILE);
      let initialMessages: ChatMessage[] = [];
      if (await this.app.vault.adapter.exists(historyPath)) {
        try {
          const content = await this.app.vault.adapter.read(historyPath);
          const parsed = JSON.parse(content) as unknown;
          if (Array.isArray(parsed)) {
            initialMessages = parsed as ChatMessage[];
          }
        } catch {
          initialMessages = [];
        }
      }

      const defaultSession: AgentSession = {
        id: `session-${Date.now()}`,
        title: initialMessages[0]?.content
          ? initialMessages[0].content.slice(0, 30).trim()
          : 'Default session',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: initialMessages,
        proposals: []
      };

      const initialData: SessionsData = {
        activeSessionId: defaultSession.id,
        sessions: [defaultSession]
      };

      await this.saveAllSessions(initialData);
      this.cachedSessions = initialData;
      return initialData;
    } catch (err) {
      console.error('AgentStorage: Failed to load sessions:', err);
      const fallback: AgentSession = {
        id: `session-${Date.now()}`,
        title: 'Default session',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        proposals: []
      };
      const fallbackData = { activeSessionId: fallback.id, sessions: [fallback] };
      this.cachedSessions = fallbackData;
      return fallbackData;
    }
  }

  public async saveAllSessions(data: SessionsData): Promise<void> {
    await this.ensureDir();
    this.cachedSessions = data;
    try {
      const sessionsPath = this.getFilePath(SESSIONS_FILE);
      await this.app.vault.adapter.write(sessionsPath, JSON.stringify(data, null, 2));

      // Also mirror the active session messages to history.json for backward compatibility
      const active = data.sessions.find(s => s.id === data.activeSessionId);
      if (active) {
        const historyPath = this.getFilePath(HISTORY_FILE);
        await this.app.vault.adapter.write(historyPath, JSON.stringify(active.messages, null, 2));
      }
    } catch (err) {
      console.error('AgentStorage: Failed to save sessions:', err);
    }
  }

  public async getActiveSession(): Promise<AgentSession> {
    const data = await this.loadAllSessions();
    const active = data.sessions.find(s => s.id === data.activeSessionId);
    if (active) return active;
    if (data.sessions.length > 0) {
      data.activeSessionId = data.sessions[0].id;
      await this.saveAllSessions(data);
      return data.sessions[0];
    }
    return await this.createSession();
  }

  public async createSession(title?: string): Promise<AgentSession> {
    const data = await this.loadAllSessions();
    const newSession: AgentSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: title?.trim() || `Session ${data.sessions.length + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      proposals: []
    };
    data.sessions.unshift(newSession); // Prepend so newest is first
    data.activeSessionId = newSession.id;
    await this.saveAllSessions(data);
    return newSession;
  }

  public async saveSession(session: AgentSession): Promise<void> {
    const data = await this.loadAllSessions();
    const index = data.sessions.findIndex(s => s.id === session.id);
    session.updatedAt = Date.now();
    if (index >= 0) {
      data.sessions[index] = session;
    } else {
      data.sessions.unshift(session);
    }
    await this.saveAllSessions(data);
  }

  public async deleteSession(id: string): Promise<AgentSession> {
    const data = await this.loadAllSessions();
    data.sessions = data.sessions.filter(s => s.id !== id);
    if (data.sessions.length === 0) {
      const fresh = await this.createSession();
      return fresh;
    }
    if (data.activeSessionId === id) {
      data.activeSessionId = data.sessions[0].id;
    }
    await this.saveAllSessions(data);
    return data.sessions.find(s => s.id === data.activeSessionId) || data.sessions[0];
  }

  public async setActiveSessionId(id: string): Promise<AgentSession | null> {
    const data = await this.loadAllSessions();
    const target = data.sessions.find(s => s.id === id);
    if (!target) return null;
    data.activeSessionId = id;
    await this.saveAllSessions(data);
    return target;
  }

  public async saveHistory(messages: ChatMessage[]): Promise<void> {
    const active = await this.getActiveSession();
    active.messages = messages;
    if (messages.length > 0 && active.title === 'Default session') {
      const firstUser = messages.find(m => m.role === 'user');
      if (firstUser?.content) {
        active.title = firstUser.content.slice(0, 30).trim();
      }
    }
    await this.saveSession(active);
  }

  public async loadHistory(): Promise<ChatMessage[]> {
    const active = await this.getActiveSession();
    return active.messages;
  }

  public async clearHistory(): Promise<void> {
    const active = await this.getActiveSession();
    active.messages = [];
    active.proposals = [];
    await this.saveSession(active);
  }

  // ==========================================================================
  // AUDIT LOGGING (JSONL)
  // ==========================================================================

  public async appendAuditEntry(entry: AuditEntry): Promise<void> {
    await this.ensureDir();
    try {
      const path = this.getFilePath(AUDIT_FILE);
      const line = `${JSON.stringify(entry)}\n`;
      const exists = await this.app.vault.adapter.exists(path);
      if (!exists) {
        await this.app.vault.adapter.write(path, line);
      } else {
        const current = await this.app.vault.adapter.read(path);
        const lines = current.split('\n').filter(Boolean);
        // Prune old lines if exceeding maximum capacity
        if (lines.length >= MAX_AUDIT_LINES) {
          const trimmed = lines.slice(lines.length - (MAX_AUDIT_LINES - 50));
          trimmed.push(JSON.stringify(entry));
          await this.app.vault.adapter.write(path, `${trimmed.join('\n')}\n`);
        } else {
          await this.app.vault.adapter.write(path, `${current}${line}`);
        }
      }
    } catch (err) {
      console.warn('AgentStorage: Failed to append audit log:', err);
    }
  }

  public async readAuditEntries(limit = 100): Promise<AuditEntry[]> {
    await this.ensureDir();
    try {
      const path = this.getFilePath(AUDIT_FILE);
      const exists = await this.app.vault.adapter.exists(path);
      if (!exists) return [];
      const content = await this.app.vault.adapter.read(path);
      const lines = content.split('\n').filter(Boolean);
      const selected = lines.slice(-limit);
      const entries: AuditEntry[] = [];
      for (const line of selected) {
        try {
          entries.push(JSON.parse(line) as AuditEntry);
        } catch {
          // Skip corrupt lines
        }
      }
      return entries.reverse(); // Newest first
    } catch {
      return [];
    }
  }

  public async clearAuditLogs(): Promise<void> {
    await this.ensureDir();
    try {
      const path = this.getFilePath(AUDIT_FILE);
      if (await this.app.vault.adapter.exists(path)) {
        await this.app.vault.adapter.remove(path);
      }
    } catch (err) {
      console.error('AgentStorage: Failed to clear audit logs:', err);
    }
  }

  public async exportAuditLogs(): Promise<string> {
    await this.ensureDir();
    try {
      const path = this.getFilePath(AUDIT_FILE);
      if (!(await this.app.vault.adapter.exists(path))) return '';
      return await this.app.vault.adapter.read(path);
    } catch {
      return '';
    }
  }
}
