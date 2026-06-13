/**
 * @file schema.ts
 * @brief Defines the Zod schema and TypeScript type for an OFCEvent.
 *
 * @description
 * This is a critical file that defines the canonical shape of an event object
 * (`OFCEvent`) within the plugin. It uses a `zod` schema to enforce structure,
 *  handle default values, and validate event data parsed from various sources.
 * This ensures that all events, regardless of origin, conform to a consistent
 * and predictable data model.
 *
 * @license See LICENSE.md
 */

import { z, ZodError } from 'zod';

export const ParsedDate = z.string();
// z.string().transform((val, ctx) => {
//     const parsed = DateTime.fromISO(val, { zone: "utc" });
//     if (parsed.invalidReason) {
//         ctx.addIssue({
//             code: z.ZodIssueCode.custom,
//             message: parsed.invalidReason,
//         });
//         return z.NEVER;
//     }
//     return stripTime(parsed);
// });

export const ParsedTime = z.string();
// z.string().transform((val, ctx) => {
//     let parsed = DateTime.fromFormat(val, "h:mm a");
//     if (parsed.invalidReason) {
//         parsed = DateTime.fromFormat(val, "HH:mm");
//     }

//     if (parsed.invalidReason) {
//         ctx.addIssue({
//             code: z.ZodIssueCode.custom,
//             message: parsed.invalidReason,
//         });
//         return z.NEVER;
//     }

//     return Duration.fromISOTime(
//         parsed.toISOTime({
//             includeOffset: false,
//             includePrefix: false,
//         })
//     );
// });

export const TimeSchema = z.discriminatedUnion('allDay', [
  z.object({ allDay: z.literal(true) }),
  z.object({
    allDay: z.literal(false),
    startTime: ParsedTime,
    endTime: ParsedTime.nullable().default(null)
  })
]);

// MODIFICATION HAPPENS HERE
export const CommonSchema = z.object({
  title: z.string(), // This will now store the CLEAN title.
  id: z.string().optional(),
  uid: z.string().optional(),
  caldavHref: z.string().optional(),
  recurrenceId: z.string().optional(),
  timezone: z.string().optional(),
  etag: z.string().optional(),
  category: z.string().optional(), // This will store the parsed category.
  subCategory: z.string().optional(),
  recurringEventId: z.string().optional(), // The ID of the parent recurring event.
  endReminder: z.boolean().optional(),
  display: z
    .enum(['auto', 'block', 'list-item', 'background', 'inverse-background', 'none'])
    .optional(), // Support for background events
  description: z.string().optional(),
  url: z.string().optional(),
  location: z.string().optional(),
  notify: z
    .object({
      value: z.number().min(0).max(1440)
    })
    .optional(),
  alarms: z
    .array(
      z.object({
        minutesBefore: z.number().int().min(0).max(10080),
        action: z.enum(['DISPLAY', 'AUDIO', 'EMAIL']).default('DISPLAY')
      })
    )
    .optional()
});

export const EventSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('single'),
      date: ParsedDate,
      endDate: ParsedDate.nullable().default(null),
      completed: ParsedDate.or(z.literal(true)).or(z.literal(false)).or(z.literal(null)).optional()
    }),
    z.object({
      type: z.literal('recurring'),
      endDate: ParsedDate.nullable().default(null),
      daysOfWeek: z.array(z.enum(['U', 'M', 'T', 'W', 'R', 'F', 'S'])).optional(),
      month: z.number().int().min(1).max(12).optional(),
      dayOfMonth: z.number().int().min(1).max(31).optional(),
      // --- ADDITIONS START ---
      repeatInterval: z.number().int().min(1).optional(),
      repeatOn: z
        .object({
          week: z.number().int().min(-1).max(4), // 1-4 for first-fourth, -1 for last
          weekday: z.number().int().min(0).max(6) // 0-6 for Sun-Sat
        })
        .optional(),
      // --- ADDITIONS END ---
      startRecur: ParsedDate.optional(),
      endRecur: ParsedDate.optional(),
      isTask: z.boolean().optional(),
      skipDates: z.array(ParsedDate).default([])
    }),
    z.object({
      type: z.literal('rrule'),
      startDate: ParsedDate,
      endDate: ParsedDate.nullable().default(null),
      rrule: z.string(),
      skipDates: z.array(ParsedDate).default([]),
      isTask: z.boolean().optional()
    })
  ])
  .superRefine((data, ctx) => {
    if (data.type !== 'recurring') return;

    const weeklyDefined = data.daysOfWeek !== undefined && data.daysOfWeek.length > 0;
    const monthlyOrYearlyDefined = data.dayOfMonth !== undefined;
    // --- ADDITION ---
    const positionalMonthlyDefined = data.repeatOn !== undefined;
    // --- END ADDITION ---

    if (weeklyDefined && monthlyOrYearlyDefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'A recurring event cannot be both weekly (daysOfWeek) and monthly/yearly (dayOfMonth).',
        path: ['daysOfWeek']
      });
    }

    // --- MODIFIED CHECK ---
    if (!weeklyDefined && !monthlyOrYearlyDefined && !positionalMonthlyDefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'A recurring event must define a recurrence rule (either daysOfWeek, dayOfMonth, or repeatOn).'
      });
    }
    // --- END MODIFIED CHECK ---

    if (data.month !== undefined && data.dayOfMonth === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A yearly recurring event (with month) must also have a dayOfMonth.',
        path: ['month']
      });
    }

    // --- ADDITION: Mutual exclusivity for monthly rules ---
    if (data.dayOfMonth !== undefined && data.repeatOn !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'A monthly recurring event can repeat on a specific day of the month OR on a numbered weekday, but not both.',
        path: ['repeatOn']
      });
    }
    // --- END ADDITION ---
  });

type EventType = z.infer<typeof EventSchema>;
type TimeType = z.infer<typeof TimeSchema>;
type CommonType = z.infer<typeof CommonSchema>;

export type OFCEvent = CommonType & TimeType & EventType;

export function parseEvent(obj: unknown): OFCEvent {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('value for parsing was not an object.');
  }
  const hasTime = 'startTime' in obj && !!(obj as Record<string, unknown>).startTime;
  const objectWithDefaults = { type: 'single', allDay: !hasTime, ...obj };
  const result = {
    ...CommonSchema.parse(objectWithDefaults),
    ...TimeSchema.parse(objectWithDefaults),
    ...EventSchema.parse(objectWithDefaults)
  };
  return result;
}

export function validateEvent(obj: unknown): OFCEvent | null {
  try {
    return parseEvent(obj);
  } catch (e) {
    if (e instanceof ZodError) {
      // Swallow validation errors and surface null to callers.
    }
    return null;
  }
}
type Json = { [key: string]: Json } | Json[] | string | number | true | false | null;

export function serializeEvent(obj: OFCEvent): Json {
  return { ...obj };
}
