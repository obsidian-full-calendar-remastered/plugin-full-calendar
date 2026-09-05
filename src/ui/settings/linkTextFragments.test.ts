/**
 * @jest-environment jsdom
 */

interface MockDomElementInfo {
  cls?: string | string[];
  text?: string;
  href?: string;
  attr?: Record<string, string | number | boolean | null>;
}

// Polyfill Obsidian global DOM helpers in jsdom environment if not defined
const targetWindow = window as unknown as {
  createFragment?: () => DocumentFragment;
  createEl?: (tag: string, o?: MockDomElementInfo | string) => HTMLElement;
};

if (!targetWindow.createFragment) {
  targetWindow.createFragment = (): DocumentFragment => document.createDocumentFragment();
}

if (!targetWindow.createEl) {
  targetWindow.createEl = (tag: string, o?: MockDomElementInfo | string): HTMLElement => {
    const el = document.createElement(tag);
    if (typeof o === 'string') {
      el.className = o;
    } else if (o) {
      if (o.cls) {
        el.className = Array.isArray(o.cls) ? o.cls.join(' ') : o.cls;
      }
      if (o.text) {
        el.textContent = o.text;
      }
      if (o.href) {
        el.setAttribute('href', o.href);
      }
      if (o.attr) {
        for (const [k, v] of Object.entries(o.attr)) {
          if (v !== null && v !== undefined) {
            el.setAttribute(k, String(v));
          }
        }
      }
    }
    return el;
  };
}

import {
  parseMarkdownLinks,
  linkItemsToSegments,
  createLinksFragment,
  createMarkdownLinksFragment
} from './linkTextFragments';

describe('linkTextFragments', () => {
  describe('parseMarkdownLinks', () => {
    it('returns a single text segment when no markdown links are present', () => {
      const segments = parseMarkdownLinks('Plain text without links');
      expect(segments).toEqual([{ kind: 'text', text: 'Plain text without links' }]);
    });

    it('correctly parses a single markdown link with surrounding text', () => {
      const segments = parseMarkdownLinks('Check out [Obsidian](https://obsidian.md) for notes.');
      expect(segments).toEqual([
        { kind: 'text', text: 'Check out ' },
        { kind: 'link', text: 'Obsidian', href: 'https://obsidian.md' },
        { kind: 'text', text: ' for notes.' }
      ]);
    });

    it('correctly parses multiple consecutive links', () => {
      const segments = parseMarkdownLinks('[Link1](https://one.com)[Link2](https://two.com)');
      expect(segments).toEqual([
        { kind: 'link', text: 'Link1', href: 'https://one.com' },
        { kind: 'link', text: 'Link2', href: 'https://two.com' }
      ]);
    });
  });

  describe('linkItemsToSegments', () => {
    it('converts LinkItem array to LinkTextSegment array of kind link', () => {
      const items = [
        { text: 'Doc 1', href: 'https://example.com/1' },
        { text: 'Doc 2', href: 'https://example.com/2' }
      ];
      const segments = linkItemsToSegments(items);
      expect(segments).toEqual([
        { kind: 'link', text: 'Doc 1', href: 'https://example.com/1' },
        { kind: 'link', text: 'Doc 2', href: 'https://example.com/2' }
      ]);
    });
  });

  describe('createLinksFragment', () => {
    it('creates a fragment with external-link and ofc-doc-link classes and security attributes for external links', () => {
      const fragment = createLinksFragment([
        { kind: 'text', text: 'Visit ' },
        {
          kind: 'link',
          text: 'Full Calendar Docs',
          href: 'https://obsidian-full-calendar.github.io'
        }
      ]);

      const container = document.createElement('div');
      container.appendChild(fragment);

      expect(container.textContent).toBe('Visit Full Calendar Docs');
      const link = container.querySelector('a');
      expect(link).not.toBeNull();
      expect(link?.textContent).toBe('Full Calendar Docs');
      expect(link?.getAttribute('href')).toBe('https://obsidian-full-calendar.github.io');
      expect(link?.classList.contains('external-link')).toBe(true);
      expect(link?.classList.contains('ofc-doc-link')).toBe(true);
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('creates internal-link class for non-external links', () => {
      const fragment = createLinksFragment([
        { kind: 'link', text: 'My Note', href: 'internal-note' }
      ]);

      const container = document.createElement('div');
      container.appendChild(fragment);

      const link = container.querySelector('a');
      expect(link).not.toBeNull();
      expect(link?.classList.contains('internal-link')).toBe(true);
      expect(link?.classList.contains('ofc-doc-link')).toBe(true);
      expect(link?.getAttribute('target')).toBeNull();
    });

    it('inserts betweenLinksText between consecutive links', () => {
      const fragment = createLinksFragment(
        [
          { kind: 'link', text: 'Link 1', href: 'https://example.com/1' },
          { kind: 'link', text: 'Link 2', href: 'https://example.com/2' }
        ],
        { betweenLinksText: ' | ' }
      );

      const container = document.createElement('div');
      container.appendChild(fragment);

      expect(container.textContent).toBe('Link 1 | Link 2');
      const links = container.querySelectorAll('a');
      expect(links.length).toBe(2);
      expect(links[0].textContent).toBe('Link 1');
      expect(links[1].textContent).toBe('Link 2');
    });
  });

  describe('createMarkdownLinksFragment', () => {
    it('creates fragment from markdown string with links', () => {
      const fragment = createMarkdownLinksFragment('Learn more: [Docs](https://example.com/docs)');
      const container = document.createElement('div');
      container.appendChild(fragment);

      expect(container.textContent).toBe('Learn more: Docs');
      const link = container.querySelector('a');
      expect(link?.getAttribute('href')).toBe('https://example.com/docs');
      expect(link?.classList.contains('external-link')).toBe(true);
      expect(link?.classList.contains('ofc-doc-link')).toBe(true);
    });
  });
});
