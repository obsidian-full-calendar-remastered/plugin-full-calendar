/**
 * @file suggestionsParser.ts
 * @brief Streaming prefix-masking and extraction for dynamic `<suggestions>` follow-up chips.
 *
 * @license See LICENSE.md
 */

const OPEN_TAG_NAME = '<suggestions';
const MAX_SUGGESTIONS = 3;
const MAX_SUGGESTION_CHARS = 90;

const COMPLETE_TAG_REGEX = /<suggestions\b[^>]*>([\s\S]*?)<\/suggestions>/gi;
const UNCLOSED_TAG_REGEX = /<suggestions\b[^>]*>([\s\S]*)$/i;
const PARTIAL_TRAILING_TAG_REGEX = /\s*<sug[a-z]*$/i;

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseSuggestionItems(rawBody: string): string[] {
  let body = rawBody.trim();
  if (!body) {
    return [];
  }

  // Strip optional markdown code fences
  if (body.startsWith('```')) {
    body = body
      .replace(/^```(?:json|text)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }

  let candidates: string[] = [];

  if (body.startsWith('[')) {
    try {
      const parsed = JSON.parse(body) as unknown;
      if (Array.isArray(parsed)) {
        candidates = parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      // Fall back to line-based parsing if a smaller model emitted malformed JSON
    }
  }

  if (candidates.length === 0) {
    candidates = body
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line !== '[' && line !== ']' && line.length > 0)
      .map(line =>
        line
          .replace(/^[-*•]\s+/, '')
          .replace(/^\d+[.)]\s+/, '')
          .replace(/,\s*$/, '')
          .trim()
      )
      .map(stripWrappingQuotes);
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawItem of candidates) {
    const item = rawItem.replace(/\s+/g, ' ').trim();
    if (!item || item.length > MAX_SUGGESTION_CHARS) {
      continue;
    }
    const key = item.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
    if (result.length >= MAX_SUGGESTIONS) {
      break;
    }
  }

  return result;
}

/**
 * Extracts follow-up suggestions from `<suggestions>...</suggestions>` tags and strips
 * tag blocks (including unclosed trailing tags) from the assistant message text.
 */
export function extractFollowUpSuggestions(rawText: string): {
  cleanText: string;
  suggestions: string[];
} {
  if (!rawText) {
    return { cleanText: '', suggestions: [] };
  }

  let capturedBody = '';
  let cleanText = rawText.replace(COMPLETE_TAG_REGEX, (_match, inner: string) => {
    if (inner && inner.trim()) {
      capturedBody = inner;
    }
    return '';
  });

  if (!capturedBody) {
    const unclosedMatch = UNCLOSED_TAG_REGEX.exec(cleanText);
    if (unclosedMatch) {
      capturedBody = unclosedMatch[1] || '';
      cleanText = cleanText.slice(0, unclosedMatch.index);
    }
  } else {
    cleanText = cleanText.replace(UNCLOSED_TAG_REGEX, '');
  }

  cleanText = cleanText.replace(PARTIAL_TRAILING_TAG_REGEX, '').trimEnd();
  const suggestions = parseSuggestionItems(capturedBody);

  return { cleanText, suggestions };
}

/**
 * Masks `<suggestions>...</suggestions>` blocks during live token streaming while
 * allowing normal comparison text like `"meeting < 30 min"` to pass without stalling.
 */
export class StreamingSuggestionsFilter {
  private raw = '';
  private emittedLen = 0;
  private openTagFound = false;

  public push(delta: string): string {
    if (!delta) {
      return '';
    }
    this.raw += delta;

    if (this.openTagFound) {
      return '';
    }

    const unemitted = this.raw.slice(this.emittedLen);
    const lowerUnemitted = unemitted.toLowerCase();

    let searchStart = 0;
    while (searchStart < lowerUnemitted.length) {
      const tagIdx = lowerUnemitted.indexOf(OPEN_TAG_NAME, searchStart);
      if (tagIdx === -1) {
        break;
      }

      const afterTagIdx = tagIdx + OPEN_TAG_NAME.length;
      if (afterTagIdx === lowerUnemitted.length) {
        // Exact prefix `<suggestions` at end of chunk; wait for `>` or whitespace.
        const safeText = unemitted.slice(0, tagIdx);
        this.emittedLen += safeText.length;
        return safeText;
      }

      const nextChar = lowerUnemitted[afterTagIdx];
      if (nextChar === '>' || /\s/.test(nextChar)) {
        const safeText = unemitted.slice(0, tagIdx);
        this.emittedLen += safeText.length;
        this.openTagFound = true;
        return safeText;
      }

      searchStart = tagIdx + 1;
    }

    // Hold back only a trailing prefix that could still grow into `<suggestions`.
    const maxCheck = Math.min(OPEN_TAG_NAME.length - 1, lowerUnemitted.length);
    for (let suffixLen = maxCheck; suffixLen >= 1; suffixLen--) {
      const tail = lowerUnemitted.slice(lowerUnemitted.length - suffixLen);
      if (OPEN_TAG_NAME.startsWith(tail)) {
        const safeLen = unemitted.length - suffixLen;
        const safeText = unemitted.slice(0, safeLen);
        this.emittedLen += safeText.length;
        return safeText;
      }
    }

    this.emittedLen += unemitted.length;
    return unemitted;
  }

  public finish(): {
    remainingVisibleText: string;
    fullCleanText: string;
    suggestions: string[];
  } {
    const { cleanText, suggestions } = extractFollowUpSuggestions(this.raw);
    const remainingVisibleText =
      cleanText.length > this.emittedLen ? cleanText.slice(this.emittedLen) : '';
    return {
      remainingVisibleText,
      fullCleanText: cleanText,
      suggestions
    };
  }
}
