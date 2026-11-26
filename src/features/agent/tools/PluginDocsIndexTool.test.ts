/**
 * @file PluginDocsIndexTool.test.ts
 * @brief Unit tests for local plugin docs index parsing, multi-topic search, lazy CDN caching, and versioned refresh.
 *
 * @license See LICENSE.md
 */

import { App, requestUrl } from 'obsidian';
import {
  DOCS_BASE_URL,
  DOCS_HOME_URL,
  MAX_DOCS_INDEX_BYTES,
  MAX_TOOL_OUTPUT_CHARS,
  executeLookupPluginDocs,
  isValidDocsIndexMarkdown,
  parsePluginDocsIndex,
  queryPluginDocsEntries,
  refreshCachedDocsIndexForVersionUpdate
} from './PluginDocsIndexTool';
import { browseScheduleOnline } from './webBrowseTool';
import { refreshCachedAgentSpecForVersionUpdate } from '../core/SpecLoader';
import { DEFAULT_AGENT_SPEC_URL, REMOTE_AGENT_ASSET_BASE_URL } from '../core/agentSettings';
import { DEFAULT_SETTINGS } from '../../../types/settings';
import type { AgentStorage } from '../core/AgentStorage';

jest.mock('obsidian', () => ({
  App: class {},
  normalizePath: (p: string) => p.replace(/\\/g, '/').replace(/\/+/g, '/'),
  requestUrl: jest.fn()
}));

const mockedRequestUrl = requestUrl as unknown as jest.Mock;

const SAMPLE_DOCS_INDEX = `# Full Calendar Remastered — Plugin Documentation Index

## Daily Note Calendar
- Category: calendars
- URL: https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/dailynote/
- Summary: Store events in-line in Daily Notes as list items and task checkboxes with Dataview or DayPlanner format.
- Sections: Prerequisites, Configuring the Daily Notes calendar, Categories

## Google Calendar Two-Way Sync
- Category: calendars
- URL: https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/calendars/gcal/
- Summary: Two-way sync with Google Calendar using OAuth 2.0 authentication directly in Obsidian.
- Sections: Quick Start: Connecting Your Account, Reconnecting an Existing Account

## Share Availability
- Category: features
- URL: https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/features/availability/
- Summary: Calculate and share available time slots via a local Markdown schedule or a secret interactive GitHub Gist booking page.
- Sections: Output Formats, How It Works: The Slot Solver, Configuration

## Chrono Analyzer Overview
- Category: chrono_analyser
- URL: https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/chrono_analyser/
- Summary: Analyze time spent across categories and projects with interactive charts, trends, and insights.
- Sections: Features, Analysis Types, Insights Engine

## Privacy Policy
- Category: legal
- URL: https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/legal/privacy-policy/
- Summary: Privacy policy explaining local calendar storage, availability sharing, and Google Calendar data handling.
- Sections: Data Storage, Third-Party Services
`;

const TEST_CONFIG_DIR = 'test-obsidian-config';

function createMemoryStorage(initialDocsIndex: string | null = null): {
  storage: AgentStorage;
  saveCachedDocsIndex: jest.Mock;
} {
  let cachedDocsIndex = initialDocsIndex;
  const saveCachedDocsIndex = jest.fn(async (content: string) => {
    cachedDocsIndex = content;
  });
  const storage = {
    loadCachedDocsIndex: jest.fn(async () => cachedDocsIndex),
    saveCachedDocsIndex,
    hasCachedDocsIndex: jest.fn(async () => cachedDocsIndex !== null)
  } as unknown as AgentStorage;
  return { storage, saveCachedDocsIndex };
}

function createMockApp(files: Record<string, string>): App {
  return {
    vault: {
      configDir: TEST_CONFIG_DIR,
      adapter: {
        exists: jest.fn(async (p: string) => Object.prototype.hasOwnProperty.call(files, p)),
        read: jest.fn(async (p: string) => files[p]),
        write: jest.fn(async (p: string, content: string) => {
          files[p] = content;
        })
      }
    }
  } as unknown as App;
}

