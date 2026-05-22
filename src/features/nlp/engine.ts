import type {
  NLPActionObject,
  NLPExecutionContext,
  NLPIntent,
  NLPPayload,
  NLPRecurrence,
  NLPRule
} from './types';

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  domenica: 0,
  lunedi: 1,
  lunedì: 1,
  martedi: 2,
  martedì: 2,
  mercoledi: 3,
  mercoledì: 3,
  giovedi: 4,
  giovedì: 4,
  venerdi: 5,
  venerdì: 5,
  sabato: 6
};

const WEEKDAY_RRULE: Record<number, string> = {
  0: 'SU',
  1: 'MO',
  2: 'TU',
  3: 'WE',
  4: 'TH',
  5: 'FR',
  6: 'SA'
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripMatchedText(source: string, matchedText: string): string {
  if (!matchedText) {
    return normalizeWhitespace(source);
  }
  const escaped = matchedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return normalizeWhitespace(source.replace(new RegExp(escaped, 'i'), ' '));
}

function splitArguments(raw: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }
    if (char === ',' && !inQuotes) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim().length > 0) {
    args.push(current.trim());
  }

  return args;
}

function resolveArgument(rawArg: string, captures: string[]): string {
  const arg = rawArg.trim();
  const captureMatch = /^\$(\d+)$/.exec(arg);
  if (captureMatch) {
    const captureIndex = Number(captureMatch[1]) - 1;
    return captures[captureIndex] ?? '';
  }

  if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
    return arg.slice(1, -1);
  }

  return arg;
}

function toNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toWeekdayIndex(value: string): number {
  const normalized = value.toLowerCase();
  const directIndex = WEEKDAY_INDEX[normalized];
  if (directIndex !== undefined) {
    return directIndex;
  }
  const numericValue = Number(normalized);
  if (Number.isInteger(numericValue) && numericValue >= 0 && numericValue <= 6) {
    return numericValue;
  }
  return 0;
}

function setTime(date: Date, hoursRaw: string, minutesRaw: string, meridiemRaw: string) {
  let hours = toNumber(hoursRaw, date.getHours());
  const minutes = toNumber(minutesRaw, 0);
  const meridiem = meridiemRaw.toLowerCase();

  if (meridiem === 'pm' && hours < 12) {
    hours += 12;
  } else if (meridiem === 'am' && hours === 12) {
    hours = 0;
  }

  date.setHours(hours, minutes, 0, 0);
}

function to24Hour(hours: number, meridiemRaw: string): number {
  const meridiem = meridiemRaw.toLowerCase();
  let adjusted = hours;
  if (meridiem === 'pm' && adjusted < 12) {
    adjusted += 12;
  } else if (meridiem === 'am' && adjusted === 12) {
    adjusted = 0;
  }
  return adjusted;
}

function parseTimeToken(
  tokenRaw: string,
  meridiemRaw: string
): { hours: number; minutes: number } | null {
  const token = normalizeWhitespace(tokenRaw).toLowerCase();
  const meridiem = normalizeWhitespace(meridiemRaw).toLowerCase();
  if (!token || (meridiem !== 'am' && meridiem !== 'pm')) {
    return null;
  }

  if (/^\d{3,4}$/.test(token)) {
    const compact = Number(token);
    const hours12 = Math.floor(compact / 100);
    const minutes = compact % 100;
    if (hours12 < 1 || hours12 > 12 || minutes < 0 || minutes > 59) {
      return null;
    }
    return { hours: to24Hour(hours12, meridiem), minutes };
  }

  const exactMatch = /^(\d{1,2})(?::(\d{2}))?$/.exec(token);
  if (!exactMatch) {
    return null;
  }

  const hours12 = toNumber(exactMatch[1] ?? '', 0);
  const minutes = toNumber(exactMatch[2] ?? '0', 0);
  if (hours12 < 1 || hours12 > 12 || minutes < 0 || minutes > 59) {
    return null;
  }

  return { hours: to24Hour(hours12, meridiem), minutes };
}

