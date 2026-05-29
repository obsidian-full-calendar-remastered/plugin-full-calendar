/**
 * @file Weather.ts
 * @brief Weather service for fetching and mapping weather forecasts.
 * @license See LICENSE.md
 */

import { requestUrl } from 'obsidian';

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
export const WEATHER_MAP: Record<number, { emoji: string; desc: string }> = {
  0: { emoji: '☀️', desc: 'Clear sky' },
  1: { emoji: '🌤️', desc: 'Mainly clear' },
  2: { emoji: '⛅', desc: 'Partly cloudy' },
  3: { emoji: '☁️', desc: 'Overcast' },
  45: { emoji: '🌫️', desc: 'Fog' },
  48: { emoji: '🌫️', desc: 'Depositing rime fog' },
  51: { emoji: '🌧️', desc: 'Light drizzle' },
  53: { emoji: '🌧️', desc: 'Moderate drizzle' },
  55: { emoji: '🌧️', desc: 'Dense drizzle' },
  56: { emoji: '🌧️', desc: 'Light freezing drizzle' },
  57: { emoji: '🌧️', desc: 'Dense freezing drizzle' },
  61: { emoji: '🌧️', desc: 'Slight rain' },
  63: { emoji: '🌧️', desc: 'Moderate rain' },
  65: { emoji: '🌧️', desc: 'Heavy rain' },
  66: { emoji: '🌧️', desc: 'Light freezing rain' },
  67: { emoji: '🌧️', desc: 'Heavy freezing rain' },
  71: { emoji: '❄️', desc: 'Slight snow fall' },
  73: { emoji: '❄️', desc: 'Moderate snow fall' },
  75: { emoji: '❄️', desc: 'Heavy snow fall' },
  77: { emoji: '❄️', desc: 'Snow grains' },
  80: { emoji: '🌧️', desc: 'Slight rain showers' },
  81: { emoji: '🌧️', desc: 'Moderate rain showers' },
  82: { emoji: '🌧️', desc: 'Violent rain showers' },
  85: { emoji: '❄️', desc: 'Slight snow showers' },
  86: { emoji: '❄️', desc: 'Heavy snow showers' },
  95: { emoji: '⛈️', desc: 'Thunderstorm' },
  96: { emoji: '⛈️', desc: 'Thunderstorm with slight hail' },
  99: { emoji: '⛈️', desc: 'Thunderstorm with heavy hail' }
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

      const weatherInfo = WEATHER_MAP[code] || { emoji: '❓', desc: 'Unknown' };
      forecast[dateStr] = {
        emoji: weatherInfo.emoji,
        desc: weatherInfo.desc,
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
