/**
 * @file Weather.ts
 * @brief Weather service for fetching and mapping weather forecasts.
 * @license See LICENSE.md
 */

import { requestUrl } from 'obsidian';
import { t } from '../i18n/i18n';

export interface WeatherInfo {
  emoji: string;
  desc: string;
  maxTemp: number;
  minTemp: number;
}

interface DailyForecastData {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
}

interface ForecastResponse {
  daily?: DailyForecastData;
}

// WMO Weather Interpretation Codes (WW)
// See https://open-meteo.com/en/docs
export const WEATHER_MAP: Record<number, { emoji: string; i18nKey: string }> = {
  0: { emoji: '☀️', i18nKey: 'settings.weather.conditions.clearSky' },
  1: { emoji: '🌤️', i18nKey: 'settings.weather.conditions.mainlyClear' },
  2: { emoji: '⛅', i18nKey: 'settings.weather.conditions.partlyCloudy' },
  3: { emoji: '☁️', i18nKey: 'settings.weather.conditions.overcast' },
  45: { emoji: '🌫️', i18nKey: 'settings.weather.conditions.fog' },
  48: { emoji: '🌫️', i18nKey: 'settings.weather.conditions.depositingRimeFog' },
  51: { emoji: '🌧️', i18nKey: 'settings.weather.conditions.lightDrizzle' },
  53: { emoji: '🌧️', i18nKey: 'settings.weather.conditions.moderateDrizzle' },
  55: { emoji: '🌧️', i18nKey: 'settings.weather.conditions.denseDrizzle' },
  56: { emoji: '🌧️', i18nKey: 'settings.weather.conditions.lightFreezingDrizzle' },
  57: { emoji: '🌧️', i18nKey: 'settings.weather.conditions.denseFreezingDrizzle' },
  61: { emoji: '🌧️', i18nKey: 'settings.weather.conditions.slightRain' },
  63: { emoji: '🌧️', i18nKey: 'settings.weather.conditions.moderateRain' },
  65: { emoji: '🌧️', i18nKey: 'settings.weather.conditions.heavyRain' },
  66: { emoji: '🌧️', i18nKey: 'settings.weather.conditions.lightFreezingRain' },
  67: { emoji: '🌧️', i18nKey: 'settings.weather.conditions.heavyFreezingRain' },
  71: { emoji: '❄️', i18nKey: 'settings.weather.conditions.slightSnowFall' },
  73: { emoji: '❄️', i18nKey: 'settings.weather.conditions.moderateSnowFall' },
  75: { emoji: '❄️', i18nKey: 'settings.weather.conditions.heavySnowFall' },
  77: { emoji: '❄️', i18nKey: 'settings.weather.conditions.snowGrains' },
  80: { emoji: '🌧️', i18nKey: 'settings.weather.conditions.slightRainShowers' },
  81: { emoji: '🌧️', i18nKey: 'settings.weather.conditions.moderateRainShowers' },
  82: { emoji: '🌧️', i18nKey: 'settings.weather.conditions.violentRainShowers' },
  85: { emoji: '❄️', i18nKey: 'settings.weather.conditions.slightSnowShowers' },
  86: { emoji: '❄️', i18nKey: 'settings.weather.conditions.heavySnowShowers' },
  95: { emoji: '⛈️', i18nKey: 'settings.weather.conditions.thunderstorm' },
  96: { emoji: '⛈️', i18nKey: 'settings.weather.conditions.thunderstormWithSlightHail' },
  99: { emoji: '⛈️', i18nKey: 'settings.weather.conditions.thunderstormWithHeavyHail' }
};

// In-memory cache for forecasts: cacheKey -> Record<dateStr, WeatherInfo>
const weatherCache = new Map<string, Record<string, WeatherInfo>>();

/**
 * Helper to clear the weather cache (primarily for testing purposes)
 */
export function clearWeatherCache(): void {
  weatherCache.clear();
}

/**
 * Fetches the daily weather forecast for a range of dates.
 * Results are cached in memory to avoid redundant API queries.
 */
export async function fetchWeatherForecast(
  latitude: number,
  longitude: number,
  startDateStr: string,
  endDateStr: string
): Promise<Record<string, WeatherInfo> | null> {
  const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)},${startDateStr},${endDateStr}`;
  if (weatherCache.has(cacheKey)) {
    return weatherCache.get(cacheKey) || null;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${startDateStr}&end_date=${endDateStr}`;
    const response = await requestUrl(url);
    const data = response.json as ForecastResponse;
    const daily = data?.daily;

    if (!daily || !daily.time) {
      return null;
    }

    const forecast: Record<string, WeatherInfo> = {};
    for (let i = 0; i < daily.time.length; i++) {
      const dateStr = daily.time[i];
      const code = daily.weather_code[i];
      const maxTemp = daily.temperature_2m_max[i];
      const minTemp = daily.temperature_2m_min[i];

      if (
        dateStr === undefined ||
        code === undefined ||
        maxTemp === undefined ||
        minTemp === undefined
      ) {
        continue;
      }

      const weatherInfo = WEATHER_MAP[code];
      const desc = weatherInfo ? t(weatherInfo.i18nKey) : t('settings.weather.conditions.unknown');
      const emoji = weatherInfo?.emoji || '❓';
      forecast[dateStr] = {
        emoji,
        desc,
        maxTemp,
        minTemp
      };
    }

    weatherCache.set(cacheKey, forecast);
    return forecast;
  } catch (e) {
    console.error('Failed to fetch weather forecast', e);
    return null;
  }
}

export interface GeocodingResult {
  latitude: number;
  longitude: number;
}

interface GeocodingResponse {
  results?: GeocodingResult[];
}

/**
 * Resolves a city or region name to latitude and longitude coordinates.
 */
export async function geocodeCity(city: string): Promise<GeocodingResult | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&format=json`;
    const geoResponse = await requestUrl(url);
    const data = geoResponse.json as GeocodingResponse;
    const results = data?.results;
    if (results && results.length > 0 && results[0]) {
      const { latitude, longitude } = results[0];
      return { latitude, longitude };
    }
  } catch (e) {
    console.error('Weather geocoding failed', e);
  }
  return null;
}
