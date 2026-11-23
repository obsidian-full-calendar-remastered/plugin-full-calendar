/**
 * @file PluginDocsIndexTool.ts
 * @brief Local-only plugin documentation index search, lazy CDN caching, and version-update refresh.
 *
 * @license See LICENSE.md
 */

import { App, normalizePath, requestUrl } from 'obsidian';
import type { AgentAuditLogger } from '../core/AgentAuditLogger';
import {
  AGENT_DOCS_INDEX_RELATIVE_PATH,
  utf8ByteLength,
  type AgentStorage
} from '../core/AgentStorage';
import { REMOTE_AGENT_ASSET_BASE_URL } from '../core/agentSettings';
import { raceWithAbort } from '../domain/abortUtils';

export const DOCS_BASE_URL = 'https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/';
export const DOCS_HOME_URL = `${DOCS_BASE_URL}user/`;
const DOCS_INDEX_URL = `${REMOTE_AGENT_ASSET_BASE_URL}/plugin-docs-index.md`;
export const MAX_DOCS_INDEX_BYTES = 256 * 1024;
export const MAX_TOOL_OUTPUT_CHARS = 4_500;
const DOCS_INDEX_HEADER_PREFIX = '# Full Calendar Remastered';
const MAX_SEARCH_RESULTS = 6;

let inflightDocsFetch: Promise<string | null> | null = null;

const STOP_WORDS = new Set([
  'the',
  'how',
  'do',
  'i',
  'to',
  'a',
  'an',
  'for',
  'in',
  'my',
  'of',
  'with',
  'and',
  'or',
  'is',
  'can',
  'what',
  'should',
  'use',
  'using',
  'set',
  'setup',
  'up',
  'configure',
  'work',
  'does',
  'add',
  'need',
  'want',
  'help',
  'plugin',
  'full',
  'calendar'
]);

const LEGAL_QUERY_TERMS = new Set([
  'legal',
  'privacy',
  'policy',
  'terms',
  'tos',
  'gdpr',
  'license'
]);

const ALLOWED_CATEGORIES = new Set([
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
  'legal',
  'all'
]);

export interface PluginDocEntry {
  title: string;
  category: string;
  url: string;
  summary: string;
  sections: string[];
}

export interface LookupPluginDocsArgs {
  query?: string;
  category?: string;
}

interface SearchResultPayload {
  mode: 'search';
  query: string;
  totalMatches: number;
  results: PluginDocEntry[];
}

interface CategoryResultPayload {
  mode: 'category';
  category: string;
  totalInCategory: number;
  truncated?: boolean;
  results: PluginDocEntry[];
}

interface OverviewCategorySummary {
  count: number;
  items: { title: string; path: string }[];
  truncated?: boolean;
}

interface OverviewResultPayload {
  mode: 'overview';
  docsBaseUrl: string;
  docsHomeUrl: string;
  totalEntries: number;
  truncated?: boolean;
  categories: Record<string, OverviewCategorySummary>;
}

type DocsLookupPayload = SearchResultPayload | CategoryResultPayload | OverviewResultPayload;

function stripControlChars(text: string): string {
  // eslint-disable-next-line no-control-regex -- Strip ASCII control characters from parsed remote markdown
  return text.replace(/[\x00-\x1F\x7F]/g, '');
}

function tokenizeText(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 0);
}

function extractQueryTerms(query: string): string[] {
  const raw = tokenizeText(query);
  const filtered = raw.filter(t => !STOP_WORDS.has(t));
  const unique = Array.from(new Set(filtered.length > 0 ? filtered : raw));
  return unique;
}

function normalizeCategory(rawCategory?: string): string {
  if (typeof rawCategory !== 'string') return 'all';
  const normalized = rawCategory.trim().toLowerCase();
  return ALLOWED_CATEGORIES.has(normalized) ? normalized : 'all';
}

function scoreTokenMatch(queryTerm: string, targetTokens: string[]): number {
  let best = 0;
  for (const token of targetTokens) {
    if (token === queryTerm) {
      return 1.0;
    }
    if (
      queryTerm.length >= 3 &&
      token.length >= 3 &&
      (token.startsWith(queryTerm) || queryTerm.startsWith(token))
    ) {
      best = Math.max(best, 0.65);
    }
  }
  return best;
}

