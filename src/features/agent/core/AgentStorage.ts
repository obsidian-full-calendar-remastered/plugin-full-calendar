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
import type { AuditEntry, ChatMessage } from '../types';

const AGENT_SUBDIR = 'agent';
const SPEC_FILE = 'agent-spec.md';
const HISTORY_FILE = 'history.json';
const AUDIT_FILE = 'audit.jsonl';
const MAX_AUDIT_LINES = 1000;

export class AgentStorage {
  private app: App;
  private plugin: FullCalendarPlugin;
  private baseDir: string;
  private initialized = false;

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
  // CHAT HISTORY
  // ==========================================================================

  public async saveHistory(messages: ChatMessage[]): Promise<void> {
    await this.ensureDir();
    try {
      const data = JSON.stringify(messages, null, 2);
      await this.app.vault.adapter.write(this.getFilePath(HISTORY_FILE), data);
    } catch (err) {
      console.error('AgentStorage: Failed to save history:', err);
    }
  }

  public async loadHistory(): Promise<ChatMessage[]> {
    await this.ensureDir();
    try {
      const path = this.getFilePath(HISTORY_FILE);
      const exists = await this.app.vault.adapter.exists(path);
      if (!exists) return [];
      const content = await this.app.vault.adapter.read(path);
      return JSON.parse(content) as ChatMessage[];
    } catch {
      return [];
    }
  }

  public async clearHistory(): Promise<void> {
    await this.ensureDir();
    try {
      const path = this.getFilePath(HISTORY_FILE);
      if (await this.app.vault.adapter.exists(path)) {
        await this.app.vault.adapter.remove(path);
      }
    } catch (err) {
      console.error('AgentStorage: Failed to clear history:', err);
    }
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
