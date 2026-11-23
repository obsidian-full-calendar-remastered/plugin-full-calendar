#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_SITE_URL = 'https://obsidian-full-calendar-remastered.github.io/plugin-full-calendar/';
const DEFAULT_OUT_PATH = 'site/assets/agent/plugin-docs-index.md';
const MAX_SUMMARY_CHARS = 260;
const MAX_SECTIONS = 12;

const MAX_INDEX_BYTES = 256 * 1024;

function parseArgs(argv) {
  let outPath = DEFAULT_OUT_PATH;
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check') {
      check = true;
    } else if (arg === '--out' && i + 1 < argv.length) {
      outPath = argv[++i];
    } else if (arg.startsWith('--out=')) {
      outPath = arg.slice('--out='.length);
    }
  }
  return { outPath, check };
}

function readSiteUrl(mkdocsPath) {
  if (!fs.existsSync(mkdocsPath)) {
    return DEFAULT_SITE_URL;
  }
  const content = fs.readFileSync(mkdocsPath, 'utf8');
  const match = content.match(/^site_url:\s*(.+)$/m);
  if (!match) {
    return DEFAULT_SITE_URL;
  }
  let url = match[1].trim();
  if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
    url = url.slice(1, -1).trim();
  }
  if (!url) {
    return DEFAULT_SITE_URL;
  }
  return url.endsWith('/') ? url : `${url}/`;
}

