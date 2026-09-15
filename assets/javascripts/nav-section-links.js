(() => {
  const SECTION_LABEL_SELECTOR =
    '.md-sidebar .md-nav--primary .md-nav__item--nested > label.md-nav__link';

  function normalizeText(value) {
    return (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function decorateSectionLinks(root = document) {
    const labels = root.querySelectorAll(SECTION_LABEL_SELECTOR);

    labels.forEach(label => {
      const item = label.parentElement;
      if (!(item instanceof Element)) return;

      const firstChildItem = item.querySelector(
        ':scope > nav.md-nav > ul.md-nav__list > li.md-nav__item'
      );
      if (!(firstChildItem instanceof HTMLElement)) return;

      const firstChildLink = firstChildItem.querySelector(':scope > a.md-nav__link[href]');
      if (!(firstChildLink instanceof HTMLAnchorElement)) return;

      // Hide only when child is a duplicate of the section label.
      const labelText = normalizeText(label.textContent);
      const childText = normalizeText(firstChildLink.textContent);

      if (labelText && childText && labelText === childText) {
        firstChildItem.classList.add('fc-nav-index-entry');
      } else {
        firstChildItem.classList.remove('fc-nav-index-entry');
      }
    });
  }

  function findFirstChildHref(label) {
    const item = label.parentElement;
    if (!(item instanceof Element)) return null;

    const directChildLink = item.querySelector(
      ':scope > nav.md-nav > ul.md-nav__list > li.md-nav__item > a.md-nav__link[href]'
    );
    if (directChildLink instanceof HTMLAnchorElement) {
      return directChildLink.getAttribute('href');
    }

    const fallback = item.querySelector('a.md-nav__link[href]');
    if (fallback instanceof HTMLAnchorElement) {
      return fallback.getAttribute('href');
    }

    return null;
  }

  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const label = target.closest(SECTION_LABEL_SELECTOR);
    if (!(label instanceof HTMLLabelElement)) return;

    // Keep native expand/collapse when clicking the chevron toggle.
    if (target.closest('.md-nav__icon')) return;

    const href = findFirstChildHref(label);
    if (!href) return;

    event.preventDefault();
    event.stopPropagation();
    window.location.assign(href);
  });

  if (window.document$ && typeof window.document$.subscribe === 'function') {
    window.document$.subscribe(() => {
      decorateSectionLinks(document);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => decorateSectionLinks(document));
  } else {
    decorateSectionLinks(document);
  }
})();
