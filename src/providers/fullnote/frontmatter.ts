/**
 * @file frontmatter.ts
 * @brief A utility for parsing and manipulating YAML frontmatter in notes.
 *
 * @description
 * This file provides a set of pure functions for working with Obsidian's
 * YAML frontmatter. It centralizes the logic for creating, reading, and
 * modifying frontmatter, ensuring consistent behavior across the plugin.
 * This utility is primarily used by the `FullNoteCalendar` to manage event
 * data stored in note files.
 *
 * @see FullNoteCalendar.ts
 *
 * @license See LICENSE.md
 */

import { parseYaml } from 'obsidian';
import { OFCEvent } from '../../types';

const FRONTMATTER_SEPARATOR = '---';

/**
 * @param page Contents of a markdown file.
 * @returns Whether or not this page has a frontmatter section.
 */
function hasFrontmatter(page: string): boolean {
  return (
    page.startsWith(FRONTMATTER_SEPARATOR) && page.slice(3).indexOf(FRONTMATTER_SEPARATOR) !== -1
  );
}

/**
 * Return only frontmatter from a page.
 * @param page Contents of a markdown file.
 * @returns Frontmatter section of a page.
 */
export function extractFrontmatter(page: string): string | null {
  if (hasFrontmatter(page)) {
    return page.split(FRONTMATTER_SEPARATOR)[1];
  }
  return null;
}

/**
 * Remove frontmatter from a page.
 * @param page Contents of markdown file.
 * @returns Contents of a page without frontmatter.
 */
function extractPageContents(page: string): string {
  if (hasFrontmatter(page)) {
    return page.split(FRONTMATTER_SEPARATOR).slice(2).join(FRONTMATTER_SEPARATOR);
  }
  return page;
}

export function replaceFrontmatter(page: string, newFrontmatter: string): string {
  const contents = extractPageContents(page).replace(/^\n+/, '');
  // If the new frontmatter is empty, don't write any separators.
  if (!newFrontmatter || newFrontmatter.trim() === '') {
    return contents;
  }
  return `---\n${newFrontmatter.trim()}\n---\n${contents}`;
}

export type PrintableAtom =
  Record<string, unknown> | (number | string)[] | number | string | boolean | null;

export function escapeYamlString(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    return value;
  }
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function stringifyYamlLine(k: string, v: PrintableAtom): string {
  if (v === null) return `${k}:`;
  if (Array.isArray(v)) {
    const formatted = v.map(item => (typeof item === 'string' ? escapeYamlString(item) : item));
    return `${k}: [${formatted.join(', ')}]`;
  }
  if (typeof v === 'string') {
    const normalized = v.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (normalized.includes('\n')) {
      const indented = normalized
        .split('\n')
        .map(line => (line.length > 0 ? `  ${line}` : ''))
        .join('\n');
      return `${k}: |-\n${indented}`;
    }
    return `${k}: ${escapeYamlString(v)}`;
  }
  if (typeof v === 'object') return `${k}: ${JSON.stringify(v)}`;
  return `${k}: ${v}`;
}

