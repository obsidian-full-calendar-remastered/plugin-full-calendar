/**
 * @file eventTitleNormalizer.test.ts
 * @brief Unit tests for pure event title and category normalization helpers.
 */

import {
  extractCleanTitle,
  normalizeEventTitleFields,
  normalizeOptionalField
} from './eventTitleNormalizer';

describe('eventTitleNormalizer', () => {
  describe('normalizeOptionalField', () => {
    it('trims strings and maps blank or missing values to undefined', () => {
      expect(normalizeOptionalField(undefined)).toBeUndefined();
      expect(normalizeOptionalField('')).toBeUndefined();
      expect(normalizeOptionalField('   ')).toBeUndefined();
      expect(normalizeOptionalField('  YouTube  ')).toBe('YouTube');
    });
  });

  describe('extractCleanTitle', () => {
    it('strips Category - SubCategory - prefix once', () => {
      expect(extractCleanTitle('Wellness - YouTube - Watch - AI News', 'Wellness', 'YouTube')).toBe(
        'Watch - AI News'
      );
    });

    it('strips Category - prefix when subCategory is absent', () => {
      expect(extractCleanTitle('Work - Standup', 'Work')).toBe('Standup');
    });

    it('strips SubCategory - prefix leaked from EventEnhancer cached titles', () => {
      expect(
        extractCleanTitle(
          'YouTube - Watch - AI News: Things Will Never Be The Same - YouTube',
          'Wellness',
          'YouTube'
        )
      ).toBe('Watch - AI News: Things Will Never Be The Same - YouTube');
    });

    it('matches prefixes case-insensitively', () => {
      expect(extractCleanTitle('wellness - youtube - Morning Stretch', 'Wellness', 'YouTube')).toBe(
        'Morning Stretch'
      );
    });

    it('preserves intentional repeated segment in title via single-pass stripping', () => {
      expect(extractCleanTitle('YouTube - YouTube - Tutorial', 'Wellness', 'YouTube')).toBe(
        'YouTube - Tutorial'
      );
    });

    it('never strips a title down to empty string', () => {
      expect(extractCleanTitle('Work', 'Work')).toBe('Work');
      expect(extractCleanTitle('YouTube - ', 'Wellness', 'YouTube')).toBe('YouTube -');
      expect(extractCleanTitle('Wellness - YouTube', 'Wellness', 'YouTube')).toBe('YouTube');
    });
  });

  describe('normalizeEventTitleFields', () => {
    it('keeps title literal and omits category/subCategory when advanced categorization is disabled', () => {
      expect(
        normalizeEventTitleFields({
          rawTitle: 'Work - Dev - Meeting',
          category: 'Work',
          subCategory: 'Dev',
          enableAdvancedCategorization: false
        })
      ).toEqual({
        title: 'Work - Dev - Meeting',
        category: undefined,
        subCategory: undefined
      });
    });

    it('returns clean structured fields when advanced categorization is enabled', () => {
      expect(
        normalizeEventTitleFields({
          rawTitle: 'YouTube - Watch - AI News',
          category: 'Wellness',
          subCategory: 'YouTube',
          enableAdvancedCategorization: true
        })
      ).toEqual({
        title: 'Watch - AI News',
        category: 'Wellness',
        subCategory: 'YouTube'
      });
    });

    it('clears subCategory when category is empty or absent', () => {
      expect(
        normalizeEventTitleFields({
          rawTitle: 'Watch - AI News',
          category: '  ',
          subCategory: 'YouTube',
          enableAdvancedCategorization: true
        })
      ).toEqual({
        title: 'Watch - AI News',
        category: undefined,
        subCategory: undefined
      });
    });
  });
});
