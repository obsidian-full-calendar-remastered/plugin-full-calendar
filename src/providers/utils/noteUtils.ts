import { DateTime } from 'luxon';
import { rrulestr } from 'rrule';
import { CachedMetadata, TFile, normalizePath } from 'obsidian';
import { OFCEvent } from '../../types';
import { ObsidianInterface } from '../../ObsidianAdapter';
import { constructTitle } from '../../features/category/categoryParser';

export interface TitleSettingsLike {
  enableAdvancedCategorization?: boolean;
}

export function sanitizeTitleForFilename(title: string): string {
  return title
    .replace(/[\\/:"*?<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const basenameFromEvent = (event: OFCEvent, settings: TitleSettingsLike): string => {
  const fullTitle = settings.enableAdvancedCategorization
    ? constructTitle(event.category, event.subCategory, event.title)
    : event.title;
  const sanitizedTitle = sanitizeTitleForFilename(fullTitle);
  switch (event.type) {
    case undefined:
    case 'single':
      return `${event.date} ${sanitizedTitle}`;
    case 'recurring': {
      if (event.daysOfWeek && event.daysOfWeek.length > 0) {
        return `(Every ${event.daysOfWeek.join(',')}) ${sanitizedTitle}`;
      }
      if (event.month && event.dayOfMonth) {
        const monthName = DateTime.fromObject({ month: event.month }).toFormat('MMM');
        return `(Every year on ${monthName} ${event.dayOfMonth}) ${sanitizedTitle}`;
      }
      if (event.dayOfMonth) {
        return `(Every month on the ${event.dayOfMonth}) ${sanitizedTitle}`;
      }
      return `(Recurring) ${sanitizedTitle}`;
    }
    case 'rrule':
      return `(${rrulestr(event.rrule).toText()}) ${sanitizedTitle}`;
  }
};

export const filenameForEvent = (event: OFCEvent, settings: TitleSettingsLike): string =>
  `${basenameFromEvent(event, settings)}.md`;

const SUFFIX_PATTERN = '-_-_-';

export function findUniquePath(
  app: ObsidianInterface,
  directory: string,
  baseFilename: string
): string {
  let path = normalizePath(`${directory}/${baseFilename}.md`);
  if (!app.getAbstractFileByPath(path)) {
    return path;
  }

  let i = 1;
  while (true) {
    const suffix = `${SUFFIX_PATTERN}${i}`;
    path = normalizePath(`${directory}/${baseFilename}${suffix}.md`);
    if (!app.getAbstractFileByPath(path)) {
      return path;
    }
    i++;
  }
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => window.setTimeout(resolve, ms));
const METADATA_WAIT_TIMEOUT_MS = 1500;

export const waitForFileAtPath = async (
  app: ObsidianInterface,
  path: string,
  attempts = 20,
  delayMs = 25
): Promise<TFile | null> => {
  for (let i = 0; i < attempts; i++) {
    const file = app.getFileByPath(path);
    if (file && file.path === path) {
      return file;
    }
    await sleep(delayMs);
  }
  return null;
};

export const waitForMetadataWithTimeout = async (
  app: ObsidianInterface,
  file: TFile,
  timeoutMs = METADATA_WAIT_TIMEOUT_MS
): Promise<CachedMetadata | null> => {
  const existing = app.getMetadata(file);
  if (existing) {
    return existing;
  }

  try {
    return await Promise.race([
      app.waitForMetadata(file),
      new Promise<null>(resolve => window.setTimeout(() => resolve(null), timeoutMs))
    ]);
  } catch (error) {
    console.warn(
      `Full Calendar: Failed while waiting for metadata for note file "${file.path}".`,
      error
    );
    return null;
  }
};

type PrintableAtom =
  | Record<string, unknown>
  | (number | string)[]
  | number
  | string
  | boolean
  | null;

function escapeYamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function stringifyYamlLine(k: string, v: PrintableAtom): string {
  if (v === null) return `${k}:`;
  if (Array.isArray(v)) return `${k}: [${v.join(',')}]`;
  if (typeof v === 'object') return `${k}: ${JSON.stringify(v)}`;
  if (typeof v === 'string') return `${k}: ${escapeYamlString(v)}`;
  return `${k}: ${v}`;
}

export function serializeFrontmatter(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .filter(([_, v]) => v !== undefined && v !== null)
    .map(([k, v]) => stringifyYamlLine(k, v as PrintableAtom))
    .join('\n');
}
