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
import { raceWithAbort } from '../domain/abortUtils';

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

function isPrivateIpv4(host: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const octets = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
  if (octets.some(o => o < 0 || o > 255)) return true;
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  if (!host.includes(':')) return false;
  const lower = host.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.slice(7);
    if (isPrivateIpv4(mapped)) return true;
    const hexParts = mapped.split(':');
    if (hexParts.length === 2) {
      const hi = parseInt(hexParts[0], 16);
      const lo = parseInt(hexParts[1], 16);
      if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
        const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        if (isPrivateIpv4(ipv4)) return true;
      }
    }
    return true;
  }
  // Link-local fe80::/10 and Unique Local fc00::/7
  const firstGroup = parseInt(lower.split(':')[0] || '0', 16);
  if (!Number.isNaN(firstGroup)) {
    if ((firstGroup & 0xffc0) === 0xfe80) return true;
    if ((firstGroup & 0xfe00) === 0xfc00) return true;
  }
  return false;
}

function isPrivateOrLocalHost(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      !host ||
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      isPrivateIpv4(host) ||
      isPrivateIpv6(host)
    ) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

const BLOCKED_PLUGIN_DOCS_HOSTS = new Set([
  'obsidian-full-calendar-remastered.github.io',
  'fcr-cdn.plugin-fcr.workers.dev'
]);

function isBlockedPluginDocsHost(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return BLOCKED_PLUGIN_DOCS_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Browses an online schedule URL and extracts content text.
 */
export async function browseScheduleOnline(url: string, signal?: AbortSignal): Promise<string> {
  try {
    const trimmed = url.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return `Error: URL must start with http:// or https://. Received: ${url}`;
    }

    if (isPrivateOrLocalHost(trimmed)) {
      return `Error: Access to private or internal network addresses is blocked for security: ${trimmed}`;
    }

    if (isBlockedPluginDocsHost(trimmed)) {
      return 'Error: Use lookup_plugin_docs instead of browse_schedule_online for Full Calendar Remastered documentation.';
    }

    const response = await raceWithAbort(
      requestUrl({
        url: trimmed,
        method: 'GET',
        headers: {
          'User-Agent': 'Obsidian-FullCalendar-Remastered/Agent'
        }
      }),
      signal
    );

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
    if (signal?.aborted) {
      throw err instanceof Error ? err : new Error('Agent request was cancelled by user.');
    }
    const msg = err instanceof Error ? err.message : String(err);
    return `Error fetching schedule from URL "${url}": ${msg}`;
  }
}
