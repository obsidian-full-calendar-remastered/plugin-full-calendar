// --- helpers/url.ts ---
import { obsidianFetch } from './obsidian-fetch_caldav';
import { createBasicAuthHeader } from './auth_caldav';

export function ensureTrailingSlash(u: string) {
  return u.endsWith('/') ? u : `${u}/`;
}
export function stripTrailingSlash(u: string) {
  return u.endsWith('/') ? u.slice(0, -1) : u;
}
export function eqUrl(a: string, b: string) {
  return stripTrailingSlash(a).toLowerCase() === stripTrailingSlash(b).toLowerCase();
}

/**
 * Fetches calendar metadata (name, color) and validates that the URL is a
 * CalDAV calendar collection — all in a single PROPFIND request.
 */
export async function fetchCalendarInfo(
  url: string,
  auth?: { username?: string; password?: string }
): Promise<{
  isCalendar: boolean;
  displayName?: string;
  color?: string;
  supportedComponents?: string[];
  error?: string;
}> {
  const headers: Record<string, string> = {
    Depth: '0',
    'Content-Type': 'application/xml; charset=utf-8',
    Accept: '*/*'
  };

  const authHeader = createBasicAuthHeader(auth?.username, auth?.password);
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  const body = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:ical="http://apple.com/ns/ical/">
  <d:prop>
    <d:resourcetype/>
    <d:displayname/>
    <c:supported-calendar-component-set/>
    <ical:calendar-color/>
  </d:prop>
</d:propfind>`;

  try {
    const res = await obsidianFetch(url, { method: 'PROPFIND', headers, body });

    if (res.status >= 400) {
      return {
        isCalendar: false,
        error: `CalDAV PROPFIND failed with status ${res.status}.`
      };
    }

    const xml = await res.text();

    // Check for <calendar> inside <resourcetype>
    // Note: namespaces can vary, so we check for local name "calendar"
    // and ensure it's within resourcetype.
    // A simple regex check is usually sufficient for this specific property.
    // We look for <...:calendar .../> or <calendar .../>
    // But strictly it should be in the DAV:resourcetype property.

    // Regex to find resourcetype block
    const resourceTypeMatch = /<[^:]*:?resourcetype[^>]*>([\s\S]*?)<\/[^:]*:?resourcetype>/i.exec(
      xml
    );
    const isCalendar = resourceTypeMatch
      ? /<(?:[a-zA-Z0-9]+:)?calendar\b[^>]*>/i.test(resourceTypeMatch[1])
      : false;

    // Extract displayname
    const displayName = /<[^:]*:?displayname[^>]*>([^<]*)<\/[^:]*:?displayname>/i
      .exec(xml)?.[1]
      ?.trim();

    // Extract calendar-color and normalize
    const color = /<[^:]*:?calendar-color[^>]*>(#?[0-9A-Fa-f]+)<\/[^:]*:?calendar-color>/i
      .exec(xml)?.[1]
      ?.replace(/^(?!#)/, '#')
      ?.match(/^.{7}/)?.[0];

    const componentSet =
      /<[^:]*:?supported-calendar-component-set\b[^>]*>([\s\S]*?)<\/[^:]*:?supported-calendar-component-set>/i.exec(
        xml
      );
    const supportedComponents = componentSet
      ? Array.from(
          componentSet[1].matchAll(
            /<(?:[a-zA-Z0-9]+:)?comp\b[^>]*\bname=["']([^"']+)["'][^>]*\/?\s*>/gi
          )
        ).map(match => match[1].toUpperCase())
      : undefined;

    return { isCalendar, displayName, color, supportedComponents };
  } catch (e) {
    console.error(`[CalDAV] Error fetching calendar info for ${url}`, e);
    const message = e instanceof Error ? e.message : String(e);
    return { isCalendar: false, error: message };
  }
}

/**
 * Basic URL splitter.
 * Now just separates potential server root from the full URL if possible,
 * but relies on validation for the actual collection check.
 */
export function splitCalDAVUrl(input: string): { serverUrl: string; collectionUrl: string } {
  if (!/^https?:\/\//i.test(input)) {
    throw new Error(`Invalid CalDAV URL (missing scheme): ${input}`);
  }
  const raw = input.trim();
  // We assume the input IS the collection URL if the user provides it.
  // The server URL is just a guess (up to /caldav/ or just the root).

  let serverUrl = raw;
  const needle = '/caldav/';
  const i = raw.toLowerCase().indexOf(needle);
  if (i >= 0) {
    serverUrl = raw.slice(0, i + needle.length);
  } else {
    try {
      const u = new URL(raw);
      serverUrl = `${u.protocol}//${u.host}/`;
    } catch {
      // fallback
    }
  }

  return {
    serverUrl: ensureTrailingSlash(serverUrl),
    collectionUrl: ensureTrailingSlash(raw)
  };
}
