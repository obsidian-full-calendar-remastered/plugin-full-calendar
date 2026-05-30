/**
 * @file plotly-custom.ts
 * @brief Dynamic loader and proxy facade for the `plotly.js` library.
 *
 * @description
 * Creates a transparent Proxy for the `Plotly` object and manages local caching in the vault.
 * Ensures the Plotly.js charting package is completely excluded from compiled main.js bundle,
 * and once loaded, works 100% offline via local vault storage.
 *
 * @license See LICENSE.md
 */

import { App } from 'obsidian';
import { loadCachedScript } from '../../utils/loadScript';
import type * as PlotlyTypes from 'plotly.js';

// Extend the global Window interface to type window.Plotly safely without any casts
declare global {
  interface Window {
    Plotly?: typeof PlotlyTypes;
  }
}

let plotlyPromise: Promise<typeof PlotlyTypes> | null = null;

/**
 * Triggers loading of the Plotly charting library from local cache, falling back to CDN.
 * Once fetched, it is cached permanently in the vault to support complete offline usage.
 */
export async function ensurePlotlyLoaded(app: App): Promise<typeof PlotlyTypes> {
  if (window.Plotly) {
    return window.Plotly;
  }

  if (plotlyPromise) {
    return plotlyPromise;
  }

  plotlyPromise = (async () => {
    const filename = 'plotly-3.5.1.min.js';
    const cdnUrl = 'https://cdn.plot.ly/plotly-3.5.1.min.js';

    try {
      await loadCachedScript(app, filename, cdnUrl);
    } catch (err) {
      plotlyPromise = null; // Allow retry on failure
      throw err;
    }

    const globalPlotly = window.Plotly;
    if (!globalPlotly) {
      plotlyPromise = null;
      throw new Error('Plotly fetched but window.Plotly is not defined.');
    }
    return globalPlotly;
  })();

  return plotlyPromise;
}

/**
 * Transparent proxy that delegates all Plotly module operations to the global window.Plotly instance.
 * Allows other chart files (like plotter.ts) to interact with Plotly statically.
 */
const PlotlyProxy = new Proxy({} as typeof PlotlyTypes, {
  get(target, prop) {
    const globalPlotly = window.Plotly;
    if (!globalPlotly) {
      throw new Error(
        'Plotly charting library is not loaded yet! Please await ensurePlotlyLoaded() first.'
      );
    }

    const val = globalPlotly[prop as keyof typeof PlotlyTypes];
    if (typeof val === 'function') {
      return (val as (...args: unknown[]) => unknown).bind(globalPlotly);
    }
    return val;
  }
});

export default PlotlyProxy;