export function parseFrontmatterWithFallback(page: string): Record<string, unknown> | null {
  const raw = extractFrontmatter(page);
  if (!raw) return null;

  try {
    const parsed: unknown = parseYaml(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // YAML parse error, fall back to tolerant line-by-line scalar parsing
  }

  const result: Record<string, unknown> = {};
  const lines = raw.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex <= 0) continue;

    const key = line.slice(0, colonIndex).trim();
    let rawVal = line.slice(colonIndex + 1).trim();

    if (!key) continue;

    if (/^[|>][-+]?$/.test(rawVal)) {
      const blockRawLines: string[] = [];
      let j = i + 1;
      let baseIndent = -1;

      while (j < lines.length) {
        const nextLine = lines[j];
        if (nextLine.trim() === '') {
          let peek = j + 1;
          while (peek < lines.length && lines[peek].trim() === '') peek++;
          if (peek < lines.length && /^\s+/.test(lines[peek])) {
            blockRawLines.push('');
            j++;
          } else {
            break;
          }
        } else if (/^\s+/.test(nextLine)) {
          if (baseIndent === -1) {
            const match = nextLine.match(/^(\s+)/);
            baseIndent = match ? match[1].length : 2;
          }
          blockRawLines.push(nextLine);
          j++;
        } else {
          break;
        }
      }

      const indentToStrip = baseIndent > 0 ? baseIndent : 2;
      const blockLines = blockRawLines.map(l => {
        if (!l) return '';
        const regex = new RegExp(`^\\s{1,${indentToStrip}}`);
        return l.replace(regex, '');
      });

      result[key] = blockLines.join('\n');
      i = j - 1;
      continue;
    }

    if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      const inner = rawVal.slice(1, -1).trim();
      if (!inner) {
        result[key] = [];
      } else {
        result[key] = inner
          .split(',')
          .map(item => item.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      }
    } else {
      if (
        (rawVal.startsWith('"') && rawVal.endsWith('"') && rawVal.length >= 2) ||
        (rawVal.startsWith("'") && rawVal.endsWith("'") && rawVal.length >= 2)
      ) {
        rawVal = rawVal.slice(1, -1);
      }

      if (rawVal === 'true') {
        result[key] = true;
      } else if (rawVal === 'false') {
        result[key] = false;
      } else if (rawVal === 'null' || rawVal === '') {
        result[key] = null;
      } else if (!isNaN(Number(rawVal)) && rawVal !== '') {
        result[key] = Number(rawVal);
      } else {
        result[key] = rawVal;
      }
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

export function newFrontmatter(fields: Partial<OFCEvent>): string {
  const newFields = { ...fields };
  if (newFields.type === 'single') delete newFields.type;
  if (!newFields.allDay) delete newFields.allDay;
  delete newFields.uid;

  return Object.entries(newFields)
    .filter(([_, v]) => v !== undefined)
    .map(([k, v]) => stringifyYamlLine(k, v as PrintableAtom))
    .join('\n');
}

export function modifyFrontmatterString(
  page: string,
  modifications: Record<string, unknown>
): string {
  const frontmatter = extractFrontmatter(page);
  const sourceLines = frontmatter ? frontmatter.split('\n') : [];

  if (sourceLines[0] === '') {
    sourceLines.shift();
  }
  if (sourceLines[sourceLines.length - 1] === '') {
    sourceLines.pop();
  }

  const lines = [...sourceLines];
  const topLevelKeyPattern = /^[^\s#][^:]*:\s*(.*)?$/;

  const findKeyBlockRange = (key: string): { start: number; end: number } | null => {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const keyPattern = new RegExp(`^${escapedKey}:\\s*(.*)?$`);

    for (let i = 0; i < lines.length; i++) {
      if (!keyPattern.test(lines[i])) {
        continue;
      }

      let end = i + 1;
      while (end < lines.length) {
        const candidate = lines[end];
        if (topLevelKeyPattern.test(candidate) || candidate.startsWith('#')) {
          break;
        }
        if (candidate.trim() === '') {
          let peek = end + 1;
          while (peek < lines.length && lines[peek].trim() === '') peek++;
          if (peek >= lines.length || !/^\s+/.test(lines[peek])) {
            break;
          }
        }
        end++;
      }

      return { start: i, end };
    }

    return null;
  };

  for (const [key, rawValue] of Object.entries(modifications)) {
    const value = rawValue as PrintableAtom | undefined;
    const range = findKeyBlockRange(key);

    if (value === undefined || value === null) {
      if (range) {
        lines.splice(range.start, range.end - range.start);
      }
      continue;
    }

    const replacement = stringifyYamlLine(key, value);
    const replacementLines = replacement.split('\n');
    if (range) {
      lines.splice(range.start, range.end - range.start, ...replacementLines);
    } else {
      lines.push(...replacementLines);
    }
  }

  return replaceFrontmatter(page, lines.join('\n'));
}
