/**
 * @file Weather.test.ts
 * @brief Unit tests for the modular Weather feature service.
 * @license See LICENSE.md
 */

import {
  fetchWeatherForecast,
  clearWeatherCache,
  WEATHER_MAP,
  formatTemp,
  formatTempRange
} from './Weather';
import { requestUrl } from 'obsidian';
import { initializeI18n } from '../i18n/i18n';

jest.mock('obsidian', () => ({
  requestUrl: jest.fn(),
  getLanguage: jest.fn().mockReturnValue('en')
}));

const mockRequestUrl = requestUrl as jest.MockedFunction<typeof requestUrl>;

describe('Weather Service Feature', () => {
  beforeAll(async () => {
    const mockApp = {
      vault: {
        getConfig: jest.fn().mockReturnValue('en'),
        configDir: 'mock-config-dir',
        adapter: {
          exists: jest.fn().mockResolvedValue(false)
        }
      }
    } as unknown as import('obsidian').App;
    await initializeI18n(mockApp, 'full-calendar-remastered');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    clearWeatherCache();
  });

  it('maps weather codes correctly', () => {
    expect(WEATHER_MAP[0]).toEqual({
      emoji: '☀️',
      i18nKey: 'settings.weather.conditions.clearSky'
    });
    expect(WEATHER_MAP[3]).toEqual({
      emoji: '☁️',
      i18nKey: 'settings.weather.conditions.overcast'
    });
    expect(WEATHER_MAP[95]).toEqual({
      emoji: '⛈️',
      i18nKey: 'settings.weather.conditions.thunderstorm'
    });
  });

  it('fetches and maps weather data correctly', async () => {
    const mockResponse = {
      status: 200,
      headers: {},
      arrayBuffer: new ArrayBuffer(0),
      text: '',
      json: {
        daily: {
          time: ['2026-05-29', '2026-05-30'],
          weather_code: [0, 3],
          temperature_2m_max: [22.5, 18.2],
          temperature_2m_min: [12.0, 11.5]
        },
        hourly: {
          time: ['2026-05-29T00:00', '2026-05-29T01:00', '2026-05-30T00:00'],
          temperature_2m: [13.0, 14.5, 12.0],
          relative_humidity_2m: [80, 75, 85],
          apparent_temperature: [12.0, 13.5, 11.0],
          precipitation_probability: [0, 10, 0],
          weather_code: [0, 1, 3],
          wind_speed_10m: [10, 12, 8]
        }
      }
    };
    mockRequestUrl.mockResolvedValueOnce(mockResponse);

    const forecast = await fetchWeatherForecast(50.08, 14.43, '2026-05-29', '2026-05-30');

    expect(forecast).not.toBeNull();
    expect(forecast!['2026-05-29']).toEqual({
      emoji: '☀️',
      desc: 'Clear sky',
      maxTemp: 22.5,
      minTemp: 12.0,
      hourly: [
        {
          time: '00:00',
          temp: 13.0,
          apparentTemp: 12.0,
          humidity: 80,
          precipProb: 0,
          windSpeed: 10,
          emoji: '☀️',
          desc: 'Clear sky'
        },
        {
          time: '01:00',
          temp: 14.5,
          apparentTemp: 13.5,
          humidity: 75,
          precipProb: 10,
          windSpeed: 12,
          emoji: '🌤️',
          desc: 'Mainly clear'
        }
      ]
    });
    expect(forecast!['2026-05-30']).toEqual({
      emoji: '☁️',
      desc: 'Overcast',
      maxTemp: 18.2,
      minTemp: 11.5,
      hourly: [
        {
          time: '00:00',
          temp: 12.0,
          apparentTemp: 11.0,
          humidity: 85,
          precipProb: 0,
          windSpeed: 8,
          emoji: '☁️',
          desc: 'Overcast'
        }
      ]
    });

    expect(mockRequestUrl).toHaveBeenCalledTimes(1);
    expect(mockRequestUrl).toHaveBeenCalledWith(
      `https://api.open-meteo.com/v1/forecast?latitude=50.08&longitude=14.43&daily=weather_code,temperature_2m_max,temperature_2m_min&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m&timezone=auto&start_date=2026-05-29&end_date=2026-05-30`
    );
  });

  it('caches the forecast requests in memory', async () => {
    const mockResponse = {
      status: 200,
      headers: {},
      arrayBuffer: new ArrayBuffer(0),
      text: '',
      json: {
        daily: {
          time: ['2026-05-29'],
          weather_code: [0],
          temperature_2m_max: [22.5],
          temperature_2m_min: [12.0]
        }
      }
    };
    mockRequestUrl.mockResolvedValue(mockResponse);

    // Call first time
    const res1 = await fetchWeatherForecast(50.08, 14.43, '2026-05-29', '2026-05-29');
    // Call second time with same params
    const res2 = await fetchWeatherForecast(50.08, 14.43, '2026-05-29', '2026-05-29');

    expect(res1).toEqual(res2);
    expect(mockRequestUrl).toHaveBeenCalledTimes(1); // Served from cache!
  });

  it('handles API errors gracefully', async () => {
    mockRequestUrl.mockRejectedValueOnce(new Error('Network Failure'));

    const forecast = await fetchWeatherForecast(50.08, 14.43, '2026-05-29', '2026-05-29');
    expect(forecast).toBeNull();
  });

  describe('Temperature Formatting & Conversion utilities', () => {
    it('formats Celsius correctly', () => {
      expect(formatTemp(0, 'C')).toBe('0°C');
      expect(formatTemp(22.4, 'C')).toBe('22°C');
      expect(formatTemp(22.6, 'C')).toBe('23°C');
      expect(formatTemp(-5.2, 'C')).toBe('-5°C');
    });

    it('formats Fahrenheit correctly', () => {
      expect(formatTemp(0, 'F')).toBe('32°F');
      expect(formatTemp(20, 'F')).toBe('68°F');
      expect(formatTemp(100, 'F')).toBe('212°F');
      expect(formatTemp(-10, 'F')).toBe('14°F');
    });

    it('formats Celsius temperature ranges correctly', () => {
      expect(formatTempRange(12.0, 22.5, 'C')).toBe('12-23°C');
      expect(formatTempRange(-5.0, 5.0, 'C')).toBe('-5-5°C');
    });

    it('formats Fahrenheit temperature ranges correctly', () => {
      expect(formatTempRange(12.0, 22.5, 'F')).toBe('54-73°F');
      expect(formatTempRange(-5.0, 5.0, 'F')).toBe('23-41°F');
    });
  });
});
