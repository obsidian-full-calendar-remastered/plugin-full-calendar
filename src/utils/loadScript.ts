/**
 * @file loadScript.ts
 * @brief Concurrency-safe local-cached script loader with popout compatibility.
 *
 * @description
 * This utility handles dynamic loading of external libraries with absolute offline capability.
 * 1. Checks if the library is cached locally in the Obsidian vault config directory.
 * 2. If present, it loads the script instantly from the local filesystem.
 * 3. If absent, it downloads it via Obsidian's requestUrl, saves it locally, and executes it.
 * 4. This guarantees that subsequent loads are 100% offline-compatible and never touch the network again.
 *
 * @license See LICENSE.md
 */

import { App, requestUrl, normalizePath, activeDocument } from 'obsidian';

interface LoadedScriptElement extends HTMLScriptElement {
  loaded?: boolean;
}

/**
 * Loads a script from a local cached file in the plugin directory.
 * If the cached file does not exist, it downloads it from the CDN, caches it locally,
 * and then executes it.
 *
 * @param app Obsidian App instance
 * @param filename File name under the plugin's assets folder (e.g. "plotly.min.js")
 * @param cdnUrl Backup CDN URL to download from if cache is cold
 */
export async function loadCachedScript(app: App, filename: string, cdnUrl: string): Promise<void> {
  const pluginId = 'full-calendar-remastered';
  const assetsFolder = normalizePath(`${app.vault.configDir}/plugins/${pluginId}/assets`);
  const assetPath = normalizePath(`${assetsFolder}/${filename}`);

  let scriptCode = '';

  // 1. Try to read from local vault cache
  try {
    if (await app.vault.adapter.exists(assetPath)) {
      scriptCode = await app.vault.adapter.read(assetPath);
    }
  } catch {
    // Silent fallback to downloading if cache read fails
  }

  // 2. Fetch from CDN and save if cache is cold
  if (!scriptCode) {
    try {
      const response = await requestUrl(cdnUrl);
      if (response.status !== 200) {
        throw new Error(`CDN returned status code ${response.status}`);
      }
      scriptCode = response.text;

      // Ensure assets folder exists
      if (!(await app.vault.adapter.exists(assetsFolder))) {
        await app.vault.adapter.mkdir(assetsFolder);
      }

      // Write to local cache
      await app.vault.adapter.write(assetPath, scriptCode);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to download script ${filename} from CDN (${cdnUrl}): ${errMsg}`, {
        cause: err
      });
    }
  }

  // 3. Inject script safely in popout window context with startup compatibility
  return new Promise<void>((resolve, reject) => {
    const doc =
      typeof activeDocument !== 'undefined' && activeDocument ? activeDocument : window.document;
    const scriptId = `ofc-script-${filename.replace(/\.[^/.]+$/, '')}`;
    const existing = doc.getElementById(scriptId) as LoadedScriptElement | null;
    if (existing) {
      if (existing.loaded) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => {
        reject(new Error(`Failed to load existing script element: ${filename}`));
      });
      return;
    }

    try {
      const script = doc.createElement('script') as LoadedScriptElement;
      script.id = scriptId;
      script.textContent = scriptCode;
      script.loaded = true;
      (doc.head || doc.body).appendChild(script);
      resolve();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(`Failed to inject script: ${String(err)}`));
    }
  });
}
