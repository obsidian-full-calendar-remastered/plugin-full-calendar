/**
 * @file AgentWeatherBridge.ts
 * @brief Sandboxed weather forecast bridge for the Calendar Agent.
 *
 * @description
 * Exposes the plugin's configured Open-Meteo weather forecast to the agent
 * with a 3-day hourly retention window (today through today+3) and daily
 * summaries beyond that, while keeping event-nested weather payloads compact
 * for token efficiency.
 *
 * @license See LICENSE.md
 */

import { PluginState } from '../../../core/PluginState';
import { raceWithAbort } from '../domain/abortUtils';
import {
  addDaysToIsoDate,
  fetchWeatherForecast,
  formatTemp,
  formatTempRange,
  isValidIsoDate,
  pruneHourlyBeyondDays,
  type HourlyForecast,
  type WeatherInfo
} from '../../weather/Weather';

const HOURLY_DAYS_AHEAD = 3;
const MAX_FORECAST_DAYS_AHEAD = 15;
const MULTI_DAY_HOURLY_HOURS = new Set(['06:00', '09:00', '12:00', '15:00', '18:00', '21:00']);

export interface CompactEventWeather {
  cond: string;
  temp?: string;
  rain?: string;
  range?: string;
}

export interface AgentWeatherDaySummary {
  date: string;
  granularity: 'hourly' | 'daily';
  condition: string;
  minTemp: string;
  maxTemp: string;
  hourly?: {
    time: string;
    temp: string;
    precipProb: number;
    condition: string;
  }[];
}

export type AgentWeatherForecastResult =
  | {
      available: false;
      reason: string;
    }
  | {
      available: true;
      location: string;
      unit: 'C' | 'F';
      hourlyThroughDate: string;
      days: AgentWeatherDaySummary[];
    };

interface ConfiguredWeatherSettings {
  latitude: number;
  longitude: number;
  unit: 'C' | 'F';
  locationLabel: string;
}

function getConfiguredWeatherSettings(): ConfiguredWeatherSettings | null {
  let settings: ReturnType<typeof PluginState.getSettings>;
  try {
    settings = PluginState.getSettings();
  } catch {
    return null;
  }
  if (!settings || settings.weatherHide) {
    return null;
  }
  const lat = settings.weatherLatitude;
  const lon = settings.weatherLongitude;
  if (
    typeof lat !== 'number' ||
    typeof lon !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return null;
  }
  const unit: 'C' | 'F' = settings.weatherUnit === 'F' ? 'F' : 'C';
  const locationLabel =
    settings.weatherInputMode === 'coords'
      ? `${lat.toFixed(2)}, ${lon.toFixed(2)}`
      : settings.weatherCity?.trim() || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;

  return { latitude: lat, longitude: lon, unit, locationLabel };
}

function clampDateRange(
  startDate: string,
  endDate: string,
  referenceDateStr: string
): { clampedStart: string; clampedEnd: string; maxDate: string } | null {
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate) || !isValidIsoDate(referenceDateStr)) {
    return null;
  }
  const maxDate = addDaysToIsoDate(referenceDateStr, MAX_FORECAST_DAYS_AHEAD);
  const clampedStart = startDate < referenceDateStr ? referenceDateStr : startDate;
  const clampedEnd = endDate > maxDate ? maxDate : endDate;
  if (clampedStart > clampedEnd) {
    return null;
  }
  return { clampedStart, clampedEnd, maxDate };
}

function matchHourlySlot(
  hourly: HourlyForecast[] | undefined,
  startTime?: string
): HourlyForecast | null {
  if (!hourly || hourly.length === 0 || !startTime) {
    return null;
  }
  const match = /^(\d{1,2}):\d{2}(?::\d{2})?$/.exec(startTime.trim());
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  if (hour < 0 || hour > 23) {
    return null;
  }
  const targetHour = `${String(hour).padStart(2, '0')}:00`;
  return hourly.find(slot => slot.time === targetHour) ?? null;
}