function collectNavEntries(rootDir, mkdocsPath) {
  const navLabels = new Map();
  if (!fs.existsSync(mkdocsPath)) {
    return { files: null, navLabels };
  }
  const content = fs.readFileSync(mkdocsPath, 'utf8').replace(/\r\n/g, '\n');
  const lines = content.split('\n');
  let inNav = false;
  const seen = new Set();
  const files = [];

  for (const line of lines) {
    if (!inNav) {
      if (/^nav:\s*(?:#.*)?$/.test(line)) {
        inNav = true;
      }
      continue;
    }

    // Stop when another top-level YAML key starts
    if (/^[A-Za-z0-9_-]+:/.test(line)) {
      break;
    }

    const match = line.match(/^\s*-\s*(?:([^:#]+?):\s*)?(['"]?[^\s#'"]+\.md['"]?)\s*(?:#.*)?$/);
    if (!match) continue;

    const rawLabel = match[1] ? match[1].trim().replace(/^['"]|['"]$/g, '') : '';
    const mdPath = match[2].trim().replace(/^['"]|['"]$/g, '');

    if (mdPath.startsWith('architecture/')) continue;
    if (mdPath !== 'getting_started.md' && !mdPath.startsWith('user/')) continue;

    const relPosix = `docs/${mdPath}`;
    const fullPath = path.join(rootDir, relPosix);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) continue;

    if (rawLabel) {
      navLabels.set(relPosix, rawLabel);
    }
    if (!seen.has(relPosix)) {
      seen.add(relPosix);
      files.push(relPosix);
    }
  }

  if (files.length === 0) {
    return { files: null, navLabels };
  }

  files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { files, navLabels };
}

function collectMarkdownFiles(rootDir, mkdocsPath) {
  const navResult = collectNavEntries(rootDir, mkdocsPath);
  if (navResult.files) {
    return navResult;
  }

  const docsDir = path.join(rootDir, 'docs');
  const results = [];

  const gettingStarted = path.join(docsDir, 'getting_started.md');
  if (fs.existsSync(gettingStarted) && fs.statSync(gettingStarted).isFile()) {
    results.push('docs/getting_started.md');
  }

  const userDir = path.join(docsDir, 'user');
  if (fs.existsSync(userDir) && fs.statSync(userDir).isDirectory()) {
    const walk = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPosix = path.relative(rootDir, fullPath).split(path.sep).join('/');
        if (relPosix.startsWith('docs/architecture/')) {
          continue;
        }
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          results.push(relPosix);
        }
      }
    };
    walk(userDir);
  }

  results.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { files: results, navLabels: navResult.navLabels };
}

function parseFrontmatter(raw) {
  const normalized = raw.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { meta: {}, body: normalized };
  }
  const endIdx = normalized.indexOf('\n---\n', 4);
  if (endIdx === -1) {
    return { meta: {}, body: normalized };
  }
  const fmBlock = normalized.slice(4, endIdx);
  const body = normalized.slice(endIdx + 5);
  const meta = {};

  for (const line of fmBlock.split('\n')) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    let val = kv[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key === 'title' || key === 'description') {
      meta[key] = val;
    }
  }

  return { meta, body };
}

function cleanInlineMarkdown(text) {
  return text
    .replace(/\{:[^}]*\}/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function humanizeFilename(relPosix) {
  const base = path.posix.basename(relPosix, '.md');
  const name = base === 'index' ? path.posix.basename(path.posix.dirname(relPosix)) : base;
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractTitle(meta, body, relPosix) {
  if (meta.title) {
    return cleanInlineMarkdown(meta.title);
  }
  const h1Match = body.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return cleanInlineMarkdown(h1Match[1]);
  }
  return humanizeFilename(relPosix);
}

function extractCategory(relPosix) {
  if (relPosix === 'docs/getting_started.md') {
    return 'getting_started';
  }
  if (relPosix === 'docs/user/index.md') {
    return 'guides';
  }
  const underUser = relPosix.slice('docs/user/'.length);
  const firstSegment = underUser.split('/')[0];
  return firstSegment || 'guides';
}

function buildCanonicalUrl(siteUrl, relPosix) {
  let underDocs = relPosix.slice('docs/'.length);
  if (underDocs === 'index.md') {
    underDocs = '';
  } else if (underDocs.endsWith('/index.md')) {
    underDocs = underDocs.slice(0, -'index.md'.length);
  } else if (underDocs.endsWith('.md')) {
    underDocs = `${underDocs.slice(0, -3)}/`;
  }
  return `${siteUrl}${underDocs}`;
}

function stripFencedCodeBlocks(text) {
  return text.replace(/^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)\s*$/gm, '');
}

function truncateSummary(text, maxChars = MAX_SUMMARY_CHARS) {
  const cleaned = cleanInlineMarkdown(text);
  if (!cleaned) return '';

  // Try to take 1-2 complete sentences within maxChars without skipping text.
  const sentences = cleaned.split(/(?<=[.!?])\s+/g).filter(Boolean);
  if (sentences.length > 0) {
    let combined = '';
    for (let i = 0; i < Math.min(2, sentences.length); i++) {
      const candidate = combined ? `${combined} ${sentences[i]}` : sentences[i];
      if (candidate.length <= maxChars) {
        combined = candidate;
      } else {
        break;
      }
    }
    if (combined.length >= 40) {
      return combined;
    }
  }

  if (cleaned.length <= maxChars) {
    return cleaned;
  }

  const slice = cleaned.slice(0, maxChars - 3);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > 40 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[,;:\-\s]+$/, '')}...`;
}

function extractSummary(meta, body) {
  if (meta.description) {
    return truncateSummary(meta.description);
  }

  let afterH1 = body;
  const h1Match = body.match(/^#\s+.+$/m);
  if (h1Match && h1Match.index !== undefined) {
    afterH1 = body.slice(h1Match.index + h1Match[0].length);
  }

  const withoutCode = stripFencedCodeBlocks(afterH1);
  const lines = withoutCode.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (
      !trimmed ||
      trimmed === '---' ||
      trimmed === '***' ||
      /^===+\s+"/.test(trimmed) ||
      /^<!--[\s\S]*-->$/.test(trimmed) ||
      /^!\[[^\]]*\]\([^)]*\)$/.test(trimmed) ||
      /^(?:\*\*)?Last updated:/i.test(trimmed)
    ) {
      i++;
      continue;
    }

    // Stop if we hit a subheading before finding any summary, or skip?
    // Usually if there's an admonition or prose before ##, we grab it; if ## comes first, skip the heading line and keep scanning.
    if (/^#{1,6}\s+/.test(trimmed)) {
      i++;
      continue;
    }

    // Unwrap leading MkDocs admonitions (!!! abstract / info / note / tip)
    const admMatch = trimmed.match(/^!!!\s+(?:abstract|info|note|tip)(?:\s+"[^"]*")?\s*$/i);
    if (admMatch) {
      i++;
      const admLines = [];
      while (i < lines.length) {
        const bodyLine = lines[i];
        if (/^(?: {4}|\t)/.test(bodyLine)) {
          admLines.push(bodyLine.replace(/^(?: {4}|\t)/, '').trim());
          i++;
        } else if (bodyLine.trim() === '' && i + 1 < lines.length && /^(?: {4}|\t)/.test(lines[i + 1])) {
          admLines.push('');
          i++;
        } else {
          break;
        }
      }
      const admText = admLines.join(' ').trim();
      if (admText) {
        return truncateSummary(admText);
      }
      continue;
    }

    // Skip other admonition types if any, or tables
    if (/^!!!\s+/.test(trimmed) || /^\|/.test(trimmed)) {
      i++;
      while (i < lines.length && (/^(?: {4}|\t)/.test(lines[i]) || /^\|/.test(lines[i].trim()))) {
        i++;
      }
      continue;
    }

    // Collect first non-empty prose paragraph
    const paraLines = [];
    while (i < lines.length) {
      const pLine = lines[i].trim();
      if (
        !pLine ||
        pLine === '---' ||
        /^#{1,6}\s+/.test(pLine) ||
        /^!!!\s+/.test(pLine) ||
        /^===+\s+"/.test(pLine) ||
        /^\|/.test(pLine)
      ) {
        break;
      }
      paraLines.push(pLine);
      i++;
    }
    const paraText = paraLines.join(' ').trim();
    if (paraText) {
      return truncateSummary(paraText);
    }
  }

  return '';
}

function extractSections(body) {
  const withoutCode = stripFencedCodeBlocks(body);
  const seen = new Set();
  const sections = [];

  for (const line of withoutCode.split('\n')) {
    const match = line.match(/^##\s+(.+)$/);
    if (!match) continue;
    const cleaned = cleanInlineMarkdown(match[1]);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    sections.push(cleaned);
    if (sections.length >= MAX_SECTIONS) {
      break;
    }
  }

  return sections;
}

function main() {
  const rootDir = process.cwd();
  const { outPath, check } = parseArgs(process.argv.slice(2));
  const resolvedOut = path.resolve(rootDir, outPath);
  const mkdocsPath = path.join(rootDir, 'mkdocs.yml');
  const siteUrl = readSiteUrl(mkdocsPath);
  const { files, navLabels } = collectMarkdownFiles(rootDir, mkdocsPath);

  if (files.length === 0) {
    console.error('Error: No documentation files found for plugin docs index.');
    process.exit(1);
  }

  const rawEntries = files.map((relPosix) => {
    const fullPath = path.join(rootDir, relPosix);
    const raw = fs.readFileSync(fullPath, 'utf8');
    const { meta, body } = parseFrontmatter(raw);

    const title = extractTitle(meta, body, relPosix);
    const category = extractCategory(relPosix);
    const url = buildCanonicalUrl(siteUrl, relPosix);
    const summary = extractSummary(meta, body) || `${title} documentation.`;
    const sections = extractSections(body);

    return { relPosix, title, category, url, summary, sections };
  });

  const titleCounts = new Map();
  for (const entry of rawEntries) {
    titleCounts.set(entry.title, (titleCounts.get(entry.title) || 0) + 1);
  }

  const chunks = ['# Full Calendar Remastered — Plugin Documentation Index', ''];

  for (const entry of rawEntries) {
    let title = entry.title;
    if ((titleCounts.get(title) || 0) > 1) {
      const navLabel = navLabels.get(entry.relPosix);
      if (navLabel && navLabel !== title) {
        title = `${title} — ${navLabel}`;
      } else if (!entry.relPosix.endsWith('/index.md')) {
        const suffix = humanizeFilename(entry.relPosix);
        if (suffix && suffix !== title) {
          title = `${title} — ${suffix}`;
        }
      }
    }

    if (!title || !entry.summary || !entry.url.startsWith('https://')) {
      console.error(`Error: Invalid docs index entry generated for "${entry.relPosix}".`);
      process.exit(1);
    }

    chunks.push(`## ${title}`);
    chunks.push(`- Category: ${entry.category}`);
    chunks.push(`- URL: ${entry.url}`);
    chunks.push(`- Summary: ${entry.summary}`);
    chunks.push(`- Sections: ${entry.sections.length > 0 ? entry.sections.join(', ') : 'None'}`);
    chunks.push('');
  }

  const output = chunks.join('\n');
  const byteLength = Buffer.byteLength(output, 'utf8');
  if (byteLength > MAX_INDEX_BYTES) {
    console.error(
      `Error: Generated plugin docs index exceeds ${MAX_INDEX_BYTES} bytes (got ${byteLength} bytes).`
    );
    process.exit(1);
  }

  if (check) {
    console.log(`Verified ${files.length} docs index entries (${byteLength} bytes).`);
    return;
  }

  fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
  fs.writeFileSync(resolvedOut, output, 'utf8');

  console.log(`Generated ${files.length} entries -> ${outPath}`);
}

main();
