import * as React from 'react';
import { injectMeetingUrl, linkify } from './meetingUrl';

describe('meetingUrl utilities', () => {
  describe('injectMeetingUrl', () => {
    it('injects meeting URL into location if location is empty', () => {
      const result = injectMeetingUrl('https://meet.google.com/abc-def', '', 'Some description');
      expect(result.location).toBe('https://meet.google.com/abc-def');
      expect(result.description).toBe('Some description');
    });

    it('injects meeting URL into location if location is undefined', () => {
      const result = injectMeetingUrl(
        'https://meet.google.com/abc-def',
        undefined,
        'Some description'
      );
      expect(result.location).toBe('https://meet.google.com/abc-def');
      expect(result.description).toBe('Some description');
    });

    it('appends meeting URL to description if location is not empty', () => {
      const result = injectMeetingUrl(
        'https://meet.google.com/abc-def',
        'Room 303',
        'Some description'
      );
      expect(result.location).toBe('Room 303');
      expect(result.description).toBe(
        'Some description\n\nmeeting URL: https://meet.google.com/abc-def'
      );
    });

    it('sets description if it was empty and location is not empty', () => {
      const result = injectMeetingUrl('https://meet.google.com/abc-def', 'Room 303', '');
      expect(result.location).toBe('Room 303');
      expect(result.description).toBe('meeting URL: https://meet.google.com/abc-def');
    });
  });

  describe('linkify', () => {
    it('returns empty string if input is empty', () => {
      expect(linkify('')).toBe('');
    });

    it('returns plain text if no URLs exist', () => {
      const result = linkify('Hello world');
      expect(result).toEqual(['Hello world']);
    });

    it('returns linkified React element if text is a URL', () => {
      const result = linkify('https://meet.google.com/abc-def') as React.ReactElement[];
      expect(result).toHaveLength(1); // [a_tag]
      const link = result[0];
      expect(React.isValidElement(link)).toBe(true);
      expect(link.type).toBe('a');
      const props = link.props as { href?: string; target?: string; className?: string };
      expect(props.href).toBe('https://meet.google.com/abc-def');
      expect(props.target).toBe('_blank');
      expect(props.className).toBe('event-link');
    });

    it('linkifies multiple URLs in text', () => {
      const result = linkify(
        'Join here: https://zoom.us/j/123 or here: https://meet.google.com/abc'
      ) as (string | React.ReactElement)[];
      expect(result).toHaveLength(4);
      expect(result[0]).toBe('Join here: ');

      const link1 = result[1] as React.ReactElement;
      expect(link1.type).toBe('a');
      const props1 = link1.props as { href?: string };
      expect(props1.href).toBe('https://zoom.us/j/123');

      expect(result[2]).toBe(' or here: ');

      const link2 = result[3] as React.ReactElement;
      expect(link2.type).toBe('a');
      const props2 = link2.props as { href?: string };
      expect(props2.href).toBe('https://meet.google.com/abc');
    });
  });
});
