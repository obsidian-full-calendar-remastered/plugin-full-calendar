/**
 * @file holidays-custom.ts
 * @brief Dynamic loader and proxy constructor for the `date-holidays` library.
 *
 * @description
 * Creates a transparent Proxy for the `Holidays` class constructor and manages local vault caching.
 * Ensures the date-holidays library is not bundled inside the main.js, keeping the plugin light.
 * Once loaded, works 100% offline via local vault storage.
 *
 * @license See LICENSE.md
 */

import { App } from 'obsidian';
import { loadCachedScript } from '../../utils/loadScript';
import type HolidaysType from 'date-holidays';

// Extend the global Window interface to type window.Holidays safely without any casts
declare global {
  interface Window {
    Holidays?: typeof HolidaysType;
  }
}

let holidaysPromise: Promise<void> | null = null;

/**
 * Triggers loading of the date-holidays library from the local cache, falling back to CDN.
 * Once fetched, it is cached permanently in the vault to support complete offline usage.
 */
export async function ensureHolidaysLoaded(app: App): Promise<void> {
  if (window.Holidays) {
    return;
  }

  if (holidaysPromise) {
    return holidaysPromise;
  }

  holidaysPromise = (async () => {
    const filename = 'date-holidays-3.30.1.min.js';
    const cdnUrl = 'https://unpkg.com/date-holidays@3.30.1/dist/date-holidays.min.js';
    try {
      await loadCachedScript(app, filename, cdnUrl);
    } catch (err) {
      holidaysPromise = null; // Allow retry on failure
      throw err;
    }

    if (!window.Holidays) {
      holidaysPromise = null;
      throw new Error(
        'date-holidays was fetched but Holidays constructor is not defined globally.'
      );
    }
  })();

  return holidaysPromise;
}

/**
 * Transparent proxy for the Holidays constructor class.
 * Intercepts calls to new Holidays() and instantiates the global window.Holidays class dynamically.
 */
export const HolidaysProxy = new Proxy(function () {} as unknown as typeof HolidaysType, {
  construct(target, argumentsList) {
    const GlobalHolidays = window.Holidays;
    if (!GlobalHolidays) {
      throw new Error(
        'date-holidays library is not loaded yet! Please await ensureHolidaysLoaded() first.'
      );
    }
    return Reflect.construct(GlobalHolidays, argumentsList) as object;
  }
});
