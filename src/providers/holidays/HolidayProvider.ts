/**
 * @file HolidayProvider.ts
 * @brief Read-only virtual calendar provider powered by the `date-holidays` library.
 *
 * @description
 * Surfaces public and regional holidays as all-day virtual events on the calendar.
 * Events have no backing vault file and are never persisted to disk.
 *
 * Key properties:
 * - Works 100% offline (date-holidays bundles all data)
 * - Results are cached in localStorage per (year × config) for 30 days
 * - Non-blocking: getEvents() is async but returns from cache on subsequent calls
 * - loadPriority = 5 so holidays appear together with the first local-provider wave
 *
 * @license See LICENSE.md
 */

import Holidays, { HolidaysTypes } from 'date-holidays';
import * as React from 'react';

import { OFCEvent, EventLocation } from '../../types';
import { CalendarProvider, CalendarProviderCapabilities, SyncKeyProvider } from '../Provider';
import { EventHandle, FCReactComponent, ProviderConfigContext } from '../typesProvider';
import { HolidayProviderConfig, getHolidayTypesForFilter } from './typesHoliday';
import { HolidayConfigComponent } from './ui/HolidayConfigComponent';

// ─── Cache constants ───────────────────────────────────────────────────────────

const CACHE_VERSION = 1;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CACHE_KEY_PREFIX = 'fc-holidays';

interface CacheEntry {
  version: number;
  configHash: string;
  events: OFCEvent[];
  cachedAt: number;
}

// ─── Settings row component ────────────────────────────────────────────────────

const HolidaySettingsRow: React.FC<{ source: Partial<import('../../types').CalendarInfo> }> = ({
  source
}) => {
  const country =
    (source as Partial<HolidayProviderConfig>).country?.toUpperCase() || 'Not configured';
  const state = (source as Partial<HolidayProviderConfig>).state;
  const display = state ? `${country} / ${state.toUpperCase()}` : country;

  return React.createElement(
    'div',
    { className: 'setting-item-control' },
    React.createElement('span', { className: 'fc-setting-tag' }, display)
  );
};

// ─── Config wrapper ────────────────────────────────────────────────────────────

type HolidayConfigProps = {
  plugin: import('../../main').default;
  config: Partial<HolidayProviderConfig>;
  onConfigChange: (newConfig: Partial<HolidayProviderConfig>) => void;
  context: ProviderConfigContext;
  onSave: (finalConfig: HolidayProviderConfig | HolidayProviderConfig[]) => void;
  onClose: () => void;
};

const HolidayConfigWrapper: React.FC<HolidayConfigProps> = props => {
  const { onSave, ...rest } = props;
  const handleSave = (finalConfig: HolidayProviderConfig) => onSave(finalConfig);
  return React.createElement(HolidayConfigComponent, { ...rest, onSave: handleSave });
};

// ─── Provider class ────────────────────────────────────────────────────────────

export class HolidayProvider implements CalendarProvider<HolidayProviderConfig>, SyncKeyProvider {
  // Static metadata for registry lookup
  static readonly type = 'holidays';
  static readonly displayName = 'Holidays';

  static getConfigurationComponent(): FCReactComponent<HolidayConfigProps> {
    return HolidayConfigWrapper;
  }

  readonly type = 'holidays';
  readonly displayName = 'Holidays';
  readonly isRemote = false;
  readonly loadPriority = 5;

  private config: HolidayProviderConfig;
  private configHash: string;
  private app: import('obsidian').App;

  constructor(config: HolidayProviderConfig, plugin: import('../../main').default) {
    this.config = config;
    this.configHash = this._computeConfigHash(config);
    this.app = plugin.app;
  }

  // ─── Capabilities ────────────────────────────────────────────────────────────

  getCapabilities(): CalendarProviderCapabilities {
    return { canCreate: false, canEdit: false, canDelete: false };
  }

  getEventHandle(event: OFCEvent): EventHandle | null {
    if (!event.id) return null;
    return { persistentId: event.id };
  }

  computeSyncKey(event: OFCEvent): string {
    return event.id ?? JSON.stringify(event);
  }

  // ─── Core: getEvents ─────────────────────────────────────────────────────────

  async getEvents(range?: { start: Date; end: Date }): Promise<[OFCEvent, EventLocation | null][]> {
    if (!this.config.country) {
      return [];
    }

    const years = this._getYearsForRange(range);
    const allEvents: [OFCEvent, EventLocation | null][] = [];

    for (const year of years) {
      const cached = this._readCache(year);
      if (cached) {
        for (const event of cached) {
          allEvents.push([event, null]);
        }
        continue;
      }

      const events = this._fetchHolidaysForYear(year);
      this._writeCache(year, events);
      for (const event of events) {
        allEvents.push([event, null]);
      }
    }

    // If a range was given, filter so only events whose date falls within range are returned.
    // This prevents years that were eagerly cached from flooding narrow range queries.
    if (range) {
      const startStr = this._dateToYYYYMMDD(range.start);
      const endStr = this._dateToYYYYMMDD(range.end);
      return allEvents.filter(([event]) => {
        const dateStr = this._getEventDateStr(event);
        return dateStr >= startStr && dateStr <= endStr;
      });
    }

    return allEvents;
  }

  // ─── Holiday fetching ─────────────────────────────────────────────────────────

