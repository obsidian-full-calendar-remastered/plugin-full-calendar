/**
 * @file webBrowseTool.ts
 * @brief Lean web fetching and sanitization tool for online schedules.
 *
 * @description
 * Uses Obsidian's CORS-free requestUrl API to fetch online schedules,
 * syllabi, timetables, and fixtures. Strips boilerplate and scripts, returning
 * clean text for the LLM to extract events from.
 *
 * @license See LICENSE.md
 */

import { requestUrl } from 'obsidian';

const MAX_OUTPUT_CHARS = 15000;

/**
 * Strips HTML boilerplate and converts structure into clean plain text.
 */
function sanitizeHtmlToText(html: string): string {
  // 1. Remove dangerous or non-content tags
  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '');

  // 2. Preserve headings and list items with clean linebreaks
  cleaned = cleaned
    .replace(/<(h[1-6]|p|div|br|tr|li)[\s>]/gi, '\n')
    .replace(/<td[\s>]/gi, ' | ')
    .replace(/<\/td>/gi, '')
    .replace(/<\/?[^>]+(>|$)/g, ''); // Strip remaining tags

  // 3. Decode common HTML entities
  cleaned = cleaned
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // 4. Collapse consecutive whitespace and empty lines
  cleaned = cleaned
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');

  if (cleaned.length > MAX_OUTPUT_CHARS) {
    cleaned = `${cleaned.slice(0, MAX_OUTPUT_CHARS)}\n\n[...Content truncated for length...]`;
  }

  return cleaned;
}

function isPrivateOrLocalHost(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host === '169.254.169.254' ||
      host.endsWith('.local')
    ) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * Browses an online schedule URL and extracts content text.
 */
export async function browseScheduleOnline(url: string): Promise<string> {
  try {
    const trimmed = url.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return `Error: URL must start with http:// or https://. Received: ${url}`;
    }

    if (isPrivateOrLocalHost(trimmed)) {
      return `Error: Access to private or internal network addresses is blocked for security: ${trimmed}`;
    }

    const response = await requestUrl({
      url: trimmed,
      method: 'GET',
      headers: {
        'User-Agent': 'Obsidian-FullCalendar-Remastered/Agent'
      }
    });

    if (response.status >= 400) {
      return `Failed to fetch URL (${response.status}): ${response.text?.slice(0, 200) || 'Unknown error'}`;
    }

    const contentType = (response.headers['content-type'] || '').toLowerCase();
    // Reject binary content
    if (
      contentType.includes('image/') ||
      contentType.includes('audio/') ||
      contentType.includes('video/') ||
      contentType.includes('application/octet-stream') ||
      contentType.includes('application/pdf') ||
      contentType.includes('application/zip')
    ) {
      return `Error: URL returned unsupported binary content (${contentType}). Only web pages and .ics calendar files are supported.`;
    }

    const rawText = response.text || '';
    if (contentType.includes('text/calendar') || trimmed.endsWith('.ics')) {
      // Raw ICS file
      return `[ICS Calendar File Content]:\n${rawText.slice(0, MAX_OUTPUT_CHARS)}`;
    }

    const extracted = sanitizeHtmlToText(rawText);
    if (!extracted.trim()) {
      return 'Notice: The page was fetched successfully but contained no readable text content.';
    }

    return extracted;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error fetching schedule from URL "${url}": ${msg}`;
  }
}
