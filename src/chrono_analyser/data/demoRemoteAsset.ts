import { App, requestUrl } from 'obsidian';
import { InsightsConfig } from '../ui/ui';

export const DEMO_CACHE_KEY = 'ChronoAnalyzerDemoData_v1';
export const DEMO_DATA_URL = 'https://fcr-cdn.plugin-fcr.workers.dev/demo/chronoanalyzer-demo.json';

export type DemoCalendarSource = {
  id: string;
  displayName: string;
  type: string;
};

export type DemoEvent = {
  id: string;
  path: string;
  title: string;
  category: string;
  subCategory: string;
  startTime: string;
  endTime: string;
  dayOffset?: number;
  type?: 'single' | 'recurring';
  startRecurOffset?: number;
  endRecurOffset?: number;
  daysOfWeek?: ('U' | 'M' | 'T' | 'W' | 'R' | 'F' | 'S')[];
};

export type DemoPayload = {
  schemaVersion: number;
  dateMode: 'relative';
  calendarSource: DemoCalendarSource;
  insightsConfig: InsightsConfig;
  events: DemoEvent[];
};

export function parseDemoPayload(rawPayload: string): DemoPayload {
  const parsed = JSON.parse(rawPayload) as Partial<DemoPayload>;
  if (
    parsed.schemaVersion !== 1 ||
    parsed.dateMode !== 'relative' ||
    !parsed.calendarSource ||
    !parsed.insightsConfig ||
    !Array.isArray(parsed.events)
  ) {
    throw new Error('Invalid ChronoAnalyser demo payload.');
  }

  return parsed as DemoPayload;
}

export async function fetchDemoPayloadText(demoDataUrl = DEMO_DATA_URL): Promise<string> {
  const response = await requestUrl(demoDataUrl);
  const rawPayload = response.text;
  parseDemoPayload(rawPayload);
  return rawPayload;
}

export async function refreshCachedChronoDemoAsset(app: App): Promise<boolean> {
  const cachedPayload = (app.loadLocalStorage as (key: string) => unknown)(DEMO_CACHE_KEY);
  if (typeof cachedPayload !== 'string' || !cachedPayload.trim()) {
    return false;
  }

  const rawPayload = await fetchDemoPayloadText();
  app.saveLocalStorage(DEMO_CACHE_KEY, rawPayload);
  return true;
}
