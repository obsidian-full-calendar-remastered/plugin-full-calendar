import {
  newFrontmatter,
  modifyFrontmatterString,
  parseFrontmatterWithFallback,
  extractFrontmatter
} from './frontmatter';
import { OFCEvent } from '../../types';

describe('frontmatter utilities', () => {
  describe('newFrontmatter', () => {
    it('double quotes string fields by default', () => {
      const event: Partial<OFCEvent> = {
        title: 'Super: Event',
        date: '2026-08-11',
        allDay: true
      };

      const result = newFrontmatter(event);
      expect(result).toContain('title: "Super: Event"');
      expect(result).toContain('date: "2026-08-11"');
      expect(result).toContain('allDay: true');
    });

    it('handles pre-quoted strings without double escaping', () => {
      const event: Partial<OFCEvent> = {
        title: '"Already Quoted: Title"',
        date: '2026-08-11',
        allDay: true
      };

      const result = newFrontmatter(event);
      expect(result).toContain('title: "Already Quoted: Title"');
      expect(result).not.toContain('""Already Quoted');
    });
  });

  describe('modifyFrontmatterString', () => {
    it('replaces unquoted title with double-quoted title when updated', () => {
      const originalPage = `---
title: Super: Event
date: 2026-08-11
allDay: true
---
Note body text`;

      const modified = modifyFrontmatterString(originalPage, {
        title: 'Super: Event Updated'
      });

      expect(modified).toContain('title: "Super: Event Updated"');
      expect(modified).toContain('date: 2026-08-11');
      expect(modified).toContain('Note body text');
    });
  });

  describe('parseFrontmatterWithFallback', () => {
    it('extracts frontmatter text using extractFrontmatter', () => {
      const page = `---\ntitle: "Test"\n---\nBody`;
      expect(extractFrontmatter(page)).toBe('\ntitle: "Test"\n');
    });

    it('parses valid frontmatter using standard YAML parser', () => {
      const page = `---
title: "Valid Event"
date: "2026-08-11"
allDay: true
---`;

      const result = parseFrontmatterWithFallback(page);
      expect(result).toEqual({
        title: 'Valid Event',
        date: '2026-08-11',
        allDay: true
      });
    });

    it('parses unquoted colon titles when standard YAML parser fails', () => {
      const page = `---
title: Super: Event
date: 2026-08-11
allDay: true
---
Body content`;

      const result = parseFrontmatterWithFallback(page);
      expect(result).toEqual({
        title: 'Super: Event',
        date: '2026-08-11',
        allDay: true
      });
    });

    it('strips quotes if value is already wrapped in single or double quotes in fallback parser', () => {
      const page = `---
title: 'Super: Event'
category: "Work"
---`;

      const result = parseFrontmatterWithFallback(page);
      expect(result).toEqual({
        title: 'Super: Event',
        category: 'Work'
      });
    });

    it('returns null if no frontmatter exists', () => {
      const page = `# No frontmatter here`;
      expect(parseFrontmatterWithFallback(page)).toBeNull();
    });

    it('parses bracketed arrays in fallback parser when YAML parser fails', () => {
      const page = `---
title: Unquoted: Title
skipDates: ["2026-09-14", "2026-09-21"]
daysOfWeek: [M, W]
---`;
      const result = parseFrontmatterWithFallback(page);
      expect(result).toEqual({
        title: 'Unquoted: Title',
        skipDates: ['2026-09-14', '2026-09-21'],
        daysOfWeek: ['M', 'W']
      });
    });
  });

  describe('array quoting in modifyFrontmatterString', () => {
    it('properly quotes string elements in arrays like skipDates', () => {
      const originalPage = `---
title: "Recurring Note"
type: recurring
---`;
      const modified = modifyFrontmatterString(originalPage, {
        skipDates: ['2026-09-14', '2026-09-21']
      });
      expect(modified).toContain('skipDates: ["2026-09-14", "2026-09-21"]');
    });
  });

  describe('multiline description handling', () => {
    const multiLineDesc = `Test Property 1: Test Value 1
Test Property 2: Test Value 2
Test Property 3: Test Value 3`;

    it('serializes multiline description as a block scalar in newFrontmatter', () => {
      const event: Partial<OFCEvent> = {
        title: 'Test Event',
        description: multiLineDesc,
        allDay: true
      };

      const result = newFrontmatter(event);
      expect(result).toContain('description: |-');
      expect(result).toContain('  Test Property 1: Test Value 1');
      expect(result).toContain('  Test Property 2: Test Value 2');
      expect(result).toContain('  Test Property 3: Test Value 3');
    });

    it('correctly parses multiline block scalar in parseFrontmatterWithFallback', () => {
      const page = `---
title: "Test Event"
description: |-
  Test Property 1: Test Value 1
  Test Property 2: Test Value 2
  Test Property 3: Test Value 3
allDay: true
---
Body text`;

      const result = parseFrontmatterWithFallback(page);
      expect(result).toEqual({
        title: 'Test Event',
        description: multiLineDesc,
        allDay: true
      });
    });

    it('updates multiline description in modifyFrontmatterString preserving rest of note', () => {
      const originalPage = `---
title: "Test Event"
date: "2026-10-09"
description: "Initial single line"
allDay: true
---
Note body content here`;

      const modified = modifyFrontmatterString(originalPage, {
        description: multiLineDesc
      });

      expect(modified).toContain('description: |-');
      expect(modified).toContain('  Test Property 1: Test Value 1');
      expect(modified).toContain('date: "2026-10-09"');
      expect(modified).toContain('Note body content here');
      expect(parseFrontmatterWithFallback(modified)).toEqual({
        title: 'Test Event',
        date: '2026-10-09',
        description: multiLineDesc,
        allDay: true
      });
    });

    it('preserves multiline block scalar when updating another frontmatter field', () => {
      const originalPage = `---
title: "Test Event"
description: |-
  Test Property 1: Test Value 1
  Test Property 2: Test Value 2
  Test Property 3: Test Value 3
allDay: true
---
Note body content`;

      const modified = modifyFrontmatterString(originalPage, {
        title: 'Updated Event Title'
      });

      expect(modified).toContain('title: "Updated Event Title"');
      expect(modified).toContain('description: |-');
      expect(modified).toContain('  Test Property 1: Test Value 1');
      expect(modified).toContain('Note body content');
      expect(parseFrontmatterWithFallback(modified)?.description).toBe(multiLineDesc);
    });

    it('handles blank lines within a multiline block scalar during modifyFrontmatterString', () => {
      const descWithBlankLine = `Paragraph 1: Details

Paragraph 2: More details`;

      const originalPage = `---
title: "Test Event"
description: |-
  Paragraph 1: Details

  Paragraph 2: More details
allDay: true
---
Note body content`;

      const modified = modifyFrontmatterString(originalPage, {
        allDay: false
      });

      expect(modified).toContain('allDay: false');
      expect(modified).toContain('Paragraph 1: Details');
      expect(modified).toContain('Paragraph 2: More details');
      expect(parseFrontmatterWithFallback(modified)?.description).toBe(descWithBlankLine);
    });

    it('replaces a multiline block scalar that contains internal blank lines without leaving orphaned text', () => {
      const originalPage = `---
title: "Test Event"
description: |-
  Paragraph 1: Details

  Paragraph 2: More details
allDay: true
---
Note body content`;

      const modified = modifyFrontmatterString(originalPage, {
        description: 'Single-line replacement'
      });

      expect(modified).toContain('description: "Single-line replacement"');
      expect(modified).not.toContain('Paragraph 1: Details');
      expect(modified).not.toContain('Paragraph 2: More details');
      expect(modified).toContain('allDay: true');
      expect(modified).toContain('Note body content');
      expect(parseFrontmatterWithFallback(modified)).toEqual({
        title: 'Test Event',
        description: 'Single-line replacement',
        allDay: true
      });
    });

    it('correctly parses block scalar with 4-space indentation and nested list', () => {
      const page = `---
title: "Indented Note"
description: |-
    - Item 1
      - Sub-item 1
    - Item 2
allDay: true
---
Body text`;

      const result = parseFrontmatterWithFallback(page);
      expect(result).toEqual({
        title: 'Indented Note',
        description: '- Item 1\n  - Sub-item 1\n- Item 2',
        allDay: true
      });
    });

    it('correctly handles multi-key modifications where one key is a multiline block scalar without data erasure', () => {
      const originalPage = `---
notes: "Old Notes"
description: "Old Description"
allDay: true
---
Body text`;

      const modified = modifyFrontmatterString(originalPage, {
        notes: 'Updated Notes',
        description: 'Line 1: Detail\nLine 2: Detail'
      });

      expect(modified).toContain('notes: "Updated Notes"');
      expect(modified).toContain('description: |-');
      expect(modified).toContain('  Line 1: Detail');
      expect(modified).toContain('  Line 2: Detail');
      expect(modified).toContain('allDay: true');
      expect(modified).toContain('Body text');

      const parsed = parseFrontmatterWithFallback(modified);
      expect(parsed).toEqual({
        notes: 'Updated Notes',
        description: 'Line 1: Detail\nLine 2: Detail',
        allDay: true
      });
    });

    it('normalizes Windows CRLF in multiline strings when generating frontmatter', () => {
      const crlfDesc = 'Line 1: Item\r\nLine 2: Item\r\n';
      const event: Partial<OFCEvent> = {
        title: 'Windows Event',
        description: crlfDesc,
        allDay: true
      };

      const result = newFrontmatter(event);
      expect(result).not.toContain('\r');
      expect(result).toContain('description: |-');
      expect(result).toContain('  Line 1: Item');
      expect(result).toContain('  Line 2: Item');
    });

    it('correctly parses folded scalars (>) in fallback parser', () => {
      const page = `---
title: "Folded Event"
description: >-
  This is line one
  and this is line two
allDay: true
---
Body text`;

      const result = parseFrontmatterWithFallback(page);
      expect(result?.title).toBe('Folded Event');
      expect(result?.description).toBe('This is line one and this is line two');
      expect(result?.allDay).toBe(true);
    });
  });
});
