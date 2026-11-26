/**
 * @file AgentWeatherBridge.test.ts
 * @brief Unit tests for AgentWeatherBridge (3-day hourly / 4+ day daily rule & compact event enrichment).
 * @license See LICENSE.md
 */

import { fetchWeatherForecast } from '../../weather/Weather';
import {
  attachWeatherToEvents,
  attachWeatherToSingleEvent,
  getAgentWeatherForecast
} from './AgentWeatherBridge';

const mockGetSettings = jest.fn<Record<string, unknown>, []>();

jest.mock('../../../core/PluginState', () => ({
  PluginState: {
    getSettings: (): Record<string, unknown> => mockGetSettings()
  }
}));

jest.mock('../../weather/Weather', () => {
  const actual =
    jest.requireActual<typeof import('../../weather/Weather')>('../../weather/Weather');
  return {
    ...actual,
    fetchWeatherForecast: jest.fn()
  };
});

const mockFetchWeatherForecast = fetchWeatherForecast as jest.MockedFunction<
  typeof fetchWeatherForecast
>;

describe('AgentWeatherBridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSettings.mockReturnValue({
      weatherHide: false,
      weatherLatitude: 50.08,
      weatherLongitude: 14.43,
      weatherUnit: 'C',
      weatherCity: 'Prague',
      weatherInputMode: 'city'
    });
  });

  it('returns unavailable when weather is hidden, coordinates missing, or calendar date invalid', async () => {
    mockGetSettings.mockReturnValueOnce({ weatherHide: true });
    const hiddenRes = await getAgentWeatherForecast('2026-06-01', '2026-06-02', '2026-06-01');
    expect(hiddenRes.available).toBe(false);

    mockGetSettings.mockReturnValueOnce({ weatherHide: false, weatherLatitude: null });
    const noCoordsRes = await getAgentWeatherForecast('2026-06-01', '2026-06-02', '2026-06-01');
    expect(noCoordsRes.available).toBe(false);

    const invalidDateRes = await getAgentWeatherForecast('2026-02-30', '2026-03-02', '2026-02-28');
    expect(invalidDateRes.available).toBe(false);
    expect(mockFetchWeatherForecast).not.toHaveBeenCalled();
  });

  it('keeps hourly predictions for today..+3 days (3h intervals on multi-day) and daily summary for +4 days onward', async () => {
    mockFetchWeatherForecast.mockResolvedValueOnce({
      '2026-06-01': {
        emoji: '☀️',
        desc: 'Clear sky',
        maxTemp: 22,
        minTemp: 12,
        hourly: [
          {
            time: '02:00',
            temp: 13,
            apparentTemp: 12,
            humidity: 60,
            precipProb: 0,
            windSpeed: 5,
            emoji: '☀️',
            desc: 'Clear sky'
          },
          {
            time: '15:00',
            temp: 21,
            apparentTemp: 20,
            humidity: 50,
            precipProb: 5,
            windSpeed: 10,
            emoji: '☀️',
            desc: 'Clear sky'
          }
        ]
      },
      '2026-06-04': {
        emoji: '⛅',
        desc: 'Partly cloudy',
        maxTemp: 20,
        minTemp: 11,
        hourly: [
          {
            time: '15:00',
            temp: 19,
            apparentTemp: 18,
            humidity: 55,
            precipProb: 20,
            windSpeed: 12,
            emoji: '⛅',
            desc: 'Partly cloudy'
          }
        ]
      },
      '2026-06-05': {
        emoji: '🌧️',
        desc: 'Rain',
        maxTemp: 17,
        minTemp: 10,
        hourly: [
          {
            time: '15:00',
            temp: 16,
            apparentTemp: 15,
            humidity: 80,
            precipProb: 85,
            windSpeed: 18,
            emoji: '🌧️',
            desc: 'Rain'
          }
        ]
      }
    });

    const res = await getAgentWeatherForecast('2026-06-01', '2026-06-05', '2026-06-01');
    expect(res.available).toBe(true);
    if (!res.available) return;

    expect(res.hourlyThroughDate).toBe('2026-06-04');
    expect(res.days).toHaveLength(3);
    expect(res.days[0].granularity).toBe('hourly');
    expect(res.days[0].hourly).toEqual([
      {
        time: '15:00',
        temp: '21°C',
        precipProb: 5,
        condition: '☀️ Clear sky'
      }
    ]);
    expect(res.days[1].granularity).toBe('hourly');
    expect(res.days[2].granularity).toBe('daily');
    expect(res.days[2].hourly).toBeUndefined();
  });

  it('attaches compact hourly weather (including 9:30 and HH:mm:ss) and daily weather for +4d/all-day events', async () => {
    mockFetchWeatherForecast.mockResolvedValueOnce({
      '2026-06-01': {
        emoji: '☀️',
        desc: 'Clear sky',
        maxTemp: 24,
        minTemp: 13,
        hourly: [
          {
            time: '09:00',
            temp: 18,
            apparentTemp: 18,
            humidity: 50,
            precipProb: 5,
            windSpeed: 7,
            emoji: '☀️',
            desc: 'Clear sky'
          },
          {
            time: '14:00',
            temp: 23,
            apparentTemp: 23,
            humidity: 45,
            precipProb: 10,
            windSpeed: 8,
            emoji: '☀️',
            desc: 'Clear sky'
          }
        ]
      },
      '2026-06-05': {
        emoji: '🌧️',
        desc: 'Rain',
        maxTemp: 16,
        minTemp: 9,
        hourly: [
          {
            time: '10:00',
            temp: 14,
            apparentTemp: 13,
            humidity: 85,
            precipProb: 80,
            windSpeed: 15,
            emoji: '🌧️',
            desc: 'Rain'
          }
        ]
      }
    });

    const events = [
      { id: '1', title: 'Morning Jog', date: '2026-06-01', allDay: false, startTime: '9:30' },
      { id: '2', title: 'Outdoor Run', date: '2026-06-01', allDay: false, startTime: '14:30:00' },
      { id: '3', title: 'Conference', date: '2026-06-05', allDay: false, startTime: '10:00' },
      { id: '4', title: 'Holiday', date: '2026-06-01', allDay: true }
    ];

    const enriched = await attachWeatherToEvents(events, '2026-06-01');
    expect(enriched[0].weather).toEqual({
      temp: '18°C',
      rain: '5%',
      cond: '☀️ Clear sky'
    });
    expect(enriched[1].weather).toEqual({
      temp: '23°C',
      rain: '10%',
      cond: '☀️ Clear sky'
    });
    expect(enriched[2].weather).toEqual({
      range: '9-16°C',
      cond: '🌧️ Rain'
    });
    expect(enriched[3].weather).toEqual({
      range: '13-24°C',
      cond: '☀️ Clear sky'
    });
  });

  it('attaches weather to single event results and propagates abort cancellation', async () => {
    mockFetchWeatherForecast.mockResolvedValueOnce({
      '2026-06-02': {
        emoji: '⛅',
        desc: 'Partly cloudy',
        maxTemp: 21,
        minTemp: 11,
        hourly: [
          {
            time: '09:00',
            temp: 17,
            apparentTemp: 17,
            humidity: 60,
            precipProb: 15,
            windSpeed: 9,
            emoji: '⛅',
            desc: 'Partly cloudy'
          }
        ]
      }
    });

    const single = await attachWeatherToSingleEvent(
      {
        id: 'ev-1',
        calendarId: 'cal-1',
        event: { title: 'Walk', date: '2026-06-02', allDay: false, startTime: '9:15' }
      },
      '2026-06-01'
    );

    expect(single?.weather).toEqual({
      temp: '17°C',
      rain: '15%',
      cond: '⛅ Partly cloudy'
    });

    const controller = new AbortController();
    controller.abort();
    await expect(
      getAgentWeatherForecast('2026-06-01', '2026-06-01', '2026-06-01', controller.signal)
    ).rejects.toThrow();
  });
});