function buildCompactEventWeather(
  info: WeatherInfo,
  unit: 'C' | 'F',
  allDay: boolean,
  startTime?: string
): CompactEventWeather {
  if (!allDay && info.hourly && info.hourly.length > 0) {
    const slot = matchHourlySlot(info.hourly, startTime);
    if (slot) {
      return {
        temp: formatTemp(slot.temp, unit),
        rain: `${slot.precipProb}%`,
        cond: `${slot.emoji} ${slot.desc}`.trim()
      };
    }
  }

  return {
    range: formatTempRange(info.minTemp, info.maxTemp, unit),
    cond: `${info.emoji} ${info.desc}`.trim()
  };
}

async function fetchPrunedForecast(
  cfg: ConfiguredWeatherSettings,
  clampedStart: string,
  clampedEnd: string,
  referenceDateStr: string,
  signal?: AbortSignal
): Promise<Record<string, WeatherInfo> | null> {
  const raw = await raceWithAbort(
    fetchWeatherForecast(cfg.latitude, cfg.longitude, clampedStart, clampedEnd),
    signal
  );
  if (!raw) {
    return null;
  }
  return pruneHourlyBeyondDays(raw, referenceDateStr, HOURLY_DAYS_AHEAD);
}

/**
 * Fetches weather forecast for the requested date range, keeping hourly predictions
 * only for today through today + 3 days and daily summaries beyond that.
 * Multi-day queries return 3-hour daytime/evening intervals (06:00-21:00) to keep
 * token usage compact; single-day queries return all available hours.
 */
export async function getAgentWeatherForecast(
  startDate: string,
  endDate: string,
  referenceDateStr: string,
  signal?: AbortSignal
): Promise<AgentWeatherForecastResult> {
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) {
    return {
      available: false,
      reason: 'Invalid calendar date. Expected valid YYYY-MM-DD for startDate and endDate.'
    };
  }
  if (startDate > endDate) {
    return {
      available: false,
      reason: 'startDate must be on or before endDate.'
    };
  }

  const cfg = getConfiguredWeatherSettings();
  if (!cfg) {
    return {
      available: false,
      reason: 'Weather forecast is disabled or no location is configured in Full Calendar settings.'
    };
  }

  const clamped = clampDateRange(startDate, endDate, referenceDateStr);
  if (!clamped) {
    const maxDate = addDaysToIsoDate(referenceDateStr, MAX_FORECAST_DAYS_AHEAD);
    return {
      available: false,
      reason: `Forecast data is only available from ${referenceDateStr} through ${maxDate}.`
    };
  }

  const forecast = await fetchPrunedForecast(
    cfg,
    clamped.clampedStart,
    clamped.clampedEnd,
    referenceDateStr,
    signal
  );
  if (!forecast) {
    return {
      available: false,
      reason: 'Unable to fetch weather forecast right now.'
    };
  }

  const isSingleDay = clamped.clampedStart === clamped.clampedEnd;
  const hourlyThroughDate = addDaysToIsoDate(referenceDateStr, HOURLY_DAYS_AHEAD);

  const days: AgentWeatherDaySummary[] = Object.keys(forecast)
    .sort()
    .map(date => {
      const info = forecast[date];
      const hasHourly = Array.isArray(info.hourly) && info.hourly.length > 0;
      const summary: AgentWeatherDaySummary = {
        date,
        granularity: hasHourly ? 'hourly' : 'daily',
        condition: `${info.emoji} ${info.desc}`.trim(),
        minTemp: formatTemp(info.minTemp, cfg.unit),
        maxTemp: formatTemp(info.maxTemp, cfg.unit)
      };
      if (hasHourly && info.hourly) {
        const slots = isSingleDay
          ? info.hourly
          : info.hourly.filter(slot => MULTI_DAY_HOURLY_HOURS.has(slot.time));
        const selected = slots.length > 0 ? slots : info.hourly;
        summary.hourly = selected.map(slot => ({
          time: slot.time,
          temp: formatTemp(slot.temp, cfg.unit),
          precipProb: slot.precipProb,
          condition: `${slot.emoji} ${slot.desc}`.trim()
        }));
      }
      return summary;
    });

  return {
    available: true,
    location: cfg.locationLabel,
    unit: cfg.unit,
    hourlyThroughDate,
    days
  };
}

