(() => {
  let cachedRoots = null;
  let isSwitching = false;

  function ensureTrailingSlash(url) {
    const normalized = new URL(url.href);
    if (!normalized.pathname.endsWith("/")) {
      normalized.pathname += "/";
    }
    return normalized;
  }

  function resolveChannelRootsOnce() {
    if (cachedRoots) return cachedRoots;

    const switcher = document.querySelector("[data-fc-version-switcher]");
    if (!switcher) return null;

    const channel = switcher.getAttribute("data-fc-channel") || "stable";
    let currentBase = null;

    if (typeof window.__md_scope !== "undefined" && window.__md_scope instanceof URL) {
      currentBase = ensureTrailingSlash(window.__md_scope);
    } else {
      const rawBase = switcher.getAttribute("data-fc-base-url") || ".";
      const normalizedRaw = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;
      currentBase = ensureTrailingSlash(new URL(normalizedRaw, window.location.href));
    }

    const stableRoot = channel === "beta" ? new URL("../", currentBase) : new URL("./", currentBase);
    const betaRoot = channel === "beta" ? new URL("./", currentBase) : new URL("beta/", currentBase);

    cachedRoots = { channel, stableRoot, betaRoot };
    return cachedRoots;
  }

  function getRelativePagePath(channelRoot) {
    const rootPath = channelRoot.pathname;
    const currentPath = window.location.pathname;
    if (currentPath.startsWith(rootPath)) {
      return currentPath.slice(rootPath.length);
    }
    return "";
  }

  function syncSwitcherHrefs() {
    const roots = resolveChannelRootsOnce();
    if (!roots) return;

    document.querySelectorAll('a[data-fc-version-switch="stable"]').forEach((el) => {
      el.setAttribute("href", roots.stableRoot.href);
    });
    document.querySelectorAll('a[data-fc-version-switch="beta"]').forEach((el) => {
      el.setAttribute("href", roots.betaRoot.href);
    });
  }

  async function navigateToChannel(targetChannel, triggerEl) {
    if (isSwitching) return;
    const roots = resolveChannelRootsOnce();
    if (!roots) return;

    const sourceRoot = roots.channel === "beta" ? roots.betaRoot : roots.stableRoot;
    const targetRoot = targetChannel === "beta" ? roots.betaRoot : roots.stableRoot;

    const relPath = getRelativePagePath(sourceRoot);
    const targetHomeUrl = targetRoot.href;
    const probeUrl = relPath ? new URL(relPath, targetRoot).href : targetHomeUrl;
    const suffix = `${window.location.search}${window.location.hash}`;

    if (!relPath) {
      window.location.assign(targetHomeUrl);
      return;
    }

    isSwitching = true;
    if (triggerEl) {
      triggerEl.setAttribute("aria-busy", "true");
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1500);
    try {
      const response = await fetch(probeUrl, {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal,
      });
      window.location.assign(response.ok ? `${probeUrl}${suffix}` : targetHomeUrl);
    } catch {
      window.location.assign(targetHomeUrl);
    } finally {
      window.clearTimeout(timer);
      isSwitching = false;
      if (triggerEl) {
        triggerEl.removeAttribute("aria-busy");
      }
    }
  }

  async function refreshVersionLabels() {
    const roots = resolveChannelRootsOnce();
    if (!roots) return;

    syncSwitcherHrefs();

    try {
      const response = await fetch(`${roots.stableRoot.href}version-info.json`, {
        cache: "no-cache",
      });
      if (!response.ok) return;
      const info = await response.json();

      for (const [key, label] of [
        ["stable", info.stable],
        ["beta", info.beta],
      ]) {
        if (!label) continue;
        document.querySelectorAll(`[data-fc-version-label="${key}"]`).forEach((el) => {
          el.textContent = label;
          el.removeAttribute("hidden");
        });
        document.querySelectorAll(`[data-fc-version-switch="${key}"]`).forEach((el) => {
          const titlePrefix = key === "beta" ? "Beta documentation" : "Stable documentation";
          el.setAttribute("title", `${titlePrefix} (${label})`);
        });
      }
    } catch {
      // Best-effort enhancement; server-rendered labels remain intact.
    }
  }

  // Capture phase ensures we intercept before Material's bubble-phase instant-nav handler on document.body.
  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest("a[data-fc-version-switch]");
      if (!link) return;

      const targetChannel = link.getAttribute("data-fc-version-switch");
      const roots = resolveChannelRootsOnce();
      if (!targetChannel || !roots || targetChannel === roots.channel) return;

      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      navigateToChannel(targetChannel, link);
    },
    { capture: true },
  );

  function init() {
    resolveChannelRootsOnce();
    refreshVersionLabels();
  }

  if (typeof document$ !== "undefined" && document$?.subscribe) {
    document$.subscribe(() => {
      init();
    });
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
