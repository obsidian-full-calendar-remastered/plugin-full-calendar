import { parseRelativeOffset } from './CodeBlockProcessor';
import { DateTime } from 'luxon';

describe('CodeBlockProcessor Relative Offset Parsing', () => {
  const baseDate = DateTime.fromISO('2026-06-15T00:00:00.000Z', { zone: 'utc' });

  it('parses basic positive and negative day offsets correctly', () => {
    expect(parseRelativeOffset('+3d', baseDate).toISO()).toBe('2026-06-18T00:00:00.000Z');
    expect(parseRelativeOffset('-5d', baseDate).toISO()).toBe('2026-06-10T00:00:00.000Z');
  });

  it('parses week offsets correctly', () => {
    expect(parseRelativeOffset('+2w', baseDate).toISO()).toBe('2026-06-29T00:00:00.000Z');
    expect(parseRelativeOffset('-1w', baseDate).toISO()).toBe('2026-06-08T00:00:00.000Z');
  });

  it('parses month offsets correctly', () => {
    expect(parseRelativeOffset('+1m', baseDate).toISO()).toBe('2026-07-15T00:00:00.000Z');
    expect(parseRelativeOffset('-2m', baseDate).toISO()).toBe('2026-04-15T00:00:00.000Z');
  });

  it('parses year offsets correctly', () => {
    expect(parseRelativeOffset('+1y', baseDate).toISO()).toBe('2027-06-15T00:00:00.000Z');
    expect(parseRelativeOffset('-3y', baseDate).toISO()).toBe('2023-06-15T00:00:00.000Z');
  });

  it('falls back to baseDate for invalid syntax', () => {
    expect(parseRelativeOffset('invalid', baseDate).toISO()).toBe(baseDate.toISO());
    expect(parseRelativeOffset('5', baseDate).toISO()).toBe(baseDate.toISO());
    expect(parseRelativeOffset('+3x', baseDate).toISO()).toBe(baseDate.toISO());
  });
});
