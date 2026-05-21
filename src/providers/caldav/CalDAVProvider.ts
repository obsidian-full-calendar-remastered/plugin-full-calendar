import { OFCEvent, EventLocation } from '../../types';
import { getEventsFromICS } from '../ics/ics';
import { eventToIcs, createOverrideVEvent } from '../ics/formatter';
import ical from 'ical.js';
import { CalendarProvider, CalendarProviderCapabilities, SyncKeyProvider } from '../Provider';
import { EventHandle, FCReactComponent, ProviderConfigContext } from '../typesProvider';
import { CalDAVProviderConfig } from './typesCalDAV';
import FullCalendarPlugin from '../../main';
import { CalDAVConfigComponent } from './CalDAVConfigComponent';
import * as React from 'react';
import { obsidianFetch } from './obsidian-fetch_caldav';
import { createBasicAuthHeader } from './auth_caldav';
import { LinkedNoteIndex } from '../utils/LinkedNoteIndex';
import { TFile } from 'obsidian';
import { createLinkedNoteForProvider } from '../../features/linked-notes/linkedNotes';

import { fetchCalendarInfo } from './helper_caldav';

// Helper function to ensure URL formatting is consistent.
function canonCollection(u?: string): string {
  return u ? (u.endsWith('/') ? u : `${u}/`) : (u as unknown as string);
}

// Helper to format a Date object into the format CalDAV expects (YYYYMMDDTHHMMSSZ).
function ymdhmsZ(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function assertNonEmptyText(text: string, message: string): string {
  if (!text.trim()) {
    throw new Error(message);
  }
  return text;
}

function assertIcsPayload(ics: string, source: string): string {
  if (!ics.trim()) {
    throw new Error(`${source} returned an empty ICS payload.`);
  }
  if (!/BEGIN:VCALENDAR/i.test(ics)) {
    throw new Error(`${source} returned invalid ICS payload (missing BEGIN:VCALENDAR).`);
  }
  return ics;
}

function ensureXmlDocument(xml: string, source: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error(`${source} returned malformed XML.`);
  }
  return doc;
}