function scoreTermForEntry(term: string, entry: PluginDocEntry): number {
  const titleScore = scoreTokenMatch(term, tokenizeText(entry.title)) * 4;
  const urlSlug = entry.url.startsWith(DOCS_BASE_URL)
    ? entry.url.slice(DOCS_BASE_URL.length)
    : entry.url;
  const slugScore = scoreTokenMatch(term, tokenizeText(urlSlug)) * 3;
  const categoryScore = scoreTokenMatch(term, tokenizeText(entry.category)) * 2;
  const sectionsScore = scoreTokenMatch(term, tokenizeText(entry.sections.join(' '))) * 2;
  const summaryScore = scoreTokenMatch(term, tokenizeText(entry.summary)) * 1;
  return titleScore + slugScore + categoryScore + sectionsScore + summaryScore;
}

function scoreEntry(terms: string[], entry: PluginDocEntry, includeLegalBoost: boolean): number {
  let total = 0;
  for (const term of terms) {
    total += scoreTermForEntry(term, entry);
  }
  if (total > 0 && entry.category === 'legal' && !includeLegalBoost) {
    total *= 0.25;
  }
  return total;
}

export function parsePluginDocsIndex(markdown: string): PluginDocEntry[] {
  if (!markdown || !markdown.trim()) return [];
  const lines = markdown.split(/\r?\n/);
  const entries: PluginDocEntry[] = [];
  let current: Partial<PluginDocEntry> | null = null;

  const commitCurrent = () => {
    if (
      current &&
      typeof current.title === 'string' &&
      current.title.trim().length > 0 &&
      typeof current.url === 'string' &&
      current.url.startsWith(DOCS_BASE_URL)
    ) {
      entries.push({
        title: stripControlChars(current.title).trim(),
        category: stripControlChars(current.category || 'guides').trim(),
        url: stripControlChars(current.url).trim(),
        summary: stripControlChars(current.summary || '').trim(),
        sections: Array.isArray(current.sections)
          ? current.sections.map(s => stripControlChars(s).trim()).filter(Boolean)
          : []
      });
    }
    current = null;
  };

  for (const line of lines) {
    if (line.startsWith('## ')) {
      commitCurrent();
      current = {
        title: line.slice(3).trim(),
        category: 'guides',
        url: '',
        summary: '',
        sections: []
      };
      continue;
    }
    if (!current) continue;

    if (line.startsWith('- Category:')) {
      current.category = line.slice('- Category:'.length).trim().toLowerCase();
    } else if (line.startsWith('- URL:')) {
      current.url = line.slice('- URL:'.length).trim();
    } else if (line.startsWith('- Summary:')) {
      current.summary = line.slice('- Summary:'.length).trim();
    } else if (line.startsWith('- Sections:')) {
      const rawSections = line.slice('- Sections:'.length).trim();
      if (rawSections && rawSections.toLowerCase() !== 'none') {
        current.sections = rawSections
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
      } else {
        current.sections = [];
      }
    }
  }
  commitCurrent();

  return entries;
}

export function isValidDocsIndexMarkdown(text: string): boolean {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed.startsWith(DOCS_INDEX_HEADER_PREFIX)) return false;
  if (utf8ByteLength(text) > MAX_DOCS_INDEX_BYTES) return false;
  const entries = parsePluginDocsIndex(trimmed);
  return entries.length > 0;
}