/**
 * Enriches an array of event records with a compact nested `weather` object
 * when weather is enabled and the event date falls within the forecast window.
 */
export async function attachWeatherToEvents(
  events: Record<string, unknown>[],
  referenceDateStr: string,
  signal?: AbortSignal
): Promise<Record<string, unknown>[]> {
  if (events.length === 0) {
    return events;
  }
  const cfg = getConfiguredWeatherSettings();
  if (!cfg || !isValidIsoDate(referenceDateStr)) {
    return events;
  }

  const maxDate = addDaysToIsoDate(referenceDateStr, MAX_FORECAST_DAYS_AHEAD);
  let minEventDate = '';
  let maxEventDate = '';

  for (const ev of events) {
    const dateVal = typeof ev.date === 'string' ? ev.date : '';
    if (!isValidIsoDate(dateVal)) continue;
    if (dateVal < referenceDateStr || dateVal > maxDate) continue;
    if (!minEventDate || dateVal < minEventDate) minEventDate = dateVal;
    if (!maxEventDate || dateVal > maxEventDate) maxEventDate = dateVal;
  }

  if (!minEventDate || !maxEventDate) {
    return events;
  }

  try {
    const forecast = await fetchPrunedForecast(
      cfg,
      minEventDate,
      maxEventDate,
      referenceDateStr,
      signal
    );
    if (!forecast) {
      return events;
    }

    return events.map(ev => {
      const dateVal = typeof ev.date === 'string' ? ev.date : '';
      const info = dateVal ? forecast[dateVal] : undefined;
      if (!info) {
        return ev;
      }
      const allDay = Boolean(ev.allDay);
      const startTime = typeof ev.startTime === 'string' ? ev.startTime : undefined;
      return {
        ...ev,
        weather: buildCompactEventWeather(info, cfg.unit, allDay, startTime)
      };
    });
  } catch (err) {
    if (signal?.aborted) {
      throw err instanceof Error ? err : new Error('Agent request was cancelled by user.');
    }
    return events;
  }
}

/**
 * Enriches a single `get_event_by_id` result with a compact nested `weather` object.
 */
export async function attachWeatherToSingleEvent(
  eventResult: Record<string, unknown> | null,
  referenceDateStr: string,
  signal?: AbortSignal
): Promise<Record<string, unknown> | null> {
  if (!eventResult) {
    return null;
  }
  const cfg = getConfiguredWeatherSettings();
  if (!cfg || !isValidIsoDate(referenceDateStr)) {
    return eventResult;
  }

  const inner = eventResult.event as Record<string, unknown> | undefined;
  if (!inner) {
    return eventResult;
  }
  const dateVal =
    typeof inner.date === 'string'
      ? inner.date
      : typeof inner.startDate === 'string'
        ? inner.startDate
        : '';
  const clamped = clampDateRange(dateVal, dateVal, referenceDateStr);
  if (!clamped) {
    return eventResult;
  }

  try {
    const forecast = await fetchPrunedForecast(
      cfg,
      clamped.clampedStart,
      clamped.clampedEnd,
      referenceDateStr,
      signal
    );
    const info = forecast?.[dateVal];
    if (!info) {
      return eventResult;
    }
    const allDay = Boolean(inner.allDay);
    const startTime = typeof inner.startTime === 'string' ? inner.startTime : undefined;
    return {
      ...eventResult,
      weather: buildCompactEventWeather(info, cfg.unit, allDay, startTime)
    };
  } catch (err) {
    if (signal?.aborted) {
      throw err instanceof Error ? err : new Error('Agent request was cancelled by user.');
    }
    return eventResult;
  }
}