describe('PluginDocsIndexTool', () => {
  beforeEach(() => {
    mockedRequestUrl.mockReset();
  });

  it('parses markdown entries and validates header, size, and URLs', () => {
    const entries = parsePluginDocsIndex(SAMPLE_DOCS_INDEX);
    expect(entries).toHaveLength(5);
    expect(entries[2]).toEqual({
      title: 'Share Availability',
      category: 'features',
      url: 'https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/features/availability/',
      summary:
        'Calculate and share available time slots via a local Markdown schedule or a secret interactive GitHub Gist booking page.',
      sections: ['Output Formats', 'How It Works: The Slot Solver', 'Configuration']
    });

    expect(isValidDocsIndexMarkdown(SAMPLE_DOCS_INDEX)).toBe(true);
    expect(isValidDocsIndexMarkdown('<html>not markdown</html>')).toBe(false);
    expect(isValidDocsIndexMarkdown('# Full Calendar Remastered\n\nNo entries here')).toBe(false);
    const oversized = `${SAMPLE_DOCS_INDEX}\n${'x'.repeat(MAX_DOCS_INDEX_BYTES)}`;
    expect(isValidDocsIndexMarkdown(oversized)).toBe(false);
  });

  it('surfaces multi-topic diversity and down-ranks legal pages unless explicitly queried', () => {
    const entries = parsePluginDocsIndex(SAMPLE_DOCS_INDEX);

    const multiTopic = JSON.parse(
      queryPluginDocsEntries(entries, {
        query: 'daily note google calendar share availability'
      })
    ) as { mode: string; results: Array<{ title: string }> };

    expect(multiTopic.mode).toBe('search');
    const titles = multiTopic.results.map(r => r.title);
    expect(titles).toContain('Daily Note Calendar');
    expect(titles).toContain('Google Calendar Two-Way Sync');
    expect(titles).toContain('Share Availability');
    expect(titles[0]).not.toBe('Privacy Policy');

    const legalQuery = JSON.parse(queryPluginDocsEntries(entries, { query: 'privacy policy' })) as {
      mode: string;
      results: Array<{ title: string }>;
    };
    expect(legalQuery.results[0]?.title).toBe('Privacy Policy');
  });

  it('supports category browsing, overview catalog, and enforces output cap', () => {
    const entries = parsePluginDocsIndex(SAMPLE_DOCS_INDEX);

    const calendarsOnly = JSON.parse(
      queryPluginDocsEntries(entries, { category: 'calendars' })
    ) as { mode: string; category: string; results: Array<{ title: string }> };
    expect(calendarsOnly.mode).toBe('category');
    expect(calendarsOnly.results.map(r => r.title)).toEqual([
      'Daily Note Calendar',
      'Google Calendar Two-Way Sync'
    ]);

    const overview = JSON.parse(queryPluginDocsEntries(entries, {})) as {
      mode: string;
      docsBaseUrl: string;
      docsHomeUrl: string;
      totalEntries: number;
      categories: Record<string, { count: number; items: Array<{ title: string; path: string }> }>;
    };
    expect(overview.mode).toBe('overview');
    expect(overview.docsBaseUrl).toBe(DOCS_BASE_URL);
    expect(overview.docsHomeUrl).toBe(DOCS_HOME_URL);
    expect(overview.totalEntries).toBe(5);
    expect(overview.categories.calendars.count).toBe(2);
    expect(overview.categories.calendars.items).toHaveLength(2);

    const manyEntries = Array.from({ length: 40 }, (_, i) => ({
      title: `Feature ${i} ${'Long Title '.repeat(4)}`,
      category: 'features',
      url: `https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/features/f-${i}/`,
      summary: 'Detailed summary '.repeat(12),
      sections: ['Section One', 'Section Two', 'Section Three', 'Section Four', 'Section Five']
    }));
    const capped = queryPluginDocsEntries(manyEntries, { category: 'features' });
    expect(capped.length).toBeLessThanOrEqual(MAX_TOOL_OUTPUT_CHARS);
    const parsedCapped = JSON.parse(capped) as {
      totalInCategory: number;
      truncated?: boolean;
      results: Array<{ title: string }>;
    };
    expect(parsedCapped.totalInCategory).toBe(40);
    expect(parsedCapped.truncated).toBe(true);
    expect(parsedCapped.results.length).toBeGreaterThan(1);
  });

  it('uses disk cache without network calls, lazily fetches once on miss, and handles offline errors', async () => {
    const { storage: warmStorage } = createMemoryStorage(SAMPLE_DOCS_INDEX);
    const warmRes = JSON.parse(
      await executeLookupPluginDocs(warmStorage, { query: 'share availability' })
    ) as { mode: string; results: Array<{ title: string }> };
    expect(warmRes.mode).toBe('search');
    expect(warmRes.results[0]?.title).toBe('Share Availability');
    expect(mockedRequestUrl).not.toHaveBeenCalled();

    const { storage: coldStorage, saveCachedDocsIndex } = createMemoryStorage(null);
    mockedRequestUrl.mockResolvedValueOnce({ status: 200, text: SAMPLE_DOCS_INDEX });
    const coldRes = JSON.parse(
      await executeLookupPluginDocs(coldStorage, { query: 'google calendar' })
    ) as { mode: string; results: Array<{ title: string }> };
    expect(mockedRequestUrl).toHaveBeenCalledTimes(1);
    expect(mockedRequestUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `${REMOTE_AGENT_ASSET_BASE_URL}/plugin-docs-index.md`,
        method: 'GET'
      })
    );
    expect(saveCachedDocsIndex).toHaveBeenCalledWith(SAMPLE_DOCS_INDEX);
    expect(coldRes.results[0]?.title).toBe('Google Calendar Two-Way Sync');

    const { storage: offlineStorage } = createMemoryStorage(null);
    mockedRequestUrl.mockRejectedValueOnce(new Error('Network offline'));
    const offlineRes = JSON.parse(
      await executeLookupPluginDocs(offlineStorage, { query: 'google calendar' })
    ) as { available: boolean; reason: string; docsHomeUrl: string };
    expect(offlineRes).toEqual({
      available: false,
      reason: 'offline_or_unreachable',
      docsHomeUrl: DOCS_HOME_URL
    });
  });

  it('refreshes cached docs index and agent spec on version update only when already cached', async () => {
    const emptyApp = createMockApp({});
    expect(await refreshCachedDocsIndexForVersionUpdate(emptyApp, 'full-calendar-remastered')).toBe(
      false
    );
    expect(await refreshCachedAgentSpecForVersionUpdate(emptyApp, 'full-calendar-remastered')).toBe(
      false
    );
    expect(mockedRequestUrl).not.toHaveBeenCalled();

    const docsPath = `${TEST_CONFIG_DIR}/plugins/full-calendar-remastered/agent/plugin-docs-index.md`;
    const specPath = `${TEST_CONFIG_DIR}/plugins/full-calendar-remastered/agent/agent-spec.md`;
    const files: Record<string, string> = {
      [docsPath]: SAMPLE_DOCS_INDEX,
      [specPath]: '# Old Spec'
    };
    const cachedApp = createMockApp(files);

    const updatedDocs = `${SAMPLE_DOCS_INDEX}\n## Reminders\n- Category: features\n- URL: https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/features/reminders/\n- Summary: Desktop reminders.\n- Sections: Setup\n`;
    mockedRequestUrl
      .mockResolvedValueOnce({ status: 200, text: updatedDocs })
      .mockResolvedValueOnce({ status: 200, text: '# Updated Agent Spec' });

    expect(
      await refreshCachedDocsIndexForVersionUpdate(cachedApp, 'full-calendar-remastered')
    ).toBe(true);
    expect(
      await refreshCachedAgentSpecForVersionUpdate(cachedApp, 'full-calendar-remastered')
    ).toBe(true);
    expect(files[docsPath]).toBe(updatedDocs);
    expect(files[specPath]).toBe('# Updated Agent Spec');
    expect(mockedRequestUrl).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ url: `${REMOTE_AGENT_ASSET_BASE_URL}/plugin-docs-index.md` })
    );
    expect(mockedRequestUrl).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ url: `${REMOTE_AGENT_ASSET_BASE_URL}/agent-spec.md` })
    );
  });

  it('keeps real-scale 70+ entry overview populated and within output cap', () => {
    const categories = [
      'getting_started',
      'calendars',
      'features',
      'chrono_analyser',
      'embeds',
      'events',
      'views',
      'settings',
      'guides',
      'reference',
      'legal'
    ];
    const largeEntries = Array.from({ length: 70 }, (_, i) => {
      const cat = categories[i % categories.length];
      return {
        title: `Documentation Page ${i + 1}`,
        category: cat,
        url: `${DOCS_BASE_URL}user/${cat}/page-${i + 1}/`,
        summary: `Summary for page ${i + 1}.`,
        sections: ['Overview', 'Configuration']
      };
    });

    const rawOverview = queryPluginDocsEntries(largeEntries, {});
    expect(rawOverview.length).toBeLessThanOrEqual(MAX_TOOL_OUTPUT_CHARS);
    const parsed = JSON.parse(rawOverview) as {
      mode: string;
      totalEntries: number;
      categories: Record<string, { count: number; items: unknown[] }>;
    };
    expect(parsed.mode).toBe('overview');
    expect(parsed.totalEntries).toBe(70);
    expect(Object.keys(parsed.categories).length).toBe(11);
  });

  it('fixes search ranking regressions (URL slug, short-token prefix, term-order bias, diacritics)', () => {
    const entries = parsePluginDocsIndex(`${SAMPLE_DOCS_INDEX}
## FCR Command — Natural Language Orchestrator
- Category: features
- URL: https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/features/nlp/
- Summary: Create and schedule events using natural language commands.
- Sections: Quick Add, Examples

## Reminders and Notifications
- Category: features
- URL: https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/features/reminders/
- Summary: Configure desktop notifications and upcoming event reminders.
- Sections: Notification Lead Time, Quiet Hours

## Chrono Analyser: Real-World Use Cases
- Category: chrono_analyser
- URL: https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/chrono_analyser/usecases/
- Summary: Configure time tracking workflows for freelancers and students.
- Sections: Freelance Billing

## Category Coloring
- Category: events
- URL: https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/events/categories/
- Summary: Color-code events by category.
- Sections: Palette

## A Guide to BY
- Category: guides
- URL: https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/guides/short-tokens/
- Summary: Short token decoy entry.
- Sections: Intro
`);

    const nlpRes = JSON.parse(
      queryPluginDocsEntries(entries, { query: 'how do I use NLP quick add?' })
    ) as { results: Array<{ title: string }> };
    expect(nlpRes.results[0]?.title).toBe('FCR Command — Natural Language Orchestrator');

    const remRes = JSON.parse(
      queryPluginDocsEntries(entries, { query: 'how do I configure reminders and notifications?' })
    ) as { results: Array<{ title: string }> };
    expect(remRes.results[0]?.title).toBe('Reminders and Notifications');

    const shortRes = JSON.parse(queryPluginDocsEntries(entries, { query: 'byok analyzer' })) as {
      results: Array<{ title: string }>;
    };
    expect(shortRes.results.map(r => r.title)).not.toContain('A Guide to BY');

    const accentedRes = JSON.parse(queryPluginDocsEntries(entries, { query: 'catégories' })) as {
      results: Array<{ title: string }>;
    };
    expect(accentedRes.results[0]?.title).toBe('Category Coloring');
  });

  it('rejects non-FCR https URLs in parsePluginDocsIndex and coalesces concurrent cold fetches', async () => {
    const poisoned = `# Full Calendar Remastered
## Phishing Entry
- Category: guides
- URL: https://evil.example/phish
- Summary: Malicious link.
- Sections: None
`;
    expect(parsePluginDocsIndex(poisoned)).toEqual([]);

    const { storage } = createMemoryStorage(null);
    let resolveFetch!: (val: { status: number; text: string }) => void;
    mockedRequestUrl.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveFetch = resolve;
        })
    );

    const p1 = executeLookupPluginDocs(storage, { query: 'daily note' });
    const p2 = executeLookupPluginDocs(storage, { query: 'google calendar' });
    await Promise.resolve();
    resolveFetch({ status: 200, text: SAMPLE_DOCS_INDEX });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(mockedRequestUrl).toHaveBeenCalledTimes(1);
    expect((JSON.parse(r1) as { results: unknown[] }).results.length).toBeGreaterThan(0);
    expect((JSON.parse(r2) as { results: unknown[] }).results.length).toBeGreaterThan(0);
  });

  it('blocks browseScheduleOnline from fetching FCR docs or CDN and aligns DEFAULT_SETTINGS', async () => {
    const docsErr = await browseScheduleOnline(
      'https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/user/'
    );
    const cdnErr = await browseScheduleOnline(
      'https://fcr-cdn.plugin-fcr.workers.dev/assets/agent/plugin-docs-index.md'
    );
    expect(docsErr).toContain('lookup_plugin_docs');
    expect(cdnErr).toContain('lookup_plugin_docs');
    expect(mockedRequestUrl).not.toHaveBeenCalled();
    expect(DEFAULT_SETTINGS.agent?.specUrl).toBe(DEFAULT_AGENT_SPEC_URL);
  });
});
