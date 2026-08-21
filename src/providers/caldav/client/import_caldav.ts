// import_caldav.ts
import { Authentication, CalDAVSource } from '../../../types';
import { generateCalendarId } from '../../../types/calendar_settings';
import { splitCalDAVUrl, ensureTrailingSlash, fetchCalendarInfo } from './helper_caldav';

/**
 * Imports a CalDAV calendar by validating the URL using PROPFIND,
 * and auto-populates name and color from server-provided metadata.
 */
export async function importCalendars(
  auth: Authentication,
  inputUrl: string,
  existingIds: string[]
): Promise<CalDAVSource[]> {
  const { serverUrl, collectionUrl } = splitCalDAVUrl(inputUrl);

  const { isCalendar, displayName, color, error } = await fetchCalendarInfo(collectionUrl, {
    username: auth.username,
    password: auth.password
  });

  if (!isCalendar) {
    if (error) {
      throw new Error(`Failed to import CalDAV calendar: ${error}`);
    }
    throw new Error(
      'The provided URL does not appear to be a valid CalDAV calendar collection. Please ensure it points directly to a calendar.'
    );
  }

  const id = generateCalendarId('caldav', existingIds);
  existingIds.push(id);

  return [
    {
      type: 'caldav',
      id,
      name: displayName ?? 'CalDAV Calendar',
      url: ensureTrailingSlash(serverUrl),
      homeUrl: ensureTrailingSlash(collectionUrl),
      color: color ?? '#888888',
      username: auth.username,
      password: auth.password
    }
  ];
}
