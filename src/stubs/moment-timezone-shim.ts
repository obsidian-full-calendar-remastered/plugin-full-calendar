/* eslint-disable */
declare var module: any;
import { moment } from 'obsidian';

// A minimal moment-timezone shim that uses standard moment and doesn't bundle any timezone database.
const tzShim: any = function (...args: any[]) {
  return (moment as any)(...args);
};

// Copy all properties from moment
Object.assign(tzShim, moment);

tzShim.tz = function (date: any, timezone: string) {
  return (moment as any)(date);
};

tzShim.tz.guess = function () {
  return 'UTC';
};

module.exports = tzShim;
