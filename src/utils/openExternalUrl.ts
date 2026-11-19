import { Platform } from 'obsidian';

interface ElectronShell {
  openExternal: (url: string) => Promise<void>;
}

interface ElectronModule {
  shell: ElectronShell;
}

interface WindowWithRequire {
  require: (module: string) => unknown;
}

/**
 * Opens a URL in the user's default system browser.
 * Bypasses Obsidian's Web Viewer (iframe) or external link intercepts on desktop.
 * ! Essential for Auth authentication workflow
 * Falls back to standard window.open on mobile or if Electron is unavailable.
 */
export function openExternalUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    console.error('Refused to open invalid external URL.');
    return;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    console.error(`Refused to open unsupported external URL protocol: ${parsed.protocol}`);
    return;
  }

  const safeUrl = parsed.toString();
  if (!Platform.isMobile) {
    try {
      const electron = (window as unknown as WindowWithRequire).require(
        'electron'
      ) as ElectronModule;
      void electron.shell.openExternal(safeUrl);
      return;
    } catch (e) {
      console.error('Failed to open URL using Electron shell.openExternal:', e);
    }
  }
  window.open(safeUrl);
}