function parseStatusCode(statusLine: string): number | null {
  const match = statusLine.match(/\s(\d{3})(?:\s|$)/);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

type CalendarObjectRef = {
  href: string;
  etag?: string;
};

function shouldUseCompatibilityFetch(status: number): boolean {
  return status === 400 || status === 422;
}

function getSuccessfulPropNode(response: Element): Element | null {
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

function extractCalendarObjectRefs(doc: Document): CalendarObjectRef[] {
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

function resolveCollectionObjectUrl(collectionUrl: string, href: string): string {
  return new URL(href, collectionUrl).toString();
}

async function fetchCalendarObjectsByRefs(
  collectionUrl: string,
  refs: CalendarObjectRef[],
  authHeader?: string
): Promise<{ ics: string; etag?: string }[]> {
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

      const payload = {
        ics: assertIcsPayload(getText, `CalDAV fallback GET for ${ref.href}`)
      } as { ics: string; etag?: string };

      if (ref.etag) {
        payload.etag = ref.etag;
      }

      return payload;
    })
  );

  const successfulObjects: { ics: string; etag?: string }[] = [];
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

async function fetchCalendarObjectsViaPropfindFallback(
  collectionUrl: string,
  authHeader?: string
): Promise<{ ics: string; etag?: string }[]> {
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

async function fetchCalendarObjectsForComponent(
  collectionUrl: string,
  start: Date,
  end: Date,
  componentName: 'VEVENT' | 'VTODO',
  authHeader?: string,
  allowFallback = true
): Promise<{ icsList: { ics: string; etag?: string }[]; fellBack: boolean }> {
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
    console.error(`[CalDAVProvider] REPORT request failed`, reportRes.status, xml.slice(0, 800));
    throw new Error(`REPORT ${reportRes.status}`);
  }

  assertNonEmptyText(xml, 'CalDAV REPORT returned an empty body.');

  // STEP 2: Parse the XML response using DOMParser
  const doc = ensureXmlDocument(xml, 'CalDAV REPORT');
  const icsList: { ics: string; etag?: string }[] = [];

  const responses = doc.getElementsByTagNameNS('*', 'response');
  const allResponses = Array.from(responses);

  for (const response of allResponses) {
    const propstats = response.getElementsByTagNameNS('*', 'propstat');

    for (let i = 0; i < propstats.length; i++) {
      const propstat = propstats[i];
      const status = propstat.getElementsByTagNameNS('*', 'status')[0]?.textContent || '';
      const statusCode = parseStatusCode(status);
      if (statusCode === null || statusCode < 200 || statusCode >= 300) continue;

      const prop = propstat.getElementsByTagNameNS('*', 'prop')[0];
      if (!prop) continue;

      // Try to find calendar-data
      let calendarData = prop.getElementsByTagNameNS(
        'urn:ietf:params:xml:ns:caldav',
        'calendar-data'
      )[0];

      if (!calendarData) {
        const candidates = prop.getElementsByTagNameNS('*', 'calendar-data');
        if (candidates.length > 0) {
          calendarData = candidates[0];
        }
      }

      if (calendarData) {
        const calendarText = assertNonEmptyText(
          calendarData.textContent || '',
          'CalDAV REPORT returned empty calendar-data payload.'
        );
        let etag = prop.getElementsByTagNameNS('DAV:', 'getetag')[0]?.textContent;
        if (!etag) {
          const candidates = prop.getElementsByTagNameNS('*', 'getetag');
          if (candidates.length > 0) etag = candidates[0].textContent;
        }

        icsList.push({
          ics: assertIcsPayload(calendarText, 'CalDAV REPORT'),
          etag: etag || undefined
        });
      }
    }
  }

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

// --- Direct REPORT + GET implementation (standards-compliant) ---
async function fetchCalendarObjects(
  collectionUrl: string,
  start: Date,
  end: Date,
  username?: string,
  password?: string
): Promise<{ ics: string; etag?: string }[]> {
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
  let vtodoList: { ics: string; etag?: string }[] = [];
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
  const deduplicated: { ics: string; etag?: string }[] = [];

  for (const item of combined) {
    const trimmed = item.ics.trim();
    if (!seenIcs.has(trimmed)) {
      seenIcs.add(trimmed);
      deduplicated.push(item);
    }
  }

  return deduplicated;
}

// --- Read-only settings row ---
const CalDAVSettingRow: React.FC<{ source: Partial<import('../../types').CalendarInfo> }> = ({
  source
}) => {
  const url = (source as unknown as { url?: string })?.url || '';
  const username = (source as unknown as { username?: string })?.username || '';

  return React.createElement(
    React.Fragment,
    {},
    React.createElement(
      'div',
      { className: 'setting-item-control' },
      React.createElement('input', {
        disabled: true,
        type: 'text',
        value: url,
        className: 'fc-setting-input'
      })
    ),
    React.createElement(
      'div',
      { className: 'setting-item-control' },
      React.createElement('input', {
        disabled: true,
        type: 'text',
        value: username,
        className: 'fc-setting-input'
      })
    )
  );
};

type CalDAVConfigProps = {
  plugin: FullCalendarPlugin;
  config: Partial<CalDAVProviderConfig>;
  onConfigChange: (newConfig: Partial<CalDAVProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: CalDAVProviderConfig | CalDAVProviderConfig[]) => void;
  onClose: () => void;
};

const CalDAVConfigWrapper: React.FC<CalDAVConfigProps> = props => {
  const { config, onSave, onClose } = props;
  const handleSave = (configs: CalDAVProviderConfig[]) => onSave(configs);

  return React.createElement(CalDAVConfigComponent, {
    config,
    onSave: handleSave,
    onClose
  });
};

export class CalDAVProvider implements CalendarProvider<CalDAVProviderConfig>, SyncKeyProvider {
  static readonly type = 'caldav';
  static readonly displayName = 'CalDAV';

  static getConfigurationComponent(): FCReactComponent<CalDAVConfigProps> {
    return CalDAVConfigWrapper;
  }

  private plugin: FullCalendarPlugin;
  private source: CalDAVProviderConfig;
  public readonly linkedNoteIndex: LinkedNoteIndex;

  readonly type = 'caldav';
  readonly displayName = 'CalDAV';
  readonly isRemote = true;
  readonly loadPriority = 110;

  constructor(source: CalDAVProviderConfig, plugin: FullCalendarPlugin) {
    this.plugin = plugin;
    this.source = source;
    this.linkedNoteIndex = new LinkedNoteIndex(plugin.app, source.id);
  }

  initialize(): void {
    this.linkedNoteIndex.initialize();
  }

  teardown(): void {
    this.linkedNoteIndex.destroy();
  }

  async createLinkedNote(event: OFCEvent): Promise<TFile | null> {
    return createLinkedNoteForProvider({
      app: this.plugin.app,
      event,
      calendarId: this.source.id,
      calendarName: this.source.name,
      linkedNoteIndex: this.linkedNoteIndex
    });
  }

  getCapabilities(): CalendarProviderCapabilities {
    return { canCreate: true, canEdit: true, canDelete: true };
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    return event.uid ? { persistentId: event.uid } : null;
  }

  computeSyncKey(event: OFCEvent): string {
    if (event.type === 'rrule' && event.id) {
      return event.id;
    }
    return event.uid || JSON.stringify(event);
  }

  async getEvents(range?: { start: Date; end: Date }): Promise<[OFCEvent, EventLocation | null][]> {
    // Validate collection URL using PROPFIND instead of regex
    const { isCalendar: isValid } = await fetchCalendarInfo(this.source.homeUrl, {
      username: this.source.username,
      password: this.source.password
    });

    if (!isValid) {
      const message = `[CalDAVProvider] Invalid collection URL or not a calendar: ${this.source.homeUrl}`;
      console.error(message);
      throw new Error(message);
    }

    let start: Date;
    let end: Date;

    if (range && range.start && range.end) {
      start = new Date(range.start);
      end = new Date(range.end);
    } else {
      const now = new Date();
      start = new Date(now);
      start.setFullYear(now.getFullYear() - 1);
      end = new Date(now);
      end.setFullYear(now.getFullYear() + 1);
    }

    try {
      const icsList = await fetchCalendarObjects(
        this.source.homeUrl,
        start,
        end,
        this.source.username,
        this.source.password
      );
      const parsedEvents: OFCEvent[] = [];
      let parseFailures = 0;

      for (const { ics, etag } of icsList) {
        try {
          const events = getEventsFromICS(ics).map(ev => {
            if (etag) ev.etag = etag.replace(/"/g, ''); // standard ETag usually has quotes
            return ev;
          });
          parsedEvents.push(...events);
        } catch {
          parseFailures += 1;
        }
      }

      if (parseFailures > 0) {
        console.warn(`[CalDAVProvider] Skipped ${parseFailures} malformed ICS payload(s).`);
      }

      return parsedEvents.map(ev => {
        const linkedFile = this.linkedNoteIndex.getFileForEvent(ev.uid || '');
        const location = linkedFile
          ? { file: { path: linkedFile.path }, lineNumber: undefined }
          : null;
        return [ev, location];
      });
    } catch (err) {
      console.error('[CalDAVProvider] Failed to fetch events.', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to fetch events from CalDAV server: ${errorMessage}`);
    }
  }

  async createEvent(event: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    // 1. Ensure event has a UID
    if (!event.uid) {
      event.uid = window.crypto.randomUUID();
    }
    const uid = event.uid;

    // 2. Convert to ICS
    const icsContent = eventToIcs(event);

    // 3. PUT to server
    // URL typically: collectionUrl + uid + ".ics"
    // Helper ensure trailing slash on homeUrl
    const url = `${canonCollection(this.source.homeUrl)}${uid}.ics`;

    await this.doRequest(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'If-None-Match': '*' // Prevent overwriting if it somehow exists
      },
      body: icsContent
    });

    return [event, null];
  }

  async updateEvent(
    handle: EventHandle,
    oldEvent: OFCEvent,
    newEvent: OFCEvent
  ): Promise<EventLocation | null> {
    const uid = handle.persistentId;
    if (!newEvent.uid) {
      newEvent.uid = uid;
    }

    // Convert to ICS
    const icsContent = eventToIcs(newEvent);

    const url = `${canonCollection(this.source.homeUrl)}${uid}.ics`;

    // PUT to update
    await this.doRequest(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        ...(oldEvent.etag ? { 'If-Match': `"${oldEvent.etag}"` } : {})
        // We could use If-Match with ETag if we had it, to prevent lost updates.
        // For now, simpler last-write-wins or just overwrite.
      },
      body: icsContent
    });

    return null;
  }

  async deleteEvent(handle: EventHandle): Promise<void> {
    const uid = handle.persistentId;
    const url = `${canonCollection(this.source.homeUrl)}${uid}.ics`;

    await this.doRequest(url, {
      method: 'DELETE'
    });
  }

  async createInstanceOverride(
    masterEvent: OFCEvent,
    instanceDate: string,
    newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    // 1. Fetch the existing ICS for the master event
    if (!masterEvent.uid) {
      throw new Error('Cannot create override: Master event has no UID.');
    }
    const uid = masterEvent.uid;
    const url = `${canonCollection(this.source.homeUrl)}${uid}.ics`;

    // Fetch existing
    // We need to fetch the raw text of the ICS file.
    const headers: Record<string, string> = {};
    const authHeader = createBasicAuthHeader(this.source.username, this.source.password);
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    // Use obsidianFetch directly for GET
    const res = await obsidianFetch(url, { method: 'GET', headers });
    if (res.status >= 300) {
      throw new Error(`Failed to fetch original event for override: ${res.status}`);
    }
    const originalIcs = await res.text();

    // 2. Parse existing ICS
    const jcal = ical.parse(originalIcs);
    const vcalendar = new ical.Component(jcal);

    // 3. Create the Override VEVENT
    const overrideVEvent = createOverrideVEvent(newEventData, instanceDate);

    // 4. Merge: Add the new VEVENT to the VCALENDAR
    vcalendar.addSubcomponent(overrideVEvent);

    // 5. Update: PUT the new ICS back
    // ical.Component properly implements toString(), cast to satisfy lint
    const newIcsContent = (vcalendar as unknown as { toString(): string }).toString();

    await this.doRequest(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8'
        // Ideally use ETag (If-Match) to avoid race conditions, but for now strict overwrite is safer
        // given we just fetched it.
      },
      body: newIcsContent
    });

    return [newEventData, null];
  }

  // Helper to attach auth and fetch
  private async doRequest(url: string, options: RequestInit) {
    const headers = (options.headers as Record<string, string>) || {};
    const authHeader = createBasicAuthHeader(this.source.username, this.source.password);
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }
    options.headers = headers;

    const res = await obsidianFetch(url, options);
    if (res.status >= 300) {
      throw new Error(`CalDAV request failed: ${res.status} ${res.statusText}`);
    }
    return res;
  }

  // Boilerplate methods for the provider interface.
  revalidate(): Promise<void> {
    return Promise.resolve();
  }

  getConfigurationComponent(): FCReactComponent<CalDAVConfigProps> {
    return CalDAVConfigWrapper;
  }
  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    return CalDAVSettingRow;
  }
}
