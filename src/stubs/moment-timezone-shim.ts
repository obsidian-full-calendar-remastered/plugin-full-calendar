import { moment } from 'obsidian';

interface TzShim {
  (...args: unknown[]): unknown;
  tz: ((date: unknown, timezone: string) => unknown) & { guess(): string };
  [key: string]: unknown;
}

// A minimal moment-timezone shim that uses standard moment and doesn't bundle any timezone database.
const tzShim = function (...args: unknown[]) {
  return (moment as unknown as (...args: unknown[]) => unknown)(...args);
} as unknown as TzShim;

// Copy all properties from moment
Object.assign(tzShim, moment);

tzShim.tz = Object.assign(
  (date: unknown, timezone: string) => (moment as unknown as (date: unknown) => unknown)(date),
  {
    guess() {
      return 'UTC';
    }
  }
);

export default tzShim;
