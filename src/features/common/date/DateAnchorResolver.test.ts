import { DateTime } from 'luxon';
import { resolveDateAnchor, isDateAnchorPreset, DATE_ANCHOR_PRESETS } from './DateAnchorResolver';

describe('DateAnchorResolver', () => {
  const fixedBase = DateTime.fromISO('2026-06-15T12:00:00.000Z');

  describe('Presets and recognition', () => {
    test('recognizes all supported presets', () => {
      for (const preset of DATE_ANCHOR_PRESETS) {
        expect(isDateAnchorPreset(preset)).toBe(true);
      }
      expect(isDateAnchorPreset('random')).toBe(false);
      expect(isDateAnchorPreset('2026-06-15')).toBe(false);
    });
  });

  describe('resolveDateAnchor', () => {
    test('returns undefined for empty or missing anchors', () => {
      expect(resolveDateAnchor(undefined, fixedBase)).toBeUndefined();
      expect(resolveDateAnchor(null, fixedBase)).toBeUndefined();
      expect(resolveDateAnchor('', fixedBase)).toBeUndefined();
      expect(resolveDateAnchor('   ', fixedBase)).toBeUndefined();
    });

    test('resolves "today" to undefined by default (calendar natural default)', () => {
      expect(resolveDateAnchor('today', fixedBase)).toBeUndefined();
      expect(resolveDateAnchor('Today', fixedBase)).toBeUndefined();
    });

    test('resolves "today" to ISO date when preserveDefaultToday is true', () => {
      expect(resolveDateAnchor('today', fixedBase, true)).toBe('2026-06-15');
    });

    test('resolves "tomorrow" to next day', () => {
      expect(resolveDateAnchor('tomorrow', fixedBase)).toBe('2026-06-16');
      expect(resolveDateAnchor('Tomorrow', fixedBase)).toBe('2026-06-16');
    });

    test('resolves "yesterday" to previous day', () => {
      expect(resolveDateAnchor('yesterday', fixedBase)).toBe('2026-06-14');
      expect(resolveDateAnchor('Yesterday', fixedBase)).toBe('2026-06-14');
    });

    test('resolves "thisWeek" to start of week (Monday)', () => {
      // 2026-06-15 is a Monday
      expect(resolveDateAnchor('thisWeek', fixedBase)).toBe('2026-06-15');
    });

    test('resolves "thisMonth" to start of month', () => {
      expect(resolveDateAnchor('thisMonth', fixedBase)).toBe('2026-06-01');
    });

    test('resolves relative offset notations', () => {
      expect(resolveDateAnchor('+1d', fixedBase)).toBe('2026-06-16');
      expect(resolveDateAnchor('-1d', fixedBase)).toBe('2026-06-14');
      expect(resolveDateAnchor('+2w', fixedBase)).toBe('2026-06-29');
      expect(resolveDateAnchor('+1m', fixedBase)).toBe('2026-07-15');
      expect(resolveDateAnchor('-1y', fixedBase)).toBe('2025-06-15');
    });

    test('resolves absolute ISO dates', () => {
      expect(resolveDateAnchor('1944-06-06', fixedBase)).toBe('1944-06-06');
      expect(resolveDateAnchor('2024-01-01', fixedBase)).toBe('2024-01-01');
      expect(resolveDateAnchor('2026-12-25', fixedBase)).toBe('2026-12-25');
    });

    test('returns undefined for invalid strings', () => {
      expect(resolveDateAnchor('invalid-date', fixedBase)).toBeUndefined();
      expect(resolveDateAnchor('not a date', fixedBase)).toBeUndefined();
    });
  });
});