function serializeWithCap(payload: DocsLookupPayload): string {
  const raw = JSON.stringify(payload);
  if (raw.length <= MAX_TOOL_OUTPUT_CHARS) return raw;

  if (payload.mode === 'overview') {
    for (const limit of [6, 4, 3, 2, 1]) {
      const trimmedCategories: Record<string, OverviewCategorySummary> = {};
      let anyTruncated = false;
      for (const [cat, summary] of Object.entries(payload.categories)) {
        const sliced = summary.items.slice(0, limit);
        const isCatTruncated = sliced.length < summary.items.length;
        if (isCatTruncated) anyTruncated = true;
        trimmedCategories[cat] = {
          count: summary.count,
          items: sliced,
          ...(isCatTruncated ? { truncated: true } : {})
        };
      }
      const candidate = JSON.stringify({
        ...payload,
        ...(anyTruncated ? { truncated: true } : {}),
        categories: trimmedCategories
      });
      if (candidate.length <= MAX_TOOL_OUTPUT_CHARS) {
        return candidate;
      }
    }

    const countsOnly: Record<string, OverviewCategorySummary> = {};
    for (const [cat, summary] of Object.entries(payload.categories)) {
      countsOnly[cat] = {
        count: summary.count,
        items: [],
        ...(summary.count > 0 ? { truncated: true } : {})
      };
    }
    return JSON.stringify({
      ...payload,
      truncated: true,
      categories: countsOnly
    });
  }

  if (payload.mode === 'category') {
    const noSections = payload.results.map(item => ({
      ...item,
      sections: [] as string[]
    }));
    const noSectionsCandidate = JSON.stringify({ ...payload, results: noSections });
    if (noSectionsCandidate.length <= MAX_TOOL_OUTPUT_CHARS) {
      return noSectionsCandidate;
    }

    const trimmed = [...noSections];
    while (trimmed.length > 1) {
      trimmed.pop();
      const candidate = JSON.stringify({
        ...payload,
        truncated: true,
        results: trimmed
      });
      if (candidate.length <= MAX_TOOL_OUTPUT_CHARS) return candidate;
    }

    return JSON.stringify({
      ...payload,
      truncated: payload.results.length > 1,
      results: trimmed.slice(0, 1).map(r => ({
        ...r,
        summary: r.summary.slice(0, 160),
        sections: []
      }))
    });
  }

  const trimmedResults = payload.results.map(item => ({
    ...item,
    sections: item.sections.slice(0, 4)
  }));
  while (trimmedResults.length > 1) {
    const candidate = JSON.stringify({ ...payload, results: trimmedResults });
    if (candidate.length <= MAX_TOOL_OUTPUT_CHARS) return candidate;
    trimmedResults.pop();
  }
  if (trimmedResults.length === 1) {
    const single = { ...trimmedResults[0], sections: [] as string[] };
    const candidate = JSON.stringify({ ...payload, results: [single] });
    if (candidate.length <= MAX_TOOL_OUTPUT_CHARS) return candidate;
  }

  return JSON.stringify({
    ...payload,
    results: trimmedResults.slice(0, 1).map(r => ({
      ...r,
      summary: r.summary.slice(0, 160),
      sections: []
    }))
  });
}

export function queryPluginDocsEntries(
  entries: PluginDocEntry[],
  args: LookupPluginDocsArgs
): string {
  const category = normalizeCategory(args.category);
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  const scopedEntries = category === 'all' ? entries : entries.filter(e => e.category === category);

  if (query.length > 0) {
    const terms = extractQueryTerms(query);
    if (terms.length > 0) {
      const includeLegalBoost = terms.some(t => LEGAL_QUERY_TERMS.has(t));
      const scored = scopedEntries
        .map(entry => ({ entry, score: scoreEntry(terms, entry, includeLegalBoost) }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title));

      // Multi-topic diversity: always lock in #1 combined hit, then top hit per distinct term
      const selectedScored: { entry: PluginDocEntry; score: number }[] = [];
      const seenUrls = new Set<string>();

      if (scored.length > 0) {
        seenUrls.add(scored[0].entry.url);
        selectedScored.push(scored[0]);
      }

      for (const term of terms) {
        if (selectedScored.length >= MAX_SEARCH_RESULTS) break;
        let bestItem: { entry: PluginDocEntry; score: number } | null = null;
        let bestScore = 0;
        for (const item of scored) {
          let termScore = scoreTermForEntry(term, item.entry);
          if (termScore > 0 && item.entry.category === 'legal' && !includeLegalBoost) {
            termScore *= 0.25;
          }
          if (termScore > bestScore) {
            bestScore = termScore;
            bestItem = item;
          }
        }
        if (bestItem && !seenUrls.has(bestItem.entry.url)) {
          seenUrls.add(bestItem.entry.url);
          selectedScored.push(bestItem);
        }
      }

      for (const item of scored) {
        if (selectedScored.length >= MAX_SEARCH_RESULTS) break;
        if (!seenUrls.has(item.entry.url)) {
          seenUrls.add(item.entry.url);
          selectedScored.push(item);
        }
      }

      selectedScored.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title));

      return serializeWithCap({
        mode: 'search',
        query,
        totalMatches: scored.length,
        results: selectedScored.map(item => item.entry)
      });
    }
  }

  if (category !== 'all') {
    return serializeWithCap({
      mode: 'category',
      category,
      totalInCategory: scopedEntries.length,
      results: scopedEntries
    });
  }

  const categories: Record<string, OverviewCategorySummary> = {};
  for (const entry of entries) {
    if (!categories[entry.category]) {
      categories[entry.category] = { count: 0, items: [] };
    }
    const relPath = entry.url.startsWith(DOCS_BASE_URL)
      ? entry.url.slice(DOCS_BASE_URL.length)
      : entry.url;
    categories[entry.category].count += 1;
    categories[entry.category].items.push({ title: entry.title, path: relPath });
  }

  return serializeWithCap({
    mode: 'overview',
    docsBaseUrl: DOCS_BASE_URL,
    docsHomeUrl: DOCS_HOME_URL,
    totalEntries: entries.length,
    categories
  });
}