  private _fetchHolidaysForYear(year: number): OFCEvent[] {
    try {
      const hd = new Holidays();

      const opts: HolidaysTypes.Options = {};

      // Init with country + optional state/region
      if (this.config.region && this.config.state) {
        hd.init(this.config.country, this.config.state, this.config.region, opts);
      } else if (this.config.state) {
        hd.init(this.config.country, this.config.state, opts);
      } else {
        hd.init(this.config.country, opts);
      }

      const allowedTypes = getHolidayTypesForFilter(this.config.holidayTypes ?? 'public');
      const holidays = hd.getHolidays(year);

      return holidays.filter(h => allowedTypes.includes(h.type)).map(h => this._toOFCEvent(h));
    } catch (err) {
      console.error(
        `[HolidayProvider] Failed to fetch holidays for ${this.config.country}/${year}`,
        err
      );
      return [];
    }
  }

  private _toOFCEvent(holiday: HolidaysTypes.Holiday): OFCEvent {
    // date-holidays returns date strings like "2025-12-25 00:00:00"
    const dateStr = holiday.date.substring(0, 10); // "YYYY-MM-DD"
    const id = `date-holidays:${dateStr}:${holiday.name}`;

    const event: OFCEvent = {
      type: 'single',
      allDay: true,
      title: holiday.name,
      date: dateStr,
      endDate: null,
      id,
      ...(this.config.display ? { display: this.config.display } : {})
    };

    return event;
  }

  // ─── Cache helpers ────────────────────────────────────────────────────────────

  private _cacheKey(year: number): string {
    return `${CACHE_KEY_PREFIX}::${this.configHash}::${year}`;
  }

  private _readCache(year: number): OFCEvent[] | null {
    try {
      const raw = (this.app.loadLocalStorage as (key: string) => unknown)(this._cacheKey(year));
      if (typeof raw !== 'string' || !raw) return null;
      const entry = JSON.parse(raw) as CacheEntry;
      if (
        entry.version !== CACHE_VERSION ||
        entry.configHash !== this.configHash ||
        Date.now() - entry.cachedAt > CACHE_TTL_MS
      ) {
        this.app.saveLocalStorage(this._cacheKey(year), '');
        return null;
      }
      return entry.events;
    } catch {
      return null;
    }
  }

  private _writeCache(year: number, events: OFCEvent[]): void {
    try {
      const entry: CacheEntry = {
        version: CACHE_VERSION,
        configHash: this.configHash,
        events,
        cachedAt: Date.now()
      };
      this.app.saveLocalStorage(this._cacheKey(year), JSON.stringify(entry));
    } catch {
      // localStorage might be full or unavailable — silently skip caching.
    }
  }

  private _computeConfigHash(config: HolidayProviderConfig): string {
    const key = [
      config.country ?? '',
      config.state ?? '',
      config.region ?? '',
      config.holidayTypes ?? 'public',
      config.display ?? ''
    ].join('|');
    // Simple deterministic hash — not cryptographic, just for cache key differentiation.
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = (Math.imul(31, hash) + key.charCodeAt(i)) | 0;
    }
    return hash.toString(36);
  }

  // ─── Year helpers ─────────────────────────────────────────────────────────────

  private _getYearsForRange(range?: { start: Date; end: Date }): number[] {
    if (!range) {
      const y = new Date().getFullYear();
      return [y - 1, y, y + 1];
    }
    const startYear = range.start.getFullYear();
    const endYear = range.end.getFullYear();
    const years: number[] = [];
    for (let y = startYear; y <= endYear; y++) {
      years.push(y);
    }
    return years;
  }

  private _dateToYYYYMMDD(date: Date): string {
    return date.toISOString().substring(0, 10);
  }

  private _getEventDateStr(event: OFCEvent): string {
    if (event.type === 'single') return event.date;
    if (event.type === 'rrule') return event.startDate;
    return '';
  }

  // ─── CRUD stubs (read-only) ──────────────────────────────────────────────────

  createEvent(_event: OFCEvent): Promise<[OFCEvent, EventLocation | null]> {
    return Promise.reject(new Error('Cannot create an event on a read-only Holiday calendar.'));
  }

  updateEvent(
    _handle: EventHandle,
    _oldEventData: OFCEvent,
    _newEventData: OFCEvent
  ): Promise<EventLocation | null> {
    return Promise.reject(new Error('Cannot update an event on a read-only Holiday calendar.'));
  }

  deleteEvent(_handle: EventHandle): Promise<void> {
    return Promise.reject(new Error('Cannot delete an event on a read-only Holiday calendar.'));
  }

  createInstanceOverride(
    _masterEvent: OFCEvent,
    _instanceDate: string,
    _newEventData: OFCEvent
  ): Promise<[OFCEvent, EventLocation | null]> {
    return Promise.reject(
      new Error('Cannot create a recurring event override on a read-only Holiday calendar.')
    );
  }

  // ─── UI components ───────────────────────────────────────────────────────────

  getConfigurationComponent(): FCReactComponent<HolidayConfigProps> {
    return HolidayConfigWrapper;
  }

  getSettingsRowComponent(): FCReactComponent<{
    source: Partial<import('../../types').CalendarInfo>;
  }> {
    return HolidaySettingsRow;
  }
}
