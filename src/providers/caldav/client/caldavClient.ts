import ical from 'ical.js';
import { obsidianFetch } from '../obsidian-fetch_caldav';
import { createBasicAuthHeader } from '../auth/auth_caldav';
import { canonCollection } from './helper_caldav';
import { CalendarObjectData, CalendarObjectRef } from '../types/typesCalDAV';
import { t } from '../../../features/i18n/i18n';

// Helper to format a Date object into the format CalDAV expects (YYYYMMDDTHHMMSSZ).
export function ymdhmsZ(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

export function assertNonEmptyText(text: string, message: string): string {
  if (!text.trim()) {
    throw new Error(message);
  }
  return text;
}

export function assertIcsPayload(ics: string, source: string): string {
  if (!ics.trim()) {
    throw new Error(`${source} returned an empty ICS payload.`);
  }
  if (!/BEGIN:VCALENDAR/i.test(ics)) {
    throw new Error(`${source} returned invalid ICS payload (missing BEGIN:VCALENDAR).`);
  }
  return ics;
}

export function ensureXmlDocument(xml: string, source: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error(`${source} returned malformed XML.`);
  }
  return doc;
}

export function parseStatusCode(statusLine: string): number | null {
  const match = statusLine.match(/\s(\d{3})(?:\s|$)/);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

export function shouldUseCompatibilityFetch(status: number): boolean {
  return status === 400 || status === 422;
}

export function getSuccessfulPropNode(response: Element): Element | null {
  const propstats = response.getElementsByTagNameNS('*', 'propstat');

  for (let i = 0; i < propstats.length; i++) {
    const propstat = propstats[i];
    const status = propstat.getElementsByTagNameNS('*', 'status')[0]?.textContent || '';
    const statusCode = parseStatusCode(status);
    if (statusCode === null || statusCode < 200 || statusCode >= 300) continue;

    const prop = propstat.getElementsByTagNameNS('*', 'prop')[0];
    if (prop) {
      return prop;
    }
  }

  return null;
}

export function extractCalendarDataFromMultiStatus(doc: Document): CalendarObjectData[] {
  const icsList: CalendarObjectData[] = [];
  const responses = Array.from(doc.getElementsByTagNameNS('*', 'response'));

  for (const response of responses) {
    const hrefNode =
      response.getElementsByTagNameNS('DAV:', 'href')[0] ||
      response.getElementsByTagNameNS('*', 'href')[0];
    const href = hrefNode?.textContent?.trim() || '';
    const propstats = Array.from(response.getElementsByTagNameNS('*', 'propstat'));
    const successfulProps: Element[] = [];

    for (const propstat of propstats) {
      const status = propstat.getElementsByTagNameNS('*', 'status')[0]?.textContent || '';
      const statusCode = parseStatusCode(status);
      if (statusCode === null || statusCode < 200 || statusCode >= 300) continue;

      const prop = propstat.getElementsByTagNameNS('*', 'prop')[0];
      if (prop) successfulProps.push(prop);
    }

    const calendarData = successfulProps
      .flatMap(prop => {
        const namespaced = Array.from(
          prop.getElementsByTagNameNS('urn:ietf:params:xml:ns:caldav', 'calendar-data')
        );
        return namespaced.length > 0
          ? namespaced
          : Array.from(prop.getElementsByTagNameNS('*', 'calendar-data'));
      })
      .find(node => Boolean(node.textContent?.trim()));

    // Apple includes the collection itself in a 207 response. Its calendar-data
    // property is empty or belongs to a 404 propstat; neither is a task resource.
    if (!calendarData?.textContent?.trim()) continue;

    let etag: string | undefined;
    for (const prop of successfulProps) {
      etag =
        prop.getElementsByTagNameNS('DAV:', 'getetag')[0]?.textContent?.trim() ||
        prop.getElementsByTagNameNS('*', 'getetag')[0]?.textContent?.trim() ||
        etag;
    }

    icsList.push({
      href,
      // Parsing stays resource-scoped in the provider so one malformed object
      // cannot discard other valid resources from the same 207 response.
      ics: calendarData.textContent.trim(),
      etag: etag || undefined
    });
  }

  return icsList;
}

export function extractCalendarObjectRefs(doc: Document): CalendarObjectRef[] {
  const refs: CalendarObjectRef[] = [];
  const responses = Array.from(doc.getElementsByTagNameNS('*', 'response'));

  for (const response of responses) {
    const hrefNode =
      response.getElementsByTagNameNS('DAV:', 'href')[0] ||
      response.getElementsByTagNameNS('*', 'href')[0];
    const href = hrefNode?.textContent?.trim();
    if (!href || href.endsWith('/')) {
      continue;
    }

    const prop = getSuccessfulPropNode(response);
    let etag =
      prop?.getElementsByTagNameNS('DAV:', 'getetag')[0]?.textContent ||
      prop?.getElementsByTagNameNS('*', 'getetag')[0]?.textContent ||
      undefined;

    if (etag) {
      etag = etag.trim();
    }

    refs.push({ href, etag: etag || undefined });
  }

  return refs;
}

export function resolveCollectionObjectUrl(collectionUrl: string, href: string): string {
  return new URL(href, collectionUrl).toString();
}

export function resolveEventObjectUrl(homeUrl: string, persistentId: string): string {
  if (/^https?:\/\//i.test(persistentId)) {
    return persistentId;
  }
  if (persistentId.endsWith('.ics') || persistentId.includes('/')) {
    return resolveCollectionObjectUrl(homeUrl, persistentId);
  }
  return `${canonCollection(homeUrl)}${persistentId}.ics`;
}

export function getUidFromHref(href: string): string {
  return decodeURIComponent(
    href
      .split('/')
      .pop()
      ?.replace(/\.ics$/i, '') || href
  );
}

export async function fetchCalendarObjectsByRefs(
  collectionUrl: string,
  refs: CalendarObjectRef[],
  authHeader?: string
): Promise<CalendarObjectData[]> {
  const getResults = await Promise.allSettled(
    refs.map(async ref => {
      const getHeaders: Record<string, string> = { Accept: 'text/calendar' };
      if (authHeader) {
        getHeaders['Authorization'] = authHeader;
      }

      const getUrl = resolveCollectionObjectUrl(collectionUrl, ref.href);
      const getRes = await obsidianFetch(getUrl, { method: 'GET', headers: getHeaders });
      const getText = await getRes.text();

      if (getRes.status < 200 || getRes.status >= 300) {
        throw new Error(`CalDAV fallback GET failed (${getRes.status}) for ${ref.href}`);
      }

      const payload: CalendarObjectData = {
        href: ref.href,
        ics: assertIcsPayload(getText, `CalDAV fallback GET for ${ref.href}`)
      };

      if (ref.etag) {
        payload.etag = ref.etag;
      }

      return payload;
    })
  );

  const successfulObjects: CalendarObjectData[] = [];
  const failedResults: PromiseRejectedResult[] = [];

  for (const result of getResults) {
    if (result.status === 'fulfilled') {
      successfulObjects.push(result.value);
    } else {
      failedResults.push(result);
    }
  }

  if (failedResults.length > 0) {
    console.warn(
      `[CalDAVProvider] Compatibility fallback skipped ${failedResults.length} event object(s).`
    );
  }

  if (successfulObjects.length === 0) {
    const firstMessage =
      failedResults[0] && failedResults[0].reason instanceof Error
        ? failedResults[0].reason.message
        : String(failedResults[0]?.reason ?? '');
    throw new Error(
      firstMessage || 'CalDAV fallback GET did not return any valid calendar objects.'
    );
  }

  return successfulObjects;
}

export async function fetchCalendarObjectsViaPropfindFallback(
  collectionUrl: string,
  authHeader?: string
): Promise<CalendarObjectData[]> {
  const propfindHeaders: Record<string, string> = {
    Depth: '1',
    'Content-Type': 'application/xml; charset=utf-8',
    Accept: '*/*'
  };
  if (authHeader) {
    propfindHeaders['Authorization'] = authHeader;
  }

  const propfindBody = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:getetag/>
  </d:prop>
</d:propfind>`;

  const propfindRes = await obsidianFetch(canonCollection(collectionUrl), {
    method: 'PROPFIND',
    headers: propfindHeaders,
    body: propfindBody
  });
  const propfindXml = await propfindRes.text();

  if (propfindRes.status < 200 || propfindRes.status >= 300) {
    throw new Error(`CalDAV compatibility PROPFIND failed (${propfindRes.status}).`);
  }

  assertNonEmptyText(propfindXml, 'CalDAV compatibility PROPFIND returned an empty body.');
  const propfindDoc = ensureXmlDocument(propfindXml, 'CalDAV compatibility PROPFIND');

  const refs = extractCalendarObjectRefs(propfindDoc);
  if (refs.length === 0) {
    return [];
  }

  return fetchCalendarObjectsByRefs(collectionUrl, refs, authHeader);
}

export async function fetchCalendarObjectsForComponent(
  collectionUrl: string,
  start: Date,
  end: Date,
  componentName: 'VEVENT' | 'VTODO',
  authHeader?: string,
  allowFallback = true
): Promise<{ icsList: CalendarObjectData[]; fellBack: boolean }> {
  const reportBody = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="${componentName}">
        <c:time-range start="${ymdhmsZ(start)}" end="${ymdhmsZ(end)}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

  const reportHeaders: Record<string, string> = {
    Depth: '1',
    'Content-Type': 'application/xml; charset=utf-8',
    Accept: '*/*'
  };
  if (authHeader) {
    reportHeaders['Authorization'] = authHeader;
  }

  const reportRes = await obsidianFetch(canonCollection(collectionUrl), {
    method: 'REPORT',
    headers: reportHeaders,
    body: reportBody
  });

  const xml = await reportRes.text();

  if (reportRes.status < 200 || reportRes.status >= 300) {
    if (allowFallback && shouldUseCompatibilityFetch(reportRes.status)) {
      console.warn(
        `[CalDAVProvider] REPORT for ${componentName} ${reportRes.status}; attempting compatibility fallback.`
      );
      const list = await fetchCalendarObjectsViaPropfindFallback(collectionUrl, authHeader);
      return { icsList: list, fellBack: true };
    }
    console.error(`[CalDAVProvider] REPORT request failed`, reportRes.status);
    throw new Error(`REPORT ${reportRes.status}`);
  }

  assertNonEmptyText(xml, 'CalDAV REPORT returned an empty body.');

  // STEP 2: Parse the XML response using DOMParser
  const doc = ensureXmlDocument(xml, 'CalDAV REPORT');
  const icsList = extractCalendarDataFromMultiStatus(doc);
  const allResponses = Array.from(doc.getElementsByTagNameNS('*', 'response'));

  // STEP 3: Fallback - if no calendar-data was returned, fetch individual .ics files
  if (icsList.length === 0) {
    const eventHrefs: string[] = [];

    for (const response of allResponses) {
      let hrefEl = response.getElementsByTagNameNS('DAV:', 'href')[0];
      if (!hrefEl) {
        const candidates = response.getElementsByTagNameNS('*', 'href');
        if (candidates.length > 0) {
          hrefEl = candidates[0];
        }
      }

      if (hrefEl && hrefEl.textContent && hrefEl.textContent.endsWith('.ics')) {
        eventHrefs.push(hrefEl.textContent);
      }
    }

    if (eventHrefs.length === 0) {
      return { icsList: [], fellBack: false };
    }

    const list = await fetchCalendarObjectsByRefs(
      collectionUrl,
      eventHrefs.map(href => ({ href })),
      authHeader
    );
    return { icsList: list, fellBack: false };
  }

  return { icsList, fellBack: false };
}

export async function fetchAllVTodoObjects(
  collectionUrl: string,
  authHeader?: string
): Promise<CalendarObjectData[]> {
  const reportBody = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VTODO"/>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

  const reportHeaders: Record<string, string> = {
    Depth: '1',
    'Content-Type': 'application/xml; charset=utf-8',
    Accept: '*/*'
  };
  if (authHeader) {
    reportHeaders['Authorization'] = authHeader;
  }

  const reportRes = await obsidianFetch(canonCollection(collectionUrl), {
    method: 'REPORT',
    headers: reportHeaders,
    body: reportBody
  });
  const xml = await reportRes.text();

  if (reportRes.status < 200 || reportRes.status >= 300) {
    if (shouldUseCompatibilityFetch(reportRes.status)) {
      console.warn(
        `[CalDAVProvider] REPORT for all VTODO ${reportRes.status}; attempting compatibility fallback.`
      );
      return fetchCalendarObjectsViaPropfindFallback(collectionUrl, authHeader);
    }
    console.error(`[CalDAVProvider] VTODO REPORT request failed`, reportRes.status);
    throw new Error(`REPORT ${reportRes.status}`);
  }

  assertNonEmptyText(xml, 'CalDAV VTODO REPORT returned an empty body.');
  const doc = ensureXmlDocument(xml, 'CalDAV VTODO REPORT');
  const icsList = extractCalendarDataFromMultiStatus(doc);

  return icsList;
}

// --- Direct REPORT + GET implementation (standards-compliant) ---
export async function fetchCalendarObjects(
  collectionUrl: string,
  start: Date,
  end: Date,
  username?: string,
  password?: string
): Promise<CalendarObjectData[]> {
  const authHeader = createBasicAuthHeader(username, password);

  // 1. Fetch VEVENT components (allow fallback)
  const { icsList: veventList, fellBack } = await fetchCalendarObjectsForComponent(
    collectionUrl,
    start,
    end,
    'VEVENT',
    authHeader,
    true
  );

  // If compatibility fallback was triggered, we already have all resource files (VEVENT & VTODO)
  // from the collection, so we can return them directly!
  if (fellBack) {
    return veventList;
  }

  // 2. Fetch VTODO components, catching errors gracefully to maintain calendar-only compatibility.
  // We disable fallback here because if VEVENT didn't need it, VTODO doesn't need it.
  let vtodoList: CalendarObjectData[] = [];
  try {
    const res = await fetchCalendarObjectsForComponent(
      collectionUrl,
      start,
      end,
      'VTODO',
      authHeader,
      false
    );
    vtodoList = res.icsList;
  } catch (err) {
    console.warn(
      '[CalDAVProvider] Failed to fetch VTODO components (possibly calendar-only collection). Skipping VTODO.',
      err
    );
  }

  // 3. Combine and deduplicate by 'ics' content payload
  const combined = [...veventList, ...vtodoList];
  const seenIcs = new Set<string>();
  const deduplicated: CalendarObjectData[] = [];

  for (const item of combined) {
    const trimmed = item.ics.trim();
    if (!seenIcs.has(trimmed)) {
      seenIcs.add(trimmed);
      deduplicated.push(item);
    }
  }

  return deduplicated;
}

export async function doRequest(
  url: string,
  options: RequestInit,
  username?: string,
  password?: string
): Promise<Response> {
  const headers = (options.headers as Record<string, string>) || {};
  const authHeader = createBasicAuthHeader(username, password);
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }
  options.headers = headers;

  const res = await obsidianFetch(url, options);
  if (res.status >= 300) {
    if (res.status === 401) {
      throw new Error(t('settings.calendars.caldav.errors.authentication'));
    }
    if (res.status === 403) {
      throw new Error(t('settings.calendars.caldav.errors.permissionDenied'));
    }
    if (res.status === 409 || res.status === 412) {
      throw new Error(t('settings.calendars.caldav.errors.conflict', { status: res.status }));
    }
    throw new Error(
      t('settings.calendars.caldav.errors.requestFailed', {
        status: res.status,
        statusText: res.statusText || ''
      }).trim()
    );
  }
  return res;
}

export async function fetchVCalendar(
  url: string,
  username?: string,
  password?: string
): Promise<ical.Component> {
  const headers: Record<string, string> = {};
  const authHeader = createBasicAuthHeader(username, password);
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  const res = await obsidianFetch(url, { method: 'GET', headers });
  if (res.status >= 300) {
    throw new Error(`Failed to fetch original event: ${res.status}`);
  }
  return new ical.Component(ical.parse(await res.text()));
}

export async function putVCalendar(
  url: string,
  vcalendar: ical.Component,
  username?: string,
  password?: string
): Promise<void> {
  await doRequest(
    url,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8'
      },
      body: (vcalendar as unknown as { toString(): string }).toString()
    },
    username,
    password
  );
}
