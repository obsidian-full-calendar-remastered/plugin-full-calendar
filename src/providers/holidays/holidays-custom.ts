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
    const filename = 'date-holidays-3.30.1.umd.min.js';
    const cdnUrl = 'https://cdn.jsdelivr.net/npm/date-holidays@3.30.1/dist/umd.min.js';
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

// Define explicit types to satisfy ESLint typescript rules
type HolidaysConstructor = new (...args: unknown[]) => HolidaysType;
interface HolidaysModule {
  default?: HolidaysConstructor;
}

/**
 * Transparent proxy for the Holidays constructor class.
 * Intercepts calls to new Holidays() and instantiates the global window.Holidays class dynamically.
 */
export const HolidaysProxy = new Proxy(function () {} as unknown as typeof HolidaysType, {
  construct(target, argumentsList) {
    const rawHolidays = window.Holidays as unknown as
      | HolidaysConstructor
      | HolidaysModule
      | undefined;
    if (!rawHolidays) {
      throw new Error(
        'date-holidays library is not loaded yet! Please await ensureHolidaysLoaded() first.'
      );
    }

    // Handle UMD module object with .default export vs direct global constructor safely
    let GlobalHolidays: HolidaysConstructor | undefined;
    if (typeof rawHolidays === 'function') {
      GlobalHolidays = rawHolidays;
    } else if (rawHolidays && typeof rawHolidays.default === 'function') {
      GlobalHolidays = rawHolidays.default;
    }

    if (!GlobalHolidays) {
      throw new Error('Holidays constructor is not a valid class/constructor function.');
    }

    return Reflect.construct(GlobalHolidays, argumentsList);
  }
});
