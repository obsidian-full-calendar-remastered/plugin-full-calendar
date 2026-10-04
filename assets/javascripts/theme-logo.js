(() => {
  function getSiteBaseUrl() {
    const candidates = [
      ...document.querySelectorAll('link[href*="assets/stylesheets/"]'),
      ...document.querySelectorAll('script[src*="assets/javascripts/"]'),
    ];

    for (const el of candidates) {
      const raw = el.getAttribute("href") || el.getAttribute("src");
      if (!raw) continue;

      const absUrl = new URL(raw, window.location.href).href;
      const assetsIndex = absUrl.indexOf("/assets/");
      if (assetsIndex !== -1) {
        return absUrl.slice(0, assetsIndex);
      }
    }

    return window.location.origin;
  }

  function getLogoPath(filename) {
    return `${getSiteBaseUrl()}/assets/branding/${filename}`;
  }

  function getScheme() {
    return (
      document.body?.getAttribute("data-md-color-scheme") ||
      document.documentElement?.getAttribute("data-md-color-scheme") ||
      "default"
    );
  }

  function applyThemeLogo() {
    const logoSrc =
      getScheme() === "slate" ? getLogoPath("icon-dark.png") : getLogoPath("icon-light.png");
    const logos = document.querySelectorAll(".md-header__button.md-logo img");

    logos.forEach((logo) => {
      logo.setAttribute("src", logoSrc);
    });
  }

  function observeThemeChanges() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "data-md-color-scheme") {
          applyThemeLogo();
          break;
        }
      }
    });

    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["data-md-color-scheme"],
      });
    }

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-md-color-scheme"],
    });
  }

  function init() {
    applyThemeLogo();
    observeThemeChanges();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
