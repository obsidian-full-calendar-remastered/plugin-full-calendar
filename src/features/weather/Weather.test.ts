/**
 * @file Weather.test.ts
 * @brief Unit tests for the modular Weather feature service.
 * @license See LICENSE.md
 */

import { fetchWeatherForecast, clearWeatherCache, WEATHER_MAP } from './Weather';
import { requestUrl } from 'obsidian';

jest.mock('obsidian', () => ({
  requestUrl: jest.fn()
}));

const mockRequestUrl = requestUrl as jest.MockedFunction<typeof requestUrl>;

describe('Weather Service Feature', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearWeatherCache();
  });

  it('maps weather codes correctly', () => {
    expect(WEATHER_MAP[0]).toEqual({ emoji: '☀️', desc: 'Clear sky' });
    expect(WEATHER_MAP[3]).toEqual({ emoji: '☁️', desc: 'Overcast' });
    expect(WEATHER_MAP[95]).toEqual({ emoji: '⛈️', desc: 'Thunderstorm' });
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
      minTemp: 12.0
    });
    expect(forecast!['2026-05-30']).toEqual({
      emoji: '☁️',
      desc: 'Overcast',
      maxTemp: 18.2,
      minTemp: 11.5
    });

    expect(mockRequestUrl).toHaveBeenCalledTimes(1);
    expect(mockRequestUrl).toHaveBeenCalledWith(
      `https://api.open-meteo.com/v1/forecast?latitude=50.08&longitude=14.43&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=2026-05-29&end_date=2026-05-30`
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
});
