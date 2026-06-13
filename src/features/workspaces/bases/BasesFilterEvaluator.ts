/**
 * @file BasesFilterEvaluator.ts
 * @brief Evaluation utility for Obsidian Bases filter expressions.
 * @license See LICENSE.md
 */

import { TFile, MetadataCache } from 'obsidian';

export interface BaseFilter {
  or?: (BaseFilter | string)[];
  and?: (BaseFilter | string)[];
  not?: (BaseFilter | string)[];
}

export interface BaseFile {
  filters?: BaseFilter;
  views?: unknown[];
  properties?: unknown;
}

export interface FilterContext {
  calendarId?: string;
  calendarName?: string;
  category?: string;
  subCategory?: string;
}

/**
 * Extracts all tags from cached metadata frontmatter or inline tags array.
 */
export function getTagsFromCache(cache: {
  tags?: { tag: string }[];
  frontmatter?: Record<string, unknown>;
}): string[] {
  const tags: Set<string> = new Set();

  if (cache.tags) {
    for (const t of cache.tags) {
      if (t.tag) {
        tags.add(t.tag);
      }
    }
  }

  const frontmatter = cache.frontmatter;
  if (frontmatter) {
    const processVal = (val: unknown) => {
      if (typeof val === 'string') {
        val.split(/[\s,]+/).forEach(item => {
          const trimmed = item.trim();
          if (trimmed) {
            tags.add(trimmed.startsWith('#') ? trimmed : `#${trimmed}`);
          }
        });
      } else if (Array.isArray(val)) {
        val.forEach(item => {
          if (typeof item === 'string') {
            tags.add(item.startsWith('#') ? item : `#${item}`);
          }
        });
      }
    };

    if (frontmatter.tags) processVal(frontmatter.tags);
    if (frontmatter.tag) processVal(frontmatter.tag);
  }

  return Array.from(tags);
}

/**
 * Recursively evaluates a Bases filter tree against a given file.
 * @param filter The filter tree node or string statement.
 * @param file The TFile to evaluate against.
 * @param metadataCache Obsidian MetadataCache instance.
 * @param context Optional event context for extended checks.
 */
export function evaluateBaseFilter(
  filter: BaseFilter | string,
  file: TFile,
  metadataCache: MetadataCache,
  context?: FilterContext
): boolean {
  if (typeof filter === 'string') {
    return evaluateBaseFilterString(filter, file, metadataCache, context);
  }

  if (filter.or) {
    return filter.or.some(f => evaluateBaseFilter(f, file, metadataCache, context));
  }
  if (filter.and) {
    return filter.and.every(f => evaluateBaseFilter(f, file, metadataCache, context));
  }
  if (filter.not) {
    return !filter.not.some(f => evaluateBaseFilter(f, file, metadataCache, context));
  }
  return true; // Default to true for empty filter object
}

/**
 * Evaluates a single string-based filter statement.
 */
export function evaluateBaseFilterString(
  statement: string,
  file: TFile,
  metadataCache: MetadataCache,
  context?: FilterContext
): boolean {
  const cache = metadataCache.getFileCache(file);
  const tags = getTagsFromCache(cache || {});

  // 1. Tag checks: file.hasTag("tag")
  if (statement.includes('file.hasTag')) {
    const match = statement.match(/file\.hasTag\("([^"]+)"\)/);
    if (match) {
      const tag = match[1];
      return tags.some(t => t === tag || t === `#${tag}`);
    }
  }

  // 2. Folder checks: file.inFolder("folder")
  if (statement.includes('file.inFolder')) {
    const match = statement.match(/file\.inFolder\("([^"]+)"\)/);
    if (match) {
      const folder = match[1];
      return file.path.startsWith(folder);
    }
  }

  // 3. Extension checks: file.ext == "md"
  if (statement.includes('file.ext')) {
    if (statement.includes('"md"')) {
      return file.extension === 'md';
    }
  }

  // 4. Context variables checks (e.g. file.calendarId, file.calendarName, file.category, file.subCategory)
  if (context) {
    if (statement.includes('file.calendarId')) {
      const match = statement.match(/file\.calendarId\s*==?\s*"([^"]+)"/);
      if (match) return context.calendarId === match[1];
    }
    if (statement.includes('file.calendarName')) {
      const match = statement.match(/file\.calendarName\s*==?\s*"([^"]+)"/);
      if (match) return context.calendarName === match[1];
    }
    if (statement.includes('file.category')) {
      const match = statement.match(/file\.category\s*==?\s*"([^"]+)"/);
      if (match) return context.category === match[1];
    }
    if (statement.includes('file.subCategory')) {
      const match = statement.match(/file\.subCategory\s*==?\s*"([^"]+)"/);
      if (match) return context.subCategory === match[1];
    }
  }

  // 5. Property comparisons (e.g. status == "done", isTask == true, priority > 3)
  const frontmatter = (cache?.frontmatter || {}) as Record<string, unknown>;

  // Equals comparison (handles strings, booleans, and numbers)
  const eqMatch = statement.match(/^([a-zA-Z0-9_.-]+)\s*==?\s*(?:"([^"]+)"|([a-zA-Z0-9_-]+))$/);
  if (eqMatch) {
    const propName = eqMatch[1];
    const stringVal = eqMatch[2];
    const rawVal = eqMatch[3];

    const expectedVal = stringVal !== undefined ? stringVal : rawVal;
    const actualVal = frontmatter[propName];

    if (actualVal === undefined || actualVal === null) {
      return false;
    }

    if (expectedVal === 'true') return actualVal === true;
    if (expectedVal === 'false') return actualVal === false;

    if (!isNaN(Number(expectedVal)) && typeof actualVal === 'number') {
      return actualVal === Number(expectedVal);
    }

    if (
      typeof actualVal === 'string' ||
      typeof actualVal === 'number' ||
      typeof actualVal === 'boolean'
    ) {
      return String(actualVal) === expectedVal;
    }
    return false;
  }

  // Inequality comparisons (e.g. priority > 3, priority <= 5)
  const ineqMatch = statement.match(/^([a-zA-Z0-9_.-]+)\s*(>=|<=|>|<)\s*([0-9.-]+)$/);
  if (ineqMatch) {
    const propName = ineqMatch[1];
    const operator = ineqMatch[2];
    const expectedNum = Number(ineqMatch[3]);
    const actualVal = Number(frontmatter[propName]);

    if (isNaN(actualVal) || frontmatter[propName] === undefined) {
      return false;
    }

    switch (operator) {
      case '>':
        return actualVal > expectedNum;
      case '<':
        return actualVal < expectedNum;
      case '>=':
        return actualVal >= expectedNum;
      case '<=':
        return actualVal <= expectedNum;
    }
  }

  // Presence check (e.g. status)
  const wordMatch = statement.match(/^([a-zA-Z0-9_.-]+)$/);
  if (wordMatch) {
    const propName = wordMatch[1];
    return frontmatter[propName] !== undefined && frontmatter[propName] !== null;
  }

  return true; // Inclusive fallback for unsupported filter statements
}