function setTimeFromToken(context: NLPExecutionContext, tokenRaw: string, meridiemRaw: string) {
  const parsed = parseTimeToken(tokenRaw, meridiemRaw);
  if (!parsed) {
    return;
  }
  context.date.setHours(parsed.hours, parsed.minutes, 0, 0);
}

function setTimeRangeFromTokens(
  context: NLPExecutionContext,
  startTokenRaw: string,
  startMeridiemRaw: string,
  endTokenRaw: string,
  endMeridiemRaw: string
) {
  const parsedStart = parseTimeToken(startTokenRaw, startMeridiemRaw);
  const parsedEnd = parseTimeToken(endTokenRaw, endMeridiemRaw);

  if (parsedStart) {
    context.date.setHours(parsedStart.hours, parsedStart.minutes, 0, 0);
  }

  if (parsedEnd) {
    context.explicitEndHours = parsedEnd.hours;
    context.explicitEndMinutes = parsedEnd.minutes;
  }
}

function setRecurrence(
  context: NLPExecutionContext,
  freqRaw: string,
  intervalRaw: string,
  byDayRaw?: string
) {
  const freqUpper = freqRaw.toUpperCase();
  const validFreq = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freqUpper)
    ? (freqUpper as NLPRecurrence['freq'])
    : 'DAILY';

  const interval = Math.max(1, toNumber(intervalRaw, 1));
  let byDay: string[] | undefined;

  if (byDayRaw && byDayRaw.trim().length > 0) {
    const dayIndex = toWeekdayIndex(byDayRaw);
    byDay = [WEEKDAY_RRULE[dayIndex]];
  }

  context.recurrence = {
    freq: validFreq,
    interval,
    byDay
  };
}

function executeCommand(command: string, captures: string[], context: NLPExecutionContext) {
  const match = /^([A-Z_]+)\((.*)\)$/.exec(command.trim());
  if (!match) {
    return;
  }

  const commandName = match[1];
  const rawArgs = splitArguments(match[2]).map(arg => resolveArgument(arg, captures));

  switch (commandName) {
    case 'ADD_DAYS': {
      const days = toNumber(rawArgs[0], 0);
      context.date.setDate(context.date.getDate() + days);
      return;
    }
    case 'SUBTRACT_DAYS': {
      const days = toNumber(rawArgs[0], 0);
      context.date.setDate(context.date.getDate() - days);
      return;
    }
    case 'SET_TIME': {
      setTime(context.date, rawArgs[0] ?? '', rawArgs[1] ?? '', rawArgs[2] ?? '');
      return;
    }
    case 'SET_TIME_TOKEN': {
      setTimeFromToken(context, rawArgs[0] ?? '', rawArgs[1] ?? '');
      return;
    }
    case 'SET_TIME_RANGE': {
      setTimeRangeFromTokens(
        context,
        rawArgs[0] ?? '',
        rawArgs[1] ?? '',
        rawArgs[2] ?? '',
        rawArgs[3] ?? ''
      );
      return;
    }
    case 'NEXT_WEEKDAY': {
      const targetDay = toWeekdayIndex(rawArgs[0] ?? '0');
      const currentDay = context.date.getDay();
      let delta = (targetDay - currentDay + 7) % 7;
      if (delta === 0) {
        delta = 7;
      }
      context.date.setDate(context.date.getDate() + delta);
      return;
    }
    case 'ADD_HOURS': {
      const hours = toNumber(rawArgs[0], 0);
      context.date.setHours(context.date.getHours() + hours);
      return;
    }
    case 'SUBTRACT_HOURS': {
      const hours = toNumber(rawArgs[0], 0);
      context.date.setHours(context.date.getHours() - hours);
      return;
    }
    case 'SET_INTENT': {
      const intent = (rawArgs[0] ?? 'CREATE_EVENT') as NLPIntent;
      context.intent = intent;
      // GOTO_DATE must NOT short-circuit so date-modifying rules can still run.
      // CREATE_EVENT is the default and also must not short-circuit.
      if (intent !== 'CREATE_EVENT' && intent !== 'GOTO_DATE') {
        context.shortCircuit = true;
      }
      return;
    }
    case 'SET_TARGET': {
      context.targetCalendar = normalizeWhitespace(rawArgs[0] ?? '');
      return;
    }
    case 'ADD_MINUTES': {
      const minutes = toNumber(rawArgs[0], 0);
      context.date.setMinutes(context.date.getMinutes() + minutes);
      return;
    }
    case 'SUBTRACT_MINUTES': {
      const minutes = toNumber(rawArgs[0], 0);
      context.date.setMinutes(context.date.getMinutes() - minutes);
      return;
    }
    case 'ADD_WEEKS': {
      const weeks = toNumber(rawArgs[0], 0);
      context.date.setDate(context.date.getDate() + weeks * 7);
      return;
    }
    case 'SET_DAY': {
      const targetDay = toWeekdayIndex(rawArgs[0] ?? '0');
      const currentDay = context.date.getDay();
      const delta = targetDay - currentDay;
      context.date.setDate(context.date.getDate() + delta);
      return;
    }
    case 'SET_RECURRENCE': {
      setRecurrence(context, rawArgs[0] ?? 'DAILY', rawArgs[1] ?? '1', rawArgs[2]);
      return;
    }
    case 'SET_NEXT_OCCURRING_DAY': {
      const targetDay = toNumber(rawArgs[0], 1);
      const currentDay = context.date.getDate();

      if (targetDay <= currentDay) {
        // Move to the next month
        context.date.setMonth(context.date.getMonth() + 1);
      }
      // Set to the target day. Date() handles month rollover if targetDay > days in month.
      context.date.setDate(targetDay);
      return;
    }
    case 'ADD_DURATION': {
      context.durationHours = toNumber(rawArgs[0], 0);
      context.durationMinutes = toNumber(rawArgs[1], 0);
      return;
    }
    default:
      return;
  }
}

