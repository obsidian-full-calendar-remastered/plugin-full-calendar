import * as React from 'react';

/**
 * Injects a meeting URL into location or description.
 * If location is empty, it assigns the meeting URL to location.
 * Otherwise, it appends the meeting URL to the description.
 */
export function injectMeetingUrl(
  meetingUrl: string,
  location: string | undefined,
  description: string | undefined
): { location: string; description: string } {
  const currentLoc = (location || '').trim();
  const currentDesc = (description || '').trim();

  if (!currentLoc) {
    return {
      location: meetingUrl,
      description: currentDesc
    };
  }

  const suffix = `meeting URL: ${meetingUrl}`;
  const newDesc = currentDesc ? `${currentDesc}\n\n${suffix}` : suffix;
  return {
    location: currentLoc,
    description: newDesc
  };
}

/**
 * Splits text by URL patterns and returns a mix of strings and clickable React <a> elements.
 */
export function linkify(text: string): React.ReactNode {
  if (!text) return '';
  const urlRegex = /(https?:\/\/\S+)/g;
  const parts = text.split(urlRegex);
  return parts
    .map((part, index) => {
      if (part.startsWith('http://') || part.startsWith('https://')) {
        return React.createElement(
          'a',
          {
            key: index,
            href: part,
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'event-link'
          },
          part
        );
      }
      return part;
    })
    .filter(part => part !== '');
}
