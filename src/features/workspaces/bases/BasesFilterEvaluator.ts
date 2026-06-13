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
 */
export function evaluateBaseFilter(
  filter: BaseFilter | string,
  file: TFile,
  metadataCache: MetadataCache
): boolean {
  if (typeof filter === 'string') {
    return evaluateBaseFilterString(filter, file, metadataCache);
  }

  if (filter.or) {
    return filter.or.some(f => evaluateBaseFilter(f, file, metadataCache));
  }
  if (filter.and) {
    return filter.and.every(f => evaluateBaseFilter(f, file, metadataCache));
  }
  if (filter.not) {
    return !filter.not.some(f => evaluateBaseFilter(f, file, metadataCache));
  }
  return true; // Default to true for empty filter object
}

/**
 * Evaluates a single string-based filter statement.
 */
export function evaluateBaseFilterString(
  statement: string,
  file: TFile,
  metadataCache: MetadataCache
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

  // 4. Property comparisons (e.g. status == "done", priority > 3)
  const frontmatter = cache?.frontmatter || {};

  // Match equals comparison (e.g., status == "done" or status = "done")
  const eqMatch = statement.match(/^([a-zA-Z0-9_-]+)\s*==?\s*"([^"]+)"$/);
  if (eqMatch) {
    const propName = eqMatch[1];
    const propVal = eqMatch[2];
    return String(frontmatter[propName]) === propVal;
  }

  // Match existence checks (e.g., just "date" or "category")
  const wordMatch = statement.match(/^([a-zA-Z0-9_-]+)$/);
  if (wordMatch) {
    const propName = wordMatch[1];
    return frontmatter[propName] !== undefined && frontmatter[propName] !== null;
  }

  return true; // Inclusive fallback for unsupported filter statements
}
