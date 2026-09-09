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
        return cached;
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
          const content = response.text;
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
    if (existingCache) return existingCache;

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

    const contextSection = `
---

## REAL-TIME USER ENVIRONMENT CONTEXT

- **Current Date**: ${timeInfo.currentDate} (${timeInfo.dayOfWeek})
- **Current Time**: ${timeInfo.currentTime24h} (24-hour format)
- **Active Timezone**: ${timeInfo.displayTimezone}
- **Time Format**: ${timeInfo.timeFormat24h ? '24-hour' : '12-hour AM/PM'}
- **Default Calendar**: "${defaultCal ? defaultCal.name : 'None'}" (id: "${defaultCal ? defaultCal.id : ''}")

### Writable Calendars
${calendarListStr}

### User Defined Categories
${categoryListStr}

**IMPORTANT FORMATTING RULE**:
When proposing events, you MUST format the title following the user's category taxonomy:
\`Category - SubCategory - Title\` or \`Category - Title\`.
Never invent non-existent categories when a configured category fits.
`;

    return `${specBase}\n${contextSection}`;
  }
}
