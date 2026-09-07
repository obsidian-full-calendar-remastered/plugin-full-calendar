import { isLightColor, getCalendarColors } from './utils';

describe('isLightColor', () => {
  it('identifies light named colors', () => {
    expect(isLightColor('white')).toBe(true);
    expect(isLightColor('White')).toBe(true);
    expect(isLightColor('WHITE')).toBe(true);
    expect(isLightColor('yellow')).toBe(true);
    expect(isLightColor('cyan')).toBe(true);
    expect(isLightColor('lime')).toBe(true);
  });

  it('identifies dark named colors', () => {
    expect(isLightColor('black')).toBe(false);
    expect(isLightColor('navy')).toBe(false);
    expect(isLightColor('darkblue')).toBe(false);
    expect(isLightColor('maroon')).toBe(false);
  });

  it('handles 3-digit and 4-digit hex codes', () => {
    expect(isLightColor('#fff')).toBe(true);
    expect(isLightColor('#FFF')).toBe(true);
    expect(isLightColor('#000')).toBe(false);
    expect(isLightColor('#ffff')).toBe(true);
    expect(isLightColor('#000f')).toBe(false);
  });

  it('handles 6-digit hex codes', () => {
    expect(isLightColor('#ffffff')).toBe(true);
    expect(isLightColor('#FFFFFF')).toBe(true);
    expect(isLightColor('#000000')).toBe(false);
    expect(isLightColor('#ffff00')).toBe(true);
    expect(isLightColor('#3788d8')).toBe(false);
  });

  it('handles 8-digit hex codes with alpha (e.g. from CalDAV/ICS)', () => {
    expect(isLightColor('#ffffffff')).toBe(true);
    expect(isLightColor('#FFFFFFFF')).toBe(true);
    expect(isLightColor('#000000ff')).toBe(false);
    expect(isLightColor('#123456ff')).toBe(false);
  });

  it('handles hex codes missing the leading hash prefix', () => {
    expect(isLightColor('ffffff')).toBe(true);
    expect(isLightColor('FFFFFF')).toBe(true);
    expect(isLightColor('fff')).toBe(true);
    expect(isLightColor('000000')).toBe(false);
    expect(isLightColor('000')).toBe(false);
    expect(isLightColor('ffffffff')).toBe(true);
  });

  it('handles rgb, rgba, and hsl formats', () => {
    expect(isLightColor('rgb(255, 255, 255)')).toBe(true);
    expect(isLightColor('rgba(255, 255, 255, 1)')).toBe(true);
    expect(isLightColor('hsl(0, 0%, 100%)')).toBe(true);
    expect(isLightColor('rgb(0, 0, 0)')).toBe(false);
    expect(isLightColor('rgba(0, 0, 0, 1)')).toBe(false);
    expect(isLightColor('hsl(0, 0%, 0%)')).toBe(false);
  });

  it('safely handles empty, whitespace, or invalid color strings', () => {
    expect(isLightColor('')).toBe(false);
    expect(isLightColor('   ')).toBe(false);
    expect(isLightColor('not-a-valid-color')).toBe(false);
  });
});

describe('getCalendarColors', () => {
  it('returns black textColor for white named color', () => {
    const result = getCalendarColors('white');
    expect(result.color).toBe('white');
    expect(result.textColor).toBe('black');
  });

  it('returns black textColor for #ffffff hex color', () => {
    const result = getCalendarColors('#ffffff');
    expect(result.color).toBe('#ffffff');
    expect(result.textColor).toBe('black');
  });

  it('returns black textColor for 3-digit #fff hex color', () => {
    const result = getCalendarColors('#fff');
    expect(result.color).toBe('#fff');
    expect(result.textColor).toBe('black');
  });

  it('returns black textColor for 8-digit #ffffffff hex color', () => {
    const result = getCalendarColors('#ffffffff');
    expect(result.color).toBe('#ffffffff');
    expect(result.textColor).toBe('black');
  });

  it('normalizes hex colors without leading # and sets contrasting text', () => {
    const whiteResult = getCalendarColors('ffffff');
    expect(whiteResult.color).toBe('#ffffff');
    expect(whiteResult.textColor).toBe('black');

    const blackResult = getCalendarColors('000000');
    expect(blackResult.color).toBe('#000000');
    expect(blackResult.textColor).not.toBe('black');
  });

  it('returns black textColor for light pastel and vibrant colors', () => {
    expect(getCalendarColors('#ffff00').textColor).toBe('black');
    expect(getCalendarColors('#ffeb3b').textColor).toBe('black');
    expect(getCalendarColors('cyan').textColor).toBe('black');
    expect(getCalendarColors('rgb(250, 250, 250)').textColor).toBe('black');
  });

  it('does not use black textColor for dark colors', () => {
    expect(getCalendarColors('#000000').textColor).not.toBe('black');
    expect(getCalendarColors('black').textColor).not.toBe('black');
    expect(getCalendarColors('#1a1a1a').textColor).not.toBe('black');
    expect(getCalendarColors('#3788d8').textColor).not.toBe('black');
  });

  it('provides default fallback colors when color is null, undefined, or empty', () => {
    const nullResult = getCalendarColors(null);
    expect(nullResult.color).toBeDefined();
    expect(nullResult.textColor).toBeDefined();

    const undefResult = getCalendarColors(undefined);
    expect(undefResult.color).toBeDefined();
    expect(undefResult.textColor).toBeDefined();

    const emptyResult = getCalendarColors('');
    expect(emptyResult.color).toBeDefined();
    expect(emptyResult.textColor).toBeDefined();
  });
});
