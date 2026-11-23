/**
 * @file chartAnchorParser.ts
 * @brief Inline `[[chart:<id>]]` anchor splitter and streaming buffer filter.
 */

export type ContentSegment =
  { type: 'markdown'; text: string } | { type: 'chart'; chartId: string };

const CHART_ANCHOR_REGEX = /\[\[chart:([a-zA-Z0-9_-]+)\]\]/g;
const PARTIAL_TRAILING_ANCHOR_REGEX =
  /(?:\[(?:\[(?:c(?:h(?:a(?:r(?:t(?::[a-zA-Z0-9_-]*)?)?)?)?)?)?\]?)?)$/;

export function stripChartAnchors(markdown: string): string {
  if (!markdown) return '';
  return markdown.replace(CHART_ANCHOR_REGEX, '');
}

export function splitContentByChartAnchors(
  markdown: string,
  validChartIds: Set<string>
): ContentSegment[] {
  if (!markdown) return [];
  if (validChartIds.size === 0) {
    const cleaned = stripChartAnchors(markdown);
    return cleaned.trim().length > 0 ? [{ type: 'markdown', text: cleaned }] : [];
  }

  const segments: ContentSegment[] = [];
  let lastIndex = 0;
  let pendingText = '';
  let match: RegExpExecArray | null;
  CHART_ANCHOR_REGEX.lastIndex = 0;

  while ((match = CHART_ANCHOR_REGEX.exec(markdown)) !== null) {
    const chartId = match[1];
    pendingText += markdown.slice(lastIndex, match.index);
    lastIndex = match.index + match[0].length;
    if (!validChartIds.has(chartId)) {
      continue;
    }
    if (pendingText.trim().length > 0) {
      segments.push({ type: 'markdown', text: pendingText });
    }
    pendingText = '';
    segments.push({ type: 'chart', chartId });
  }

  if (lastIndex < markdown.length) {
    pendingText += markdown.slice(lastIndex);
  }
  if (pendingText.trim().length > 0 || (segments.length === 0 && pendingText.length > 0)) {
    segments.push({ type: 'markdown', text: pendingText });
  }

  return segments;
}

/**
 * Buffers partial `[[chart:...]]` tokens during live plain-text streaming so raw
 * anchor brackets do not flash before final markdown/card rendering.
 */
export class StreamingChartAnchorFilter {
  private buffer = '';

  public push(delta: string): string {
    if (!delta) return '';
    this.buffer += delta;

    // Strip any complete `[[chart:...]]` tokens from the live plain-text stream
    this.buffer = this.buffer.replace(CHART_ANCHOR_REGEX, '');

    const partialMatch = PARTIAL_TRAILING_ANCHOR_REGEX.exec(this.buffer);
    if (partialMatch && partialMatch[0].length > 0) {
      const safe = this.buffer.slice(0, partialMatch.index);
      this.buffer = this.buffer.slice(partialMatch.index);
      return safe;
    }

    const out = this.buffer;
    this.buffer = '';
    return out;
  }

  public finish(): string {
    const remaining = this.buffer.replace(CHART_ANCHOR_REGEX, '');
    this.buffer = '';
    return remaining;
  }
}
