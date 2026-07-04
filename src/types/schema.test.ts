import {
  CommonSchema,
  EventSchema,
  OFCEvent,
  ParsedDate,
  ParsedTime,
  TimeSchema,
  parseEvent,
  serializeEvent
} from './schema';
import { z } from 'zod';
import fc from 'fast-check';
import { ZodFastCheck } from 'zod-fast-check';

describe('schema parsing tests', () => {
  describe('single events', () => {
    it('simplest', () => {
      expect(
        parseEvent({
          title: 'Test',
          date: '2021-01-01',
          allDay: true
        })
      ).toMatchInlineSnapshot(`
        {
          "allDay": true,
          "date": "2021-01-01",
          "endDate": null,
          "title": "Test",
          "type": "single",
        }
      `);
    });

    it('with category', () => {
      expect(
        parseEvent({
          title: 'Test',
          category: 'Work',
          date: '2021-01-01',
          allDay: true
        })
      ).toMatchInlineSnapshot(`
        {
          "allDay": true,
          "category": "Work",
          "date": "2021-01-01",
          "endDate": null,
          "title": "Test",
          "type": "single",
        }
      `);
    });

    it('start time', () => {
      expect(
        parseEvent({
          title: 'Test',
          type: 'single',
          date: '2021-01-01T10:30:00.000Z',
          allDay: false,
          startTime: '10:30',
          endTime: null
        })
      ).toMatchInlineSnapshot(`
        {
          "allDay": false,
          "date": "2021-01-01T10:30:00.000Z",
          "endDate": null,
          "endTime": null,
          "startTime": "10:30",
          "title": "Test",
          "type": "single",
        }
      `);
    });

    it('am/pm start time', () => {
      expect(
        parseEvent({
          title: 'Test',
          type: 'single',
          date: '2021-01-01',
          allDay: false,
          startTime: '10:30 pm',
          endTime: null
        })
      ).toMatchInlineSnapshot(`
        {
          "allDay": false,
          "date": "2021-01-01",
          "endDate": null,
          "endTime": null,
          "startTime": "10:30 pm",
          "title": "Test",
          "type": "single",
        }
      `);
    });
    it('end time', () => {
      expect(
        parseEvent({
          title: 'Test',
          type: 'single',
          date: '2021-01-01',
          allDay: false,
          startTime: '10:30',
          endTime: '11:45'
        })
      ).toMatchInlineSnapshot(`
        {
          "allDay": false,
          "date": "2021-01-01",
          "endDate": null,
          "endTime": "11:45",
          "startTime": "10:30",
          "title": "Test",
          "type": "single",
        }
      `);
    });
    it('multi-day events', () => {
      expect(
        parseEvent({
          title: 'Test',
          type: 'single',
          date: '2021-01-01',
          endDate: '2021-01-03',
          allDay: true
        })
      ).toMatchInlineSnapshot(`
        {
          "allDay": true,
          "date": "2021-01-01",
          "endDate": "2021-01-03",
          "title": "Test",
          "type": "single",
        }
      `);
    });
    it('to-do', () => {
      expect(
        parseEvent({
          title: 'Test',
          type: 'single',
          date: '2021-01-01',
          allDay: true,
          completed: null
        })
      ).toMatchInlineSnapshot(`
        {
          "allDay": true,
          "completed": null,
          "date": "2021-01-01",
          "endDate": null,
          "title": "Test",
          "type": "single",
        }
      `);
    });
    it('to-do unchecked', () => {
      expect(
        parseEvent({
          title: 'Test',
          type: 'single',
          date: '2021-01-01',
          allDay: true,
          completed: false
        })
      ).toMatchInlineSnapshot(`
        {
          "allDay": true,
          "completed": false,
          "date": "2021-01-01",
          "endDate": null,
          "title": "Test",
          "type": "single",
        }
      `);
    });
    it('to-do completed', () => {
      expect(
        parseEvent({
          title: 'Test',
          type: 'single',
          date: '2021-01-01',
          allDay: true,
          completed: '2021-01-01T10:30:00.000Z'
        })
      ).toMatchInlineSnapshot(`
        {
          "allDay": true,
          "completed": "2021-01-01T10:30:00.000Z",
          "date": "2021-01-01",
          "endDate": null,
          "title": "Test",
          "type": "single",
        }
      `);
    });
    it('to-do completed with true boolean', () => {
      expect(
        parseEvent({
          title: 'Test',
          type: 'single',
          date: '2021-01-01',
          allDay: true,
          completed: true
        })
      ).toMatchInlineSnapshot(`
        {
          "allDay": true,
          "completed": true,
          "date": "2021-01-01",
          "endDate": null,
          "title": "Test",
          "type": "single",
        }
      `);
    });
  });

  describe('simple recurring events', () => {
    it('recurs once per week', () => {
      expect(
        parseEvent({
          title: 'Test',
          allDay: true,
          type: 'recurring',
          daysOfWeek: ['M']
        })
      ).toMatchInlineSnapshot(`
        {
          "allDay": true,
          "daysOfWeek": [
            "M",
          ],
          "endDate": null,
          "skipDates": [],
          "title": "Test",
          "type": "recurring",
        }
      `);
    });
    it('recurs twice per week', () => {
      expect(
        parseEvent({
          title: 'Test',
          allDay: true,
          type: 'recurring',
          daysOfWeek: ['M', 'W']
        })
      ).toMatchInlineSnapshot(`
        {
          "allDay": true,
          "daysOfWeek": [
            "M",
            "W",
          ],
          "endDate": null,
          "skipDates": [],
          "title": "Test",
          "type": "recurring",
        }
      `);
    });
    it('recurs with start date', () => {
      expect(
        parseEvent({
          title: 'Test',
          allDay: true,
          type: 'recurring',
          daysOfWeek: ['M'],
          startRecur: '2023-01-05'
        })
      ).toMatchInlineSnapshot(`
        {
          "allDay": true,
          "daysOfWeek": [
            "M",
          ],
          "endDate": null,
          "skipDates": [],
          "startRecur": "2023-01-05",
          "title": "Test",
          "type": "recurring",
        }
      `);
    });
    it('recurs with end date', () => {
      expect(
        parseEvent({
          title: 'Test',
          allDay: true,
          type: 'recurring',
          daysOfWeek: ['M'],
          endRecur: '2023-01-05'
        })
      ).toMatchInlineSnapshot(`
        {
          "allDay": true,
          "daysOfWeek": [
            "M",
          ],
          "endDate": null,
          "endRecur": "2023-01-05",
          "skipDates": [],
          "title": "Test",
          "type": "recurring",
        }
      `);
    });
    it('recurs with both start and end dates', () => {
      expect(
        parseEvent({
          title: 'Test',
          allDay: true,
          type: 'recurring',
          daysOfWeek: ['M'],
          startRecur: '2023-01-05',
          endRecur: '2023-05-12'
        })
      ).toMatchInlineSnapshot(`
        {
          "allDay": true,
          "daysOfWeek": [
            "M",
          ],
          "endDate": null,
          "endRecur": "2023-05-12",
          "skipDates": [],
          "startRecur": "2023-01-05",
          "title": "Test",
          "type": "recurring",
        }
      `);
    });
    it('recurs daily with repeatInterval', () => {
      expect(
        parseEvent({
          title: 'Test Daily',
          allDay: true,
          type: 'recurring',
          fcrDaily: true,
          repeatInterval: 3,
          startRecur: '2023-01-05'
        })
      ).toMatchInlineSnapshot(`
        {
          "allDay": true,
          "endDate": null,
          "fcrDaily": true,
          "repeatInterval": 3,
          "skipDates": [],
          "startRecur": "2023-01-05",
          "title": "Test Daily",
          "type": "recurring",
        }
      `);
    });
  });

  describe('rrule events', () => {
    it('basic rrule', () => {
      expect(
        parseEvent({
          title: 'Test',
          allDay: true,
          type: 'rrule',
          id: 'hi',
          rrule: 'RRULE',
          skipDates: [],
          startDate: '2023-01-05'
        })
      ).toMatchInlineSnapshot(`
        {
          "allDay": true,
          "endDate": null,
          "id": "hi",
          "rrule": "RRULE",
          "skipDates": [],
          "startDate": "2023-01-05",
          "title": "Test",
          "type": "rrule",
        }
      `);
    });
  });

  describe('property-based tests', () => {
    const zfc = ZodFastCheck()
      .override(
        ParsedDate,
        fc
          .date({
            min: new Date(2000, 0, 0),
            max: new Date(2150, 0, 0)
          })
          .map(
            date =>
              `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date
                .getDate()
                .toString()
                .padStart(2, '0')}`
          )
      )
      .override(
        ParsedTime,
        fc
          .date()
          .map(
            date =>
              `${date.getHours().toString().padStart(2, '0')}:${date
                .getMinutes()
                .toString()
                .padStart(2, '0')}`
          )
      );

    it('parses', () => {
      const CommonArb = zfc.inputOf(CommonSchema.extend({ category: z.string() }));
      const TimeArb = zfc.inputOf(TimeSchema);
      const EventArb = zfc.inputOf(EventSchema);
      const EventInputArbitrary = fc
        .tuple(CommonArb, TimeArb, EventArb)
        .map(([common, time, event]) => ({
          ...common,
          ...time,
          ...event
        }));

      fc.assert(
        fc.property(EventInputArbitrary, obj => {
          expect(() => parseEvent(obj)).not.toThrow();
        })
      );
    });

    it('roundtrips', () => {
      const ExtendedCommonSchema = CommonSchema.extend({ category: z.string().optional() });
      const CommonArb = zfc.outputOf(ExtendedCommonSchema);
      const TimeArb = zfc.outputOf(TimeSchema);
      const EventArb = zfc.outputOf(EventSchema);

      const OFCEventArbitrary: fc.Arbitrary<OFCEvent> = fc
        .tuple(CommonArb, TimeArb, EventArb)
        .map(([common, time, event]) => ({
          ...common,
          ...time,
          ...event
        }));

      fc.assert(
        fc.property(OFCEventArbitrary, event => {
          const obj = serializeEvent(event);
          const newParsedEvent = parseEvent(obj);
          expect(newParsedEvent).toEqual(event);
        })
      );
    });
  });
});
