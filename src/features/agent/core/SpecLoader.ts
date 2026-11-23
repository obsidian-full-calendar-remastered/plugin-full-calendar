/**
 * @file SpecLoader.ts
 * @brief Downloads, caches, and compiles the agent system prompt and specifications.
 *
 * @description
 * Fetches the raw markdown specification from GitHub docs on first run,
 * caching it inside the plugin directory. If offline or unavailable, falls back
 * to the bundled default spec. Compiles dynamic runtime context (categories,
 * calendars, time, timezone) into the system prompt.
 *
 * @license See LICENSE.md
 */

import { App, normalizePath, requestUrl } from 'obsidian';
import { PluginState } from '../../../core/PluginState';
import { DEFAULT_AGENT_SPEC } from '../defaultAgentSpec';
import { DEFAULT_AGENT_SPEC_URL } from './agentSettings';
import { AGENT_SPEC_RELATIVE_PATH, utf8ByteLength, type AgentStorage } from './AgentStorage';
import type { AgentCalendarBridge } from '../tools/AgentCalendarBridge';
import type { AgentAuditLogger } from './AgentAuditLogger';

const MAX_AGENT_SPEC_BYTES = 256 * 1024;
const LEGACY_GITHUB_SPEC_URL =
  'https://raw.githubusercontent.com/obsidian-full-calendar-remastered/plugin-full-calendar/main/docs/architecture/api/agent-spec.md';

function resolveSpecUrl(configured?: string): string {
  const trimmed = configured?.trim();
  if (!trimmed || trimmed === LEGACY_GITHUB_SPEC_URL) {
    return DEFAULT_AGENT_SPEC_URL;
  }
  return trimmed;
}

const COMPACT_TOOLS_SECTION = `## 3. Available Tools (Provided via OpenAI \`tools\` Parameter)

- **Read Tools (Silent)**: \`get_events\`, \`get_event_by_id\`, \`get_calendar_sources\`, \`get_user_categories\`, \`get_current_time\` (only if exact seconds/ISO needed), \`lookup_plugin_docs\` (local offline FCR setup & feature index), \`browse_schedule_online\` (strictly for user-provided external \`http\`/\`https\` schedule URLs, never plugin docs).
- **Chrono Analytics Tools (Silent, Rule-Based)**: \`get_chrono_overview\` (taxonomy & date range), \`analyze_time\` (exact breakdowns, trends, activity patterns, period comparisons + embedded chart), \`get_chrono_insights\` (Global Snapshot & persona insights).
- **Staged Proposal Tools (User Approval Required)**: \`propose_create_event\`, \`propose_update_event\`, \`propose_delete_event\`, \`propose_batch_create_events\`.`;

export async function refreshCachedAgentSpecForVersionUpdate(
  app: App,
  pluginId: string
): Promise<boolean> {
  const path = normalizePath(
    `${app.vault.configDir}/plugins/${pluginId}/${AGENT_SPEC_RELATIVE_PATH}`
  );
  const exists = await app.vault.adapter.exists(path);
  if (!exists) {
    return false;
  }

  let configuredUrl: string | undefined;
  try {
    configuredUrl = PluginState.getSettings().agent?.specUrl?.trim();
  } catch {
    configuredUrl = undefined;
  }
  const resolved = resolveSpecUrl(configuredUrl);
  const targetUrl =
    resolved.startsWith('http://') || resolved.startsWith('https://')
      ? resolved
      : DEFAULT_AGENT_SPEC_URL;

  const response = await requestUrl({
    url: targetUrl,
    method: 'GET',
    headers: {
      'User-Agent': 'Obsidian-FullCalendar-Remastered/Agent'
    }
  });

  const responseBytes = utf8ByteLength(response.text || '');

  if (
    response.status !== 200 ||
    !response.text ||
    response.text.trim().length === 0 ||
    responseBytes > MAX_AGENT_SPEC_BYTES
  ) {
    throw new Error(`Invalid agent spec response (status ${response.status}).`);
  }

  const sanitized = sanitizeAgentSpec(response.text);
  await app.vault.adapter.write(path, sanitized);
  return true;
}

/**
 * Strips legacy duplicated JSON tool schema blocks and redundant get_current_time
 * few-shot guidance so cached or remote specs stay compact and token-efficient.
 */
export function sanitizeAgentSpec(rawSpec: string): string {
  let cleaned = rawSpec.replace(
    /##\s*3\.\s*Tool Schemas[^\n]*[\r\n]+[\s\S]*?```json[\s\S]*?```/i,
    COMPACT_TOOLS_SECTION
  );
  cleaned = cleaned.replace(
    /1\.\s*Calls\s+`get_current_time\(\)`\s*->/g,
    '1. Uses injected `[Current Local Time]` ->'
  );
  return cleaned;
}

export class SpecLoader {
  private storage: AgentStorage;
  private bridge: AgentCalendarBridge;
  private logger?: AgentAuditLogger;

  constructor(storage: AgentStorage, bridge: AgentCalendarBridge, logger?: AgentAuditLogger) {
    this.storage = storage;
    this.bridge = bridge;
    this.logger = logger;
  }

