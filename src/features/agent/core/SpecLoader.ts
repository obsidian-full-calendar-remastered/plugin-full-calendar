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

import { requestUrl } from 'obsidian';
import { PluginState } from '../../../core/PluginState';
import { DEFAULT_AGENT_SPEC } from '../defaultAgentSpec';
import type { AgentStorage } from './AgentStorage';
import type { AgentCalendarBridge } from '../tools/AgentCalendarBridge';
import type { AgentAuditLogger } from './AgentAuditLogger';

const COMPACT_TOOLS_SECTION = `## 3. Available Tools (Provided via OpenAI \`tools\` Parameter)

- **Read Tools (Silent)**: \`get_events\`, \`get_event_by_id\`, \`get_calendar_sources\`, \`get_user_categories\`, \`get_current_time\` (only if exact seconds/ISO needed), \`browse_schedule_online\` (public \`http\`/\`https\` schedules).
- **Staged Proposal Tools (User Approval Required)**: \`propose_create_event\`, \`propose_update_event\`, \`propose_delete_event\`, \`propose_batch_create_events\`.`;

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
   * Fetches the raw markdown spec from GitHub or loads from local cache.
   */
  public async loadSpec(forceRefresh = false): Promise<string> {
    const settings = PluginState.getSettings().agent;
    const specUrl = settings?.specUrl?.trim();

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

    if (specUrl && (specUrl.startsWith('http://') || specUrl.startsWith('https://'))) {
      try {
        const response = await requestUrl({
          url: specUrl,
          method: 'GET',
          headers: {
            'User-Agent': 'Obsidian-FullCalendar-Remastered/Agent'
          }
        });

        if (response.status === 200 && response.text && response.text.trim().length > 0) {
          const content = sanitizeAgentSpec(response.text);
          await this.storage.saveCachedSpec(content);
          this.logger?.info('Loaded and cached agent spec from GitHub docs', { url: specUrl });
          return content;
        }
      } catch (err) {
        this.logger?.warn('Failed to download agent spec from URL, using fallback', {
          url: specUrl,
          error: String(err)
        });
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

### Follow-Up Suggestions
At the very end of a final user-facing reply (never during tool-calling turns), you may optionally append 2-3 short, contextual next steps the user might want to take next inside \`<suggestions>["...", "..."]</suggestions>\` tags (under 60 characters each). Omit the tag if no follow-up is helpful.
`;

    return `${specBase}\n${contextSection}`;
  }
}
