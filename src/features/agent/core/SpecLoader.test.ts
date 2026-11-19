/**
 * @file SpecLoader.test.ts
 * @brief Unit tests for SpecLoader spec sanitization and static daily system prompt caching.
 */

import { sanitizeAgentSpec, SpecLoader } from './SpecLoader';
import { PluginState } from '../../../core/PluginState';
import { DEFAULT_SETTINGS } from '../../../types/settings';
import type { AgentStorage } from './AgentStorage';
import type { AgentCalendarBridge } from '../tools/AgentCalendarBridge';

describe('SpecLoader & sanitizeAgentSpec', () => {
  beforeEach(() => {
    PluginState.setSettings({
      ...DEFAULT_SETTINGS,
      displayTimezone: 'UTC',
      timeFormat24h: true,
      categorySettings: [{ name: 'Work', color: '#ff0000' }]
    });
  });

  it('strips legacy duplicated JSON tool schemas and get_current_time few-shot call idempotently', () => {
    const legacySpec = [
      '# Full Calendar Remastered: Agent Specification & Tool Schemas',
      '',
      '## 3. Tool Schemas (OpenAI Compatible)',
      '',
      '```json',
      '[{"type":"function","function":{"name":"get_current_time","description":"time","parameters":{"type":"object","properties":{}}}}]',
      '```',
      '',
      '## 4. Few-Shot Examples',
      '1. Calls `get_current_time()` -> Computes tomorrow as 2026-09-10.'
    ].join('\n');

    const cleaned = sanitizeAgentSpec(legacySpec);
    expect(cleaned).not.toContain('"name":"get_current_time"');
    expect(cleaned).not.toContain('Calls `get_current_time()`');
    expect(cleaned).toContain('## 3. Available Tools');
    expect(cleaned).toContain('Uses injected `[Current Local Time]` ->');
    expect(sanitizeAgentSpec(cleaned)).toBe(cleaned);
  });

  it('evicts and rewrites bloated cached spec and omits minute-level Current Time from system prompt', async () => {
    const legacyCached =
      '# Full Calendar Remastered\n## 3. Tool Schemas (OpenAI Compatible)\n```json\n[{"type":"function"}]\n```';
    const saveCachedSpec = jest.fn().mockResolvedValue(undefined);
    const mockStorage = {
      loadCachedSpec: jest.fn().mockResolvedValue(legacyCached),
      saveCachedSpec
    } as unknown as AgentStorage;

    const mockBridge = {
      getCurrentTime: () => ({
        currentIsoTimestamp: '2026-11-19T14:35:00.000Z',
        currentDate: '2026-11-19',
        currentTime24h: '14:35',
        dayOfWeek: 'Thursday',
        displayTimezone: 'UTC',
        timeFormat24h: true
      }),
      getUserCategories: () => [{ name: 'Work', color: '#ff0000' }],
      getCalendarSources: () => [
        {
          id: 'cal-1',
          name: 'Work',
          color: '#ff0000',
          type: 'local',
          canCreate: true,
          canEdit: true,
          isDefault: true
        }
      ]
    } as unknown as AgentCalendarBridge;

    const loader = new SpecLoader(mockStorage, mockBridge);
    const prompt = await loader.buildSystemPrompt();

    expect(saveCachedSpec).toHaveBeenCalledTimes(1);
    expect(prompt).toContain('FULL CALENDAR REMASTERED');
    expect(prompt).toContain('**Current Date**: 2026-11-19 (Thursday)');
    expect(prompt).not.toContain('Current Time');
    expect(prompt).not.toContain('14:35');
  });
});
