import { moment } from 'obsidian';

export interface TzShim {
  (...args: unknown[]): moment.Moment;
  tz: ((date?: unknown, timezone?: string) => moment.Moment) & {
    guess(): string;
    zone(name: string): unknown;
    names(): string[];
    setDefault(name?: string): unknown;
  };
  [key: string]: unknown;
}

const momentFn = moment as unknown as (...args: unknown[]) => moment.Moment;

// A minimal moment-timezone shim that uses Obsidian's built-in moment
// and avoids bundling the heavy timezone database.
const tzShim = function (...args: unknown[]): moment.Moment {
  return momentFn(...args);
} as unknown as TzShim;

// Copy all properties from Obsidian's moment
Object.assign(tzShim, moment);

const tz = Object.assign(
  function (date?: unknown, _timezone?: string): moment.Moment {
    if (arguments.length === 0) {
      return momentFn();
    }
    if (arguments.length === 1 && typeof date === 'string' && !/^\d{4}/.test(date)) {
      return momentFn();
    }
    return momentFn(date);
  },
  {
    guess(): string {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      } catch {
        return 'UTC';
      }
    },
    zone(_name: string) {
      return null;
    },
    names(): string[] {
      return [];
    },
    setDefault(_name?: string): TzShim {
      return tzShim;
    }
  }
);

tzShim.tz = tz;

export default tzShim;
