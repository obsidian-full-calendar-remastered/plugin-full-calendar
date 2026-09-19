import moment from '../moment-shim';
import tzShim from '../moment-timezone-shim';

interface HolidayItem {
  date: string;
  name: string;
  type: string;
}

interface HolidaysInstance {
  getHolidays(year: number): HolidayItem[];
}

type HolidaysConstructor = new (country: string) => HolidaysInstance;

describe('moment-timezone-shim and moment-shim', () => {
  describe('moment-shim', () => {
    it('should export a callable moment function', () => {
      expect(typeof moment).toBe('function');
      const m = (moment as unknown as (inp: string) => moment.Moment)('2026-05-08');
      expect(m.isValid()).toBe(true);
      expect(m.format('YYYY-MM-DD')).toBe('2026-05-08');
    });
  });

  describe('moment-timezone-shim', () => {
    it('should export a callable function that delegates to moment', () => {
      expect(typeof tzShim).toBe('function');
      const m = tzShim('2026-01-01');
      expect(m.isValid()).toBe(true);
      expect(m.year()).toBe(2026);
    });

    it('should provide a tz method with guess(), names(), zone(), and setDefault()', () => {
      expect(typeof tzShim.tz).toBe('function');

      const tzObj = tzShim.tz('2026-07-01 12:00:00', 'America/Toronto');
      expect(typeof tzObj.format).toBe('function');
      expect(tzObj.year()).toBe(2026);
      expect(tzObj.month()).toBe(6); // 0-indexed: July is 6
      expect(tzObj.date()).toBe(1);

      expect(typeof tzShim.tz.guess()).toBe('string');
      expect(Array.isArray(tzShim.tz.names())).toBe(true);
      expect(tzShim.tz.zone('America/New_York')).toBeNull();
      expect(tzShim.tz.setDefault('UTC')).toBe(tzShim);
    });

    it('should handle tz() called with no arguments or with single timezone string', () => {
      const now1 = tzShim.tz();
      expect(now1.isValid()).toBe(true);

      const now2 = tzShim.tz('America/New_York');
      expect(now2.isValid()).toBe(true);
    });
  });

  describe('date-holidays integration with custom vendor bundle', () => {
    it('should fetch US, CA, and JP holidays without throwing TypeError: m.default.tz is not a function', async () => {
      const HolidaysModule =
        (await import('../../../vendor/date-holidays-custom.min.js')) as unknown as
          { default?: HolidaysConstructor } | HolidaysConstructor;
      const HolidaysClass = (
        'default' in HolidaysModule && HolidaysModule.default
          ? HolidaysModule.default
          : HolidaysModule
      ) as HolidaysConstructor;

      // Test Canada: CA 2025, 2026, 2027 (user reported cases)
      for (const year of [2025, 2026, 2027]) {
        const hdCA = new HolidaysClass('CA');
        const caHolidays = hdCA.getHolidays(year);
        expect(Array.isArray(caHolidays)).toBe(true);
        expect(caHolidays.length).toBeGreaterThan(0);
        expect(caHolidays.some((h: HolidayItem) => h.name === 'Canada Day')).toBe(true);
      }

      // Test United States: US 2025, 2026, 2027 (user reported cases)
      for (const year of [2025, 2026, 2027]) {
        const hdUS = new HolidaysClass('US');
        const usHolidays = hdUS.getHolidays(year);
        expect(Array.isArray(usHolidays)).toBe(true);
        expect(usHolidays.length).toBeGreaterThan(0);
        expect(usHolidays.some((h: HolidayItem) => h.name.includes("New Year's Day"))).toBe(true);
      }

      // Test Japan: JP 2026 (tests astronomical equinox/solstice calculation invoking D0.default)
      const hdJP = new HolidaysClass('JP');
      const jpHolidays = hdJP.getHolidays(2026);
      expect(Array.isArray(jpHolidays)).toBe(true);
      expect(jpHolidays.length).toBeGreaterThan(0);
    });
  });
});
