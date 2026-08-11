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
  });
});
