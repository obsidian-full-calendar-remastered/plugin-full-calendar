/**
 * @file linkTextFragments.ts
 * @brief Shared helpers to render text with links as DocumentFragment segments.
 * @license See LICENSE.md
 */

export type LinkTextSegment =
  { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string };

export interface LinkItem {
  text: string;
  href: string;
}

const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;

export function parseMarkdownLinks(text: string): LinkTextSegment[] {
  const segments: LinkTextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = MARKDOWN_LINK_REGEX.exec(text)) !== null) {
    const [fullMatch, linkText, href] = match;

    if (match.index > lastIndex) {
      segments.push({ kind: 'text', text: text.substring(lastIndex, match.index) });
    }

    segments.push({ kind: 'link', text: linkText, href });
    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < text.length) {
    segments.push({ kind: 'text', text: text.substring(lastIndex) });
  }

  return segments;
}

export function createMarkdownLinksFragment(text: string): DocumentFragment {
  return createLinksFragment(parseMarkdownLinks(text));
}

export function createLinksFragment(
  segments: LinkTextSegment[],
  options?: { betweenLinksText?: string }
): DocumentFragment {
  const fragment = createFragment();
  const betweenLinksText = options?.betweenLinksText;
  let previousSegmentWasLink = false;

  segments.forEach(segment => {
    if (betweenLinksText && previousSegmentWasLink && segment.kind === 'link') {
      fragment.append(betweenLinksText);
    }

    if (segment.kind === 'text') {
      fragment.append(segment.text);
      previousSegmentWasLink = false;
      return;
    }

    const isExternal = /^(?:https?:)?\/\//i.test(segment.href);
    const linkEl = createEl('a', {
      text: segment.text,
      href: segment.href,
      cls: isExternal ? 'external-link ofc-doc-link' : 'internal-link ofc-doc-link',
      attr: isExternal
        ? {
            target: '_blank',
            rel: 'noopener noreferrer'
          }
        : undefined
    });
    fragment.append(linkEl);

    previousSegmentWasLink = true;
  });

  return fragment;
}

export function linkItemsToSegments(items: LinkItem[]): LinkTextSegment[] {
  return items.map(item => ({ kind: 'link', text: item.text, href: item.href }));
}
