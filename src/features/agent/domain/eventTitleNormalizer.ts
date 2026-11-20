/**
 * @file eventTitleNormalizer.ts
 * @brief Pure domain helpers for normalizing agent event titles and category fields.
 *
 * @description
 * Keeps agent-staged events aligned with EventEnhancer's contract:
 * - When advanced categorization is enabled, event titles passed to EventCache must
 *   contain only the clean event title (without duplicated Category/SubCategory prefixes),
 *   with `category` and optional `subCategory` supplied as structured fields.
 * - When advanced categorization is disabled, titles remain literal and category fields
 *   are omitted so providers never persist stray categorization metadata.
 *
 * @license See LICENSE.md
 */

import { CATEGORY_TITLE_DELIMITER } from '../../category/categoryParser';

/**
 * Trims an optional string field and normalizes blank values to `undefined`.
 */
export function normalizeOptionalField(value?: string): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function stripLeadingDelimiterSegment(text: string, prefix: string): string {
  const segment = `${prefix}${CATEGORY_TITLE_DELIMITER}`;
  if (text.length <= segment.length) {
    return text;
  }
  if (text.slice(0, segment.length).toLowerCase() !== segment.toLowerCase()) {
    return text;
  }
  const remainder = text.slice(segment.length).trim();
  return remainder.length > 0 ? remainder : text;
}

/**
 * Strips one leading `category - ` and/or `subCategory - ` prefix (case-insensitive)
 * without collapsing legitimate repeated words inside the event title itself.
 */
export function extractCleanTitle(
  rawTitle: string,
  category?: string,
  subCategory?: string
): string {
  const trimmed = (rawTitle || '').trim();
  if (!trimmed) {
    return '';
  }

  let cleaned = trimmed;
  const cat = normalizeOptionalField(category);
  const sub = normalizeOptionalField(subCategory);

  if (cat) {
    cleaned = stripLeadingDelimiterSegment(cleaned, cat);
  }
  if (sub) {
    cleaned = stripLeadingDelimiterSegment(cleaned, sub);
  }

  return cleaned || trimmed;
}

export interface NormalizedEventTitleFields {
  title: string;
  category?: string;
  subCategory?: string;
}

/**
 * Produces EventCache-compatible `{ title, category, subCategory }` fields for agent proposals.
 */
export function normalizeEventTitleFields(params: {
  rawTitle: string;
  category?: string;
  subCategory?: string;
  enableAdvancedCategorization: boolean;
}): NormalizedEventTitleFields {
  const trimmedTitle = (params.rawTitle || '').trim();
  if (!params.enableAdvancedCategorization) {
    return {
      title: trimmedTitle,
      category: undefined,
      subCategory: undefined
    };
  }

  const category = normalizeOptionalField(params.category);
  const subCategory = category ? normalizeOptionalField(params.subCategory) : undefined;
  const title = extractCleanTitle(trimmedTitle, category, subCategory);

  return {
    title,
    category,
    subCategory
  };
}