  /**
   * Downloads and caches the remote agent spec. Returns true only when the remote
   * fetch succeeded and passed validation.
   */
  public async refreshSpecFromRemote(): Promise<boolean> {
    const specUrl = resolveSpecUrl(PluginState.getSettings().agent?.specUrl);
    if (!specUrl.startsWith('http://') && !specUrl.startsWith('https://')) {
      return false;
    }

    try {
      const response = await requestUrl({
        url: specUrl,
        method: 'GET',
        headers: {
          'User-Agent': 'Obsidian-FullCalendar-Remastered/Agent'
        }
      });

      if (
        response.status === 200 &&
        response.text &&
        response.text.trim().length > 0 &&
        utf8ByteLength(response.text) <= MAX_AGENT_SPEC_BYTES
      ) {
        const content = sanitizeAgentSpec(response.text);
        await this.storage.saveCachedSpec(content);
        this.logger?.info('Loaded and cached agent spec from remote URL', { url: specUrl });
        return true;
      }
    } catch (err) {
      this.logger?.warn('Failed to download agent spec from URL, using fallback', {
        url: specUrl,
        error: String(err)
      });
    }
    return false;
  }

  /**
   * Fetches the raw markdown spec from remote CDN or loads from local cache.
   */
  public async loadSpec(forceRefresh = false): Promise<string> {
    if (!forceRefresh) {
      const cached = await this.storage.loadCachedSpec();
      if (cached && cached.trim().length > 0) {
        const sanitized = sanitizeAgentSpec(cached);
        if (sanitized !== cached) {
          await this.storage.saveCachedSpec(sanitized);
        }
        return sanitized;
      }
    }

    if (await this.refreshSpecFromRemote()) {
      const refreshed = await this.storage.loadCachedSpec();
      if (refreshed && refreshed.trim().length > 0) {
        return refreshed;
      }
    }

    // Fallback to cached copy if available
    const existingCache = await this.storage.loadCachedSpec();
    if (existingCache) {
      const sanitized = sanitizeAgentSpec(existingCache);
      if (sanitized !== existingCache) {
        await this.storage.saveCachedSpec(sanitized);
      }
      return sanitized;
    }

    // Fallback to bundled offline spec
    await this.storage.saveCachedSpec(DEFAULT_AGENT_SPEC);
    return DEFAULT_AGENT_SPEC;
  }

  /**
   * Builds the comprehensive system prompt including real-time dynamic context.
   */
  public async buildSystemPrompt(forceRefresh = false): Promise<string> {
    const specBase = await this.loadSpec(forceRefresh);
    const timeInfo = this.bridge.getCurrentTime();
    const enableCat = PluginState.getSettings().enableAdvancedCategorization;
    const categories = this.bridge.getUserCategories();
    const calendars = this.bridge.getCalendarSources().filter(c => c.canCreate);
    const defaultCal = calendars.find(c => c.isDefault) || calendars[0];

    const categoryListStr =
      categories.length > 0
        ? categories.map(c => `- ${c.name} (color: ${c.color})`).join('\n')
        : '- General (default)';

    const calendarListStr =
      calendars.length > 0
        ? calendars
            .map(c => `- ${c.name} (id: "${c.id}")${c.isDefault ? ' [DEFAULT]' : ''}`)
            .join('\n')
        : '- (No writable calendars configured)';

    const categorySection = enableCat
      ? `### User Defined Categories
${categoryListStr}

**IMPORTANT FORMATTING RULE**:
When proposing events, pass ONLY the bare clean event title in \`title\` (never prepend \`Category - \` or \`SubCategory - \`) and pass the matching category in \`category\` (and optional \`subCategory\`); the host formats \`Category - SubCategory - Title\` automatically on save.
Never invent non-existent categories when a configured category fits.`
      : `**TITLE RULE**:
Advanced categorization is currently disabled. Pass literal event titles in \`title\` and omit \`category\` and \`subCategory\`.`;

    const contextSection = `
---

## FULL CALENDAR REMASTERED — REAL-TIME USER ENVIRONMENT CONTEXT

- **Current Date**: ${timeInfo.currentDate} (${timeInfo.dayOfWeek})
- **Active Timezone**: ${timeInfo.displayTimezone}
- **Time Format**: ${timeInfo.timeFormat24h ? '24-hour' : '12-hour AM/PM'}
- **Default Calendar**: "${defaultCal ? defaultCal.name : 'None'}" (id: "${defaultCal ? defaultCal.id : ''}")

### Writable Calendars
${calendarListStr}

${categorySection}

### Chrono Analytics & Inline Charts
For time totals, category breakdowns, trends, activity patterns, or period comparisons, ALWAYS use \`analyze_time\` / \`get_chrono_insights\` (call \`get_chrono_overview\` first if you need exact hierarchy/project names) instead of summing events manually from \`get_events\`. When \`analyze_time\` returns a \`chartId\`, place \`[[chart:<chartId>]]\` on its own line in your reply exactly where the chart should appear.

### Plugin Setup & Feature Help
For questions about Full Calendar Remastered features, workflows, or setup, ALWAYS call \`lookup_plugin_docs\` (which reads the local docs index) and include the exact official documentation URLs returned. Never guess doc URLs and never use \`browse_schedule_online\` for plugin documentation—\`browse_schedule_online\` is strictly for user-provided external schedule URLs.

### Follow-Up Suggestions
At the very end of a final user-facing reply (never during tool-calling turns), you may optionally append 2-3 short, contextual next steps the user might want to take next inside \`<suggestions>["...", "..."]</suggestions>\` tags (under 60 characters each). Omit the tag if no follow-up is helpful.
`;

    return `${specBase}\n${contextSection}`;
  }
}