function runRule(rule: NLPRule, sourceText: string, context: NLPExecutionContext): string {
  const flags = rule.flags ?? 'i';
  const regex = new RegExp(rule.regex, flags);
  const match = regex.exec(sourceText);

  if (!match) {
    return sourceText;
  }

  const captures = match.slice(1).map(group => group ?? '');
  const matchedText = match[0] ?? '';
  context.matchedRules.push(rule.name);
  context.strippedTitle = stripMatchedText(context.strippedTitle, matchedText);

  for (const action of rule.actions) {
    executeCommand(action, captures, context);
    if (context.shortCircuit) {
      break;
    }
  }

  return context.strippedTitle;
}

function toDateOnlyIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function processNaturalLanguage(
  rawInput: string,
  payload: NLPPayload,
  now: Date = new Date()
): NLPActionObject {
  const context: NLPExecutionContext = {
    date: new Date(now.getTime()),
    durationHours: null,
    durationMinutes: null,
    explicitEndHours: null,
    explicitEndMinutes: null,
    intent: 'CREATE_EVENT',
    targetCalendar: null,
    recurrence: null,
    matchedRules: [],
    strippedTitle: normalizeWhitespace(rawInput),
    shortCircuit: false
  };

  for (const rule of payload.rules) {
    runRule(rule, context.strippedTitle, context);
    if (context.shortCircuit) {
      break;
    }
  }

  // Finalize end time if duration was specified
  let endHours: number | null = context.explicitEndHours;
  let endMinutes: number | null = context.explicitEndMinutes;
  if (
    endHours === null &&
    endMinutes === null &&
    (context.durationHours !== null || context.durationMinutes !== null)
  ) {
    const endDate = new Date(context.date.getTime());
    endDate.setHours(endDate.getHours() + (context.durationHours ?? 0));
    endDate.setMinutes(endDate.getMinutes() + (context.durationMinutes ?? 0));
    endHours = endDate.getHours();
    endMinutes = endDate.getMinutes();
  }

  const fallbackTitle =
    context.intent === 'CREATE_EVENT' ? context.strippedTitle || rawInput.trim() : '';

  return {
    intent: context.intent,
    title: fallbackTitle,
    date: toDateOnlyIso(context.date),
    hours: context.date.getHours(),
    minutes: context.date.getMinutes(),
    endHours,
    endMinutes,
    targetCalendar: context.targetCalendar,
    recurrence: context.recurrence,
    matchedRules: context.matchedRules
  };
}