export async function fetchAndCacheDocsIndex(
  storage: AgentStorage,
  logger?: AgentAuditLogger,
  signal?: AbortSignal
): Promise<string | null> {
  if (inflightDocsFetch) {
    return raceWithAbort(inflightDocsFetch, signal);
  }

  inflightDocsFetch = (async () => {
    try {
      const response = await raceWithAbort(
        requestUrl({
          url: DOCS_INDEX_URL,
          method: 'GET',
          headers: {
            'User-Agent': 'Obsidian-FullCalendar-Remastered/Agent'
          }
        }),
        signal
      );
      if (response.status === 200 && isValidDocsIndexMarkdown(response.text)) {
        await storage.saveCachedDocsIndex(response.text);
        logger?.info('Loaded and cached plugin docs index from CDN', {
          url: DOCS_INDEX_URL
        });
        return response.text;
      }
      logger?.warn('Received invalid plugin docs index payload from CDN', {
        status: response.status
      });
      return null;
    } catch (err) {
      logger?.warn('Failed to download plugin docs index from CDN', {
        url: DOCS_INDEX_URL,
        error: String(err)
      });
      return null;
    } finally {
      inflightDocsFetch = null;
    }
  })();

  return inflightDocsFetch;
}

export async function executeLookupPluginDocs(
  storage: AgentStorage,
  args: Record<string, unknown>,
  logger?: AgentAuditLogger,
  signal?: AbortSignal
): Promise<string> {
  let markdown = await storage.loadCachedDocsIndex();
  if (!markdown || !isValidDocsIndexMarkdown(markdown)) {
    markdown = await fetchAndCacheDocsIndex(storage, logger, signal);
  }

  if (!markdown || !isValidDocsIndexMarkdown(markdown)) {
    return JSON.stringify({
      available: false,
      reason: 'offline_or_unreachable',
      docsHomeUrl: DOCS_HOME_URL
    });
  }

  const entries = parsePluginDocsIndex(markdown);
  const query = typeof args.query === 'string' ? args.query : undefined;
  const category = typeof args.category === 'string' ? args.category : undefined;
  return queryPluginDocsEntries(entries, { query, category });
}

export async function refreshCachedDocsIndexForVersionUpdate(
  app: App,
  pluginId: string
): Promise<boolean> {
  const path = normalizePath(
    `${app.vault.configDir}/plugins/${pluginId}/${AGENT_DOCS_INDEX_RELATIVE_PATH}`
  );
  const exists = await app.vault.adapter.exists(path);
  if (!exists) {
    return false;
  }

  const response = await requestUrl({
    url: DOCS_INDEX_URL,
    method: 'GET',
    headers: {
      'User-Agent': 'Obsidian-FullCalendar-Remastered/Agent'
    }
  });

  if (response.status !== 200 || !isValidDocsIndexMarkdown(response.text)) {
    throw new Error(`Invalid plugin docs index response (status ${response.status}).`);
  }

  await app.vault.adapter.write(path, response.text);
  return true;
}
